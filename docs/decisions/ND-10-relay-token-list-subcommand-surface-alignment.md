---
id: ND-10
status: resolved
resolved-on: 2026-05-27
title: "`relay token list` subcommand surface alignment"
affects: "prd/03-server.md §7"
surfaced-by: "build-plan 6B preflight (2026-05-17) — the build-plan 6B row commits to four token subcommands (init, create, revoke, list) but prd/03-server.md §7 enumerates only init, create, revoke."
---

# ND-10 — `relay token list` subcommand surface alignment


**Status:** resolved (2026-05-27)
**Affects:** `prd/03-server.md` §7
**Surfaced by:** build-plan 6B preflight (2026-05-17) — the build-plan 6B row commits to four token subcommands (`init`, `create`, `revoke`, `list`) but `prd/03-server.md` §7 enumerates only `init`, `create`, `revoke`.

## Question
Should `relay token list` ship as part of the Phase 1 CLI surface, and if so, what is its exact output shape? `prd/03-server.md` §7 omits it; `docs/build-plan.md` task 6B includes it. The two specs disagree by one subcommand.

## Elaboration prompt
The build-plan is the newer artifact and explicitly canonicalizes the four-subcommand surface. The PRD §7 omission appears to be an oversight rather than a deliberate exclusion: a user who has issued multiple tokens via `relay token create --device <name>` has no way to enumerate them, which makes `relay token revoke <id>` unusable in practice (the operator can't recover the `<id>` of a token they want to kill — `~/.relay/last-pairing.txt` only shows the most recent issue). Treating `list` as in-scope for Phase 1 also keeps `relay session list` / `relay project list` / `relay persona list` symmetric across the noun surface.

What to validate before resolving: (a) the exact output columns (`{ id, deviceLabel, createdAt, revokedAt | "active" }` is the build-plan 6B proposal — confirm against operator UX expectations); (b) that `list` never prints the plaintext or the hash (threat-model §4 makes this load-bearing); (c) whether `--all` is needed to include revoked rows or whether they're listed by default (build-plan 6B does not specify; lean toward listing revoked by default since the list will be short and operators want to see "did my revoke actually land"); (d) the propagation edit to `prd/03-server.md` §7 — add the `relay token list` row between `relay token create --device <name>` and `relay token revoke <id>`.

This is filed as `open` so the resolution lands as a deliberate PRD edit rather than an inline implementation drift. Build-plan 6B ships `list` regardless (the build-plan is the canonical task surface for code that will be written); the PRD §7 propagation closes the doc gap.

## Resolution

`relay token list` ships as a first-class Phase 1 subcommand; the PRD §7 omission was an oversight, and the four-subcommand surface (`init`/`create`/`revoke`/`list`) is canonical.

1. **In scope for Phase 1.** Without `list`, `relay token revoke <id>` is unusable — `~/.relay/last-pairing.txt` only records the most recent issue, so an operator who minted several tokens has no way to recover the `<id>` of an older one. `list` is the recovery path that makes `revoke` operable, and it keeps the noun surface symmetric with `relay session list` / `relay project list` / `relay persona list`.
2. **Output is one row per token, tab-separated columns `id`, `deviceLabel`, `createdAt`, `status`** — where `status` is the literal `active` for a live token or `revoked <revokedAt>` for a revoked one. This is exactly the `TokenView` shape (`{ id, deviceLabel, createdAt, revokedAt }`) with `revokedAt: null` rendered as `active`. Empty store prints `No tokens.`
3. **Revoked rows are listed by default** — no `--all` flag. The token list is short, and operators want to confirm "did my revoke actually land," so hiding revoked rows would defeat the command's primary recovery use.
4. **Never prints the plaintext or the hash.** Only the four non-secret columns above. This is load-bearing per threat-model §4 — the plaintext is shown exactly once at `create` time and is never recoverable thereafter.
5. **Reads `~/.relay/tokens.json` directly** (no running server required), consistent with the [[nd-16-cli-data-plane-boundary-rule]] read-direct posture.

**Why this and not "PRD §7 is authoritative, drop `list`":** the PRD predates the build-plan, and §7 already enumerated `init`/`create`/`revoke` without noticing that `revoke <id>` needs a way to discover `<id>`. Dropping `list` to match the older doc would ship a `revoke` that operators can't actually drive. The build-plan is the newer artifact and deliberately canonicalized all four; this resolution ratifies that and closes the §7 gap rather than silently letting code and spec disagree.

**Propagated to:** prd/03-server.md §7 (2026-05-27).
