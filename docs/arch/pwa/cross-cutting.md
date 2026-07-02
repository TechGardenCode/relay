# L6 — Cross-cutting concerns

**Status:** v0.1 (in progress, 2026-07-02)
**Scope:** L6 of [`README.md`](README.md) §3 — the client-side cross-cutting concerns, organised
around the NFRs: latency (NFR-1) · reliability / reconnect (NFR-2) · statelessness (NFR-3) · security
(NFR-4) · compatibility + iOS Safari PWA quirks (NFR-6) · offline posture (NFR-7) · a11y / ergonomics
(NFR-8) · disposability / migration (NFR-9) · observability (NFR-10). Where a concern was already
settled in L2 or L3, this layer **consolidates and cross-references — it does not re-decide.** It is
the single place to answer "how does the PWA hold NFR-X across all its modules."
**Out of scope:** Design-system content (L1 — [`foundations.md`](foundations.md)). Per-module
decomposition (L4 — [`feature-modules.md`](feature-modules.md)). **Any server-side mechanism** — this
layer introduces no new server behaviour; a coupling that surfaces is harvested to
[`unresolved-dependencies.md`](unresolved-dependencies.md) (NFR-5, the harvest rule —
[`README.md`](README.md) §2.1), not resolved here.

---

## 0. NFR-5 is structural, not a section here

**Client-agnosticism (NFR-5)** is the load-bearing rule of the whole doc set, not a concern this layer
"handles" with code. It is enforced structurally: every server coupling any layer surfaces is filed in
[`unresolved-dependencies.md`](unresolved-dependencies.md) as a candidate ND, never resolved inline.
This layer holds to it — **nothing in L6 introduces new server behaviour.** Every concern below is
satisfied with client-side means or by cross-referencing a decision already made in L2 / L3.

## 1. Latency (NFR-1)

**Target.** Input→echo feels immediate over LAN / Tailscale; output streams without stalls. The
concrete design budget, which [`requirements.md`](../../design/pwa/requirements.md) NFR-1 deferred to
this phase, is **≤ 150 ms perceived input→echo** on the LAN / Tailscale path. This is a **budget to
verify empirically on the real path, not a guaranteed constant** — actual round-trip depends on
Tailscale relay vs. direct, phone radio state, and server load, so it must be measured during
implementation and the number tuned to what the hardware actually delivers.

**Client-side levers already chosen that defend it** (nothing new decided here — this consolidates):

- **Binary PTY output straight to xterm, no decode hop.** Output travels as raw WS binary frames
  ([`ws-protocol.md`](../ws-protocol.md) §1, §2.4); the viewport writes bytes verbatim — no base64
  decode on the hottest path.
- **Native `WebSocket`, no stream-library overhead.** [`data-layer.md`](data-layer.md) §3.1 — zero
  extra abstraction between the socket and the signal.
- **Cheap, repeatable `fit-addon` re-fits** during keyboard animation ([`app-shell.md`](app-shell.md)
  §5.3) and **`requestAnimationFrame`-throttled** keyboard-inset writes ([`app-shell.md`](app-shell.md)
  §5.2) keep the compose/resize path off the main-thread critical section.
- **Eager route loading** ([`app-shell.md`](app-shell.md) §4.4) removes chunk-load latency from
  in-session navigation; NFR-1 is about input/echo, not first paint, and the eager decision is made on
  exactly that reasoning.

**Cites.** NFR-1; [`ws-protocol.md`](../ws-protocol.md) §1, §2.4; [`data-layer.md`](data-layer.md)
§3.1; [`app-shell.md`](app-shell.md) §4.4, §5.2, §5.3.

## 2. Reliability / reconnect (NFR-2)

**Settled in L3 — consolidated here, not re-decided.** The reconnect strategy (immediate-retry →
exponential backoff base 1 s, 30 s cap, ±20% jitter, **10-minute** auto-retry window then manual
fallback, `window.online` fast-path, idempotent state machine) is fully specified in
[`data-layer.md`](data-layer.md) §3.2. The connect→subscribe **replay-gap buffer**
([[nd-40-relay-attach-drops-replayed-bytes-in-connect-subscribe-gap]]) that guarantees no dropped bytes
across a reconnect is in [`data-layer.md`](data-layer.md) §3.3, bounded by the server ring buffer
([[nd-03-ring-buffer-size-for-attach-replay]]). On every reconnect the server re-sends the bracketed
replay ([`ws-protocol.md`](../ws-protocol.md) §3), so the viewport repaints current screen state
([[d-g3-reattach-semantics]]).

