# Relay Arch — UX Rollout Posture

**Status:** v0.1
**Scope:** Top-down inventory of the end-user UX gaps that block painless wider rollout of Relay, surfaced by the 6I IDE-extension e2e walk on 2026-05-22. Identifies and groups gaps across four surfaces (install + onboarding, IDE GUI overhaul, session + attach polish, diagnostics + error UX); does NOT prescribe fixes. Each surface's content decision is owned by its [`docs/decisions/`](../decisions/) child entry ([[nd-32-install-and-onboarding-deep-dive]], [[nd-33-ide-gui-overhaul-deep-dive]], [[nd-34-session-and-attach-polish-deep-dive]], [[nd-35-diagnostics-and-error-ux-deep-dive]]). Authored as part of [`Track 7`](../build-plan.md) row 7A; closes [[d-15-ux-rollout-posture]].

**Out of scope:** Per-surface fixes (handled by Track 7 rows 7B–7E, each opening its own brainstorm → spec → plan cycle); Phase 2 mobile PWA UX (deferred per [`docs/prd/05-mobile-pwa.md`](../prd/05-mobile-pwa.md)); the [`6Z` Phase 1 acceptance gate](../build-plan.md) (which is the *acceptance* bar — scenarios pass on a clean install — not the *rollout* bar that this doc establishes); re-parenting existing NDs (ND-15, ND-17, ND-19, ND-25, ND-30, ND-31, ND-02, ND-03, ND-05, ND-07, ND-11 stay where they are; this doc references them under the appropriate surface for context only).

---

## 1. Purpose & framing

Written immediately after the 6I IDE extension wire-up landed (ed97bc3, 2026-05-22) and was exercised end-to-end across a remote-SSH workstation IDE and multiple attach clients against a server hosted on a separate machine. The functional contract held — the WS protocol, REST routes, persona application, claim arbitration, transcript replay, and cross-device attach all worked the way the spec says they should. The **UX surface around those mechanics** was clunky in ways that would make a wider rollout (beyond the operator who built it) painful.

This doc names the clunky pieces, groups them into four surfaces, and points each surface at the ND child that will resolve its deep-dive. The doc is **identify-only**. The actual fixes happen later, in independent deep-dives sequenced as Track 7 rows 7B–7E in [`docs/build-plan.md`](../build-plan.md). Each ND deep-dive owns its own scoping — not every bullet listed below must ship; deliberate deferrals are valid resolutions provided the deferral rationale is written down in the ND's Resolution.

The doc ends (§7) with a one-sentence rollout-readiness statement so future audits ([`scenario-runner`](../../.claude/skills/scenario-runner/SKILL.md), readiness reviews) can quote the gate verbatim.

## 2. Posture summary

**What's painful end-to-end today.** A new user goes through a path that looks like: clone the repo or wait for it to be available somewhere → run `npm install -g @relay/relay` (post-6J) or `pnpm -F relay-extension vsix` + sideload (today) → globally link the `relay` binary so the IDE extension's `vscode.window.createTerminal` spawn can find it → run `claude login` on whichever machine will host the server → run `relay init`, copy the pairing snippet out of stdout → run `relay server` (no prompt to do so) → open the IDE, run "Relay: Connect to server" from the command palette, paste the snippet → run "Relay: Start session," pick a persona from a quick-pick → a terminal pane opens running `relay attach` → start typing.

That path has roughly twelve manual steps. Each step is documented somewhere, but the user has to know to do them in order, with no narrative bridge between `relay init` and the IDE pairing prompt, no GUI surface beyond a single-click status-bar widget, and no visibility into "did `claude login` actually work?" or "did my persona load?" When something goes wrong — bad token, missing credentials, persona YAML typo, project marker mismatch — the failure is either silent or surfaces as a generic error with no recovery path.

The 6I e2e walk also surfaced moment-to-moment ergonomic issues once a session is running: detaching from `relay attach` requires two `^D` presses ([[nd-25-relay-attach-detach-with-d-requires-two-keypresses-on-the-host-tty]]), reattaching to a quiet session shows a blank pane until the agent emits new bytes, sessions are identified only by ULID with no human-readable label, and the BUSY notice when another device interacts shows as an unstructured stderr line that scrolls away ([[nd-30-relay-attach-stderr-event-stream-for-subprocess-of-attach-consumers]]).

None of these block Phase 1 *acceptance* — [`6Z`](../build-plan.md) tests that scenarios A–H pass on a clean install, which they do (modulo 6J distribution work). They block *painless rollout* — the bar that says someone who is not the author can install Relay, pair an IDE, and use it productively without DMing the author.

