import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

import {
  SessionCreateRequestSchema,
  SessionListQuerySchema,
  type Session,
  type SessionListResponse,
} from '@relay/protocol';

import {
  projects,
  sessions as sessionsRepo,
  type Database,
  type SessionRow,
  type SessionStatus,
} from '../../../store/index.js';
import { SessionCreateError, type SessionRegistry } from '../../../session/index.js';
import { HttpProblemError } from '../http-error.js';

export interface SessionsRoutesOptions {
  db: Database;
  registry: SessionRegistry;
}

function toWire(row: SessionRow): Session {
  return {
    id: row.id,
    projectId: row.projectId,
    personaName: row.personaName,
    agentCli: row.agentCli,
    agentSessionId: row.agentSessionId,
    ptyPid: row.ptyPid,
    status: row.status,
    terminatedReason: row.terminatedReason,
    totalBytes: row.totalBytes,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

function listAll(db: Database): SessionRow[] {
  // No store helper for "all statuses without a project filter" — we union
  // the three concrete statuses. The denormalized cost is acceptable at MVP
  // scale; pagination per rest-conventions.md §5 is the future answer.
  const all: SessionRow[] = [];
  for (const status of ['running', 'idle', 'killed'] as const) {
    all.push(...sessionsRepo.listByStatus(db, status));
  }
  return all;
}

export async function registerSessionsRoutes(
  app: FastifyInstance,
  opts: SessionsRoutesOptions,
): Promise<void> {
  app.get('/sessions', async (req: FastifyRequest): Promise<SessionListResponse> => {
    const query = SessionListQuerySchema.parse(req.query);
    // Default per D-11: ?status=running. The CLI `--all` flag maps to
    // ?status=all on the wire.
    const status = query.status ?? 'running';

    let rows: SessionRow[];
    if (query.projectId !== undefined) {
      const filter: SessionStatus | undefined =
        status === 'all' ? undefined : (status as SessionStatus);
      rows = sessionsRepo.listByProject(opts.db, query.projectId, filter);
    } else if (status === 'all') {
      rows = listAll(opts.db);
    } else {
      rows = sessionsRepo.listByStatus(opts.db, status);
    }
    return { items: rows.map(toWire) };
  });

  app.get(
    '/sessions/:id',
    async (req: FastifyRequest<{ Params: { id: string } }>): Promise<Session> => {
      const row = sessionsRepo.findById(opts.db, req.params.id);
      if (row === undefined) {
        throw new HttpProblemError({
          status: 404,
          typeSlug: 'session-not-found',
          title: 'Session not found',
          detail: `No session with id ${req.params.id}.`,
        });
      }
      return toWire(row);
    },
  );

  app.post('/sessions', async (req: FastifyRequest, reply: FastifyReply): Promise<Session> => {
    const body = SessionCreateRequestSchema.parse(req.body);

    // The registry needs the canonical project path; the store has it.
    const project = projects.findById(opts.db, body.projectId);
    if (project === undefined) {
      throw new HttpProblemError({
        status: 404,
        typeSlug: 'project-not-found',
        title: 'Project not found',
        detail: `No project with id ${body.projectId}.`,
      });
    }

    try {
      const handle = await opts.registry.create({
        projectId: body.projectId,
        personaName: body.personaName,
        canonicalProjectPath: project.canonicalPath,
      });
      const row = handle.row;
      reply.status(201).header('Location', `/sessions/${row.id}`);
      return toWire(row);
    } catch (err) {
      if (err instanceof SessionCreateError) {
        // Per session/types.ts: 'persona_not_found' | 'session_not_found'
        // both map to 404 (create() never raises session_not_found, but
        // the type narrowing stays exhaustive).
        throw new HttpProblemError({
          status: 404,
          typeSlug: err.code === 'persona_not_found' ? 'persona-not-found' : 'session-not-found',
          title: err.code === 'persona_not_found' ? 'Persona not found' : 'Session not found',
          detail: err.message,
        });
      }
      throw err;
    }
  });

  app.delete(
    '/sessions/:id',
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply): Promise<void> => {
      // Per D-11: DELETE is idempotent. Re-deleting a killed session is 204,
      // not 404 — the row stays queryable. The registry returns killed=false
      // when the session is not in the in-memory map (already terminated, or
      // never lived this boot); we treat both as the same idempotent success
      // as long as the row exists.
      const row = sessionsRepo.findById(opts.db, req.params.id);
      if (row === undefined) {
        throw new HttpProblemError({
          status: 404,
          typeSlug: 'session-not-found',
          title: 'Session not found',
          detail: `No session with id ${req.params.id}.`,
        });
      }
      opts.registry.kill(req.params.id, 'operator_kill');
      reply.status(204).send();
    },
  );
}
