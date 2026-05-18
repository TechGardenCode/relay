/**
 * Coverage map — packages/server/src/session/CLAUDE.md constraints:
 *   Owns:
 *     - Build CLI argv from persona (persona-application.md §5 mapping)   → describe("buildArgv") > it("...")
 *     - Write transient ~/.relay/sessions/<sid>/ with spawn.json + mcp.json → describe("writeTransientDir") > it("...")
 *     - Hash persona file content for spawn.json provenance (ND-12)        → describe("hashPersonaFile") > it("...")
 *   Surprising constraints:
 *     - spawn.json validated against SpawnRecordSchema BEFORE write (ND-12) → describe("writeTransientDir") > it("rejects malformed SpawnRecord with a Zod error")
 *     - Non-empty mcpServers produces empty {mcpServers: {}} mcp.json
 *       (Phase 1 caveat in session/CLAUDE.md)                              → describe("buildArgv") > it("mcpServers: ['foo'] still routes via empty mcp.json")
 *     - spawn.json records envNames as KEYS only, never values             → describe("writeTransientDir") > it("envNames carries keys only, no values bleed into the file")
 *   Does NOT own (deferred to composition):
 *     - Actually spawning the agent (→ pty/)                              → enforced by import surface; spawn.ts has no node-pty dep
 */

import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SpawnRecordSchema, type Persona, type SpawnRecord } from '@relay/protocol';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { sessionWorkDir } from '../config/paths.js';

import { buildArgv, hashPersonaFile, writeTransientDir } from './spawn.js';

let homeOverride: string;

beforeEach(() => {
  homeOverride = mkdtempSync(join(tmpdir(), 'relay-session-spawn-test-'));
});

afterEach(() => {
  rmSync(homeOverride, { recursive: true, force: true });
});

function persona(overrides: Partial<Persona> = {}): Persona {
  return { schemaVersion: 1, name: 'x', ...overrides } as Persona;
}

function baseSpawnRecord(sid: string): SpawnRecord {
  return {
    schemaVersion: 1,
    sessionId: sid,
    projectId: '01HXYZ000000000000PROJ0000',
    personaName: 'x',
    personaSource: 'tenant',
    personaFilePath: '/tmp/x.yaml',
    personaContentHash: 'sha256:deadbeef',
    argv: ['claude'],
    envNames: [],
    cwd: '/home/dev/demo',
    agentCli: 'claude',
    mcpJsonPath: null,
    spawnedAt: new Date(1_700_000_000_000).toISOString(),
  };
}

