/**
 * Coverage map — packages/server/src/session/CLAUDE.md constraints:
 *   Owns:
 *     - agentSessionId capture (ND-11): pre-spawn snapshot + post-spawn poll  → describe("captureAgentSessionId") > it(...)
 *     - Path encoding for ~/.claude/projects/<encodedPath>/                   → describe("encodeClaudeProjectPath") > it(...)
 *   Surprising constraints:
 *     - Capture is fire-and-forget and non-fatal; NULL is a valid terminal
 *       state (ND-11 §5)                                                       → describe("captureAgentSessionId") > it("returns null after timeout if no dir/no new file")
 *     - Dual filter: must end in .jsonl AND have a UUID stem (ND-11 §3)        → describe("captureAgentSessionId") > it("ignores non-UUID .jsonl") + it("ignores bare-UUID directories without .jsonl")
 *     - Path-encoding edge: spaces pass through textually (ND-11 §path edge)   → describe("encodeClaudeProjectPath") > it("spaces pass through textually")
 *   Does NOT own (deferred to composition):
 *     - Writing the agent_session_id column                                    → registry.ts does that on capture resolve; covered in registry.test.ts
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  captureAgentSessionId,
  claudeProjectDir,
  encodeClaudeProjectPath,
} from './agent-session-id.js';

const CANONICAL = '/home/dev/demo';

let homeOverride: string;

beforeEach(() => {
  homeOverride = mkdtempSync(join(tmpdir(), 'relay-asid-test-'));
});

afterEach(() => {
  rmSync(homeOverride, { recursive: true, force: true });
});

function projectDir(): string {
  return claudeProjectDir(CANONICAL, homeOverride);
}

function uuid(slot: number): string {
  // Deterministic v4-shape UUID stems for testing — the regex only enforces
  // hex + dashes, not the version-nibble bit pattern.
  const hex = slot.toString(16).padStart(2, '0');
  return `aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeee${hex}`;
}

describe('encodeClaudeProjectPath', () => {
  it("'/home/foo/proj' → '-home-foo-proj' (leading slash becomes leading dash)", () => {
    // Per ND-11 §1 + persona-application.md §4.3: encoding replaces EVERY '/'
    // with '-', including the leading one.
    expect(encodeClaudeProjectPath('/home/foo/proj')).toBe('-home-foo-proj');
  });

  it("'/with spaces/here' → '-with spaces-here' (spaces pass through textually)", () => {
    // Per ND-11 path-encoding edge case: empirical sample lacked spaces; the
    // implementation passes them through unchanged. If Claude Code's real
    // behavior diverges, file an ND.
    expect(encodeClaudeProjectPath('/with spaces/here')).toBe('-with spaces-here');
  });
});

describe('captureAgentSessionId — discovery (ND-11)', () => {
  it('ignores pre-existing .jsonl files as baseline; returns the new entry that appears mid-poll', async () => {
    const dir = projectDir();
    mkdirSync(dir, { recursive: true });
    // Pre-existing entry is part of the baseline; the poll must NOT report it.
    const baselineEntry = `${uuid(1)}.jsonl`;
    writeFileSync(join(dir, baselineEntry), '');

    const newEntry = uuid(2);
    const newName = `${newEntry}.jsonl`;
    // Drop the new file after a short delay so the poll observes it.
    setTimeout(() => writeFileSync(join(dir, newName), ''), 15);

    const result = await captureAgentSessionId({
      canonicalProjectPath: CANONICAL,
      homeOverride,
      intervalMs: 10,
      timeoutMs: 500,
    });
    // Per ND-11 §2: capture target is the UUID stem (without `.jsonl`).
    expect(result).toBe(newEntry);
  });

  it('returns null after timeout when the project dir does not exist (ENOENT tolerated)', async () => {
    // Per ND-11 §1: a missing pre-spawn dir is the empty-set baseline.
    // Per ND-11 §5: a timeout-no-discovery is non-fatal — returns null.
    const result = await captureAgentSessionId({
      canonicalProjectPath: CANONICAL,
      homeOverride,
      intervalMs: 10,
      timeoutMs: 60,
    });
    expect(result).toBeNull();
  });

  it('dir exists with one pre-existing .jsonl, no new files → returns null after timeout', async () => {
    const dir = projectDir();
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${uuid(1)}.jsonl`), '');

    const result = await captureAgentSessionId({
      canonicalProjectPath: CANONICAL,
      homeOverride,
      intervalMs: 10,
      timeoutMs: 60,
    });
    expect(result).toBeNull();
  });

  it('ignores a new file named notuuid.jsonl (UUID-shape required)', async () => {
    const dir = projectDir();
    mkdirSync(dir, { recursive: true });

    setTimeout(() => writeFileSync(join(dir, 'notuuid.jsonl'), ''), 15);

    // Per ND-11 §3: the entry must end in `.jsonl` AND its stem must match
    // the UUID-v4 regex. A non-UUID `.jsonl` is filtered out.
    const result = await captureAgentSessionId({
      canonicalProjectPath: CANONICAL,
      homeOverride,
      intervalMs: 10,
      timeoutMs: 60,
    });
    expect(result).toBeNull();
  });

  it('ignores a new bare-UUID directory without .jsonl extension', async () => {
    const dir = projectDir();
    mkdirSync(dir, { recursive: true });

    setTimeout(() => mkdirSync(join(dir, uuid(3))), 15);

    // Per ND-11 §3: Claude Code creates a sibling bare-UUID directory
    // (sidecar storage) alongside the .jsonl. Extension filter rejects it.
    const result = await captureAgentSessionId({
      canonicalProjectPath: CANONICAL,
      homeOverride,
      intervalMs: 10,
      timeoutMs: 60,
    });
    expect(result).toBeNull();
  });
});

describe('captureAgentSessionId — abort', () => {
  it('aborted signal short-circuits the poll and returns null', async () => {
    const dir = projectDir();
    mkdirSync(dir, { recursive: true });

    const ctl = new AbortController();
    ctl.abort();

    // Per agent-session-id.ts: aborted signal returns null inside the loop
    // before the next listMatching call.
    const result = await captureAgentSessionId({
      canonicalProjectPath: CANONICAL,
      homeOverride,
      intervalMs: 10,
      timeoutMs: 5_000,
      signal: ctl.signal,
    });
    expect(result).toBeNull();
  });
});
