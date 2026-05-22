---
id: ND-33
status: open
title: "IDE GUI overhaul deep-dive — painless-rollout bar"
affects: "docs/prd/04-ide-extension.md (the extension command surface and GUI affordances); packages/extension/src/commands/ (the four palette commands); packages/extension/src/statusBar.ts (focus-following indicator that today is a single click target); the user's discovery and management of sessions through the IDE rather than the CLI."
surfaced-by: "[[d-15-ux-rollout-posture]] resolution (2026-05-22). One of four per-surface deep-dives opened to gate Phase 1.5 rollout."
---

# ND-33 — IDE GUI overhaul deep-dive — painless-rollout bar

**Status:** open
**Affects:** `docs/prd/04-ide-extension.md` (the extension command surface and GUI affordances); `packages/extension/src/commands/` (the four palette commands); `packages/extension/src/statusBar.ts` (focus-following indicator that today is a single click target); the user's discovery and management of sessions through the IDE rather than the CLI.
**Surfaced by:** [[d-15-ux-rollout-posture]] resolution (2026-05-22). One of four per-surface deep-dives opened to gate Phase 1.5 rollout.

## Question
What is the minimum painless-rollout bar for **IDE GUI** — the visual surface that lets a user discover, attach to, switch between, and manage sessions without reaching for the command palette or the CLI? Today the extension contributes four palette commands and a single-click status-bar widget; everything else falls through to `relay attach` running inside a terminal pane. Which GUI affordances must exist before a non-CLI user can use Relay productively?

## Elaboration prompt
The inventory in [`docs/arch/ux-rollout-posture.md`](../arch/ux-rollout-posture.md) §4 lists what's painful today. The resolution must decide which items are P0, P1, or deferred-with-rationale. The triage frame below covers the known surface.

**What to consider:**

- **(a) Sessions tree view (Activity Bar).** Today there is no Activity Bar contribution — no left-rail icon, no tree view of "sessions in this project" or "all running sessions across all projects." A user with three running sessions has no GUI way to see them; the command palette quick-pick is the only path. Decide whether the extension contributes a `viewsContainers` + `views` entry with at least: sessions-grouped-by-project tree, per-session quick actions (attach, release, kill), live status (running / idle / killed) per [[d-11-server-restart-and-session-orphaning]]. Validate against `vscode.window.createTreeView` API capabilities (refresh on REST poll vs. WS push from the extension itself — though [[d-g2-multi-client-input-arbitration]] forbids WS in the extension; the tree refresh would have to be REST poll).

- **(b) Persona picker UI beyond the quick-pick.** Today "Relay: Start session" surfaces personas via `vscode.window.showQuickPick`. For a user with five personas, this is fine; for a user with twenty (post-`personas/` directory growth), search/filter and per-persona descriptions become necessary. Decide whether the persona picker becomes a tree view, a webview-panel picker, or stays as quick-pick with `matchOnDescription: true` + grouping.

- **(c) BUSY notice anchoring per [[nd-02-rejection-ux-for-busy-response]].** Today the BUSY signal is the unstructured stderr line in the terminal pane (fails ND-02). [[nd-30-relay-attach-stderr-event-stream-for-subprocess-of-attach-consumers]] is the unblocking dependency: once `relay attach` ships a structured `RELAY-EVENT busy\n` sentinel, the extension can render an ND-02-compliant status-row-anchored, auto-dismissing notice. Decide here: is the IDE GUI overhaul resolution **blocked on ND-30** (so 7C requires 6L-style precursor work on the attach client), or does the GUI overhaul commit to a fallback UX (e.g. status-bar item that turns red on stderr-line detection) for the case where ND-30 ships later?

- **(d) Multi-server pairing UI per [[nd-31-secretstorage-key-namespace-for-multi-server-ide-pairing]].** Today SecretStorage uses single-server keys; a marker pointing at a different server URL refuses to bind. The ND-31 resolution introduces per-server-URL-hashed keys; the GUI overhaul must surface the multi-server picker (which server is this workspace bound to, switch active server, add new server). Decide: does the extension contribute a "server picker" in the status bar, an Activity Bar tree section, or a settings-style webview?

- **(e) Project-marker mental-model gap per [[d-12-project-record-storage-and-relay-project-add-semantics]] / [[d-g6-project-discovery-workspace-to-project-binding]] / [[nd-07-marker-file-schema]].** A CLI-first operator runs `relay project add /path` which today does NOT write the `.relay/project.json` marker (the marker is written server-side during `POST /projects` from the extension). The user opens the IDE, the extension finds no marker, prompts to "register new" or "bind existing," and the user is confused because they thought they already registered. Decide whether (i) `relay project add` writes the marker locally (then the extension just reads it), (ii) the extension's "bind existing" flow always succeeds against the project the CLI registered (by listing all projects for the active tenant), or (iii) the docs commit to one workflow (IDE-first or CLI-first) and the other is a documented friction point. This is a workflow decision, not just GUI.

- **(f) Quick-pick search / filter on attach.** Today "Relay: Attach to session" lists sessions in a quick-pick with no search/filter. A user with ten sessions sees a long list with no way to narrow. Decide whether the quick-pick gains `matchOnDescription` + `matchOnDetail`, grouping by project, or whether attach-via-tree-view (from (a)) supersedes the quick-pick entirely.

- **(g) Subdirectory selection for monorepos per [[d-01-workspace-root-vs-subdirectory-for-start-session]].** D-01 deferred subdirectory selection "if a concrete need surfaces." If the IDE overhaul ships a tree view, the per-project node could expose "start session in this subdirectory" — but D-01 explicitly says no. Decide whether to revisit D-01 here (and refile as resolved with a different choice) or honor the deferral and explicitly note "monorepo subdirectory selection remains deferred per D-01" in the GUI overhaul resolution.

- **(h) Persona switch mid-session per [[d-g1-persona-application-semantics]].** D-G1 makes session personas immutable for MVP; a user wanting a new persona must kill + restart. The GUI could surface a "switch persona" action that kills + spawns a new session with the desired persona while preserving the conversation via Claude Code's native session-resume (Phase 3 per D-G1). Decide whether to surface the kill-and-restart-with-resume gesture in the GUI now (visible affordance, even if it costs the lossy step) or wait for Phase 3.

- **(i) Status-bar richness.** Today the status bar shows `$(broadcast) Relay: <persona>` with a click target running `relay.attachSession`. Decide whether it gains: agent activity indicator (idle / running / waiting), claim-holder indicator (who has the claim, you or another device), unread-output indicator (bytes received since the user last focused the pane), version banner. Each addition costs status-bar real estate.

- **(j) Webview-based session UI (out-of-scope flag).** A full webview-based session UI — chat-style transcript, side-by-side personas, project switcher — overlaps Phase 2 PWA scope. Decide whether the IDE overhaul stays "lightweight tree + status bar + quick-picks" or starts down the webview path. Default is the former; flag the choice explicitly.

**Validation against the gate.** The resolution must end with a line of the shape "the painless-rollout bar for IDE GUI is: <one-paragraph statement>" so [[d-15-ux-rollout-posture]] §7 can quote it.

This is filed as `open` so the resolution lands as a deliberate deep-dive (Track 7C in `docs/build-plan.md`) rather than inline drift.

## Resolution

*(unresolved)*
