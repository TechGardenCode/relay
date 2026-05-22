# @relay/spike-pwa — Track 8 PWA monitoring spike

**Status:** exploratory · disposable · do not depend on this package.
**Scope:** Validate that "monitor + prompt a Relay session from a phone over Tailscale" works against the existing server with zero protocol changes. Three screens: pair, sessions list, live session (xterm.js + compose + BUSY UX).
**Not the Phase 2 PWA.** `packages/pwa/` is the eventual home, currently empty. This package is the throwaway-or-graduate spike. See [`docs/build-plan.md`](../../docs/build-plan.md) Track 8 and the design plan at [`/Users/kianalikhani/.claude/plans/i-ve-switched-over-to-silly-milner.md`](file:///Users/kianalikhani/.claude/plans/i-ve-switched-over-to-silly-milner.md).

---

## Quick start

```sh
# From repo root.
pnpm install
pnpm --filter @relay/spike-pwa build         # → packages/spike-pwa/dist/browser/

# Start the Relay server (it serves the built bundle at /app/*).
pnpm --filter @relay/relay start
# Or for development with HMR on the PWA:
pnpm --filter @relay/spike-pwa dev           # → ng serve on :4200, proxies API to :3001
```

For phone-over-Tailscale dogfooding, the server must bind to an interface the phone can reach. Edit `~/.relay/config.yaml` and change `host:` from `127.0.0.1` to the laptop's Tailscale IP (e.g., `100.x.y.z`) or `0.0.0.0`. Restart the server. On the phone, open `http://<LAPTOP_IP>:3001/app`.

---

## What changed on the server to make this work

Three additive edits, all in `packages/server/`:

1. **`src/server/rest/plugins/auth.ts`** — preHandler now skips when `req.url.startsWith('/app/')` and falls back to parsing `Sec-WebSocket-Protocol: relay.bearer, <token>` when no `Authorization` header is present. Per [ND-36](../../docs/decisions/ND-36-subprotocol-sourced-bearer-token-for-browser-ws-auth.md).
2. **`src/server/static/index.ts`** (NEW) — `@fastify/static` registration at `/app/`, with SPA fallback to `index.html` for unmatched paths so Angular's HTML5 router survives a page reload.
3. **`src/server/ws/handler.ts`** — `@fastify/websocket` is registered with `handleProtocols` so the server echoes `relay.bearer` back in the 101 response; without this, the browser handshake fails.

Three test files cover the new behavior:

- `src/server/rest/plugins/auth.test.ts` — 5 new cases (skip `/app/*`, accept subprotocol, malformed subprotocol still 401s, Authorization precedence, subprotocol-malformed-token).
- `src/server/static/index.test.ts` — 5 new cases (file served, SPA fallback, no auth required, doesn't weaken auth elsewhere, no-op when opted out).

Existing REST routes and `relay attach` are unchanged.

---

## Kill the spike

If this experiment doesn't graduate, removing it cleanly is four mechanical steps:

1. `rm -rf packages/spike-pwa/`
2. `git revert <feat(server,spike):...>` commits — the three server edits + the `@fastify/static` dep add (~50 lines of code reverted across `auth.ts`, `ws/handler.ts`, `index.ts`, and the new `static/index.ts` module).
3. `pnpm install` — regenerate the lockfile without `@fastify/static`, Angular, and `xterm`.
4. Mark Track 8 as `abandoned` in [`docs/build-plan.md`](../../docs/build-plan.md); mark [ND-36](../../docs/decisions/ND-36-subprotocol-sourced-bearer-token-for-browser-ws-auth.md) as `deferred`.

After step 4, `main` is bit-identical to its pre-Track-8 state except for an "abandoned" docs trail.

---

## Stack

- Angular latest stable (standalone components, `@angular/build:application` builder, esbuild backend).
- xterm.js via `@xterm/xterm` + `@xterm/addon-fit`.
- `@relay/protocol` (`workspace:*`) for REST + WS types — no hand-rolled wire shapes.
- `localStorage` for the paired token (no cookies, no session state on the server).

## Decisions consumed verbatim (no amendments)

D-G2 input arbitration · D-G3 reattach · D-13 pairing UX (`relay://pair?...` snippet) · ND-01 claim timeout · ND-02 BUSY UX · ND-03 ring buffer · ND-23 resize · ND-24 newline-conditional release.

## Decisions filed by this spike

ND-36 — Subprotocol-sourced bearer token for browser-WS auth.
