// Per ND-36 + Track 8 spike: tests for the /app/* static-serve module.
// The dist directory is faked via a tmpdir fixture; the spike-pwa build
// is not a test prerequisite.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { RevocationBus, TokenStore } from '../../auth/index.js';
import { tokensPath } from '../../config/paths.js';
import { createRegistry, type SessionRegistry } from '../../session/index.js';
import { runMigrations, openDatabase, tenants, type Database } from '../../store/index.js';
import { migrationsDirForTests } from '../rest/test-helpers.js';
import { buildServer } from '../index.js';

interface StaticTestRig {
  app: FastifyInstance;
  spikePwaDist: string;
  homeOverride: string;
  db: Database;
  registry: SessionRegistry;
  cleanup: () => Promise<void>;
}

async function makeStaticRig(): Promise<StaticTestRig> {
  // Spike-pwa dist fixture.
  const spikePwaDist = mkdtempSync(join(tmpdir(), 'relay-spike-pwa-dist-'));
  writeFileSync(
    join(spikePwaDist, 'index.html'),
    '<!doctype html><html><head><title>spike-pwa</title></head><body data-test="root"></body></html>',
  );
  writeFileSync(join(spikePwaDist, 'main.js'), 'console.log("spike");\n');

  const homeOverride = mkdtempSync(join(tmpdir(), 'relay-static-rig-'));
  const db = openDatabase({ filename: ':memory:' });
  runMigrations(db, migrationsDirForTests());
  tenants.ensureSingleton(db, Date.now());

  const tokenStore = new TokenStore(tokensPath(homeOverride), new RevocationBus());
  const registry = createRegistry({ db, homeOverride });

  const app = await buildServer({
    db,
    registry,
    tokenStore,
    config: {
      host: '127.0.0.1',
      port: 0,
      claimLockTimeoutSeconds: 30,
      replayBufferBytes: 32 * 1024,
    },
    homeOverride,
    spikePwaDist,
  });
  await app.ready();

  let cleaned = false;
  return {
    app,
    spikePwaDist,
    homeOverride,
    db,
    registry,
    async cleanup(): Promise<void> {
      if (cleaned) return;
      cleaned = true;
      await app.close();
      await registry.shutdown();
      db.close();
      rmSync(homeOverride, { recursive: true, force: true });
      rmSync(spikePwaDist, { recursive: true, force: true });
    },
  };
}

describe('server/static — Track 8 spike-pwa static-serve', () => {
  let rig: StaticTestRig;

  beforeEach(async () => {
    rig = await makeStaticRig();
  });

  afterEach(async () => {
    await rig.cleanup();
  });

  it('serves /app/index.html from the dist fixture (no auth required)', async () => {
    const res = await rig.app.inject({ method: 'GET', url: '/app/index.html' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.body).toContain('data-test="root"');
    // Crucially: no auth was sent; the response is NOT 401.
    expect(res.headers['www-authenticate']).toBeUndefined();
  });

  it('serves /app/main.js (an existing asset) from the dist fixture', async () => {
    const res = await rig.app.inject({ method: 'GET', url: '/app/main.js' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('console.log("spike")');
  });

  // SPA fallback: any /app/* path that doesn't match a built asset returns
  // index.html so Angular's HTML5 router can take over after page reload.
  it('falls back to index.html for unmatched /app/* paths (Angular HTML5 router)', async () => {
    const res = await rig.app.inject({ method: 'GET', url: '/app/sessions/abc123' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.body).toContain('data-test="root"');
  });

  // The static surface MUST NOT contaminate auth on other routes. Tap a
  // REST route from the same rig and confirm it still demands a token.
  it('does not weaken auth on non-/app/ routes', async () => {
    const res = await rig.app.inject({ method: 'GET', url: '/tenants' });
    expect(res.statusCode).toBe(401);
    expect(res.headers['www-authenticate']).toBe('Bearer');
  });

  it('no-ops when spikePwaDist is opted out (null)', async () => {
    // Build a second server without the static surface; /app/* should 404
    // (the auth preHandler still skips, but no route exists).
    const noStaticApp = await buildServer({
      db: rig.db,
      registry: rig.registry,
      tokenStore: new TokenStore(tokensPath(rig.homeOverride), new RevocationBus()),
      config: {
        host: '127.0.0.1',
        port: 0,
        claimLockTimeoutSeconds: 30,
        replayBufferBytes: 32 * 1024,
      },
      homeOverride: rig.homeOverride,
      spikePwaDist: null,
    });
    await noStaticApp.ready();
    try {
      const res = await noStaticApp.inject({ method: 'GET', url: '/app/index.html' });
      expect(res.statusCode).toBe(404);
      expect(res.headers['www-authenticate']).toBeUndefined();
    } finally {
      await noStaticApp.close();
    }
  });
});
