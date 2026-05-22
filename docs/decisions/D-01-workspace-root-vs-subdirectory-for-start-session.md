---
id: D-01
status: resolved
title: "Workspace root vs. subdirectory for start-session"
resolved-on: 2026-05-14
affects: "prd/04-ide-extension.md §4"
surfaced-by: "Original PRD §15 Q1"
---

# D-01 — Workspace root vs. subdirectory for start-session


**Status:** resolved (2026-05-14)
**Affects:** `prd/04-ide-extension.md` §4
**Surfaced by:** Original PRD §15 Q1

## Question
Should the extension's start-session command pre-prompt for a working directory, or always use the workspace root?

## Current thinking
Workspace root at MVP. Subdirectory support if anyone asks.

## Resolution
**Always use the workspace root at MVP.** No pre-prompt. The workspace root is the unambiguous default and matches the marker-file location ([[d-g6-project-discovery--workspace-to-project-binding]]). Subdirectory support is a small follow-on if a user surfaces a concrete need (e.g., monorepo with per-package agents). Until then, the simpler flow ships.

**Propagated to:** `prd/04-ide-extension.md` §4 (2026-05-14).
