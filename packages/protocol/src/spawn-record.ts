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
    // Per D-17, personas are descoped from MVP (dormant module). Sessions spawn
    // a bare agent, so the runtime writer omits these four fields; they stay
    // optional (not removed) so a Phase-2 persona re-enable restores them
    // without a schemaVersion bump.
    personaName: z.string().optional(),
    personaSource: z.enum(['tenant', 'project']).optional(),
    personaFilePath: z.string().optional(),
    personaContentHash: z.string().optional(),
    argv: z.array(z.string()),
    envNames: z.array(z.string()),
    cwd: z.string(),
    agentCli: z.string(),
    mcpJsonPath: z.string().nullable(),
    spawnedAt: z.string().datetime(),
  })
  .strict();

export type SpawnRecord = z.infer<typeof SpawnRecordSchema>;
