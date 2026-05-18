import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import yaml from 'js-yaml';

import {
  PERSONA_NAME_REGEX,
  PersonaCreateRequestSchema,
  PersonaUpdateRequestSchema,
  type PersonaListResponse,
  type PersonaResource,
} from '@relay/protocol';

import { loadAll, validatePersona } from '../../../persona/index.js';
import { personasDir, projectPersonasDir } from '../../../config/paths.js';
import { HttpProblemError } from '../http-error.js';

// POST/PATCH write to the **tenant** persona dir (~/.relay/personas/). The
// project-level override path (<project>/.relay/personas/) is read at compose
// time only — operators edit those files directly per 09-persona-schema.md.
// MVP scope: REST personas surface == tenant personas surface.

export interface PersonasRoutesOptions {
  homeOverride?: string;
}

function personaFilePath(name: string, homeOverride?: string): string {
  return join(personasDir(homeOverride), `${name}.yaml`);
}

function notFound(name: string): HttpProblemError {
  return new HttpProblemError({
    status: 404,
    typeSlug: 'persona-not-found',
    title: 'Persona not found',
    detail: `No persona with name '${name}'.`,
  });
}

function ensurePersonaNameInUrl(req: FastifyRequest<{ Params: { id: string } }>): string {
  const id = req.params.id;
  if (!PERSONA_NAME_REGEX.test(id)) {
    throw new HttpProblemError({
      status: 400,
      typeSlug: 'persona-name-invalid',
      title: 'Persona name in URL is not valid',
      detail: `Persona name '${id}' does not match the kebab-case pattern.`,
    });
  }
  return id;
}

function loadOneFromTenant(name: string, homeOverride?: string): PersonaResource | undefined {
  // Use loadAll so the same composition rules apply (tenant-only here since
  // we don't have a project context on a tenant-level REST call). The match
  // is on filename stem == name.
  const { personas } = loadAll({ tenantDir: personasDir(homeOverride) });
  const input = personas.get(name);
  if (input === undefined) return undefined;
  return {
    ...input.persona,
    source: input.source,
    filePath: input.filePath,
  };
}

export async function registerPersonasRoutes(
  app: FastifyInstance,
  opts: PersonasRoutesOptions,
): Promise<void> {
  app.get(
    '/personas',
    async (
      req: FastifyRequest<{ Querystring: { projectId?: string } }>,
    ): Promise<PersonaListResponse> => {
      // ?projectId=... lets the IDE surface the effective set inside a
      // registered workspace. Without it, callers get the tenant-only view.
      const tenantDir = personasDir(opts.homeOverride);
      // projectId would resolve to a canonical_path via the store layer; we
      // do not surface that here at MVP to keep the route DB-free and
      // synchronous. The IDE composes tenant + project itself by calling
      // GET /projects/:id and reading <canonicalPath>/.relay/personas/.
      const projectDir =
        req.query.projectId !== undefined ? projectPersonasDir(req.query.projectId) : undefined;
      // ^ defensive — projectId here is a placeholder; real composition lives
      // in 6E (session/) at spawn time. The MVP REST surface returns the
      // tenant set; future expansion plumbs the project canonical path.
      const result = loadAll({ tenantDir, projectDir });
      const items: PersonaResource[] = [...result.personas.values()].map((input) => ({
        ...input.persona,
        source: input.source,
        filePath: input.filePath,
      }));
      return { items, errors: result.errors };
    },
  );

  app.get(
    '/personas/:id',
    async (req: FastifyRequest<{ Params: { id: string } }>): Promise<PersonaResource> => {
      const name = ensurePersonaNameInUrl(req);
      const persona = loadOneFromTenant(name, opts.homeOverride);
      if (persona === undefined) throw notFound(name);
      return persona;
    },
  );

  app.post(
    '/personas',
    async (req: FastifyRequest, reply: FastifyReply): Promise<PersonaResource> => {
      const body = PersonaCreateRequestSchema.parse(req.body);

      // Per D-09: the persona's `name` field is the source of truth for the
      // filename stem. validatePersona enforces this (name regex + structural
      // rules); the filename match is implicit because the server picks the
      // filename from body.name.
      const validation = validatePersona(body, body.name);
      if (!validation.ok) {
        throw new HttpProblemError({
          status: 422,
          typeSlug: 'persona-invalid',
          title: 'Persona definition is semantically invalid',
          detail: validation.detail,
          extensions: { reason: validation.reason },
        });
      }

      const filePath = personaFilePath(body.name, opts.homeOverride);
      mkdirSync(personasDir(opts.homeOverride), { recursive: true });

      // Reject create-if-exists; PATCH is the update path. ENOENT means we
      // can write.
      try {
        readFileSync(filePath);
        throw new HttpProblemError({
          status: 409,
          typeSlug: 'persona-already-exists',
          title: 'Persona already exists',
          detail: `Persona '${body.name}' already exists at ${filePath}.`,
          extensions: { name: body.name, filePath },
        });
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      }

      writeFileSync(filePath, yaml.dump(body), { mode: 0o600 });

      reply.status(201).header('Location', `/personas/${body.name}`);
      return {
        ...body,
        source: 'tenant',
        filePath,
      };
    },
  );

  app.patch(
    '/personas/:id',
    async (req: FastifyRequest<{ Params: { id: string } }>): Promise<PersonaResource> => {
      const name = ensurePersonaNameInUrl(req);
      const partial = PersonaUpdateRequestSchema.parse(req.body);

      const existing = loadOneFromTenant(name, opts.homeOverride);
      if (existing === undefined) throw notFound(name);
      if (existing.source !== 'tenant') {
        // Defensive: loadOneFromTenant only reads tenant dir, but the guard
        // makes the contract explicit — REST PATCH only touches tenant files.
        throw notFound(name);
      }

      // A name change is a rename; for MVP, reject it. The client can DELETE
      // + POST if they want to rename.
      if (partial.name !== undefined && partial.name !== name) {
        throw new HttpProblemError({
          status: 422,
          typeSlug: 'persona-rename-unsupported',
          title: 'Persona rename via PATCH is not supported',
          detail: 'To rename a persona, DELETE the old one and POST a new one.',
        });
      }

      const { filePath } = existing;
      const existingPersonaFields = {
        schemaVersion: existing.schemaVersion,
        name: existing.name,
        description: existing.description,
        systemPrompt: existing.systemPrompt,
        skills: existing.skills,
        mcpServers: existing.mcpServers,
        model: existing.model,
      };
      const merged = { ...existingPersonaFields, ...partial, name };

      const validation = validatePersona(merged, name);
      if (!validation.ok) {
        throw new HttpProblemError({
          status: 422,
          typeSlug: 'persona-invalid',
          title: 'Persona definition is semantically invalid',
          detail: validation.detail,
          extensions: { reason: validation.reason },
        });
      }

      writeFileSync(filePath, yaml.dump(merged), { mode: 0o600 });
      return {
        ...merged,
        source: 'tenant',
        filePath,
      };
    },
  );

  app.delete(
    '/personas/:id',
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply): Promise<void> => {
      const name = ensurePersonaNameInUrl(req);
      const filePath = personaFilePath(name, opts.homeOverride);
      try {
        rmSync(filePath, { force: false });
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw notFound(name);
        throw err;
      }
      reply.status(204).send();
    },
  );
}