describe('buildArgv — persona-application.md §5 mapping', () => {
  it('empty persona (only schemaVersion + name) → no argv, no mcp.json', () => {
    const result = buildArgv(persona(), 'sid-1', homeOverride);
    // Per persona-application.md §4.1: "an empty persona is a no-op."
    expect(result.argv).toEqual([]);
    expect(result.mcpJsonPath).toBeNull();
    expect(result.mcpJsonPayload).toBeNull();
  });

  it("model: 'opus' → ['--model', 'opus']", () => {
    const { argv } = buildArgv(persona({ model: 'opus' }), 'sid-1', homeOverride);
    expect(argv).toEqual(['--model', 'opus']);
  });

  it("systemPrompt: 'be terse' → ['--append-system-prompt', 'be terse']", () => {
    const { argv } = buildArgv(persona({ systemPrompt: 'be terse' }), 'sid-1', homeOverride);
    expect(argv).toEqual(['--append-system-prompt', 'be terse']);
  });

  it("skills: [] (explicitly empty) → ['--disable-slash-commands']", () => {
    const { argv } = buildArgv(persona({ skills: [] }), 'sid-1', homeOverride);
    // Per persona-application.md §5 mapping: `skills: []` (explicitly empty)
    // → `--disable-slash-commands`.
    expect(argv).toEqual(['--disable-slash-commands']);
  });

  it("skills: ['foo'] (non-empty) → NO --disable-slash-commands (ND-08 advisory)", () => {
    const { argv } = buildArgv(persona({ skills: ['foo'] }), 'sid-1', homeOverride);
    // Per ND-08: non-empty `skills:` is advisory at MVP — the persona module
    // surfaces the list but spawn.ts does not gate on it.
    expect(argv).not.toContain('--disable-slash-commands');
    expect(argv).toEqual([]);
  });

  it('mcpServers: [] → mcp.json path set, argv includes --mcp-config + --strict-mcp-config', () => {
    const sid = 'sid-mcp-empty';
    const { argv, mcpJsonPath, mcpJsonPayload } = buildArgv(
      persona({ mcpServers: [] }),
      sid,
      homeOverride,
    );
    const expectedPath = join(sessionWorkDir(sid, homeOverride), 'mcp.json');
    expect(mcpJsonPath).toBe(expectedPath);
    expect(mcpJsonPayload).not.toBeNull();
    // Per persona-application.md §5: empty-but-strict yields zero MCP servers.
    expect(JSON.parse(mcpJsonPayload as string)).toEqual({ mcpServers: {} });
    expect(argv).toEqual(['--mcp-config', expectedPath, '--strict-mcp-config']);
  });

  it("mcpServers: ['foo'] still routes via empty mcp.json (Phase 1 caveat)", () => {
    const sid = 'sid-mcp-populated';
    const { argv, mcpJsonPath, mcpJsonPayload } = buildArgv(
      persona({ mcpServers: ['foo'] }),
      sid,
      homeOverride,
    );
    // Per session/CLAUDE.md "Surprising constraints" §6 + spawn.ts header:
    // Phase 1 stubs non-empty mcpServers with {mcpServers: {}} — the agent
    // sees zero MCP servers (honest degradation). The native-config filter
    // is a follow-up ND when a user persona first triggers the gap.
    expect(JSON.parse(mcpJsonPayload as string)).toEqual({ mcpServers: {} });
    expect(argv).toEqual(['--mcp-config', mcpJsonPath as string, '--strict-mcp-config']);
  });

  it('all flags combined produce them in documented order', () => {
    const sid = 'sid-all';
    const { argv, mcpJsonPath } = buildArgv(
      persona({
        model: 'opus',
        systemPrompt: 'be terse',
        mcpServers: [],
        skills: [],
      }),
      sid,
      homeOverride,
    );
    // Per persona-application.md §7 sketch:
    //   [--model, --append-system-prompt, --mcp-config + --strict-mcp-config,
    //    --disable-slash-commands]
    expect(argv).toEqual([
      '--model',
      'opus',
      '--append-system-prompt',
      'be terse',
      '--mcp-config',
      mcpJsonPath as string,
      '--strict-mcp-config',
      '--disable-slash-commands',
    ]);
  });
});