The cross-cutting guarantee this layer records: **a phone backgrounding or network switch never loses
the session** — the socket reconnects and re-replays within the 10-minute window, and the server is the
source of truth throughout (NFR-3). Reconnect **state is always visible** (NFR-10, §9).

**Cites.** NFR-2; [`data-layer.md`](data-layer.md) §3.2, §3.3;
[[nd-40-relay-attach-drops-replayed-bytes-in-connect-subscribe-gap]];
[[nd-03-ring-buffer-size-for-attach-replay]]; [[d-g3-reattach-semantics]];
[`ws-protocol.md`](../ws-protocol.md) §3.

## 3. Statelessness (NFR-3)

**No client state of consequence** (`prd/05-mobile-pwa.md` §3). The only persisted client datum is the
bearer token in `localStorage` ([`data-layer.md`](data-layer.md) §2); everything else — sessions list,
per-session status, draft buffers, connection/claim state — is **ephemeral signal state** rebuilt from
the server on load ([`data-layer.md`](data-layer.md) §1). Kill the PWA and reopen: the bearer is reread,
the session list is refetched, and any running session is reattached with full replay — **no data loss**
(FR-14 fire-and-forget). The server owns all durable state.

This is why the state layer can stay pure-signals-in-services with no persistence machinery
([`data-layer.md`](data-layer.md) §1.2 explicitly cites NFR-3): there is nothing of consequence to
persist. The service worker (§7) caches the **app shell only**, never session data.

**Cites.** NFR-3; FR-14; `prd/05-mobile-pwa.md` §3; [`data-layer.md`](data-layer.md) §1, §1.2, §2.

## 4. Security (NFR-4)

**Bearer-token auth on all REST + WS; token in client storage only.** Consolidated from the layers that
decided each piece:

- **Storage** — `localStorage`, read at boot, cleared on unpair / `401` ([`data-layer.md`](data-layer.md)
  §2). Acceptable under the **LAN / Tailscale trust model** (G-7); no public-internet hardening assumed
  for MVP.
- **WS auth** — subprotocol-sourced bearer, not header, not URL
  ([[nd-36-subprotocol-sourced-bearer-token-for-browser-ws-auth]]; [`data-layer.md`](data-layer.md) §2).
- **REST auth** — bearer header; the `pairStatus` guard bounces unauthenticated navigation to `/pair`
  ([`app-shell.md`](app-shell.md) §4.5).

**Client attack surface.** The PWA bundle is **first-party only** — no untrusted third-party JS — so the
practical XSS exposure of a `localStorage` bearer is small on the LAN trust boundary
([`data-layer.md`](data-layer.md) §2 trust model). The design-system delivery is consumed as a Tailwind
scheme + assets ([`foundations.md`](foundations.md) §2), not as executable third-party script, so it
does not widen this surface.

**Revisit trigger — and it is a server coupling if taken.** If the trust model ever broadens beyond
LAN / Tailscale, the mitigations ([`data-layer.md`](data-layer.md) §2 — IndexedDB, `httpOnly`-cookie
flow, short-lived + refresh tokens) apply; the `httpOnly`-cookie option **requires a server change** and
would then be filed as a candidate ND ([`data-layer.md`](data-layer.md) §2 already flags this). Not
triggered at MVP, so nothing is filed now.

**Cites.** NFR-4; [`data-layer.md`](data-layer.md) §2; [`app-shell.md`](app-shell.md) §4.5;
[[nd-36-subprotocol-sourced-bearer-token-for-browser-ws-auth]]; [`foundations.md`](foundations.md) §2.

## 5. Compatibility + iOS Safari PWA quirks (NFR-6)

**Primary device = the user's phone** (NFR-6); modern mobile browsers, iOS Safari the sharp-edge case.
This section is the **single reference for the iOS gotchas** scattered across L2 — gathered so
implementation has one checklist:

- **Soft keyboard / `visualViewport`.** The hybrid CSS-base + JS-during-keyboard shell
  ([`app-shell.md`](app-shell.md) §5) exists because iOS Safari does not resize the layout viewport when
  the keyboard opens. `dvh`/`svh` express the resting layout; `visualViewport` drives layout only while
  compose is focused. This keeps the rail + compose above the keyboard (NFR-8).
