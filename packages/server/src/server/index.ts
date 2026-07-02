// Fastify instance factory. Composes db + registry + tokenStore + config into
// a server that the relay CLI's `relay server` subcommand starts and tests
// inject directly. The WS surface (6G) plugs into the same instance via a
// future registerWs() call.

import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';

import type { TokenStore } from '../auth/index.js';
import type { RelayConfig } from '../config/index.js';
import type { SessionRegistry } from '../session/index.js';
import type { Database } from '../store/index.js';

import { registerRest, type RestPluginOptions } from './rest/index.js';
import { registerWs } from './ws/index.js';

export interface BuildServerOptions {
  db: Database;
  registry: SessionRegistry;
  tokenStore: TokenStore;
  config: RelayConfig;
  // Test seam: passed through to plugins that resolve filesystem paths via
  // config/paths.ts (personas dir, transcripts dir). Production callers omit.
  homeOverride?: string;
  // Fastify logger toggle. Default false in tests; production callers pass
  // true (or a real Pino instance).
  logger?: FastifyServerOptions['logger'];
}

export async function buildServer(opts: BuildServerOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opts.logger ?? false,
  });

  const restOpts: RestPluginOptions = {
    db: opts.db,
    registry: opts.registry,
    tokenStore: opts.tokenStore,
    homeOverride: opts.homeOverride,
  };
  await registerRest(app, restOpts);
  await registerWs(app, {
    db: opts.db,
    registry: opts.registry,
    tokenStore: opts.tokenStore,
    config: opts.config,
  });

  return app;
}

export type { RestPluginOptions };
export { registerRest } from './rest/index.js';
export { HttpProblemError } from './rest/http-error.js';
