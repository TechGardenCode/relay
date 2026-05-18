import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { type Persona, SpawnRecordSchema, type SpawnRecord } from '@relay/protocol';

import { sessionWorkDir } from '../config/paths.js';

// Per ND-12 + persona-application.md §4.2. spawn.json owner-only readable;
// the parent transient dir is owner-only listable. Mirrors transcript/writer.ts
// and auth/store.ts mode pattern.
const SPAWN_JSON_MODE = 0o600;
const SESSION_DIR_MODE = 0o700;

export interface BuildArgvResult {
  // CLI args AFTER the agent binary name (e.g. ['--model', 'opus', ...]).
  // Caller composes the full argv as [agentCli, ...result.argv].
  argv: string[];
  // When persona.mcpServers is set, the absolute path to the transient mcp.json
  // the writer must materialize; null otherwise (no flag, no file).
  mcpJsonPath: string | null;
  // When mcpJsonPath is non-null, the JSON content to write at that path.
  mcpJsonPayload: string | null;
}

// Per persona-application.md §4.1 + §5 mapping table.
//
// Phase 1 caveat: non-empty mcpServers lists are NOT filtered against the
// native ~/.claude.json + <project>/.mcp.json. Any mcpServers commitment
// (empty or populated list) routes via an empty transient mcp.json with
// --strict-mcp-config — which means the agent sees zero MCP servers. None of
// the 1A defaults set mcpServers; if a user-authored persona triggers it, the
// honest "zero MCP" degradation surfaces immediately. File a follow-up ND to
// land the native-config filter when that happens.
export function buildArgv(persona: Persona, sid: string, homeOverride?: string): BuildArgvResult {
  const argv: string[] = [];
  let mcpJsonPath: string | null = null;
  let mcpJsonPayload: string | null = null;

  if (persona.model !== undefined) {
    argv.push('--model', persona.model);
  }
  if (persona.systemPrompt !== undefined) {
    argv.push('--append-system-prompt', persona.systemPrompt);
  }
  if (persona.mcpServers !== undefined && persona.mcpServers !== null) {
    mcpJsonPath = join(sessionWorkDir(sid, homeOverride), 'mcp.json');
    mcpJsonPayload = JSON.stringify({ mcpServers: {} }, null, 2);
    argv.push('--mcp-config', mcpJsonPath, '--strict-mcp-config');
  }
  if (Array.isArray(persona.skills) && persona.skills.length === 0) {
    argv.push('--disable-slash-commands');
  }
  return { argv, mcpJsonPath, mcpJsonPayload };
}

export interface WriteTransientDirArgs {
  sid: string;
  homeOverride?: string;
  spawnRecord: SpawnRecord;
  mcpJsonPath: string | null;
  mcpJsonPayload: string | null;
}

// Writes the per-session transient dir at ~/.relay/sessions/<sid>/. Always
// emits spawn.json (validated against the ND-12 schema); emits mcp.json when
// the persona sets mcpServers.
export function writeTransientDir(args: WriteTransientDirArgs): void {
  const dir = sessionWorkDir(args.sid, args.homeOverride);
  mkdirSync(dir, { recursive: true, mode: SESSION_DIR_MODE });
  // Validate before write so a malformed record fails loud instead of
  // landing on disk for the future `relay session inspect` reader to choke on.
  const validated = SpawnRecordSchema.parse(args.spawnRecord);
  writeFileSync(join(dir, 'spawn.json'), JSON.stringify(validated, null, 2), {
    mode: SPAWN_JSON_MODE,
  });
  if (args.mcpJsonPath !== null && args.mcpJsonPayload !== null) {
    writeFileSync(args.mcpJsonPath, args.mcpJsonPayload, { mode: SPAWN_JSON_MODE });
  }
}

// Per ND-12: personaContentHash is sha256 of the YAML bytes at spawn time.
// Proves which exact bytes resolved even if the file is later edited; the
// future forensic reader can detect drift between spawn.json and the current
// persona file content.
export function hashPersonaFile(filePath: string): string {
  const bytes = readFileSync(filePath);
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}