- **`interactive-widget=resizes-content` watch item.** If iOS Safari ships it, the §5.2 JS path can
  simplify or retire ([`app-shell.md`](app-shell.md) §5.3, §7) — re-check each iOS release during
  implementation.
- **PWA standalone vs. in-browser viewport differences.** Behaviour differs between installed-PWA and
  in-Safari; [`app-shell.md`](app-shell.md) §5.3 / §7 call for a **dedicated standalone-mode viewport
  test pass** during implementation — carried here as a cross-cutting acceptance item.
- **PWA installability.** Manifest + service worker via Angular defaults (`@angular/pwa`,
  `ngsw-config.json` — [`app-shell.md`](app-shell.md) §3).
- **xterm.js on mobile Safari.** Touch scrollback, text selection, and the on-screen-keyboard
  interaction are the mobile-specific rendering risks; the compose-first + control-rail model
  ([[d-18-pwa-terminal-substrate-and-mvp-scope]]) is designed so the user rarely needs the native
  keyboard against the terminal directly. Allocate a device test pass (real phone, not just simulator).
- **Target OS confirmation.** [`requirements.md`](../../design/pwa/requirements.md) NFR-6 leaves
  iOS-vs-Android primary "to confirm"; the quirk list above is iOS-worst-case and remains valid either
  way.

**Cites.** NFR-6; [`app-shell.md`](app-shell.md) §3, §5, §5.3, §7;
[[d-18-pwa-terminal-substrate-and-mvp-scope]]; [`requirements.md`](../../design/pwa/requirements.md)
NFR-6.

## 6. Offline posture (NFR-7)

**None for MVP** — already settled in [`app-shell.md`](app-shell.md) §3. The PWA is a **live view**; the
service worker exists for **installability + first-load caching only**, not offline session use.
Disconnected ≠ offline mode — it is the reconnect prompt (§2; [`data-layer.md`](data-layer.md) §3.2).
There is no cached session data to serve offline (NFR-3, §3). Consolidated here for completeness; no new
decision.

**Cites.** NFR-7; [`app-shell.md`](app-shell.md) §3; [`data-layer.md`](data-layer.md) §3.2.

## 7. Accessibility / ergonomics (NFR-8)