## 3. Surface 1 — Install & onboarding

**Entry point for the deep-dive:** [[nd-32-install-and-onboarding-deep-dive]]. **Track 7 row:** 7B.

### Inventory

- **Sideload-only extension.** Today the extension is built via `pnpm -F relay-extension vsix` and installed with `code --install-extension <path>.vsix`. For non-author users this is a blocker — they expect Marketplace install (VS Code Marketplace, Open VSX, or both). Ties to [`6J` distribution](../build-plan.md).
- **`relay` binary discovery from the extension.** The extension spawns `vscode.window.createTerminal({ shellPath: 'relay', shellArgs: ['attach', sid, ...] })` — requires `relay` on PATH. Today that means `npm link` during development; post-6J it means a successful `npm install -g @relay/relay`. No extension-side probe surfaces "binary not found" with install guidance. Remote-SSH (Cursor) adds a local-vs-remote PATH twist.
- **`claude login` is a manual pre-flight gate.** Per [[nd-19-claude-login-oauth-as-the-documented-credential-default-anthropic-api-key-as-fallback]], OAuth-via-`claude login` is the documented default. The operator must know to run it before `relay server` boots; there is no surfaced affordance from `relay init` or the IDE extension. Cites [[d-10-agent-model-credentials-handling]].
- **`relay init` lacks a narrative bridge.** Per [[d-13-first-run-pairing-ux]], `relay init` prints the `relay://pair?...` snippet and exits. The operator is left to figure out the next steps ("run `relay server`," "open this URL in your IDE," "now create your first project"). No numbered next-steps block, no `--start` to launch the server.
- **`relay attach` distribution shape.** The Phase 0 audit raised the question of whether `relay attach` should ship as its own tiny package (`@relay/attach`) so third-party tools can depend on a narrow surface, or stay bundled per [[d-08-single-binary-vs-separate-packages]]. Not yet filed as an independent ND; the ND-32 deep-dive may open one or absorb the decision inline.
- **Cross-device install assumptions.** The 6I walk used remote SSH (workstation IDE → SSH-tunnelled server). Whether "server on one machine, IDE on another" is a documented first-class scenario (with a guide for SSH tunnel / Tailscale / Caddy reverse proxy) or whether same-machine install is the documented default is unresolved.
- **No version banner.** Extension version, server version, `relay` binary version are not surfaced anywhere. Version-skew between extension and server is silent.

### Existing decisions cited

- [[d-08-single-binary-vs-separate-packages]] — single binary; affects attach distribution shape.
- [[d-10-agent-model-credentials-handling]] — credential precedence story.
- [[d-13-first-run-pairing-ux]] — pairing snippet shape; doesn't cover next-steps narrative.
- [[nd-19-claude-login-oauth-as-the-documented-credential-default-anthropic-api-key-as-fallback]] — OAuth default, env-var fallback.

## 4. Surface 2 — IDE GUI overhaul

**Entry point for the deep-dive:** [[nd-33-ide-gui-overhaul-deep-dive]]. **Track 7 row:** 7C.

### Inventory

- **Every action is command-palette.** The extension contributes four palette commands (`relay.connectServer`, `relay.startSession`, `relay.attachSession`, `relay.registerWorkspace`) and a single-click status-bar widget. There is no Activity Bar contribution, no tree view, no webview, no menu items beyond the palette and status bar. A user expecting a GUI surface for "see all my sessions" or "switch personas without typing" has nothing.
- **No sessions tree view.** A user with three running sessions has no GUI way to see them; the quick-pick on "Relay: Attach to session" is the only path. `vscode.window.createTreeView` would carry sessions-grouped-by-project + per-session actions + live status (running / idle / killed per [[d-11-server-restart-and-session-orphaning]]).
- **No persona picker UI beyond quick-pick.** Personas surface via `vscode.window.showQuickPick`. Fine for five personas; awkward for twenty.
- **No quick-pick search/filter on attach.** "Relay: Attach to session" shows all sessions in a long list with no `matchOnDescription` / `matchOnDetail` / project grouping.
- **No persona switch without kill-and-restart.** Per [[d-g1-persona-application-semantics]], session personas are immutable for MVP. The GUI offers no affordance for the kill + spawn-new-with-resume dance.
- **Project-marker mental-model gap.** A CLI-first operator runs `relay project add /path` which does NOT write the `.relay/project.json` marker (the marker is written server-side during `POST /projects` from the extension). The user opens the IDE, the extension finds no marker, prompts to "register new" or "bind existing," and the user is confused. Cites [[d-12-project-record-storage-and-relay-project-add-semantics]], [[d-g6-project-discovery-workspace-to-project-binding]], [[nd-07-marker-file-schema]].
- **BUSY notice not anchored.** Per [[nd-02-rejection-ux-for-busy-response]], the BUSY notice must be status-row-anchored and auto-dismissing. The current implementation surfaces only `relay attach`'s unstructured stderr line in the terminal pane; fails ND-02. Blocked by [[nd-30-relay-attach-stderr-event-stream-for-subprocess-of-attach-consumers]] (structured event stream so the extension can render the notice).
- **Multi-server pairing constraints.** SecretStorage uses single-server keys; a marker carrying a different server URL refuses to bind. Cites [[nd-31-secretstorage-key-namespace-for-multi-server-ide-pairing]]. The GUI surface for multi-server (server picker, switch active server, add new server) does not exist.
- **Subdirectory selection for monorepos.** Deferred by [[d-01-workspace-root-vs-subdirectory-for-start-session]]; revisit if a tree view exists and the per-project node can expose "start session here."
- **Status-bar richness.** The status bar shows `$(broadcast) Relay: <persona>` with a click target running `relay.attachSession`. No agent activity indicator, no claim-holder indicator, no unread-output indicator, no version banner.

