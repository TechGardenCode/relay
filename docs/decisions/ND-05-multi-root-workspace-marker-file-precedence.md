---
id: ND-05
status: resolved
title: "Multi-root workspace marker file precedence"
resolved-on: 2026-05-15
affects: "prd/04-ide-extension.md §4"
surfaced-by: "[[d-g6-project-discovery--workspace-to-project-binding]] resolution"
---

# ND-05 — Multi-root workspace marker file precedence


**Status:** resolved (2026-05-15)
**Affects:** `prd/04-ide-extension.md` §4
**Surfaced by:** [[d-g6-project-discovery--workspace-to-project-binding]] resolution

## Question
When a VS Code workspace has multiple root folders and more than one carries a `.relay/project.json` marker, which marker binds the session? And what happens when none of the roots have a marker — does the user-choice fallback apply once for the workspace or once per root?

## Resolution
**Each root folder is evaluated independently; a multi-root workspace maps to N projects, not one.** "Start session" operates on the active editor's containing root folder.

1. **Per-root binding.** Each root folder in a multi-root workspace is treated as its own project candidate. Each can carry its own `.relay/project.json`; each binds independently.
2. **"Start session" target.** The command resolves the target project by looking up the active editor's URI and finding which root folder contains it. The session's working directory is that root folder. If no editor is active, the command surfaces a quick-pick of root folders to choose from.
3. **Missing marker → per-root user-choice.** The fallback from `prd/04-ide-extension.md` §4 fires for the specific root being targeted, not for the workspace as a whole. Registering one root has no effect on sibling roots.
4. **Status bar follows focus.** The status bar item shows the project bound to the root folder containing the currently focused editor, swapping as the user navigates between roots.
5. **No workspace-level "primary project."** The conceptual model treats a project as 1:1 with a working tree. A multi-root workspace is a UX convenience for editing several trees side-by-side, not a higher-order container.

**Why per-root and not workspace-level:** Workspace-level binding would force a "primary project" choice that has no analogue in the conceptual model. It also creates the worse failure mode: a user adds a second root with its own `.relay/project.json`, and the workspace silently keeps using the first root's project. Per-root binding has no ambiguity.

**Propagated to:** `prd/04-ide-extension.md` §4 (2026-05-15), `prd/01-conceptual-model.md` Project entity (2026-05-15).
