---
id: ND-06
status: resolved
title: "Worktree project identity"
resolved-on: 2026-05-15
affects: "prd/01-conceptual-model.md, prd/04-ide-extension.md"
surfaced-by: "[[d-g6-project-discovery--workspace-to-project-binding]] resolution"
---

# ND-06 — Worktree project identity


**Status:** resolved (2026-05-15)
**Affects:** `prd/01-conceptual-model.md`, `prd/04-ide-extension.md`
**Surfaced by:** [[d-g6-project-discovery--workspace-to-project-binding]] resolution

## Question
For git worktrees, do all worktrees of one repo share a single Relay project (same project ID across all worktree paths) or is each worktree its own bound project? The marker file decision in D-G6 makes either possible, but the conceptual model needs to commit to one.

## Resolution
**Per-worktree identity. Each worktree is its own Relay project with its own marker file and project ID.** This is consistent with the conceptual-model commitment that a project is 1:1 with a working tree (see [[nd-05-multi-root-workspace-marker-file-precedence]] for the multi-root analogue).

1. **Identity unit.** A Relay project corresponds to one filesystem working tree, not a logical codebase. Two worktrees of the same repo are two projects.
2. **Marker per worktree.** Each worktree gets its own `.relay/project.json` written into the worktree's root. Worktrees added after `relay project create` are not retroactively registered — the user runs the bind flow per worktree.
3. **Sessions are scoped to worktrees.** A session opened in worktree A appears in worktree A's project session list, not in worktree B's. `relay session list` shows both as distinct sessions on distinct projects.
4. **Personas independent per worktree.** Each worktree can carry its own `<worktree>/.relay/personas/` overrides per [[d-09-persona-yaml-schema]]. A persona override applied in worktree A does not affect worktree B.
5. **Cross-device addressability.** Project ID is the address, and project IDs differ across worktrees, so cross-device attach is unaffected — clients address sessions by ID, not by path.

**Why per-worktree and not codebase-wide:** Worktrees are commonly used for in-progress work on parallel branches (one worktree per feature). Sharing a single Relay project across them would conflate sessions that are conceptually separate, surface persona overrides cross-contamination, and make `relay session list` ambiguous about which session belongs to which working tree. The conceptual cost of "git users see N projects for N worktrees" is small and matches how git itself treats worktrees as discrete check-outs.

**Propagated to:** `prd/01-conceptual-model.md` Project entity (2026-05-15), `prd/04-ide-extension.md` §4 (2026-05-15).
