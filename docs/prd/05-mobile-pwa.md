# Relay PRD — Mobile PWA (Phase 2)

**Status:** v0.4
**Scope:** High-level mobile client scope. The mobile PWA is one instance of the generic client contract defined by the server (`03-server.md`); detailed mobile UX is deferred to a separate Phase 2 design document.

---

## 1. Scope

- Installable PWA, served by the Relay server itself or as a separate static deployment pointing at any Relay server.
- Connects to the same REST + WebSocket API used by the IDE extension.
- Authenticates with a bearer token paired via QR code on first use.
- Single-purpose surface: monitor and prompt running sessions. Not a coding environment.

## 2. Capabilities (intent only — detailed UX in a separate design doc)

The mobile client is one instance of the generic client contract. Its core behaviors — render the session's output stream, accept user input, surface session-level controls — are determined by the server's client contract (input arbitration, reattach semantics, transcript access), not by mobile-specific PRD prescription.

The **rendering substrate is resolved: terminal-style** (xterm.js), not chat-style — the PWA renders the live PTY of the real server-side agent, so plan mode, interactive prompts, skills, agents, and diff approval all happen in the TUI exactly as on the laptop (no reimplementation). The substrate question was deliberately deferred until the client contract (D-G2 input arbitration, D-G3 reattach) was stable; it now is. The interaction model (compose-first with a keyless control rail), the information architecture (Projects + Scratch groups), the spawn/scratch flows, and the full functional + non-functional requirements are owned by the design spec at [`../design/pwa/`](../design/pwa/README.md). A read-only file tree + light text viewer is in scope (conditional); file editing, a diff-approval GUI, OS push notifications, and a custom voice-transcription engine are out of MVP scope (voice is covered by OS keyboard dictation into the compose buffer).

*Rendering substrate + MVP scope resolved by [D-18](../decisions/D-18-pwa-terminal-substrate-and-mvp-scope.md) on 2026-05-28; full design at [`../design/pwa/`](../design/pwa/README.md).*

## 3. Constraint

No client-side state of consequence. The PWA is a view onto the server. The server holds sessions, transcripts, files. The PWA can disappear and reappear without data loss.

## 3a. BUSY-on-input UX (shared client contract)

When the user submits a message and the server rejects the `CLAIM` with `BUSY` (per `03-server.md` §5.1), the PWA surfaces a one-shot, dismissible inline indicator above the compose field — not a global toast that obscures the live session output: "Another device is interacting with this session." The indicator auto-dismisses after ~4 seconds or on the next keystroke. The local input draft is preserved unchanged; the user retries by tapping Send again. The PWA does not auto-retry. This is the same contract the IDE extension follows (`04-ide-extension.md` §4); only the visual primitive differs.

*BUSY UX resolved by [ND-02](../decisions/ND-02-rejection-ux-for-busy-response.md) on 2026-05-15.*

## 4. Reference: the PWA design spec

The standalone design doc is now authored at [`../design/pwa/`](../design/pwa/README.md) (a new
`docs/design/` category for product/UX/interaction design). It owns:

- Rendering substrate — **resolved: terminal-style** (D-18).
- Interaction model (compose-first + control rail), information architecture, spawn/scratch flows —
  [`../design/pwa/interaction-model.md`](../design/pwa/interaction-model.md).
- Functional + non-functional requirements — [`../design/pwa/requirements.md`](../design/pwa/requirements.md).
- The minimal additive server touch points — [`../design/pwa/server-touchpoints.md`](../design/pwa/server-touchpoints.md).

Deferred to the PWA **tech-architecture phase** (resolved after the product/UX design, per the
product → design → tech ordering): framework choice (graduate `packages/spike-pwa/` vs. rebuild
`packages/pwa/`), voice transcription engine, terminal-on-mobile rendering specifics, notification
flows (PWA Push vs. webhook fallback — MVP ships in-app status only), offline behavior (none at
MVP), and PWA infrastructure (manifest / service worker / installability).

*The deferral precondition named here — "after the Phase 1 client contract is stable" — was met by
D-G2/D-G3/ND-39; the product + UX design was authored 2026-05-28 per [D-18](../decisions/D-18-pwa-terminal-substrate-and-mvp-scope.md).*
