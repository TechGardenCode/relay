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
    personaName: z.string(),
    personaSource: z.enum(['tenant', 'project']),
    personaFilePath: z.string(),
    personaContentHash: z.string(),
    argv: z.array(z.string()),
    envNames: z.array(z.string()),
    cwd: z.string(),
    agentCli: z.string(),
    mcpJsonPath: z.string().nullable(),
    spawnedAt: z.string().datetime(),
  })
  .strict();

export type SpawnRecord = z.infer<typeof SpawnRecordSchema>;
