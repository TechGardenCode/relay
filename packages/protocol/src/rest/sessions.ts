// Per prd/03-server.md §2. The session resource mirrors the store-layer
// SessionRow, projected to camelCase + ISO-8601 timestamps on the wire.

import { z } from 'zod';

import { IsoTimestampSchema, UlidSchema } from './common.js';

// Per sqlite-schema.md §3.3 + sessions.ts. `idle` is a reserved status value
// with no MVP transition (per 08-acceptance.md "Explicit Phase 1 deferrals").
export const SessionStatusSchema = z.enum(['running', 'idle', 'killed']);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

export const SessionSchema = z
  .object({
    id: UlidSchema,
    projectId: UlidSchema,
    personaName: z.string(),
    agentCli: z.string(),
    agentSessionId: z.string().nullable(),
    ptyPid: z.number().int().nullable(),
    status: SessionStatusSchema,
    // Per D-11 + sqlite-schema.md §3.3: column is free-form TEXT; documented
    // values are 'server_restart', 'operator_kill', 'agent_exit'. The wire
    // keeps it as string to allow future reasons without a schema change.
    terminatedReason: z.string().nullable(),
    totalBytes: z.number().int().nonnegative(),
    createdAt: IsoTimestampSchema,
    updatedAt: IsoTimestampSchema,
  })
  .strict();

export type Session = z.infer<typeof SessionSchema>;

// POST /sessions — body picks the (project, persona) pair. The server reads
// the project's canonical path from the store and passes it to
// registry.create(). `personaName` resolves against the composed tenant +
// project persona set (per D-09).
export const SessionCreateRequestSchema = z
  .object({
    projectId: UlidSchema,
    personaName: z.string(),
  })
  .strict();

export type SessionCreateRequest = z.infer<typeof SessionCreateRequestSchema>;

// GET /sessions — defaults to ?status=running per D-11. ?status=all is the
// escape hatch for the CLI `--all` mirror.
export const SessionListStatusFilterSchema = z.enum(['running', 'idle', 'killed', 'all']);
export type SessionListStatusFilter = z.infer<typeof SessionListStatusFilterSchema>;

export const SessionListQuerySchema = z
  .object({
    status: SessionListStatusFilterSchema.optional(),
    projectId: UlidSchema.optional(),
  })
  .strict();
export type SessionListQuery = z.infer<typeof SessionListQuerySchema>;

export const SessionListResponseSchema = z
  .object({
    items: z.array(SessionSchema),
  })
  .strict();
export type SessionListResponse = z.infer<typeof SessionListResponseSchema>;
