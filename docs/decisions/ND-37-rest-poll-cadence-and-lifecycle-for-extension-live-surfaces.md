---
id: ND-37
status: resolved
resolved-on: 2026-05-26
title: "REST poll cadence and lifecycle for extension live surfaces"
affects: "packages/extension/src/sessionsTree.ts (the P0 sessions-tree poll timer); the future P1 status-bar running-session indicator (docs/prd/04-ide-extension.md §6 P1); docs/prd/04-ide-extension.md §6."
surfaced-by: "[[nd-33-ide-gui-overhaul-deep-dive]] resolution (2026-05-26) — relay-architect 7C-tree plan-review."
---

# ND-37 — REST poll cadence and lifecycle for extension live surfaces

**Status:** resolved (2026-05-26)
**Affects:** `packages/extension/src/sessionsTree.ts` (the P0 sessions-tree poll timer); the future P1 status-bar running-session indicator (`docs/prd/04-ide-extension.md` §6 P1); `docs/prd/04-ide-extension.md` §6.
**Surfaced by:** [[nd-33-ide-gui-overhaul-deep-dive]] resolution (2026-05-26) — relay-architect 7C-tree plan-review.

## Question
[[d-g2-multi-client-input-arbitration]] forbids a WebSocket in the extension, so every live extension surface refreshes by REST poll ([[nd-33-ide-gui-overhaul-deep-dive]] Contract #3). The sessions tree view (7C-tree) is the extension's **first** polling surface — `statusBar.ts` refreshes on editor/workspace events, never on a timer. ND-33 mandates "REST poll" but sets no cadence, no pause-when-hidden behavior, no failure posture, and no disposal contract. Left unspecified, the P0 tree and the P1 status-bar running-session indicator ([[nd-33-ide-gui-overhaul-deep-dive]] item (i), `prd/04-ide-extension.md` §6 P1) would each invent their own timer and diverge. What is the poll cadence and lifecycle contract for extension live surfaces?

## Resolution
**A single shared poll contract: a 5-second interval that runs only while the surface is visible, tears down with the surface, survives transient poll failures by rendering an in-tree error state, and is reused verbatim by every future REST-poll surface so the extension never runs two divergent timers.**

1. **Cadence.** Poll every **5 seconds** while the surface is visible. 5s is the cheapest interval that keeps `running`/`killed` status badges feeling live without hammering the server; the data is lifecycle status, not byte-stream output, so sub-second freshness is unnecessary.
2. **Visibility-gated.** The interval starts when the surface becomes visible and is cleared when it is hidden, via `vscode.TreeView.onDidChangeVisibility`. A collapsed Activity Bar panel polls zero times. The surface does a single immediate poll on becoming visible so a freshly-revealed tree is never stale-empty.
3. **Disposal.** The interval handle is cleared on `dispose()`, and the provider/view is pushed onto `context.subscriptions` so `deactivate()` tears the timer down — mirroring `statusBar.ts` subscription disposal. No timer outlives the extension host.
4. **Failure posture.** A `RelayNetworkError` / `RelayHttpError` thrown during a poll does **not** stop the timer. The surface renders a single informational placeholder (e.g. a tree node carrying the error's user message) and recovers on the next successful poll. Transient server-down or token-expiry never kills the refresh loop. Not-paired (no credentials) renders a "not paired" placeholder and skips polling entirely until credentials change.
5. **Manual refresh.** Each surface contributes a refresh command (view-title action for the tree) that forces an immediate poll independent of the timer, for the user who does not want to wait out the interval.
6. **Shared, not per-surface.** This contract governs all extension REST-poll surfaces. When the P1 status-bar running-session indicator lands, it reuses the same cadence, visibility gating, disposal, and failure posture rather than introducing a second timer.

**Why 5s visibility-gated and not a faster always-on poll:** an always-on 1s timer would poll the server hundreds of times an hour for a panel the user is not looking at — wasteful against [[d-g2-multi-client-input-arbitration]]'s "the extension is a lightweight REST client, the real-time surface is `relay attach`" posture. Visibility gating makes the cost proportional to attention. **Why render-error-and-keep-polling and not tear-down-on-failure:** a dropped poll is almost always transient (server restart per [[d-11-server-restart-and-session-orphaning]], laptop sleep, token refresh); tearing down the timer would require the user to manually re-trigger the view to recover, which contradicts "live status." **Why a shared contract and not per-surface tuning:** ND-33 already names two polling surfaces (P0 tree, P1 status bar); divergent cadences would double server load and confuse "why does one update faster than the other." One contract, cited once.

**Surfaces new sub-questions:** none — this is a self-contained lifecycle contract derived from [[d-g2-multi-client-input-arbitration]] + [[nd-33-ide-gui-overhaul-deep-dive]] Contract #3.

**Propagated to:** `prd/04-ide-extension.md` §6 P0 bullet (2026-05-26).
