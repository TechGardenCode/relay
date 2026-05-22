---
id: D-08
status: resolved
title: "Single binary vs. separate packages"
resolved-on: 2026-05-14
affects: "prd/06-distribution.md"
surfaced-by: "Original PRD §15 Q8"
---

# D-08 — Single binary vs. separate packages


**Status:** resolved (2026-05-14)
**Affects:** `prd/06-distribution.md`
**Surfaced by:** Original PRD §15 Q8

## Question
Single binary vs. separate `relay-server` and `relay-cli` packages?

## Current thinking
Single binary with subcommands. Simpler distribution.

## Resolution
**Single binary with subcommands.** One `relay` executable with subcommands like `relay server`, `relay project`, `relay token`, etc. One install path, one version to track, one set of release artifacts.

**Why:** Splitting into separate `relay-server` and `relay-cli` packages doubles the distribution surface (npm, Docker, Helm, version-pinning) for no functional benefit — operators always need both anyway. The single binary is also simpler for container images: one binary copy, one entrypoint.

**Propagated to:** `prd/06-distribution.md` Packaging shape (2026-05-14).
