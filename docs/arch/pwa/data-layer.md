# Relay Arch — PWA Data / Connection Layer

**Status:** v0.1 (in progress, 2026-06-02)
**Scope:** L3 of [`README.md`](README.md) §3 — client state model, WebSocket client (attach
lifecycle, reconnect, replay-gap, claim handling), REST client, and auth / bearer-token storage.
**Out of scope:** Server-side protocol (canonical at [`../ws-protocol.md`](../ws-protocol.md),
[`../rest-conventions.md`](../rest-conventions.md)). UI module decomposition (L4 —
[`feature-modules.md`](feature-modules.md)). Server-side couplings — those land in
[`unresolved-dependencies.md`](unresolved-dependencies.md).

---

## 1. State management

**Decision (user, 2026-06-02): pure signals in services.** No state-management library. Service
classes expose `signal()`, `computed()`, and `effect()` directly; components consume injected
services and read signals. Aligned with the Angular 21 era — signals stable, zoneless default;
see [`app-shell.md`](app-shell.md) §2.

### 1.1 Expected service surface

The state surface the PWA carries (concrete shapes detailed per-feature in
[`feature-modules.md`](feature-modules.md) as L4 lands):

- **`AuthService`** — bearer-token signal; pair status (`paired` / `unpaired` / `pairing`).
- **`SessionsService`** — sessions list signal (server-derived); per-session status; current
  attach selection.
- **`WsClientService`** — connection state (`idle` / `connecting` / `attached` / `reconnecting` /
  `error`); claim state (`released` / `claimed-local` / `busy-other`); last error.
- **`ComposeService`** — draft-buffer signal per session, preserved across BUSY (FR-6).
- **`PtyOutputService`** — per-session byte-stream surface for the terminal viewport (xterm.js).

### 1.2 Revisit trigger

**Pause and explore NgRx Signal Store (`@ngrx/signals`) if** the pure-signals approach becomes
unsustainable. Concrete signals of trouble — any one warrants a revisit:

- Repeated boilerplate for state-update patterns that `withState` / `withMethods` would clean up.
- Cross-service effect orchestration becoming tangled (more than ~3 services coordinating).
- Test setup for service-with-signals becoming painful.
- A genuine need for global cross-feature state coordination that doesn't fit the per-service
  pattern.

When a revisit happens, the migration shape is **per-service, not big-bang**: convert the service
that's hurting into a `signalStore`, leave the others on plain signals.

**Cites.** [`app-shell.md`](app-shell.md) §2 (Angular 21 era); NFR-3 (statelessness — client
state is ephemeral; the server is the source of truth).

## 2. Auth & bearer-token storage

**Decision (user, 2026-06-02): `localStorage` for the bearer token.** Read at app boot into
`AuthService.bearer` (§1.1); written when pairing completes (FR-1); cleared on explicit unpair
or auth-failure (401 on REST, WS auth reject).

**Trust model.** Acceptable under NFR-4 — LAN / Tailscale only, no public-internet hardening
assumed. localStorage is XSS-exposed in principle; the PWA's bundle is first-party (no untrusted
third-party JS) and the trust boundary is the LAN, so the practical exposure is small.

**"For now" — revisit trigger.** If the trust model broadens beyond LAN / Tailscale (e.g. public
internet exposure, multi-user host scenarios), reconsider:

- Move to `IndexedDB` with a clear key naming scheme (still XSS-exposed but moves the storage
  out of the most-scanned surface).
- Switch to an `httpOnly` cookie flow (requires server-side change — files as a candidate ND in
  [`unresolved-dependencies.md`](unresolved-dependencies.md) §2 on revisit).
- Add short-lived bearer + refresh-token pattern.

**WS auth path.** The bearer is passed to the WebSocket via the subprotocol-sourced bearer
pattern per [[nd-36-subprotocol-sourced-bearer-token-for-browser-ws-auth]] — *not* in a header,
*not* in the URL. Implementation detail of the WS client (§3).

**Cites.** FR-1 (token in client storage only); NFR-4 (bearer auth on REST + WS; LAN / Tailscale
trust model); [[nd-36-subprotocol-sourced-bearer-token-for-browser-ws-auth]].

## 3. WS client

