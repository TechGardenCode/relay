// Per ND-12 + docs/arch/persona-application.md §4.2. Single source of truth for
// the spawn.json audit file written into ~/.relay/sessions/<sid>/ at session
// spawn. The runtime writer in packages/server/src/session/spawn.ts (build-plan
// 6E) validates writes against this schema; the future `relay session inspect`
// reader validates reads against it.
//
// Strict mode rejects unknown top-level keys so spec drift surfaces as
// validation failures rather than silent forks.

import { z } from 'zod';

export const SpawnRecordSchema = z
  .object({
    schemaVersion: z.literal(1),
    sessionId: z.string(),
    projectId: z.string(),
    // Per D-17, personas are descoped from MVP; the optional persona fields were
    // removed with the persona code (restore: tag pre-cleanup-phase1). MVP writers
    // never emitted them, so no MVP-written spawn.json fails strict validation.
    argv: z.array(z.string()),
    envNames: z.array(z.string()),
    cwd: z.string(),
    agentCli: z.string(),
    mcpJsonPath: z.string().nullable(),
    spawnedAt: z.string().datetime(),
  })
  .strict();

export type SpawnRecord = z.infer<typeof SpawnRecordSchema>;
