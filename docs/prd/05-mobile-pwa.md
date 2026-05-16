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

The mobile client is one instance of the generic client contract. Its core behaviors — render the session's output stream, accept user input, surface session-level controls — are determined by the server's client contract (input arbitration, reattach semantics, transcript access), not by mobile-specific PRD prescription. Concretely, the Phase 2 design doc will cover sessions list, live session view, compose, file viewer, and diff approval; the rendering substrate (terminal vs. chat-style) and gesture/interaction model are UX choices that belong in that doc, not here.

This deferral is deliberate. Locking mobile UX into the PRD before the client contract is fully resolved (see `../open-questions.md` decisions D-G2 and D-G3) would be premature.

## 3. Constraint

No client-side state of consequence. The PWA is a view onto the server. The server holds sessions, transcripts, files. The PWA can disappear and reappear without data loss.

## 3a. BUSY-on-input UX (shared client contract)

When the user submits a message and the server rejects the `CLAIM` with `BUSY` (per `03-server.md` §5.1), the PWA surfaces a one-shot, dismissible inline indicator above the compose field — not a global toast that obscures the live session output: "Another device is interacting with this session." The indicator auto-dismisses after ~4 seconds or on the next keystroke. The local input draft is preserved unchanged; the user retries by tapping Send again. The PWA does not auto-retry. This is the same contract the IDE extension follows (`04-ide-extension.md` §4); only the visual primitive differs.

*BUSY UX resolved by [ND-02](../open-questions.md#nd-02-rejection-ux-for-busy-response) on 2026-05-15.*

## 4. Reference: separate Phase 2 design doc

A standalone mobile design document (TBD; not yet authored) will own:
- Rendering substrate decision (terminal-style vs. chat-style)
- Gesture/touch model
- Notification flows (PWA Push vs. webhook fallback)
- Offline behavior
- View-by-view screen specifications

That document will be written when Phase 2 begins, after the Phase 1 client contract is stable.
