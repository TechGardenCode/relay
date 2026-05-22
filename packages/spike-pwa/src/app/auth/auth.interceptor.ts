import type { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

import { TokenStore } from './token.store';

// Injects `Authorization: Bearer <token>` on every outbound HttpClient
// call. The interceptor is wired in app.config.ts via withInterceptors.
// Per ND-36: REST stays Authorization-header-only; the subprotocol auth
// path is for the WS upgrade only.
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const tokenStore = inject(TokenStore);
  const paired = tokenStore.state();
  if (paired === null) return next(req);
  // Only attach the token to requests targeting the paired server. The
  // dev-server proxy and the prod same-origin static bundle both keep
  // /tenants /projects /sessions /personas relative, so the safest
  // discriminator is "same origin OR matches paired server URL."
  const isRelativeOrSameHost =
    req.url.startsWith('/') ||
    req.url.startsWith(paired.serverUrl) ||
    req.url.startsWith(window.location.origin);
  if (!isRelativeOrSameHost) return next(req);
  return next(req.clone({ setHeaders: { Authorization: `Bearer ${paired.token}` } }));
};
