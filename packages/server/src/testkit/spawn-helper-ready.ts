// Shared macOS spawn-helper preflight for every test that spawns a real
// `node-pty`. Factored out of pty/supervisor.test.ts so the visual-testing
// harness (which spawns both a server-side agent PTY and client-side PTYs)
// reuses the exact same probe + diagnostic.
//
// Per phase-0-report.md §1: pnpm's content-addressable hardlinks can drop the
// executable bit on node-pty's macOS spawn-helper. If that happens, every
// PTY spawn fails with an opaque `posix_spawnp failed.`. Probe the prebuild and
// let callers `describe.skip` with a clear diagnostic so a contributor knows to
// run `pnpm --filter @relay/spike fix-pty`. On Linux/Windows there is no
// spawn-helper to chmod — node-pty uses different code paths.

import { globSync, statSync } from 'node:fs';
import { platform, arch } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export function spawnHelperReady(): { ok: boolean; reason: string } {
  if (platform() !== 'darwin') return { ok: true, reason: 'non-macOS' };
  const here = dirname(fileURLToPath(import.meta.url));
  // Walk up to repo root from packages/server/src/testkit/.
  const repoRoot = resolve(here, '../../../../');
  const pattern = `node_modules/.pnpm/node-pty@*/node_modules/node-pty/prebuilds/darwin-${arch()}/spawn-helper`;
  const matches = globSync(pattern, { cwd: repoRoot });
  if (matches.length === 0) {
    return { ok: false, reason: `spawn-helper not found under ${repoRoot} (pattern: ${pattern})` };
  }
  for (const rel of matches) {
    const mode = statSync(resolve(repoRoot, rel)).mode & 0o111;
    if (mode === 0) {
      return {
        ok: false,
        reason: `spawn-helper missing exec bit at ${rel} — run \`pnpm --filter @relay/spike fix-pty\``,
      };
    }
  }
  return { ok: true, reason: 'ready' };
}
