import type { FastifyInstance, FastifyRequest } from 'fastify';

import type { TokenStore } from '../../../auth/index.js';
import { HttpProblemError } from '../http-error.js';

declare module 'fastify' {
  interface FastifyRequest {
    tokenId?: string;
  }
}

// Per D-13 + threat-model.md §4: every REST route requires a valid bearer
// token. The verify() result discriminates 'unknown' | 'revoked' | 'malformed'
// — all three map to 401 + WWW-Authenticate: Bearer per rest-conventions.md
// §3. There is no 403 emission at MVP (Phase 4 RBAC).

export interface AuthPluginOptions {
  tokenStore: TokenStore;
}

const AUTH_HEADER = 'authorization';
const BEARER_PREFIX = 'Bearer ';

function unauthorized(slug: string, detail: string): HttpProblemError {
  return new HttpProblemError({
    status: 401,
    typeSlug: slug,
    title: 'Authentication required',
    detail,
    headers: { 'WWW-Authenticate': 'Bearer' },
  });
}

export async function registerAuthPlugin(
  app: FastifyInstance,
  opts: AuthPluginOptions,
): Promise<void> {
  app.addHook('preHandler', async (req: FastifyRequest) => {
    const header = req.headers[AUTH_HEADER];
    if (typeof header !== 'string' || !header.startsWith(BEARER_PREFIX)) {
      throw unauthorized('auth-missing', 'Authorization header missing or not Bearer.');
    }
    const plaintext = header.slice(BEARER_PREFIX.length);
    const result = opts.tokenStore.verify(plaintext);
    if (!result.ok) {
      // The reason discriminator stays in the type slug so logs / tests can
      // distinguish without parsing detail prose.
      const slug =
        result.reason === 'revoked'
          ? 'auth-revoked'
          : result.reason === 'malformed'
            ? 'auth-malformed'
            : 'auth-unknown';
      throw unauthorized(slug, `Bearer token ${result.reason}.`);
    }
    req.tokenId = result.tokenId;
  });
}
