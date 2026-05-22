---
id: ND-10
status: open
title: "`relay token list` subcommand surface alignment"
affects: "prd/03-server.md §7"
surfaced-by: "build-plan 6B preflight (2026-05-17) — the build-plan 6B row commits to four token subcommands (init, create, revoke, list) but prd/03-server.md §7 enumerates only init, create, revoke."
---

# ND-10 — `relay token list` subcommand surface alignment


**Status:** open
**Affects:** `prd/03-server.md` §7
**Surfaced by:** build-plan 6B preflight (2026-05-17) — the build-plan 6B row commits to four token subcommands (`init`, `create`, `revoke`, `list`) but `prd/03-server.md` §7 enumerates only `init`, `create`, `revoke`.

## Question
Should `relay token list` ship as part of the Phase 1 CLI surface, and if so, what is its exact output shape? `prd/03-server.md` §7 omits it; `docs/build-plan.md` task 6B includes it. The two specs disagree by one subcommand.

## Elaboration prompt
The build-plan is the newer artifact and explicitly canonicalizes the four-subcommand surface. The PRD §7 omission appears to be an oversight rather than a deliberate exclusion: a user who has issued multiple tokens via `relay token create --device <name>` has no way to enumerate them, which makes `relay token revoke <id>` unusable in practice (the operator can't recover the `<id>` of a token they want to kill — `~/.relay/last-pairing.txt` only shows the most recent issue). Treating `list` as in-scope for Phase 1 also keeps `relay session list` / `relay project list` / `relay persona list` symmetric across the noun surface.

What to validate before resolving: (a) the exact output columns (`{ id, deviceLabel, createdAt, revokedAt | "active" }` is the build-plan 6B proposal — confirm against operator UX expectations); (b) that `list` never prints the plaintext or the hash (threat-model §4 makes this load-bearing); (c) whether `--all` is needed to include revoked rows or whether they're listed by default (build-plan 6B does not specify; lean toward listing revoked by default since the list will be short and operators want to see "did my revoke actually land"); (d) the propagation edit to `prd/03-server.md` §7 — add the `relay token list` row between `relay token create --device <name>` and `relay token revoke <id>`.

This is filed as `open` so the resolution lands as a deliberate PRD edit rather than an inline implementation drift. Build-plan 6B ships `list` regardless (the build-plan is the canonical task surface for code that will be written); the PRD §7 propagation closes the doc gap.
