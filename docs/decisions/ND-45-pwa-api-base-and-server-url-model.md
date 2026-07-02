---
id: ND-45
status: resolved
title: "PWA API-base / server-URL model (same-origin vs pair-link-sourced)"
resolved-on: 2026-07-02
affects: "docs/arch/pwa/app-shell.md §3 / §6 (hosting + package layout leave the API base unpinned); docs/arch/pwa/data-layer.md §2 / §3.1 (REST + WS base URL); docs/decisions/D-13-first-run-pairing-ux.md (the relay://pair?url=…&token=… link the base is sourced from); packages/pwa/src/app/services/auth.service.ts, rest-client.service.ts, ws-client.service.ts"
surfaced-by: "P2-PWA-build plan-time relay-architect review (2026-07-02) — the L0–L6 arch set never pins whether the built PWA is served from the relay server origin (same-origin REST/WS) or is a standalone deployment consuming D-13's url; the plan had hard-wired location.origin, silently ignoring the pair link's url."
---

# ND-45 — PWA API-base / server-URL model (same-origin vs pair-link-sourced)

**Status:** resolved (2026-07-02)
**Affects:** [`docs/arch/pwa/app-shell.md`](../arch/pwa/app-shell.md) §3 / §6 (hosting + package layout leave the API base unpinned); [`docs/arch/pwa/data-layer.md`](../arch/pwa/data-layer.md) §2 / §3.1 (REST + WS base URL); [[d-13-first-run-pairing-ux]] (the `relay://pair?url=…&token=…` link the base is sourced from); `packages/pwa/src/app/services/{auth,rest-client,ws-client}.service.ts`.
**Surfaced by:** P2-PWA-build plan-time [`relay-architect`] review (2026-07-02). The L0–L6 arch set never pins whether the built PWA is served from the relay server origin (same-origin REST/WS, making D-13's `url` redundant) or is a standalone deployment that must learn its server URL from D-13's `url`. The draft implementation plan had hard-wired `location.origin` / `location.host` as the REST/WS base, which silently connects to the PWA's own origin — wrong for any host where the PWA is not co-served with the server.

## Question

What determines the base URL the PWA uses for its REST calls and its `/sessions/:id/stream` WebSocket — the page's own origin (assuming the relay server also serves the PWA bundle), or a value carried in the pairing artifact?

## Context

The Track 9 spike served the PWA from the server via an `/app/*` static route, which made same-origin the implicit model — but the spike is feasibility-only and contributes nothing to this build (app-shell §1 clean-slate guardrail), and the L2 app-shell doc pins the package layout and PWA infra without ever pinning where the bundle is hosted. Meanwhile [[d-13-first-run-pairing-ux]] already resolved the pairing link as `relay://pair?url=<server>&token=<bearer>` and §6 of that decision states the Phase-2 mobile QR encodes **the same** `relay://pair?...` URL. So the pairing artifact the PWA already consumes to obtain the bearer **also carries the server URL** — the client does not need to assume co-hosting.

## Resolution

**The PWA sources its API base from D-13's pair-link `url` parameter, persists it alongside the bearer, and uses it as the base for all REST + WS calls; when no persisted base is present it falls back to the page's own origin.** This supports both deployment models (server-co-hosted and standalone) with one code path and zero server change, and honors the link shape D-13 already ships.

1. **Pair parse.** `AuthService.parsePairPayload(raw)` extracts both `token` **and** `url` from the `relay://pair?url=…&token=…` deep link (D-13 §1). A payload with a `token` but no `url` is valid (same-origin case).
2. **Persistence.** The server base is stored in `localStorage` under `relay.serverUrl` next to the bearer (`relay.bearer`, data-layer §2), read at boot, cleared on unpair / auth-failure exactly like the bearer.
3. **REST base.** `RestClient` prefixes every path with the persisted `serverUrl` (origin only — scheme + host + optional port); if absent it uses relative paths against `location.origin`.
4. **WS base.** `WsClientService` derives the socket URL from the same `serverUrl`, swapping the scheme to `ws`/`wss` (`https→wss`, `http→ws`); if absent it derives from `location`. The subprotocol-sourced bearer ([[nd-36-subprotocol-sourced-bearer-token-for-browser-ws-auth]]) is unchanged — only the base host is sourced here.
5. **No server change (NFR-5).** This is purely a client-side sourcing rule over an existing D-13 field; it adds no server touch point and forks no `@relay/protocol` schema.

**Why this and not same-origin-only:** hard-wiring `location.origin` bakes in the "server co-serves the PWA bundle" assumption the arch docs never made, and silently misconnects a standalone-hosted PWA to its own origin. Sourcing the base from the pair link costs one extra parsed field and makes both hosting models work identically, so there is no reason to constrain deployment now. **Why persist rather than re-read per navigation:** the bearer is already persisted for fire-and-forget reattach (NFR-3); the server URL travels with it in the same artifact, so persisting both together keeps the "reopen → reattach with no re-pair" property (FR-14) intact.

**Surfaces new sub-questions:** none.

**Propagated to:** _(pending — see [protocol](protocol.md))_