describe('writeTransientDir — ND-12 schema + persona-application.md §4.2', () => {
  it('creates ~/.relay/sessions/<sid>/ and writes a valid spawn.json', () => {
    const sid = 'sid-write-1';
    const record = baseSpawnRecord(sid);
    writeTransientDir({
      sid,
      homeOverride,
      spawnRecord: record,
      mcpJsonPath: null,
      mcpJsonPayload: null,
    });

    const dir = sessionWorkDir(sid, homeOverride);
    expect(statSync(dir).isDirectory()).toBe(true);

    const path = join(dir, 'spawn.json');
    const onDisk = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    const parsed = SpawnRecordSchema.parse(onDisk);
    expect(parsed.sessionId).toBe(sid);
  });

  it('envNames carries keys only, no values bleed into the file', () => {
    const sid = 'sid-env';
    const record: SpawnRecord = {
      ...baseSpawnRecord(sid),
      envNames: ['FOO', 'BAR'].sort(),
    };
    writeTransientDir({
      sid,
      homeOverride,
      spawnRecord: record,
      mcpJsonPath: null,
      mcpJsonPayload: null,
    });

    const raw = readFileSync(join(sessionWorkDir(sid, homeOverride), 'spawn.json'), 'utf8');
    const parsed = JSON.parse(raw) as { envNames: string[] };
    // Per persona-application.md §4.2 + ND-12: envNames is keys ONLY. Values
    // are secrets per the threat model; they must never land in spawn.json.
    expect(parsed.envNames).toEqual(['BAR', 'FOO']);
    expect(raw).not.toContain('fooval');
    expect(raw).not.toContain('barval');
  });

  it('on-disk spawn.json round-trips through SpawnRecordSchema', () => {
    const sid = 'sid-roundtrip';
    const record = baseSpawnRecord(sid);
    writeTransientDir({
      sid,
      homeOverride,
      spawnRecord: record,
      mcpJsonPath: null,
      mcpJsonPayload: null,
    });

    const raw = readFileSync(join(sessionWorkDir(sid, homeOverride), 'spawn.json'), 'utf8');
    const reread = SpawnRecordSchema.parse(JSON.parse(raw));
    expect(reread).toEqual(record);
  });

  it('mcpJsonPath null → no mcp.json file is written', () => {
    const sid = 'sid-no-mcp';
    writeTransientDir({
      sid,
      homeOverride,
      spawnRecord: baseSpawnRecord(sid),
      mcpJsonPath: null,
      mcpJsonPayload: null,
    });
    expect(() => statSync(join(sessionWorkDir(sid, homeOverride), 'mcp.json'))).toThrow(/ENOENT/);
  });

  it('mcpJsonPath set → mcp.json materializes at that path with the payload', () => {
    const sid = 'sid-mcp';
    const dir = sessionWorkDir(sid, homeOverride);
    const mcpPath = join(dir, 'mcp.json');
    const payload = JSON.stringify({ mcpServers: {} }, null, 2);
    writeTransientDir({
      sid,
      homeOverride,
      spawnRecord: { ...baseSpawnRecord(sid), mcpJsonPath: mcpPath },
      mcpJsonPath: mcpPath,
      mcpJsonPayload: payload,
    });

    expect(readFileSync(mcpPath, 'utf8')).toBe(payload);
  });

  it('rejects malformed SpawnRecord with a Zod parse error BEFORE writing', () => {
    const sid = 'sid-bad';
    // Per ND-12 + session/CLAUDE.md "Surprising constraints" §7: spawn.json
    // is validated against SpawnRecordSchema BEFORE the write — a malformed
    // record fails loud rather than landing on disk.
    const broken = { ...baseSpawnRecord(sid) } as unknown as Record<string, unknown>;
    delete broken.schemaVersion;
    expect(() =>
      writeTransientDir({
        sid,
        homeOverride,
        spawnRecord: broken as unknown as SpawnRecord,
        mcpJsonPath: null,
        mcpJsonPayload: null,
      }),
    ).toThrow();
    // The dir is created before the validate-then-write path, but spawn.json
    // must not exist (the validate runs before the writeFile).
    expect(() => statSync(join(sessionWorkDir(sid, homeOverride), 'spawn.json'))).toThrow(/ENOENT/);
  });
});

describe('hashPersonaFile — ND-12 provenance', () => {
  it('returns sha256:<64-hex> for a real file', () => {
    const path = join(homeOverride, 'fixture.yaml');
    writeFileSync(path, 'schemaVersion: 1\nname: x\n');
    const hash = hashPersonaFile(path);
    expect(hash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('same content → same hash', () => {
    const a = join(homeOverride, 'a.yaml');
    const b = join(homeOverride, 'b.yaml');
    writeFileSync(a, 'schemaVersion: 1\nname: x\n');
    writeFileSync(b, 'schemaVersion: 1\nname: x\n');
    expect(hashPersonaFile(a)).toBe(hashPersonaFile(b));
  });

  it('different content → different hash', () => {
    const a = join(homeOverride, 'a.yaml');
    const b = join(homeOverride, 'b.yaml');
    writeFileSync(a, 'schemaVersion: 1\nname: x\n');
    writeFileSync(b, 'schemaVersion: 1\nname: y\n');
    expect(hashPersonaFile(a)).not.toBe(hashPersonaFile(b));
  });
});
