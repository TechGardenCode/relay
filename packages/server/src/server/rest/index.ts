// REST plugin: wires the error mapper, the auth preHandler, and every route
// module. The order matters: setErrorHandler before any route registration so
// thrown errors land in the mapper, and the auth preHandler is added globally
// so every route requires a bearer token by default.

import type { FastifyInstance } from 'fastify';

import type { TokenStore } from '../../auth/index.js';
import type { SessionRegistry } from '../../session/index.js';
import type { Database } from '../../store/index.js';

import { registerAuthPlugin } from './plugins/auth.js';
import { registerErrorMapper } from './plugins/error-mapper.js';
import { registerTenantsRoutes } from './routes/tenants.js';
import { registerProjectsRoutes } from './routes/projects.js';
import { registerSessionsRoutes } from './routes/sessions.js';
import { registerTranscriptRoutes } from './routes/transcript.js';

export interface RestPluginOptions {
  db: Database;
  registry: SessionRegistry;
  tokenStore: TokenStore;
  homeOverride?: string;
}

export async function registerRest(app: FastifyInstance, opts: RestPluginOptions): Promise<void> {
  await registerErrorMapper(app);
  await registerAuthPlugin(app, { tokenStore: opts.tokenStore });

  await registerTenantsRoutes(app, { db: opts.db });
  await registerProjectsRoutes(app, { db: opts.db });
  // Per D-17: personas are descoped from MVP; no /personas routes exist, so
  // GET/POST /personas return 404 (guarded in sessions.test.ts).
  await registerSessionsRoutes(app, { db: opts.db, registry: opts.registry });
  await registerTranscriptRoutes(app, { db: opts.db, homeOverride: opts.homeOverride });
}

export { HttpProblemError } from './http-error.js';
