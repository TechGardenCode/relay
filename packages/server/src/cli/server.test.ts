// `relay server` boots the REST + WS surface against ~/.relay/relay.db.
// Verifies the boot order from session/registry.ts initServer + buildServer
// composition, and exercises the --config override.

import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runInit } from './init.js';
import { runServer } from './server.js';

const MIGRATIONS_DIR = join(import.meta.dirname, '..', 'store', 'migrations');

let home: string;

beforeEach(() => {
  home = realpathSync(mkdtempSync(join(tmpdir(), 'relay-cli-server-')));
  runInit({ home });
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

describe('runServer', () => {
  it('boots end-to-end: openDatabase → initServer → buildServer → listen', async () => {
    const server = await runServer({
      homeOverride: home,
      migrationsDirOverride: MIGRATIONS_DIR,
      logger: false,
      listenOverride: { host: '127.0.0.1', port: 0 },
    });
    try {
      const address = server.app.server.address();
      expect(address).not.toBeNull();
      expect(typeof address === 'object' && address !== null ? address.port : 0).toBeGreaterThan(0);
    } finally {
      await server.shutdown();
    }
  });

  it('uses --config <path> to load a non-default config file', async () => {
    const customConfig = join(home, 'custom.yaml');
    writeFileSync(
      customConfig,
      'host: 127.0.0.1\nport: 9999\nclaimLockTimeoutSeconds: 5\nreplayBufferBytes: 1024\n',
    );
    const server = await runServer({
      homeOverride: home,
      configPath: customConfig,
      migrationsDirOverride: MIGRATIONS_DIR,
      logger: false,
      listenOverride: { host: '127.0.0.1', port: 0 },
    });
    try {
      expect(server.config.claimLockTimeoutSeconds).toBe(5);
      expect(server.config.replayBufferBytes).toBe(1024);
    } finally {
      await server.shutdown();
    }
  });

  it('shutdown() closes the Fastify app, drains the registry, and closes the DB without throwing', async () => {
    const server = await runServer({
      homeOverride: home,
      migrationsDirOverride: MIGRATIONS_DIR,
      logger: false,
      listenOverride: { host: '127.0.0.1', port: 0 },
    });
    await expect(server.shutdown()).resolves.toBeUndefined();
  });
});