### Existing decisions cited

- [[d-01-workspace-root-vs-subdirectory-for-start-session]] — monorepo subdirectory selection deferred.
- [[d-11-server-restart-and-session-orphaning]] — session lifecycle states the tree view would surface.
- [[d-12-project-record-storage-and-relay-project-add-semantics]] — `relay project add` semantics.
- [[d-g1-persona-application-semantics]] — persona immutability for MVP.
- [[d-g2-multi-client-input-arbitration]] — claim FSM lives in `relay attach`, not the extension; constrains tree view's refresh story to REST poll.
- [[d-g6-project-discovery-workspace-to-project-binding]] — workspace-to-project binding rules.
- [[nd-02-rejection-ux-for-busy-response]] — BUSY notice anchoring contract.
- [[nd-05-multi-root-workspace-marker-file-precedence]] — multi-root resolution.
- [[nd-07-marker-file-schema]] — marker schema and refuse-to-bind rules.
- [[nd-30-relay-attach-stderr-event-stream-for-subprocess-of-attach-consumers]] — unblocking dependency for BUSY notice.
- [[nd-31-secretstorage-key-namespace-for-multi-server-ide-pairing]] — multi-server SecretStorage keying.

## 5. Surface 3 — Session + attach polish

**Entry point for the deep-dive:** [[nd-34-session-and-attach-polish-deep-dive]]. **Track 7 row:** 7D.

### Inventory

- **`^D` two-press detach.** Standard terminal behavior is one `^D`; `relay attach` requires two. Root cause unclear (raw-mode setup, canonical-mode drain, or control-sequence filtering in `packages/server/src/attach/tty.ts`). Cites [[nd-25-relay-attach-detach-with-d-requires-two-keypresses-on-the-host-tty]].
- **Blank pane on reattach to quiet sessions.** Per [[d-g3-reattach-semantics]] and [[nd-03-ring-buffer-size-for-attach-replay]], reattach sends 32 KB of replay buffer. A quiet session (no recent agent output) yields a blank pane until the agent emits new bytes; the user must pull deeper history via the transcript REST route ([[nd-04-transcript-pagination-api-shape]]) or wait.
- **No session naming / labeling.** Sessions are ULID-only. `relay session list`, IDE tree views, and the status bar all show opaque identifiers. Storage implication: a column on `sessions` in [`docs/arch/sqlite-schema.md`](sqlite-schema.md) — file a migration if the deep-dive ships labels.
- **`relay session show` surface alignment.** Cites [[nd-15-relay-session-show-subcommand-surface-alignment]]. Build-plan 6H ships `show`; PRD §7 enumerates only `list` and `kill`. ND-34 can resolve ND-15 inline or leave it independent.
- **`relay attach` raw-mode FSM variants.** Cites [[nd-17-relay-attach-raw-mode-tty-variant-of-the-5-1-client-fsm]]. Pending per-keystroke streaming (now landed as [[nd-24-per-keystroke-input-streaming-for-tui-agents]]) — ND-17 may now be resolvable.
- **Persona switch mid-session.** Cites [[d-g1-persona-application-semantics]]'s Phase 3 deferral. ND-34 decides whether to surface a kill + spawn-new-with-resume gesture now or honor the deferral.
- **`idle` status reserved but unused.** Per `docs/prd/01-conceptual-model.md`, `idle` is "reserved for a future agent-driven indicator" with no MVP transition. ND-34 decides whether to fill it in or remove it.
- **Attach distribution shape (overlap with ND-32).** Coordinate with [[nd-32-install-and-onboarding-deep-dive]] (e) so the attach-as-its-own-package decision lands in one place.
- **Detach-without-kill clarity.** `^D` detaches but the session keeps running; CLI does not print "session 01HXYZ still running; reattach with `relay attach 01HXYZ`."
- **Multi-client claim handoff polish (CLI side).** The IDE-side BUSY UX lives in ND-33; the CLI side (when you're typing in `relay attach` and get BUSY'd) is here.

