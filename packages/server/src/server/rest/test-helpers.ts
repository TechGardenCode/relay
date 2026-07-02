// Shared fixtures + factories for the REST route specs. Centralized so each
// route file's *.test.ts can stand up the same in-memory server in a few
// lines (DB → migrations → singleton tenant → registry → tokenStore → app).
//
// Suites drive the app through Fastify's `app.inject({ method, url, headers,
// payload })` — no socket bind, fully synchronous, identical assertion surface
// (status, headers, JSON body).

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { FastifyInstance } from 'fastify';

import { RevocationBus, TokenStore, type CreatedToken } from '../../auth/index.js';
import { tokensPath } from '../../config/paths.js';
import {
  createRegistry,
  type SessionHandle,
  type SessionRegistry,
  type RegistryDeps,
} from '../../session/index.js';
import { runMigrations, openDatabase, tenants, type Database } from '../../store/index.js';
import { buildServer } from '../index.js';

export function migrationsDirForTests(): string {
  // src/server/rest/test-helpers.ts → src/store/migrations
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, '..', '..', 'store', 'migrations');
}

export interface TestRig {
  app: FastifyInstance;
  db: Database;
  registry: SessionRegistry;
  tokenStore: TokenStore;
  token: CreatedToken;
  homeOverride: string;
  authHeader: string;
  cleanup: () => Promise<void>;
}

export interface MakeTestRigOptions {
  registryOverride?: SessionRegistry;
  // Passed into createRegistry when registryOverride is omitted. Use the
  // session/test-fakes helpers (createFakeSupervisor, etc.) to fake out the
  // PTY layer without spawning real processes.
  registryDeps?: Partial<RegistryDeps>;
}

export async function makeTestRig(opts: MakeTestRigOptions = {}): Promise<TestRig> {
  const homeOverride = mkdtempSync(join(tmpdir(), 'relay-rest-test-'));
  const db = openDatabase({ filename: ':memory:' });
  runMigrations(db, migrationsDirForTests());
  tenants.ensureSingleton(db, Date.now());

  const tokenStore = new TokenStore(tokensPath(homeOverride), new RevocationBus());
  const token = tokenStore.createToken('test-device');

  const registry =
    opts.registryOverride ??
    createRegistry({
      db,
      homeOverride,
      ...opts.registryDeps,
    });

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
  });
  await app.ready();

  const authHeader = `Bearer ${token.plaintext}`;

  let cleaned = false;
  return {
    app,
    db,
    registry,
    tokenStore,
    token,
    homeOverride,
    authHeader,
    async cleanup(): Promise<void> {
      if (cleaned) return;
      cleaned = true;
      await app.close();
      await registry.shutdown();
      db.close();
      rmSync(homeOverride, { recursive: true, force: true });
    },
  };
}

// Lightweight no-op registry for tests that want to bypass session spawn
// entirely (e.g., "DELETE /sessions/:id of unknown id returns 404" without
// standing up node-pty). The registry never spawns; create() throws.
export function nullRegistry(): SessionRegistry {
  return {
    create(): Promise<SessionHandle> {
      return Promise.reject(new Error('nullRegistry: create() not supported in this test'));
    },
    get(): SessionHandle | undefined {
      return undefined;
    },
    attach(): { unsubscribe: () => void } {
      return { unsubscribe(): void {} };
    },
    kill(): { killed: boolean } {
      return { killed: false };
    },
    async shutdown(): Promise<void> {},
    get shuttingDown(): boolean {
      return false;
    },
  };
}
