import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const scriptDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts');

describe('postinstall.mjs', () => {
  it('exits 0 and emits no addon-load WARNING on a supported platform', () => {
    const { status, stderr } = spawnSync('node', [join(scriptDir, 'postinstall.mjs')], {
      encoding: 'utf8',
    });
    expect(status).toBe(0);
    // node-pty + better-sqlite3 are installed in the workspace, so no WARNING on stderr.
    expect(stderr).not.toMatch(/WARNING/);
  });
});
