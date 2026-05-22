---
id: D-G6
status: resolved
title: "Project discovery / workspace-to-project binding"
resolved-on: 2026-05-14
affects: "prd/04-ide-extension.md §4"
surfaced-by: "Deep-dive analysis G6 (the v0.3 PRD §9.4 hand-waved auto-detection as \"queries the server for a matching project by working directory path\" with a CLI fallback)"
---

# D-G6 — Project discovery / workspace-to-project binding


**Status:** resolved (2026-05-14)
**Affects:** `prd/04-ide-extension.md` §4
**Surfaced by:** Deep-dive analysis G6 (the v0.3 PRD §9.4 hand-waved auto-detection as "queries the server for a matching project by working directory path" with a CLI fallback)

## Question
How does the IDE extension determine that an open workspace corresponds to a registered Relay project? What is the user-facing flow when the workspace is not yet a project?

## Context
This is the first-run experience for every user, and "kick to CLI" is not a UX. It must work correctly under Remote-SSH (cwd lives on the homelab, not the laptop), git worktrees (multiple paths, one logical project), multi-root workspaces, and symlinked paths.

Cross-device only works if project identity is stable across devices. If two clients on different machines bind the same logical project differently, sessions can't be addressed coherently.

## Options under consideration
- **Option A — Canonicalized absolute path match only.** The extension sends the workspace's canonicalized absolute path; the server looks up by exact match. Simple; brittle under Remote-SSH path differences and worktrees.
- **Option B — Marker file (e.g., `.relay/project.json`).** A registered project drops a marker file in the working directory containing the project ID. The extension reads the marker rather than guessing from the path. Robust across path representations; requires the marker file to be checked in (or gitignored and bootstrapped).
- **Option C — User choice on first detection.** When a workspace opens, the extension presents a quick-pick of "this looks like project X — confirm?" with a path-similarity guess and a "register as new project" affordance. Adds one click but eliminates ambiguity.
- **Option D — Hybrid: marker file when present, fall back to path match, fall back to user choice.** Tiered resolution. Most flexible; most code paths.

## Current thinking
Option B (marker file) plus Option D fallback is the most robust. The marker file is the authoritative bind; path matching is a discovery convenience; user choice catches unmatched cases. Worth confirming the marker file's location and whether it should be gitignored by default.

## Resolution
**Marker file as authoritative bind, user-choice fallback when missing.** Path matching is skipped entirely — it's brittle under Remote-SSH and worktrees and provides no benefit once the marker file exists. The contract:

1. **Marker file location.** A registered project drops `.relay/project.json` at the workspace root, containing at minimum the project ID. Full schema → [[nd-07-marker-file-schema]].
2. **Marker is authoritative.** On workspace open, the IDE extension reads `.relay/project.json` and binds the workspace to that project ID. No path inference, no fuzzy matching.
3. **Missing marker → user choice.** If the file is absent, the extension shows a quick-pick: "Register this workspace as a new project" or "Bind to existing project: [list of known projects on the server]." The user's selection writes the marker.
4. **Gitignored by default.** `relay project create` adds `.relay/project.json` to the workspace's `.gitignore`. The marker carries server-bound identity, not source content, so teammates registering the same repo locally each get their own bind. Users who want a shared bind (e.g., on a homelab where everyone hits the same Relay server) can opt to check the marker in.
5. **Remote-SSH transparency.** The marker lives on the workspace filesystem, so Remote-SSH works with no special handling — the extension reads the file via the same Remote-SSH file API as any other workspace file.

**Why this and not path-match-anywhere:** Path matching fails the cross-device test — Remote-SSH paths differ between laptop and homelab, worktrees give one project multiple paths, symlinks confuse canonicalization. The marker file makes binding stable across all of these by lifting identity into the workspace itself.

**Surfaces new sub-questions:** [[nd-05-multi-root-workspace-marker-file-precedence]], [[nd-06-worktree-project-identity]], [[nd-07-marker-file-schema]].

**Propagated to:** `prd/04-ide-extension.md` §4 (2026-05-14).
