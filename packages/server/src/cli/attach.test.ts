// `relay attach <sid>` dispatcher. Covers the error paths that should not
// require a running server (no token, no URL config).
//
// The happy-path attach exercise lives in attach/client.test.ts (FSM) and
// attach/tty.test.ts (TTY bridge). End-to-end "from CLI through real WS
// against a live server" is the responsibility of scenario-runner walking
// scenario E's plain-attach variant — not duplicated here as a unit test.

import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AttachConfigError } from '../attach/config.js';
import { runAttach } from './attach.js';

let home: string;
let savedHome: string | undefined;
let savedRelayToken: string | undefined;

beforeEach(() => {
  home = realpathSync(mkdtempSync(join(tmpdir(), 'relay-cli-attach-')));
  savedHome = process.env['HOME'];
  savedRelayToken = process.env['RELAY_TOKEN'];
  process.env['HOME'] = home;
  delete process.env['RELAY_TOKEN'];
  mkdirSync(join(home, '.relay'), { recursive: true });
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  if (savedHome === undefined) delete process.env['HOME'];
  else process.env['HOME'] = savedHome;
  if (savedRelayToken === undefined) delete process.env['RELAY_TOKEN'];
  else process.env['RELAY_TOKEN'] = savedRelayToken;
});

describe('runAttach error paths', () => {
  it('rejects when no token is available (no --token, no RELAY_TOKEN)', async () => {
    writeFileSync(
      join(home, '.relay', 'config.yaml'),
      'host: 127.0.0.1\nport: 7777\nclaimLockTimeoutSeconds: 30\nreplayBufferBytes: 32768\n',
    );
    await expect(
      runAttach({ sessionId: '01J7ZXY9PQ2K0M4B6F3HV8C5R7', homeOverride: home }),
    ).rejects.toBeInstanceOf(AttachConfigError);
  });

  it('returns a non-zero exit code when the WS upgrade fails (server unreachable)', async () => {
    writeFileSync(
      join(home, '.relay', 'config.yaml'),
      'host: 127.0.0.1\nport: 1\nclaimLockTimeoutSeconds: 30\nreplayBufferBytes: 32768\n',
    );
    const code = await runAttach({
      sessionId: '01J7ZXY9PQ2K0M4B6F3HV8C5R7',
      token: 'fake-token',
      homeOverride: home,
    });
    expect(code).toBe(2);
  });
});
