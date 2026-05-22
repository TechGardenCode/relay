---
id: ND-15
status: open
title: "`relay session show` subcommand surface alignment"
affects: "prd/03-server.md §7"
surfaced-by: "build-plan 6H preflight (2026-05-18) — the build-plan 6H Done-when names relay session show as a required subcommand but prd/03-server.md §7 enumerates only relay session list and relay session kill. Same shape as [[nd-10-relay-token-list-subcommand-surface-alignment]]."
---

# ND-15 — `relay session show` subcommand surface alignment


**Status:** open
**Affects:** `prd/03-server.md` §7
**Surfaced by:** build-plan 6H preflight (2026-05-18) — the build-plan 6H Done-when names `relay session show` as a required subcommand but `prd/03-server.md` §7 enumerates only `relay session list` and `relay session kill`. Same shape as [[nd-10-relay-token-list-subcommand-surface-alignment]].

## Question
Should `relay session show <id>` ship as part of the Phase 1 CLI surface, and if so, what is its exact output shape? `prd/03-server.md` §7 omits it; `docs/build-plan.md` task 6H includes it. The two specs disagree by one subcommand.

## Elaboration prompt
The build-plan is the newer artifact and explicitly canonicalizes `show` as part of the 6H surface. The PRD §7 omission appears to be an oversight rather than a deliberate exclusion: a user who has located a session id via `relay session list` will reasonably expect a `show` verb to render its full record (status, terminated_reason, project, persona, agent_session_id, total_bytes, createdAt/updatedAt) — the same shape the IDE extension's "session details" view will need from the corresponding `GET /sessions/:id` REST route. Without `show`, an operator inspecting a session has to resort to `sqlite3 ~/.relay/relay.db` or piping `GET /sessions` through `jq`, both of which break the otherwise complete CLI noun/verb grid (`{project,persona,session,token} × {list, …}`).

What to validate before resolving: (a) the exact field set (proposal: `id`, `status`, `terminatedReason`, `projectSlug`, `personaName`, `agentSessionId`, `totalBytes`, `createdAt`, `updatedAt`); (b) the output format — plain text (one `key: value` per line, matching `relay token list` columnar precedent) vs. JSON (machine-readable for scripting, easier to keep aligned with the REST shape); (c) error behavior when `<id>` does not exist (exit 1 with a one-line message vs. RFC 9457 problem-details echo from the REST route); (d) whether `show` reads SQLite directly (read-only path per the [[nd-16-cli--data-plane-boundary-rule]] proposal) or hits the running server's `GET /sessions/:id` route (consistency with how the IDE extension will render the same data).

This is filed as `open` so the resolution lands as a deliberate PRD edit rather than an inline implementation drift. Build-plan 6H ships `show` regardless (the build-plan is the canonical task surface for code that will be written); the PRD §7 propagation closes the doc gap.
