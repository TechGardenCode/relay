---
id: D-14
status: deferred
title: "Product name"
deferred-until: "pre-launch naming review"
affects: "prd.md, prd/06-distribution.md, repo slug, npm package name, OpenVSX listing"
surfaced-by: "Doc audit (2026-05-15)"
---

# D-14 — Product name


**Status:** deferred (until pre-launch naming review)
**Affects:** `prd.md`, `prd/06-distribution.md`, repo slug, npm package name, OpenVSX listing
**Surfaced by:** Doc audit (2026-05-15)

## Question
Is "Relay" the final product name, or a working name to be replaced before public launch?

## Context
`prd.md` carries `Working name: Relay (TBD)`. The name doesn't block Phase 1 implementation but it does block the *publishable* artifacts: the npm package (currently `@relay/relay` in `06-distribution.md`), Docker image tag, GitHub repo slug, OpenVSX listing, and any first-party domain. Settling on a name late risks renaming across all of these in a hurry.

## Resolution
**Deferred** — the name is not load-bearing for Phase 1 implementation; the naming review happens before the first publishable artifact ships.

**MVP behavior:** "Relay" is the working name through Phase 1 implementation. All internal docs, CLI binary names (`relay`), config paths (`~/.relay/`), and protocol markers (`.relay/project.json`) use it. A future rename, if it happens, will be a mechanical refactor across these surfaces.

**Default direction when picked up:** Conflict-check "Relay" against existing npm packages, GitHub orgs, OpenVSX entries, and trademark databases. If clear and not too generic, keep it. If conflicts surface, pick from a shortlist that preserves the "small piece of infrastructure between two endpoints" connotation.

**Re-open trigger:** Before the first public artifact publishes (npm, Docker Hub, OpenVSX, GitHub public release). Likely Phase 1 end or Phase 2 start.
