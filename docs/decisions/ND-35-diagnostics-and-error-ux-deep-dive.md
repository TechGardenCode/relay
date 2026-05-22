---
id: ND-35
status: open
title: "Diagnostics + error UX deep-dive — painless-rollout bar"
affects: "docs/prd/03-server.md §3 (agent spawn + credential validation); docs/arch/persona-application.md (persona-load failure surface); docs/arch/rest-conventions.md (RFC 9457 problem-details recovery guidance); packages/server/src/session/ (pre-spawn validation hooks); packages/extension/ (in-IDE diagnostics surface — log access, failure notices, 'why is this broken' affordances)."
surfaced-by: "[[d-15-ux-rollout-posture]] resolution (2026-05-22). One of four per-surface deep-dives opened to gate Phase 1.5 rollout."
---

# ND-35 — Diagnostics + error UX deep-dive — painless-rollout bar

**Status:** open
**Affects:** `docs/prd/03-server.md` §3 (agent spawn + credential validation); `docs/arch/persona-application.md` (persona-load failure surface); `docs/arch/rest-conventions.md` (RFC 9457 problem-details recovery guidance); `packages/server/src/session/` (pre-spawn validation hooks); `packages/extension/` (in-IDE diagnostics surface — log access, failure notices, "why is this broken" affordances).
**Surfaced by:** [[d-15-ux-rollout-posture]] resolution (2026-05-22). One of four per-surface deep-dives opened to gate Phase 1.5 rollout.

## Question
What is the minimum painless-rollout bar for **diagnostics and error UX** — the visibility a user has into "what's failing and why" when something goes wrong? Today many failure modes are silent (bad credentials, missing persona files, project-marker mismatches), generic ("session ended"), or invisible from the IDE (server-side logs require SSH). Which diagnostic surfaces must exist before a non-author user can recover from a failure without DMing the author?

## Elaboration prompt
The inventory in [`docs/arch/ux-rollout-posture.md`](../arch/ux-rollout-posture.md) §6 lists what's painful today. The resolution must decide which items are P0, P1, or deferred-with-rationale.

**What to consider:**

- **(a) Pre-flight credential validation per [[d-10-agent-model-credentials-handling]] / [[nd-19-claude-login-oauth-as-the-documented-credential-default-anthropic-api-key-as-fallback]].** Today if `ANTHROPIC_API_KEY` is invalid or `claude login` was never run, the agent process spawns and may silently fail or hang. Relay does not validate credentials before spawning. The operator discovers the failure only when attaching and seeing the agent exit or produce no output. Decide whether `relay server` boots with a credential probe (call `claude` with `--version` or a no-op invocation, check exit), whether `POST /sessions` rejects with a 5xx + RFC 9457 problem-details before spawning if credentials are missing, or whether the validation runs at `relay init` time.

- **(b) Persona-load failure visibility per [[d-g1-persona-application-semantics]] / [[nd-11-agentsessionid-capture-mechanism]].** Per the persona-application doc, if a persona YAML has a syntax error or MCP config mismatch, the session spawns but the persona is not applied — the failure is "non-fatal." A user sees normal agent output but `agent_session_id` stays `NULL` and the persona's system prompt is missing. Today there is no surfaced error. Decide whether: (i) persona-load failures become fatal (session refuses to spawn with a clear error), (ii) persona-load failures surface as a session-record field that the IDE renders ("persona did not apply: <reason>"), or (iii) the [`persona-yaml-check`](../../.claude/skills/persona-yaml-check/SKILL.md) skill is wired into `relay server` boot to fail-fast before any session is started.

- **(c) REST error recovery guidance per [`docs/arch/rest-conventions.md`](../arch/rest-conventions.md).** Errors are RFC 9457 problem-details with machine-readable `type` codes (`project-path-taken`, `project-slug-undeducible`, etc.) but the docs do not describe the recovery path. A user receives `409 project-slug-undeducible` with no guidance on "what slug will work" or "how to fix the path you passed." Decide whether: (i) each `type` code gains a `recovery` field in the problem-details payload (machine-readable next-action), (ii) each `type` code documents its recovery path in `docs/arch/rest-conventions.md` so the IDE extension can hard-code the user-facing copy, or (iii) the recovery copy lives in the IDE extension's error-handler with a fallback for unknown codes.

- **(d) Log access from the IDE.** Today the server's stderr (where spawn failures, persona-load errors, and other "why is this broken" data live) is visible only to whoever started `relay server`. A user on a different device has no in-IDE way to see "why did my session not start?" Decide whether the IDE extension contributes a "Show server logs" command (REST route returning the last N log lines), a tail-style WebSocket log stream (gated by tenant ownership), or whether the docs commit to "SSH to the server box to see logs" as the documented path.

- **(e) "Why is this broken" diagnostics from the IDE.** When `relay attach` exits unexpectedly (auth_expired, session_ended, BUSY rejection, server unreachable), the terminal pane just closes. Decide whether the extension intercepts the exit code (via `vscode.window.onDidCloseTerminal`?) and surfaces a notification or an output-channel entry explaining what happened, with a "reconnect" or "see logs" action.

- **(f) Silent terminal-close on attach failure.** Today `vscode.window.createTerminal({ shellPath: 'relay', shellArgs: ['attach', sid, ...] })` opens a terminal pane that prints any `relay attach` stderr inline before exiting on failure. A user not watching the pane misses the stderr entirely. Decide whether the extension wraps the spawn in a way that captures stderr and surfaces it as a notification on non-zero exit, in addition to the inline pane output.

- **(g) `relay doctor` subcommand.** Decide whether `relay doctor` ships (or `relay init --check`) — a single command that probes everything: credentials present, server reachable, token valid, persona files parse, `claude` binary on PATH, SQLite writable. Useful for new-install troubleshooting; overlaps [[nd-32-install-and-onboarding-deep-dive]] (g) version banner.

- **(h) Project-marker mismatch error UX per [[nd-07-marker-file-schema]].** Today a marker carrying an unknown `schemaVersion` causes the extension to refuse-to-bind silently (per [[nd-31-secretstorage-key-namespace-for-multi-server-ide-pairing]]). Decide whether the refusal surfaces as a clear "this project was registered with a newer/older Relay; upgrade [the server | the extension]" notice with a remediation action.

- **(i) Telemetry / failure reporting (out-of-scope flag).** Flagged here so the deep-dive consciously punts unless the resolution scopes it in.

- **(j) Audit-log surface.** Auth events, session spawns, project-add events go to the SQLite store but have no user-facing surface. Decide whether ND-35 introduces `relay audit` or whether audit is deferred to Phase 3 hardening.

**Validation against the gate.** The resolution must end with a line of the shape "the painless-rollout bar for diagnostics + error UX is: <one-paragraph statement>" so [[d-15-ux-rollout-posture]] §7 can quote it.

This is filed as `open` so the resolution lands as a deliberate deep-dive (Track 7E in `docs/build-plan.md`) rather than inline drift.

## Resolution

*(unresolved)*