The PWA's WebSocket client implements the attach lifecycle, reconnect, replay-gap handling, and
claim-state management against the canonical wire defined in
[`../ws-protocol.md`](../ws-protocol.md). It lives behind `WsClientService` (§1.1) and exposes
its state as signals; binary frames are forwarded to `PtyOutputService` for the terminal.

### 3.1 Primitive

**Decision (user, 2026-06-02): native browser `WebSocket` API.** Zero extra dependencies; fits
the signals-first data layer (no RxJS pulled in for stream modelling); maximum control over the
ND-40 replay-gap buffer and the [`../ws-protocol.md`](../ws-protocol.md) message catalog.

Reconnect, frame dispatch, claim-state tracking, and replay-gap buffering are implemented
directly in `WsClientService`. Sub-decisions for each follow below.

**Cites.** [`app-shell.md`](app-shell.md) §2 (signals-first era); NFR-2 (reliability / reconnect
— required by all candidates here);
[[nd-36-subprotocol-sourced-bearer-token-for-browser-ws-auth]] (subprotocol-sourced bearer at
WS construction).

### 3.2 Reconnect strategy

**Decision (user, 2026-06-02): time-bounded auto-reconnect with manual fallback.**

| Lever                | Setting                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| Backoff curve        | Immediate-retry, then exponential (base 1 s) with 30 s cap.                                       |
| Jitter               | ±20% on each delay.                                                                              |
| Reconnect window     | **10 minutes** of continuous reconnecting; on expiry, stop auto-retry and surface manual retry.   |
| Reset trigger        | Successful `open` resets the window and the attempt counter.                                      |
| Network event hook   | `window.online` cancels the pending backoff timer and reconnects immediately.                     |
| Concurrency guard    | State-machine flag (`connecting` / `connected` / `reconnecting` / `idle` / `error`); idempotent `reconnect()`. |
| UI indicator         | `reconnecting (attempt N)` while in-window; `disconnected — tap to reconnect` after the 10 min window expires. |

**Why 10 min then manual.** The PWA is the user's always-on client for a server they own;
auto-retry forever is hostile if the network really is gone (phone left on a no-Wi-Fi train).
10 minutes of auto-retry covers the common cases (Tailscale renegotiation, brief outage, VM
reboot) while bounding wasted battery / wake-lock on extended dead-network situations. After the
window, the user can tap to retry, which resets the window.

**Backoff sequence (no jitter, for illustration).**

```
attempt:  0   1   2   3   4    5    6    7    ... ~20
delay:    0s  1s  2s  4s  8s   16s  30s  30s  ... 30s (capped)
cumulative ≈ 0s 1s 3s 7s 15s 31s  61s  91s  ... 600s → window expires
```

**Cites.** NFR-2 (auto-reconnect required); NFR-10 (observability — visible reconnect state);
[[nd-35-diagnostics-and-error-ux-deep-dive]] (error-UX posture).

### 3.3 Replay-gap handling (ND-40)

**Decision (user, 2026-06-02): adopt the ND-40 buffer recipe as-is** — mirror the existing
`relay attach` `AttachClient` fix exactly.

**Mechanism.**

- On WS open, the client begins buffering all inbound binary in memory.
- When the consumer (xterm.js viewport, via `PtyOutputService`) subscribes, the buffer is
  drained to the consumer first; live bytes are then forwarded directly.
- On disconnect or explicit unsubscribe, the buffer is cleared.

**Bounds.**

- **Buffer cap:** none — upstream cap is the server's ND-03 ring-buffer replay; the realistic
  connect → subscribe gap is short and the resulting buffer is bounded by ND-03's size.
- **Multi-consumer:** single consumer per session (the xterm.js viewport). Multi-consumer is not
  in MVP scope.

**Why "as-is" (not subscribe-before-connect ordering).** The buffer-around-the-race recipe is
defense-in-depth, matches the existing fix verbatim, and is the easier verification target. The
Angular component-lifecycle improvement (subscribe-before-connect ordering — no buffer needed)
was considered and deferred; the buffer recipe protects against ordering regressions if the
component lifecycle is ever refactored.

**Cites.** [[nd-40-relay-attach-drops-replayed-bytes-in-connect-subscribe-gap]];
[[nd-03-ring-buffer-size-for-attach-replay]]; FR-4 (no dropped bytes in the connect → subscribe
gap).
