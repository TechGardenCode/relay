/**
 * Coverage map — packages/server/src/session/CLAUDE.md constraints:
 *   Owns:
 *     - Write transient ~/.relay/sessions/<sid>/ with spawn.json            → describe("writeTransientDir") > it("...")
 *   Surprising constraints:
 *     - spawn.json validated against SpawnRecordSchema BEFORE write (ND-12) → describe("writeTransientDir") > it("rejects malformed SpawnRecord with a Zod error")
 *     - spawn.json records envNames as KEYS only, never values             → describe("writeTransientDir") > it("envNames carries keys only, no values bleed into the file")
 *
 * Per D-17 the buildArgv / hashPersonaFile describe blocks were removed with the
 * persona spawn path; sessions spawn a bare agent (argv: [agentCli]) and write
 * no transient mcp.json. Restore those tests from git history at Phase-2 re-enable.
 */

import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SpawnRecordSchema, type SpawnRecord } from '@relay/protocol';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { sessionWorkDir } from '../config/paths.js';

import { writeTransientDir } from './spawn.js';

let homeOverride: string;

beforeEach(() => {
  homeOverride = mkdtempSync(join(tmpdir(), 'relay-session-spawn-test-'));
});

afterEach(() => {
  rmSync(homeOverride, { recursive: true, force: true });
});

// Per D-17: a bare-agent spawn record — the persona fields were removed from
// SpawnRecordSchema and argv is just the agent binary.
function baseSpawnRecord(sid: string): SpawnRecord {
  return {
    schemaVersion: 1,
    sessionId: sid,
    projectId: '01HXYZ000000000000PROJ0000',
    argv: ['claude'],
    envNames: [],
    cwd: '/home/dev/demo',
    agentCli: 'claude',
    mcpJsonPath: null,
    spawnedAt: new Date(1_700_000_000_000).toISOString(),
  };
}

describe('writeTransientDir — ND-12 schema', () => {
  it('creates ~/.relay/sessions/<sid>/ and writes a valid spawn.json', () => {
    const sid = 'sid-write-1';
    const record = baseSpawnRecord(sid);
    writeTransientDir({ sid, homeOverride, spawnRecord: record });

    const dir = sessionWorkDir(sid, homeOverride);
    expect(statSync(dir).isDirectory()).toBe(true);

    const path = join(dir, 'spawn.json');
    const onDisk = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    const parsed = SpawnRecordSchema.parse(onDisk);
    expect(parsed.sessionId).toBe(sid);
  });

  it('records a bare-agent argv with no persona fields (D-17)', () => {
    const sid = 'sid-bare';
    writeTransientDir({ sid, homeOverride, spawnRecord: baseSpawnRecord(sid) });
    const raw = readFileSync(join(sessionWorkDir(sid, homeOverride), 'spawn.json'), 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    expect(parsed.argv).toEqual(['claude']);
    expect(parsed.personaName).toBeUndefined();
    expect(parsed.personaSource).toBeUndefined();
    expect(parsed.personaFilePath).toBeUndefined();
    expect(parsed.personaContentHash).toBeUndefined();
  });

  it('envNames carries keys only, no values bleed into the file', () => {
    const sid = 'sid-env';
    const record: SpawnRecord = {
      ...baseSpawnRecord(sid),
      envNames: ['FOO', 'BAR'].sort(),
    };
    writeTransientDir({ sid, homeOverride, spawnRecord: record });

    const raw = readFileSync(join(sessionWorkDir(sid, homeOverride), 'spawn.json'), 'utf8');
    const parsed = JSON.parse(raw) as { envNames: string[] };
    // Per ND-12: envNames is keys ONLY. Values are secrets per the threat
    // model; they must never land in spawn.json.
    expect(parsed.envNames).toEqual(['BAR', 'FOO']);
    expect(raw).not.toContain('fooval');
    expect(raw).not.toContain('barval');
  });

  it('on-disk spawn.json round-trips through SpawnRecordSchema', () => {
    const sid = 'sid-roundtrip';
    const record = baseSpawnRecord(sid);
    writeTransientDir({ sid, homeOverride, spawnRecord: record });

    const raw = readFileSync(join(sessionWorkDir(sid, homeOverride), 'spawn.json'), 'utf8');
    const reread = SpawnRecordSchema.parse(JSON.parse(raw));
    expect(reread).toEqual(record);
  });

  it('rejects malformed SpawnRecord with a Zod parse error BEFORE writing', () => {
    const sid = 'sid-bad';
    // Per ND-12 + session/CLAUDE.md: spawn.json is validated against
    // SpawnRecordSchema BEFORE the write — a malformed record fails loud
    // rather than landing on disk.
    const broken = { ...baseSpawnRecord(sid) } as unknown as Record<string, unknown>;
    delete broken.schemaVersion;
    expect(() =>
      writeTransientDir({
        sid,
        homeOverride,
        spawnRecord: broken as unknown as SpawnRecord,
      }),
    ).toThrow();
    // The dir is created before the validate-then-write path, but spawn.json
    // must not exist (the validate runs before the writeFile).
    expect(() => statSync(join(sessionWorkDir(sid, homeOverride), 'spawn.json'))).toThrow(/ENOENT/);
  });
});
