---
id: ND-16
status: open
title: "CLI ↔ data-plane boundary rule"
affects: "docs/arch/repo-layout.md §3 (module boundaries for cli/), docs/arch/rest-conventions.md (cross-reference from CLI), packages/server/src/cli/CLAUDE.md (new — to be authored when this resolves), docs/build-plan.md task 6H (Done-when)"
surfaced-by: "build-plan 6H preflight (2026-05-18) — 6B established the precedent that relay token {create,revoke,list} talks to ~/.relay/tokens.json directly without going through the running server (no HTTP). 6H must extend the CLI surface with subcommands that **cannot** uniformly follow that rule: relay session kill needs to terminate a live PTY supervised by the long-running relay server process; relay project add needs the canonicalization + marker-file + gitignore logic already centralized in 6F's POST /projects handler. The CLI ↔ data-plane boundary is unspecified."
---

# ND-16 — CLI ↔ data-plane boundary rule


**Status:** open
**Affects:** `docs/arch/repo-layout.md` §3 (module boundaries for `cli/`), `docs/arch/rest-conventions.md` (cross-reference from CLI), `packages/server/src/cli/CLAUDE.md` (new — to be authored when this resolves), `docs/build-plan.md` task 6H (Done-when)
**Surfaced by:** build-plan 6H preflight (2026-05-18) — 6B established the precedent that `relay token {create,revoke,list}` talks to `~/.relay/tokens.json` directly without going through the running server (no HTTP). 6H must extend the CLI surface with subcommands that **cannot** uniformly follow that rule: `relay session kill` needs to terminate a live PTY supervised by the long-running `relay server` process; `relay project add` needs the canonicalization + marker-file + gitignore logic already centralized in 6F's `POST /projects` handler. The CLI ↔ data-plane boundary is unspecified.

## Question
For each Phase 1 CLI subcommand, which data plane does it operate against — the local SQLite database + filesystem directly (no running server required), or the long-lived `relay server`'s REST API over loopback (server must be running)?

## Elaboration prompt
Three concrete subcommand groups force the question:

1. **Read-only subcommands** (`relay session list`, `relay project list`, `relay persona list`, `relay token list`). Both options are technically correct: the SQLite reader is a pure function over the on-disk state, and the REST route returns the same data. Direct SQLite has the advantage that it works without a running server (handy for offline inspection and recovery) and avoids the latency + dependency on `127.0.0.1:7777` being bound. The REST route has the advantage that any future row-level access control or audit logging lands in one place.

2. **State-mutating subcommands that DON'T touch live PTYs** (`relay project add`, `relay project remove`, `relay persona create`). `relay project add` specifically duplicates non-trivial logic if it goes direct-to-SQLite: 6F's `POST /projects` handler already owns `realpathSync` canonicalization, slug derivation, `409 Conflict` mapping of `SQLITE_CONSTRAINT_UNIQUE`, marker-file write at `<path>/.relay/project.json` per [[nd-07-marker-file-schema]], and idempotent `.gitignore` append. A direct-SQLite path either re-implements all of that (drift risk) or extracts a shared internal module that both the CLI and the REST handler call (a third option below). `relay persona create` is the inverse: it writes a YAML file under `~/.relay/personas/`, no SQLite involvement, and `POST /personas` adds nothing beyond the file write — direct is the same code path.

3. **State-mutating subcommands that DO touch live PTYs** (`relay session kill`). The PTY supervisor (`registry`) only exists inside the running `relay server` process — there's no IPC mechanism that would let a one-shot CLI invocation reach into the server's in-memory `Map<sid, AttachedSession>` and call `kill('operator_kill')`. Direct SQLite would mark the row `killed` but leave the actual `node-pty` child alive until the next boot orphan sweep ([[d-11-server-restart-and-session-orphaning]]) — a correctness violation. REST is the only correct option.

Three options for the boundary rule:

- **Option A — Uniform REST.** Every CLI subcommand hits the local server's REST API. Pros: one code path per operation, no logic duplication, future-proof against in-process state. Cons: every CLI invocation requires `relay server` running; offline inspection becomes impossible; latency on small `relay token list` ops where the SQLite read is sub-millisecond.

- **Option B — Uniform direct-SQLite/filesystem.** Every CLI subcommand talks to the data layer directly. Forced shared-module extraction for the canonicalization logic in `POST /projects`. Forced design of an IPC mechanism (e.g., a UNIX socket the server listens on for control commands) to support `session kill`. Pros: CLI works without server; one canonical data-plane layer. Cons: significant new surface area (control-plane IPC) for one subcommand; defeats the point of having a REST API.

- **Option C — Split rule: read direct, mutate to REST, with one carve-out for filesystem-only writes.** Read-only subcommands talk to SQLite/filesystem directly (no server required). State-mutating subcommands that touch live sessions talk to the running server's REST API over loopback. State-mutating subcommands that only write files (`relay persona create`) talk to the filesystem directly. State-mutating subcommands that have non-trivial logic centralized in a REST handler (`relay project add`, `relay project remove`) talk to REST to avoid duplicating that logic. Pros: matches each subcommand's actual constraints; offline inspection still works; no new IPC surface. Cons: the rule is "it depends" — slightly less uniform.

What to validate before resolving: (a) whether `relay session list` should be REST-only on the grounds that running-session data lives in the server's in-memory registry (e.g., currently-attached client count, in-flight claim holder); answer for Phase 1 appears to be "no" — `relay session list` per `prd/03-server.md` §7 only renders persisted DB columns, no in-memory state; (b) error behavior when `relay session kill` is invoked while no server is running (proposal: exit 1 with a clear "no relay server reachable at <url>" message and a hint to start one — do NOT fall back to direct DB mutation, which would orphan the PTY); (c) where the loopback URL + bearer token come from (proposal: read `~/.relay/config.yaml` for URL — defaults `127.0.0.1:7777` — and `~/.relay/tokens.json` for the most-recent active token, same posture as the IDE extension's first-run pairing snippet); (d) whether the rule belongs in `docs/arch/repo-layout.md` §3 (as a new "CLI data-plane rule" subsection under the `cli/` module entry) or in a brand-new `packages/server/src/cli/CLAUDE.md` (no per-module CLAUDE.md exists for `cli/` today, but if the rule is load-bearing it would justify one).

Proposed direction is Option C with the carve-out for `relay persona create` being filesystem-direct. Build-plan 6H is blocked on this resolution because the CLI dispatchers for `session/project/persona` need to know which client (SQLite reader, REST client, filesystem writer) to instantiate per subcommand.

This is filed as `open` so the resolution lands as a deliberate arch-doc edit + a CLI per-module CLAUDE.md (if warranted) rather than an inline implementation drift. Build-plan 6H ships against the Option C posture provisionally; the propagation closes the doc gap.