### Existing decisions cited

- [[d-g1-persona-application-semantics]] — persona immutability; Phase 3 switch deferral.
- [[d-g3-reattach-semantics]] — live-forward priority on attach with viewport-sized replay.
- [[nd-03-ring-buffer-size-for-attach-replay]] — 32 KB replay sizing.
- [[nd-04-transcript-pagination-api-shape]] — byte-offset transcript pagination.
- [[nd-15-relay-session-show-subcommand-surface-alignment]] — `session show` surface mismatch.
- [[nd-17-relay-attach-raw-mode-tty-variant-of-the-5-1-client-fsm]] — attach FSM variants.
- [[nd-24-per-keystroke-input-streaming-for-tui-agents]] — per-keystroke streaming (resolved).
- [[nd-25-relay-attach-detach-with-d-requires-two-keypresses-on-the-host-tty]] — `^D` two-press.

## 6. Surface 4 — Diagnostics & error UX

**Entry point for the deep-dive:** [[nd-35-diagnostics-and-error-ux-deep-dive]]. **Track 7 row:** 7E.

### Inventory

- **Silent credential failures.** If `ANTHROPIC_API_KEY` is invalid or `claude login` was never run, the agent process spawns and may silently fail or hang. Relay does not validate credentials before spawning. Cites [[d-10-agent-model-credentials-handling]], [[nd-19-claude-login-oauth-as-the-documented-credential-default-anthropic-api-key-as-fallback]].
- **Persona-load failure invisibility.** Per [`docs/arch/persona-application.md`](persona-application.md), persona-load failures are "non-fatal" — the session spawns without the persona applied. A user sees normal agent output but `agent_session_id` stays `NULL` and the system prompt is missing. No surfaced error. Cites [[d-g1-persona-application-semantics]], [[nd-11-agentsessionid-capture-mechanism]].
- **REST error recovery guidance is absent.** Errors are RFC 9457 problem-details with machine-readable `type` codes (`project-path-taken`, `project-slug-undeducible`, etc.) but [`docs/arch/rest-conventions.md`](rest-conventions.md) does not describe the recovery path. A user receives `409 project-slug-undeducible` with no guidance.
- **No log access from the IDE.** Server stderr is visible only to whoever started `relay server`. A user on a different device has no in-IDE way to see "why did my session not start?"
- **Silent terminal-close on attach failure.** When `relay attach` exits unexpectedly (auth_expired, session_ended, BUSY rejection, server unreachable), the terminal pane just closes; the extension does not intercept the exit code (via `vscode.window.onDidCloseTerminal`) to surface a notification.
- **No `relay doctor`.** No single command probes "credentials present, server reachable, token valid, persona files parse, `claude` binary on PATH, SQLite writable." A new-install troubleshooter has to check each manually.
- **Project-marker mismatch silent refusal.** Per [[nd-07-marker-file-schema]] / [[nd-31-secretstorage-key-namespace-for-multi-server-ide-pairing]], a marker carrying an unknown `schemaVersion` causes refuse-to-bind. The refusal does not surface as "this project was registered with a newer/older Relay; upgrade [the server | the extension]."
- **No audit-log surface.** Auth events, session spawns, project-add events go to SQLite but have no user-facing surface (`relay audit` does not exist).

### Existing decisions cited

- [[d-10-agent-model-credentials-handling]] — credential precedence; validation hooks belong here.
- [[d-g1-persona-application-semantics]] — persona application semantics; "non-fatal" load failures.
- [[nd-07-marker-file-schema]] — marker schema and refuse-to-bind rules.
- [[nd-11-agentsessionid-capture-mechanism]] — how the agent session ID is captured; relevant to persona-load failure detection.
- [[nd-19-claude-login-oauth-as-the-documented-credential-default-anthropic-api-key-as-fallback]] — credential default + fallback.
- [[nd-31-secretstorage-key-namespace-for-multi-server-ide-pairing]] — refuse-to-bind path.

