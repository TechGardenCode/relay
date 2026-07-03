import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const scriptDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts');

describe('postinstall.mjs', () => {
  it('exits 0 and reports no addon load failure on a supported platform', () => {
    const out = execFileSync('node', [join(scriptDir, 'postinstall.mjs')], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    // node-pty + better-sqlite3 are installed in the workspace, so no WARNING.
    expect(out).not.toMatch(/WARNING/);
  });
});
