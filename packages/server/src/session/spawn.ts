import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { SpawnRecordSchema, type SpawnRecord } from '@relay/protocol';

import { sessionWorkDir } from '../config/paths.js';

// Per ND-12 + persona-application.md §4.2. spawn.json owner-only readable;
// the parent transient dir is owner-only listable. Mirrors transcript/writer.ts
// and auth/store.ts mode pattern.
const SPAWN_JSON_MODE = 0o600;
const SESSION_DIR_MODE = 0o700;

// Per D-17: buildArgv() and hashPersonaFile() were removed when personas were
// descoped from MVP. They composed the agent argv from a persona's fields
// (--model / --append-system-prompt / --mcp-config / --disable-slash-commands)
// and hashed the persona YAML for the spawn record. Sessions now spawn a bare
// agent (empty argv) and write no transient mcp.json, so neither helper has a
// caller. The persona module stays dormant; restore these from git history for
// the Phase-2 persona re-enable.

export interface WriteTransientDirArgs {
  sid: string;
  homeOverride?: string;
  spawnRecord: SpawnRecord;
}

// Writes the per-session transient dir at ~/.relay/sessions/<sid>/. Emits
// spawn.json (validated against the ND-12 schema). Per D-17 no mcp.json is
// written — bare-agent spawn carries no persona-derived MCP config.
export function writeTransientDir(args: WriteTransientDirArgs): void {
  const dir = sessionWorkDir(args.sid, args.homeOverride);
  mkdirSync(dir, { recursive: true, mode: SESSION_DIR_MODE });
  // Validate before write so a malformed record fails loud instead of
  // landing on disk for the future `relay session inspect` reader to choke on.
  const validated = SpawnRecordSchema.parse(args.spawnRecord);
  writeFileSync(join(dir, 'spawn.json'), JSON.stringify(validated, null, 2), {
    mode: SPAWN_JSON_MODE,
  });
}
