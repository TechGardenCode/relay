import { appendFileSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

import {
  PROJECT_SLUG_REGEX,
  ProjectCreateRequestSchema,
  type Project,
  type ProjectListResponse,
} from '@techgardencode/protocol';

import { projects, tenants, type Database, type ProjectRow } from '../../../store/index.js';
import { HttpProblemError } from '../http-error.js';

export interface ProjectsRoutesOptions {
  db: Database;
}

const MARKER_DIRNAME = '.relay';
const MARKER_FILENAME = 'project.json';
const MARKER_RELATIVE_PATH = `${MARKER_DIRNAME}/${MARKER_FILENAME}`;

function toWire(row: ProjectRow): Project {
  return {
    id: row.id,
    tenantId: row.tenantId,
    slug: row.slug,
    displayName: row.displayName,
    canonicalPath: row.canonicalPath,
    agentCli: row.agentCli,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

// Lowercase, kebab-sanitize, trim leading/trailing/duplicate '-'. Returns
// undefined if the result can't satisfy PROJECT_SLUG_REGEX (rare: a basename
// like "123" leads with a digit). The caller surfaces 422 in that case.
function deriveSlug(input: string): string | undefined {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return PROJECT_SLUG_REGEX.test(slug) ? slug : undefined;
}

function writeMarkerAndGitignore(canonicalPath: string, projectId: string): void {
  const relayDir = join(canonicalPath, MARKER_DIRNAME);
  mkdirSync(relayDir, { recursive: true });
  const marker = {
    schemaVersion: 1,
    projectId,
  };
  // Per ND-07: minimum two required fields. serverUrl / displayName are
  // optional; the IDE binds via the projectId alone in the local-server case.
  writeFileSync(join(relayDir, MARKER_FILENAME), JSON.stringify(marker, null, 2) + '\n');
  appendToGitignore(canonicalPath);
}

// Per D-12 + prd/03-server.md §7: append `.relay/project.json` to
// <project>/.gitignore so the device-specific marker stays out of source
// control by default. Idempotent — checks for an existing entry before
// appending. Creates the .gitignore file if missing.
function appendToGitignore(canonicalPath: string): void {
  const gitignorePath = join(canonicalPath, '.gitignore');
  let existing = '';
  try {
    existing = readFileSync(gitignorePath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
  const lines = existing.split('\n').map((l) => l.trim());
  if (lines.includes(MARKER_RELATIVE_PATH) || lines.includes(`/${MARKER_RELATIVE_PATH}`)) {
    return;
  }
  const needsLeadingNewline = existing.length > 0 && !existing.endsWith('\n');
  const suffix = `${needsLeadingNewline ? '\n' : ''}${MARKER_RELATIVE_PATH}\n`;
  appendFileSync(gitignorePath, suffix);
}

interface SqliteErrorLike {
  code?: string;
}

function isUniqueConstraint(err: unknown): err is SqliteErrorLike {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as SqliteErrorLike).code === 'SQLITE_CONSTRAINT_UNIQUE'
  );
}

export async function registerProjectsRoutes(
  app: FastifyInstance,
  opts: ProjectsRoutesOptions,
): Promise<void> {
  app.get('/projects', async (): Promise<ProjectListResponse> => {
    const tenant = tenants.ensureSingleton(opts.db, Date.now());
    const rows = projects.listByTenant(opts.db, tenant.id);
    return { items: rows.map(toWire) };
  });

  app.get(
    '/projects/:id',
    async (req: FastifyRequest<{ Params: { id: string } }>): Promise<Project> => {
      const row = projects.findById(opts.db, req.params.id);
      if (row === undefined) {
        throw new HttpProblemError({
          status: 404,
          typeSlug: 'project-not-found',
          title: 'Project not found',
          detail: `No project with id ${req.params.id}.`,
        });
      }
      return toWire(row);
    },
  );

  app.post('/projects', async (req: FastifyRequest, reply: FastifyReply): Promise<Project> => {
    const body = ProjectCreateRequestSchema.parse(req.body);

    // Per D-12 rule 1: realpath the supplied path. Missing directory is a
    // 422 — well-formed request, semantically invalid (no such directory).
    let canonicalPath: string;
    try {
      canonicalPath = realpathSync(body.path);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new HttpProblemError({
          status: 422,
          typeSlug: 'project-path-missing',
          title: 'Project path does not exist',
          detail: `realpath(${body.path}) failed: ENOENT.`,
          extensions: { suppliedPath: body.path },
        });
      }
      throw err;
    }

    const tenant = tenants.ensureSingleton(opts.db, Date.now());
    const fallbackBase = basename(canonicalPath);
    const slug = body.slug ?? deriveSlug(fallbackBase);
    if (slug === undefined) {
      throw new HttpProblemError({
        status: 422,
        typeSlug: 'project-slug-undeducible',
        title: 'Project slug could not be derived from path basename',
        detail: `Could not derive a kebab-case slug from basename '${fallbackBase}'. Pass an explicit slug.`,
        extensions: { canonicalPath, basename: fallbackBase },
      });
    }
    const displayName = body.displayName ?? fallbackBase;

    let row: ProjectRow;
    try {
      row = projects.insert(
        opts.db,
        {
          tenantId: tenant.id,
          slug,
          displayName,
          canonicalPath,
          agentCli: body.agentCli,
        },
        Date.now(),
      );
    } catch (err) {
      if (isUniqueConstraint(err)) {
        // The UNIQUE conflict could be on (tenant_id, canonical_path) or
        // (tenant_id, slug). Look up both to distinguish for the error
        // body — the client cares which one collided.
        const byPath = projects.findByCanonicalPath(opts.db, tenant.id, canonicalPath);
        if (byPath !== undefined) {
          throw new HttpProblemError({
            status: 409,
            typeSlug: 'project-path-taken',
            title: 'Project path already registered',
            detail: `A project is already registered at ${canonicalPath}.`,
            extensions: { canonicalPath, existingProjectId: byPath.id },
          });
        }
        const bySlug = projects.findBySlug(opts.db, tenant.id, slug);
        if (bySlug !== undefined) {
          throw new HttpProblemError({
            status: 409,
            typeSlug: 'project-slug-taken',
            title: 'Project slug already in use',
            detail: `A project with slug '${slug}' is already registered.`,
            extensions: { slug, existingProjectId: bySlug.id },
          });
        }
        // UNIQUE failure with no matching row found — shouldn't happen, but
        // surface a generic 409 rather than a confusing 500.
        throw new HttpProblemError({
          status: 409,
          typeSlug: 'project-conflict',
          title: 'Project registration conflict',
          detail: 'A uniqueness constraint failed on project insert.',
        });
      }
      throw err;
    }

    // Per D-12 rule 5 + ND-07: drop the marker, append to .gitignore. The
    // marker write happens AFTER the row INSERT succeeds — a write failure
    // here leaves the row in place (the row is authoritative; the marker is
    // a local-disk convenience for the IDE binding).
    try {
      writeMarkerAndGitignore(canonicalPath, row.id);
    } catch (err) {
      // Log via Fastify; surface as 500. The project row exists — the
      // operator can manually drop the marker or re-run with a re-write
      // helper later.
      req.log.error({ err, projectId: row.id, canonicalPath }, 'project marker write failed');
      throw new HttpProblemError({
        status: 500,
        typeSlug: 'project-marker-write-failed',
        title: 'Project registered but marker file write failed',
        detail: `Project row created (id=${row.id}) but writing ${MARKER_RELATIVE_PATH} failed.`,
        extensions: { projectId: row.id, canonicalPath },
      });
    }

    reply.status(201).header('Location', `/projects/${row.id}`);
    return toWire(row);
  });

  app.delete(
    '/projects/:id',
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply): Promise<void> => {
      // Per D-12: remove() cascades to sessions via the FK. The on-disk
      // working directory and marker file are NOT touched per prd/03-server.md
      // §7 ("does not delete the working directory or the on-disk marker").
      const { removed } = projects.remove(opts.db, req.params.id);
      if (!removed) {
        throw new HttpProblemError({
          status: 404,
          typeSlug: 'project-not-found',
          title: 'Project not found',
          detail: `No project with id ${req.params.id}.`,
        });
      }
      reply.status(204).send();
    },
  );
}
