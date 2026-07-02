---
id: ND-46
status: open
title: "Control-rail arrow-key escape sequences (normal vs application cursor mode / DECCKM)"
affects: "docs/arch/pwa/feature-modules.md §4.2 (FR-5 control rail byte mapping); docs/design/pwa/interaction-model.md §2 (rail affordances, byte sequences left unpinned); packages/pwa/src/app/components/control-rail.component.ts"
surfaced-by: "P2-PWA-build plan-time relay-architect review (2026-07-02) — Task 7.1's raw-byte table hard-codes arrows to the normal cursor-key sequences (ESC [ A / ESC [ B) but a full-screen TUI agent that enables DECCKM (application cursor keys) expects ESC O A / ESC O B; the spec pins neither."
---

# ND-46 — Control-rail arrow-key escape sequences (normal vs application cursor mode / DECCKM)

**Status:** open
**Affects:** [`docs/arch/pwa/feature-modules.md`](../arch/pwa/feature-modules.md) §4.2 (FR-5 control rail byte mapping); [`docs/design/pwa/interaction-model.md`](../../design/pwa/interaction-model.md) §2 (rail affordances; byte sequences left unpinned); `packages/pwa/src/app/components/control-rail.component.ts`.
**Surfaced by:** P2-PWA-build plan-time [`relay-architect`] review (2026-07-02).

## Question

The control rail's `↑`/`↓` buttons (FR-5) send a raw escape sequence through the input path. In a terminal's **normal** cursor-key mode an up-arrow is `ESC [ A` (`0x1b 0x5b 0x41`); when a full-screen TUI application sets **DECCKM** (application cursor keys, `ESC [ ? 1 h`) it instead expects `ESC O A` (`0x1b 0x4f 0x41`). The PWA control rail is a stateless button that cannot see the PTY's current DECCKM state. Which byte sequence should the rail emit — the normal-mode sequence unconditionally, or should it track/negotiate application-cursor-key mode?

## Elaboration prompt

Weigh the options against the real TUI the rail drives (claude's terminal UI, and any menu/pager it launches). **(a) Emit normal-mode `ESC [ A/B` unconditionally** — simplest, and correct for line-oriented and most modern TUIs, but an arrow may be misread by an app in application-cursor mode (e.g. some readline/menu contexts). **(b) Track DECCKM client-side** by parsing the PTY output stream for `ESC [ ? 1 h` / `ESC [ ? 1 l` and switching the rail's emitted sequence — accurate but couples the (currently pure-consumer) terminal viewport to escape-sequence parsing it otherwise never does, and races the stream. **(c) A hybrid** — let xterm.js itself own the mapping by feeding the arrow as a synthetic key event through xterm's input path so xterm applies the mode it already tracks internally. Option (c) is attractive because xterm already parses DECCKM for its own keyboard handling; the open question is whether the rail can cleanly route a synthetic keypress through xterm's `onData`/input pipeline rather than fabricating bytes. Validate the chosen option on the Task 10.2 tui-visual harness and the Task 10.4 real-device pass against an app known to use application cursor keys. Whatever is chosen must serve every client uniformly (NFR-5) and needs no server change (the bytes ride the existing `send` frame). Until resolved, the build ships option (a) (normal-mode sequences) as the MVP stopgap.

## Resolution

*(unresolved)*
