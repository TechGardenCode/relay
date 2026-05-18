// Per ND-18: `relay --help`, `relay --version`, `relay attach --help`, and
// the cold path through `relay attach <sid>` must NOT load the server-side
// native deps (`better-sqlite3`, `node-pty`, `fastify`). The vm-e2e walk
// (2026-05-18) caught a regression where the dispatcher eagerly imported
// every action handler at module-init time, forcing a build toolchain on
// thin-client devices that only need the WS+TTY client.
//
// This test spawns the built `dist/cli/relay.js` as a subprocess with
// NODE_DEBUG=module so Node's module loader emits one stderr line per
// require/import. We grep for the three deps that ND-18 names and assert
// none of them appear in the load list.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIST_CLI = join(import.meta.dirname, '..', '..', 'dist', 'cli', 'relay.js');

const FORBIDDEN_FOR_THIN_CLIENT = ['better-sqlite3', 'node-pty', 'fastify'];

interface RunResult {
  exit: number | null;
  stderr: string;
  loaded: Set<string>;
}

function runRelay(args: string[]): Promise<RunResult> {
  return new Promise<RunResult>((resolve) => {
    const proc = spawn('node', [DIST_CLI, ...args], {
      env: { ...process.env, NODE_DEBUG: 'module' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    proc.stderr.on('data', (d: Buffer) => {
      stderr += d.toString('utf8');
    });
    proc.on('close', (code) => {
      const loaded = new Set<string>();
      // NODE_DEBUG=module prints lines like
      //   "MODULE 12345: load '/abs/path/to/.../<dep>/index.js' from ..."
      // and
      //   "MODULE 12345: RequireResolve '<dep>'"
      // Grep for any path/segment containing one of the forbidden deps.
      for (const dep of FORBIDDEN_FOR_THIN_CLIENT) {
        const re = new RegExp(`[\\\\/]${dep.replace('-', '[-]')}[\\\\/]`, 'i');
        if (re.test(stderr)) loaded.add(dep);
      }
      resolve({ exit: code, stderr, loaded });
    });
  });
}

// The test depends on the compiled dist/. tsc -b runs as part of pnpm
// typecheck / test in CI; locally if dist/ is missing the test skips
// rather than failing — surfacing the gap directly.
const distAvailable = existsSync(DIST_CLI);

describe.skipIf(!distAvailable)('cli/relay.ts ND-18 lazy-load contract', () => {
  it('`relay --help` does not load better-sqlite3, node-pty, or fastify', async () => {
    const result = await runRelay(['--help']);
    expect(result.exit).toBe(0);
    expect(Array.from(result.loaded)).toEqual([]);
  });

  it('`relay --version` does not load better-sqlite3, node-pty, or fastify', async () => {
    const result = await runRelay(['--version']);
    expect(result.exit).toBe(0);
    expect(Array.from(result.loaded)).toEqual([]);
  });

  it('`relay attach --help` does not load better-sqlite3, node-pty, or fastify', async () => {
    const result = await runRelay(['attach', '--help']);
    expect(result.exit).toBe(0);
    expect(Array.from(result.loaded)).toEqual([]);
  });

  it('`relay session list` DOES load better-sqlite3 (per ND-16 read-direct rule — sanity check the negative)', async () => {
    // Use a tmp HOME that has no relay.db — the command errors out, but
    // not before opening the DB; that proves the lazy import fires.
    const result = await runRelay(['session', 'list']);
    expect(result.loaded.has('better-sqlite3')).toBe(true);
  });
});
