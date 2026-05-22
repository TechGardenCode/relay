---
id: D-11
status: resolved
title: "Server restart and session orphaning"
resolved-on: 2026-05-15
affects: "prd/01-conceptual-model.md, prd/03-server.md, prd/08-acceptance.md scenario A"
surfaced-by: "Doc audit (2026-05-15)"
---

# D-11 — Server restart and session orphaning


**Status:** resolved (2026-05-15)
**Affects:** `prd/01-conceptual-model.md`, `prd/03-server.md`, `prd/08-acceptance.md` scenario A
**Surfaced by:** Doc audit (2026-05-15)

## Question
When the Relay server restarts, what happens to sessions that were `running` at shutdown? Phase 0 says "preserves session metadata but kills the agent process" — Phase 1 needs to commit to what the post-restart session state looks like and whether anything is auto-restarted.

## Context
A server restart (operator action, crash, container redeploy) inevitably kills every spawned agent process — they live as `node-pty` children of the server. Their session records, transcripts, and `agent_session_id` references are still on disk in SQLite. The PRD has not said what state those records land in, whether the operator must clean them up, or whether Phase 3's `claude --resume` flow can reanimate them.

## Resolution
**Orphaned `running` sessions auto-transition to `killed` at server boot. Metadata (project, persona, transcript, `agent_session_id`) is preserved. No auto-relaunch.** The contract:

1. **Boot-time scan.** When `relay server` starts, it queries SQLite for sessions with `status = running` and transitions each to `killed` with a `terminated_reason = "server_restart"` annotation. The transition is unconditional — if the row was `running`, the PTY is gone, so the status was already lying.
2. **Metadata preserved.** The session record itself is not deleted. The project ID, persona ID, agent CLI choice, `agent_session_id`, transcript bytes, and timestamps remain. The session is queryable via `GET /sessions/:id` and listable (filtered by status) via `GET /sessions?status=killed`.
3. **No auto-relaunch.** Relay does not attempt to spawn a replacement agent process for a killed session. The user explicitly starts a new session if they want to continue work — at MVP this is a fresh agent process; at Phase 3, the new session may be created with the prior session's `agent_session_id` to resume via `claude --resume`.
4. **`relay session list` default filter.** Defaults to `status=running` to avoid drowning users in killed sessions across restarts. `--all` shows everything; `--status killed` filters explicitly.
5. **Acceptance.** Scenario A in `08-acceptance.md` is extended to cover this: after a server restart, sessions that were running before the restart appear in `relay session list --status killed` with their metadata intact; the project/persona/token persistence already in scenario A continues to apply.

**Why auto-mark `killed` and not auto-relaunch:** Auto-relaunch can't reproduce a session — Claude Code's mid-session state lives inside the agent process, and even a `--resume` start would not be byte-identical. Silent auto-relaunch would also surprise the user with a session that "kept going" while they were watching the server restart. Explicit "the agent died, start a new one or resume in Phase 3" is the honest contract.

**Why preserve metadata and not garbage-collect:** The transcript is the user's record of work. Deleting it on restart would lose data; archiving without a retention policy is the simpler default. A retention policy can land in Phase 3 alongside transcript-store hardening if it becomes necessary.

**Propagated to:** `prd/01-conceptual-model.md` Session entity (2026-05-15), `prd/03-server.md` §3 (2026-05-15), `prd/08-acceptance.md` scenario A (2026-05-15).