## 7. Rollout-readiness bar

**Wider rollout of Relay — beyond the operator/dogfood loop, to users who did not author the codebase — requires [[nd-32-install-and-onboarding-deep-dive]], [[nd-33-ide-gui-overhaul-deep-dive]], [[nd-34-session-and-attach-polish-deep-dive]], and [[nd-35-diagnostics-and-error-ux-deep-dive]] to each be resolved or deliberately deferred with documented rationale in the ND's Resolution.** Track 7 row 7F (rollout-readiness re-walk) is the gate's verification step.

This statement is quotable verbatim. [`scenario-runner`](../../.claude/skills/scenario-runner/SKILL.md) and any future readiness audit may reference it as the rollout bar.

The Phase 1 [`6Z`](../build-plan.md) acceptance gate ships independently of this bar — `6Z` is "scenarios A–H pass on a clean install"; this is "a non-author user can install and use Relay without DMing the author." The two gates are complementary, not alternatives.

## 8. References

### PRD subdocs

- [`docs/prd/03-server.md`](../prd/03-server.md) — server CLI surface (`relay init`, `relay session`, `relay token`), REST routes, attach semantics.
- [`docs/prd/04-ide-extension.md`](../prd/04-ide-extension.md) — extension command surface and GUI affordances.
- [`docs/prd/06-distribution.md`](../prd/06-distribution.md) — install / distribution narrative.
- [`docs/prd/01-conceptual-model.md`](../prd/01-conceptual-model.md) — session lifecycle, `idle` status semantics.

### Sibling arch docs

- [`docs/arch/persona-application.md`](persona-application.md) — persona-load failure semantics (Surface 4).
- [`docs/arch/rest-conventions.md`](rest-conventions.md) — RFC 9457 problem-details + recovery-guidance gap (Surface 4).
- [`docs/arch/ws-protocol.md`](ws-protocol.md) — frames the BUSY notice + claim handoff polish work against (Surfaces 2 and 3).
- [`docs/arch/sqlite-schema.md`](sqlite-schema.md) — `sessions` table; session-label column would be a migration here (Surface 3).

### Decision-log entries

- Parent: [[d-15-ux-rollout-posture]] — the strategy decision that authors this doc.
- Children: [[nd-32-install-and-onboarding-deep-dive]], [[nd-33-ide-gui-overhaul-deep-dive]], [[nd-34-session-and-attach-polish-deep-dive]], [[nd-35-diagnostics-and-error-ux-deep-dive]].
- Existing NDs referenced (not re-parented): [[d-01-workspace-root-vs-subdirectory-for-start-session]], [[d-08-single-binary-vs-separate-packages]], [[d-10-agent-model-credentials-handling]], [[d-11-server-restart-and-session-orphaning]], [[d-12-project-record-storage-and-relay-project-add-semantics]], [[d-13-first-run-pairing-ux]], [[d-g1-persona-application-semantics]], [[d-g2-multi-client-input-arbitration]], [[d-g3-reattach-semantics]], [[d-g6-project-discovery-workspace-to-project-binding]], [[nd-02-rejection-ux-for-busy-response]], [[nd-03-ring-buffer-size-for-attach-replay]], [[nd-04-transcript-pagination-api-shape]], [[nd-05-multi-root-workspace-marker-file-precedence]], [[nd-07-marker-file-schema]], [[nd-11-agentsessionid-capture-mechanism]], [[nd-15-relay-session-show-subcommand-surface-alignment]], [[nd-17-relay-attach-raw-mode-tty-variant-of-the-5-1-client-fsm]], [[nd-19-claude-login-oauth-as-the-documented-credential-default-anthropic-api-key-as-fallback]], [[nd-24-per-keystroke-input-streaming-for-tui-agents]], [[nd-25-relay-attach-detach-with-d-requires-two-keypresses-on-the-host-tty]], [[nd-30-relay-attach-stderr-event-stream-for-subprocess-of-attach-consumers]], [[nd-31-secretstorage-key-namespace-for-multi-server-ide-pairing]].

### Build-plan track

- [`docs/build-plan.md`](../build-plan.md) — Track 7: UX rollout polish (Phase 1.5, blocks rollout). Rows 7A (this doc), 7B (ND-32 deep-dive), 7C (ND-33 deep-dive), 7D (ND-34 deep-dive), 7E (ND-35 deep-dive), 7F (rollout-readiness re-walk).

*Resolved by [D-15](../decisions/D-15-ux-rollout-posture.md) on 2026-05-22.*
