// Fastify instance factory. Composes db + registry + tokenStore + config into
// a server that the relay CLI's `relay server` subcommand starts and tests
// inject directly. The WS surface (6G) plugs into the same instance via a
// future registerWs() call.

import { fileURLToPath } from 'node:url';

import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';

import type { TokenStore } from '../auth/index.js';
import type { RelayConfig } from '../config/index.js';
import type { SessionRegistry } from '../session/index.js';
import type { Database } from '../store/index.js';

import { registerRest, type RestPluginOptions } from './rest/index.js';
import { registerStatic } from './static/index.js';
import { registerWs } from './ws/index.js';

// Per Track 8 spike: resolve `packages/spike-pwa/dist/browser/` relative
// to this module's compiled location (`packages/server/dist/server/index.js`).
// The static module no-ops gracefully when the directory is missing, so
// builds that don't ship the PWA bundle work unchanged.
const DEFAULT_SPIKE_PWA_DIST = fileURLToPath(
  new URL('../../../spike-pwa/dist/browser/', import.meta.url),
);

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
  // Test seam for the Track 8 spike static-serve route. Defaults to
  // `packages/spike-pwa/dist/browser/` via import.meta.url; pass `null`
  // to opt out (most tests do, to keep the surface area small) or an
  // absolute path to force.
  spikePwaDist?: string | null;
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
  const spikePwaDist =
    opts.spikePwaDist === null ? undefined : (opts.spikePwaDist ?? DEFAULT_SPIKE_PWA_DIST);
  await registerStatic(app, { spikePwaDist });
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
