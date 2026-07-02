---
id: ND-42
status: open
title: "Control-key claim/release semantics for keyless control affordances"
affects: "docs/arch/ws-protocol.md §2.2 / §5.2 (claim/release FSM); packages/server/src/server/ws/ (release rule); docs/decisions/ND-24-per-keystroke-input-streaming-for-tui-agents.md (newline-release rule); docs/decisions/ND-01-claim-lock-timeout-duration.md (the timeout a held claim would otherwise wait out); docs/arch/pwa/unresolved-dependencies.md §1.2; docs/arch/pwa/feature-modules.md §4.2 (FR-5 control rail)."
surfaced-by: "[[d-18-pwa-terminal-substrate-and-mvp-scope]] §5 (committed to filing this sub-question during the PWA tech-architecture phase); harvested in docs/arch/pwa/unresolved-dependencies.md §1.2 during P2-PWA-tech (2026-07-02)."
---

# ND-42 — Control-key claim/release semantics for keyless control affordances

**Status:** open
**Affects:** [`docs/arch/ws-protocol.md`](../arch/ws-protocol.md) §2.2 / §5.2 (claim/release FSM); `packages/server/src/server/ws/` (release rule); [[nd-24-per-keystroke-input-streaming-for-tui-agents]] (newline-release rule); [[nd-01-claim-lock-timeout-duration]] (the timeout a held claim would otherwise wait out); [`docs/arch/pwa/unresolved-dependencies.md`](../arch/pwa/unresolved-dependencies.md) §1.2; [`docs/arch/pwa/feature-modules.md`](../arch/pwa/feature-modules.md) §4.2.
**Surfaced by:** [[d-18-pwa-terminal-substrate-and-mvp-scope]] §5 (committed to filing this sub-question during the PWA tech-architecture phase); harvested in [`docs/arch/pwa/unresolved-dependencies.md`](../arch/pwa/unresolved-dependencies.md) §1.2 during P2-PWA-tech (2026-07-02).

## Question

The PWA control rail (FR-5) sends raw control bytes — `Ctrl-C`, `Esc`, `Tab`, arrows, the plan-mode
cycle (Shift+Tab). Per [[nd-24-per-keystroke-input-streaming-for-tui-agents]] the server releases the
claim only when a `send`'s decoded payload contains a newline byte; a bare control byte is **not** a
newline, so it writes to the PTY but leaves the claim held until the
[[nd-01-claim-lock-timeout-duration]] inactivity timeout — blocking the other device for up to that
window. Should the **client** send an explicit `release` after each non-newline control send, or should
the **server** treat a single non-newline control send as fire-and-release?

## Elaboration prompt

Weigh the two mechanisms. **Client-driven explicit RELEASE** (send-then-`release`) keeps the server's
§5.2 FSM unchanged and is purely a client convention, at the cost of an extra frame per control key and
a client that must remember to release. **Server-side rule** (a single control-char `send` that reaches
the PTY auto-releases) removes the client burden but changes the §5.2 newline-release invariant and
risks TUI flows that legitimately want the claim held across a multi-key sequence (e.g. arrow-arrow-Enter
in a menu) — so it likely needs to be scoped to genuinely single, isolated control sends, which is
fiddly to define. Consider: the raw-input toggle (FR-7) path already streams per-keystroke and relies on
newline release, so whatever is chosen must compose with ND-24 streaming; multi-client arbitration
(D-G2) must stay correct; and the rule must serve every client uniformly (NFR-5) — `relay attach`'s
raw-mode TTY sends the same control bytes. Recommend the option that needs the smallest, most local
change and preserves ND-24's "server stays line-agnostic about payload contents" property. File the wire
change (if any) into `ws-protocol.md` §2.2 / §5.2 on resolution.

## Resolution

*(unresolved)*
