---
id: ND-36
status: resolved
title: "Subprotocol-sourced bearer token for browser-WS auth"
resolved-on: 2026-05-22
affects: "packages/server/src/server/rest/plugins/auth.ts (preHandler accepts Sec-WebSocket-Protocol as token source); packages/server/src/server/ws/handler.ts (Fastify WS plugin echoes `relay.bearer` subprotocol in the 101 response); docs/arch/ws-protocol.md §6 (auth path, browser variant)."
surfaced-by: "Track 8 PWA monitoring spike design (2026-05-22)."
---

# ND-36 — Subprotocol-sourced bearer token for browser-WS auth

**Status:** resolved (2026-05-22)
**Affects:** `packages/server/src/server/rest/plugins/auth.ts` (preHandler accepts `Sec-WebSocket-Protocol` as token source); `packages/server/src/server/ws/handler.ts` (Fastify WS plugin echoes `relay.bearer` subprotocol in the 101 response); `docs/arch/ws-protocol.md` §6 (auth path, browser variant).
**Surfaced by:** Track 8 PWA monitoring spike design (2026-05-22).

## Question

Browsers cannot set custom headers on `new WebSocket(...)`. Today's WS upgrade at `/sessions/:id/stream` only accepts the bearer token via `Authorization: Bearer`. How does a browser-based client (the Track 8 spike PWA, the eventual Phase 2 PWA) authenticate the upgrade?

## Context

The Track 8 PWA monitoring spike is the first browser-based Relay client. Until now, the only WS consumers were `relay attach` (Node.js `ws` package, can set arbitrary headers) and the IDE extension (which shells out to `relay attach`). The PWA needs a wire-level path that works in a browser; the answer constrains the eventual Phase 2 PWA too. Three real options exist, with very different security and surface-area implications.

## Options under consideration

- **Option A — Subprotocol-sourced.** Client opens `new WebSocket(url, ['relay.bearer', token])`. The browser serializes this as `Sec-WebSocket-Protocol: relay.bearer, <token>` (RFC 6455 §1.9). The server reads the header and authenticates via the same `tokenStore.verify()` path the REST `Authorization` header uses. The server must echo `relay.bearer` back in the 101 response (`@fastify/websocket` `handleProtocols`) for the browser to accept the handshake.
  - Pros: bearer never lands in access logs; standard browser-WS auth pattern; ~30 lines additive on the server (no new module, no new routes); leaves the existing `Authorization` header path untouched for `relay attach`.
  - Cons: subprotocol negotiation is one extra concept for new readers of the auth flow.
- **Option B — Query parameter.** Client opens `wss://.../stream?token=<token>`. Server reads `req.query.token` as an alternative to the `Authorization` header.
  - Pros: simplest possible code change.
  - Cons: bearer tokens land in server access logs and in any reverse-proxy / WAF logs in front of the server — a real security smell even on a Tailscale-only deployment. Once shipped, the surface is hard to take back.
- **Option C — Cookie + login endpoint.** Add a new `POST /auth/login` route that takes a bearer and sets an HttpOnly `Secure` `SameSite=Strict` cookie scoped to `/sessions/*/stream`. WS upgrade reads `Cookie` automatically.
  - Pros: cookie-based auth is familiar to web devs; no novel browser-WS pattern.
  - Cons: introduces a login-session state (TTL, revocation reach, cookie scope decisions); a new route to test, secure, and document; the eventual Phase 2 PWA would still want subprotocol auth in addition (cookies don't replace it for, e.g., embedded use-cases). Largest server-side surface of the three.

## Current thinking

Option A. The decision was effectively forced by the combination of "smallest server change" and "no token-in-logs" — only A satisfies both.

## Resolution

**Adopt Option A — subprotocol-sourced bearer token.**

Wire grammar:
- Client (browser): `new WebSocket(url, ['relay.bearer', token])`. The two-element array — scheme name plus credential — is the contract.
- Header serialization (browser-emitted): `Sec-WebSocket-Protocol: relay.bearer, <token>`.
- Server upgrade response: `Sec-WebSocket-Protocol: relay.bearer` (the scheme name echoed back; the token is NOT in the response).

Server implementation:
1. **Auth preHandler (`packages/server/src/server/rest/plugins/auth.ts`).** When `Authorization` is absent and `Sec-WebSocket-Protocol` is `relay.bearer, <token>` (two whitespace-trimmed CSV parts, first part exactly `relay.bearer`), use `<token>` as the bearer plaintext. Verification routes through the same `tokenStore.verify()` path. **`Authorization` always wins when both headers are present** — a malformed Authorization is NOT silently masked by a valid subprotocol, so a browser cannot smuggle credentials past a server-trusted header source.
2. **WS plugin (`packages/server/src/server/ws/handler.ts`).** `@fastify/websocket` is registered with `options.handleProtocols`, returning `'relay.bearer'` when the client offers it and `false` otherwise. Native `relay attach` doesn't offer a subprotocol (it uses `Authorization`), so `handleProtocols` is never called for it.

Wire compatibility:
- Existing REST routes: unchanged. `Authorization: Bearer` continues to be the only documented path for REST.
- `relay attach`: unchanged. Node's `ws` package can set `Authorization`, so the native client never sees the subprotocol path.
- IDE extension: unchanged. Spawns `relay attach`.
- Browser PWA (Track 8, eventual Phase 2): uses subprotocol.

**Why not Option B (query param):** bearer-in-logs is the wrong default even on a Tailscale-only deployment, and once shipped you can't quietly take it back. The Track 8 spike has a disposability contract; the auth path under it should not.

**Why not Option C (cookie + login):** the additional server surface (new route, cookie scoping, TTL, revocation reach) is disproportionate for a spike, and a future PWA would still want subprotocol auth as a complement — cookies don't replace it for embedded / direct-WS use-cases.

**Forward path.** When ND-28 (programmatic / machine-to-machine credential flow) resolves and adds a PAT / token-create REST endpoint, that endpoint and subprotocol-WS auth compose cleanly — the PAT issued by the new endpoint is the same bearer token, sourced via whichever header the client can set.

**Propagated to:** `packages/server/src/server/rest/plugins/auth.ts` (2026-05-22), `packages/server/src/server/ws/handler.ts` (2026-05-22). `docs/arch/ws-protocol.md` §6 propagation pending — a one-paragraph "browser variant" addition that documents the subprotocol grammar.
