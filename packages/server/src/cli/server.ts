// `relay server [--config <path>]` — binds the Fastify app onto host:port
// from ~/.relay/config.yaml. Per prd/03-server.md §7. The CLI dispatcher's
// thin wrapper around buildServer() so 6I and Docker images can share the
// same boot path: openDatabase → initServer → buildServer → listen.

import type { FastifyInstance } from 'fastify';

import { RevocationBus, TokenStore } from '../auth/index.js';
import { dbPath, tokensPath } from '../config/paths.js';
import { loadConfig, type RelayConfig } from '../config/loader.js';
import { initServer } from '../session/index.js';
import { buildServer } from '../server/index.js';
import { openDatabase } from '../store/index.js';

import { resolveMigrationsDir } from './migrations-dir.js';

export interface ServerRunOptions {
  configPath?: string;
  homeOverride?: string;
  // Test seam: when omitted, the runner resolves `migrations/` relative to
  // the compiled cli/server.js location. Tests pass an explicit path.
  migrationsDirOverride?: string;
  // Test seam: when omitted, the runner uses Fastify's default Pino logger
  // (printed to stdout). Tests pass false.
  logger?: boolean;
  // Test seam: when set, overrides the host:port from config.yaml at listen()
  // time without altering the config (used so tests can bind port 0 and
  // capture the bound port, which the schema otherwise rejects as too-small).
  listenOverride?: { host: string; port: number };
}

export interface ServerRunResult {
  app: FastifyInstance;
  config: RelayConfig;
  shutdown: () => Promise<void>;
}

function resolveServerMigrationsDir(override: string | undefined): string {
  if (override !== undefined) return override;
  return resolveMigrationsDir(import.meta.url);
}

export async function runServer(opts: ServerRunOptions = {}): Promise<ServerRunResult> {
  const config = loadConfig({
    homeOverride: opts.homeOverride,
    configPathOverride: opts.configPath,
  });

  const db = openDatabase({ filename: dbPath(opts.homeOverride) });
  const tokenStore = new TokenStore(tokensPath(opts.homeOverride), new RevocationBus());

  const { registry, shutdown: registryShutdown } = await initServer({
    db,
    migrationsDir: resolveServerMigrationsDir(opts.migrationsDirOverride),
    homeOverride: opts.homeOverride,
  });

  const app = await buildServer({
    db,
    registry,
    tokenStore,
    config,
    homeOverride: opts.homeOverride,
    logger: opts.logger ?? true,
  });
  await app.ready();
  const listenHost = opts.listenOverride?.host ?? config.host;
  const listenPort = opts.listenOverride?.port ?? config.port;
  await app.listen({ host: listenHost, port: listenPort });

  const shutdown = async (): Promise<void> => {
    await app.close();
    await registryShutdown();
    db.close();
  };

  return { app, config, shutdown };
}