**Delivered by the design system, verified on delivery — not hand-rolled here.** The NFR-8 primitives —
thumb-sized tap targets, focus rings, contrast, legible monospace terminal font — are **prescribed by
the external Claude Design delivery** ([`foundations.md`](foundations.md) §4, §5 guarantee #4); consumer
modules use the scheme, they do not redefine a11y values. This layer records the **checklist and where
each item is satisfied**, so the L1 delivery integration ([`foundations.md`](foundations.md) §6) has a
concrete acceptance list:

| NFR-8 item | Satisfied by | Verify |
| --- | --- | --- |
| Thumb-sized control-rail tap targets | delivered scheme sizing (L4 §4.2 uses it abstractly) | on L1 delivery |
| Soft-keyboard-aware layout (rail + compose stay visible) | shell §5 keyboard handling | §5 test pass |
| Focus rings / contrast | delivered scheme ([`foundations.md`](foundations.md) §4) | on L1 delivery |
| Legible terminal font on mobile | delivered monospace ([`foundations.md`](foundations.md) §4) | device test pass |

Any a11y gap found at delivery goes to the design source or to
[`unresolved-dependencies.md`](unresolved-dependencies.md) §2 — **never silently patched in PWA code**
([`foundations.md`](foundations.md) §5 guarantee #4).

**Cites.** NFR-8; [`foundations.md`](foundations.md) §4, §5, §6; [`app-shell.md`](app-shell.md) §5;
[`feature-modules.md`](feature-modules.md) §4.2.

## 8. Disposability / migration (NFR-9)

**Resolved — the graduate-or-rebuild question is closed.** [`requirements.md`](../../design/pwa/requirements.md)
NFR-9 asked for "a clear graduate-or-rebuild path from `spike-pwa`, decided in the tech phase." It is
decided: **clean rebuild in `packages/pwa/`**, not graduation. Two facts seal it:

- [`app-shell.md`](app-shell.md) §1 — "Clean-slate, not spike inertia": the framework decision rests on
  the modern Angular era, not on the Track 9 spike; the spike contributes nothing to this build.
- The `spike-pwa` tree was **deleted on 2026-07-02** (archived at tag `pre-cleanup-phase1`; build-plan
  row **9A**). Its disposability contract was honoured — it was feasibility-only and is gone — so
  "keep the spike's kill procedure valid until then" is moot.

So NFR-9 carries **no ongoing migration burden**: there is no spike to graduate, no dual-tree period,
no kill procedure to maintain. The PWA is a clean-slate build from L1–L6.

**Cites.** NFR-9; [`app-shell.md`](app-shell.md) §1; [`requirements.md`](../../design/pwa/requirements.md)
NFR-9; build-plan 9A (spike deleted, tag `pre-cleanup-phase1`).

## 9. Observability (NFR-10)

**Surface connection state + errors clearly; carry the `relay doctor` error-UX posture to the client.**
The **rendering** of this is the L4 §7 status & error module; L6 owns the **cross-cutting posture**:

- **What is observable, client-side:** connection state (`idle / connecting / attached / reconnecting /
  error`) and claim state, both live signals on `WsClientService` ([`data-layer.md`](data-layer.md)
  §1.1); reconnect progress ("reconnecting (attempt N)" / "disconnected — tap to reconnect",
  [`data-layer.md`](data-layer.md) §3.2); errors with a **cause + next action**, never a raw stack —
  REST via RFC 9457 problem-details + the recovery table ([`rest-conventions.md`](../rest-conventions.md)
  §2, §7), WS via `error` frames ([`ws-protocol.md`](../ws-protocol.md) §4.1). This is the
  [[nd-35-diagnostics-and-error-ux-deep-dive]] bar carried to the client.
- **Deliberate non-goals (MVP):** **no OS push / service-worker notifications** — in-app running/idle
  status only ([[d-18-pwa-terminal-substrate-and-mvp-scope]] §4 descope; `interaction-model.md` §5). No
  **client-side telemetry / analytics** endpoint — observability is client-local surfacing, so there is
  **no server coupling** here.

**Cites.** NFR-10; [`feature-modules.md`](feature-modules.md) §7; [`data-layer.md`](data-layer.md) §1.1,
§3.2; [[nd-35-diagnostics-and-error-ux-deep-dive]]; [`rest-conventions.md`](../rest-conventions.md) §2,
§7; [`ws-protocol.md`](../ws-protocol.md) §4.1; [[d-18-pwa-terminal-substrate-and-mvp-scope]] §4.

## 10. NFR coverage summary

| NFR | Concern | Where held | New decision here |
| --- | --- | --- | --- |
| NFR-1 | Latency | §1 (target set) + L2 §5, L3 §3.1, ws-protocol §1 | **≤150 ms budget, verify on real path** |
| NFR-2 | Reliability / reconnect | L3 §3.2, §3.3 (consolidated §2) | no — cross-ref |
| NFR-3 | Statelessness | L3 §1, §2 (consolidated §3) | no — cross-ref |
| NFR-4 | Security | L3 §2, ND-36 (consolidated §4) | no — cross-ref |
| NFR-5 | Client-agnosticism | L5 (structural — §0) | no — harvest rule |
| NFR-6 | Compatibility / iOS quirks | L2 §3, §5, §5.3 (gathered §5) | no — consolidated checklist |
| NFR-7 | Offline | L2 §3 (consolidated §6) | no — cross-ref |
| NFR-8 | A11y / ergonomics | L1 §4, §5; L2 §5 (checklist §7) | no — verify on L1 delivery |
| NFR-9 | Disposability / migration | L2 §1; build-plan 9A (§8) | **closed: clean rebuild** |
| NFR-10 | Observability | L4 §7; L3 §3.2 (posture §9) | no — posture + non-goals |

**Server couplings surfaced by L6:** **none.** Every concern is client-side or already-decided; the one
security revisit that *would* couple the server (`httpOnly` cookie) is not triggered at MVP
([`data-layer.md`](data-layer.md) §2).

## 11. Loose ends

- **NFR-1 latency number is a budget, not a measurement.** ≤150 ms must be validated on the real
  LAN / Tailscale path during implementation and re-tuned to what the hardware delivers (§1).
- **iOS standalone-mode viewport test pass** and a **real-device xterm.js pass** are acceptance items
  for implementation, not resolvable on paper (§5).
- **A11y verification is gated on L1 delivery** (§7) — the checklist is written; the values arrive with
  the scheme ([`foundations.md`](foundations.md) §6).
- **NFR-4 trust-model revisit** would file an `httpOnly`-cookie server coupling as an ND if the PWA ever
  leaves the LAN / Tailscale boundary (§4) — flagged, not triggered.
