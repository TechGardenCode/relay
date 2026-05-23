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
const SUBPROTOCOL_HEADER = 'sec-websocket-protocol';
// Per ND-36: browsers cannot set Authorization on `new WebSocket(...)`, so
// the WS subprotocol carries the bearer for the PWA. Scheme name is fixed
// to keep the parser unambiguous (a future v2 scheme would be e.g.
// `relay.bearer.v2.<token>`); the comma between scheme and token is the
// standard CSV form browsers emit when given a two-element array.
const SUBPROTOCOL_SCHEME = 'relay.bearer';
// Match what @fastify/static is mounted at: prefix `/app`. The plugin serves
// both `/app` (the bare prefix → index.html) and `/app/<asset>`, so the skip
// must too. Restricting to `/app/` would 401 the SPA's root URL when typed
// without a trailing slash.
const SPIKE_PWA_PREFIX = '/app';

function unauthorized(slug: string, detail: string): HttpProblemError {
  return new HttpProblemError({
    status: 401,
    typeSlug: slug,
    title: 'Authentication required',
    detail,
    headers: { 'WWW-Authenticate': 'Bearer' },
  });
}

// Returns the bearer plaintext from either `Authorization: Bearer <token>` or
// (per ND-36) `Sec-WebSocket-Protocol: relay.bearer, <token>` — the
// Authorization header always wins when both are present, so a browser
// client cannot override a server-trusted header source by smuggling a
// subprotocol value.
function extractBearer(req: FastifyRequest): string | undefined {
  const authHeader = req.headers[AUTH_HEADER];
  if (typeof authHeader === 'string' && authHeader.startsWith(BEARER_PREFIX)) {
    return authHeader.slice(BEARER_PREFIX.length);
  }
  const subprotocol = req.headers[SUBPROTOCOL_HEADER];
  if (typeof subprotocol !== 'string') return undefined;
  // Browsers serialize `new WebSocket(url, ['relay.bearer', token])` as
  // `relay.bearer, <token>` (RFC 6455 §1.9). Parse defensively — extra
  // whitespace is permitted, any non-matching scheme is treated as absent.
  const parts = subprotocol.split(',').map((p) => p.trim());
  if (parts.length !== 2 || parts[0] !== SUBPROTOCOL_SCHEME) return undefined;
  return parts[1];
}

export async function registerAuthPlugin(
  app: FastifyInstance,
  opts: AuthPluginOptions,
): Promise<void> {
  app.addHook('preHandler', async (req: FastifyRequest) => {
    // Per ND-36: the /app/* static bundle is public-by-design (HTML/JS the
    // browser fetches before pairing). Everything /app/* calls back into
    // (REST + WS) is still authenticated by this same preHandler.
    // Match `/app` exact, `/app/...`, `/app?...`, `/app#...` — i.e. every URL
    // the static plugin's `/app` prefix accepts. Plain `startsWith('/app')`
    // would also match e.g. `/applicant`, so anchor on the boundary.
    const url = req.url;
    if (
      url === SPIKE_PWA_PREFIX ||
      url.startsWith(SPIKE_PWA_PREFIX + '/') ||
      url.startsWith(SPIKE_PWA_PREFIX + '?') ||
      url.startsWith(SPIKE_PWA_PREFIX + '#')
    ) {
      return;
    }

    const plaintext = extractBearer(req);
    if (plaintext === undefined) {
      throw unauthorized('auth-missing', 'Authorization header missing or not Bearer.');
    }
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
