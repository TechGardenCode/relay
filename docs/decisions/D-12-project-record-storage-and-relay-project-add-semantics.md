---
id: D-12
status: resolved
title: "Project record storage and `relay project add` semantics"
resolved-on: 2026-05-15
affects: "prd/03-server.md §3, §7; prd/04-ide-extension.md §4; prd/06-distribution.md; prd/02-architecture.md"
surfaced-by: "Doc audit (2026-05-15)"
---

# D-12 — Project record storage and `relay project add` semantics


**Status:** resolved (2026-05-15)
**Affects:** `prd/03-server.md` §3, §7; `prd/04-ide-extension.md` §4; `prd/06-distribution.md`; `prd/02-architecture.md`
**Surfaced by:** Doc audit (2026-05-15)

## Question
When `relay project add <path>` runs, what does it persist and where? Is the user-supplied path the canonical working directory (registered in place), or is it copied/symlinked into the configurable `/projects/` path? How is the project display name derived? What is the SQLite record's shape? And the `add` vs. `create` naming discrepancy (D-G6 used `relay project create`) needs to be reconciled.

## Context
`02-architecture.md` shows `/projects/<name>/` in the filesystem diagram and `06-distribution.md` says project working directories live under a configurable path (default `/projects/` in container, `~/projects/` in local mode). `03-server.md` §7 lists `relay project add <path>` without semantics. D-G6 referenced `relay project create` colloquially as the operation that writes the marker file. The implementation needs one verb and one source of truth.

## Resolution
**`relay project add <path>` registers the user-supplied path in place — no copy, no symlink, no rewriting. The canonical working directory is exactly what the user passed.** The contract:

1. **In-place registration.** Relay does not move, copy, or symlink the project working directory. The path passed to `relay project add` is the canonical path stored on the project record. The `/projects/` and `~/projects/` paths from `06-distribution.md` are *conventions* for where operators commonly mount or check out source — they are not Relay-owned directories.
2. **Path canonicalization.** Relay resolves the path with `realpath` once at registration (resolving symlinks, normalizing `..` and trailing slashes) and stores the canonical form. Re-registering the same canonical path is an error (`409 Conflict`); registering a different path that resolves to the same canonical form is also an error.
3. **Display name.** Defaults to the canonical path's basename. Overridable via `--name <slug>` on the CLI; the slug must be kebab-case, unique per tenant, and stable across renames (rename changes the display name only, not the slug or ID).
4. **Project ID.** Server-issued ULID at registration. This is the `projectId` that goes into the marker file (see [[nd-07-marker-file-schema]]).
5. **SQLite record.** Each project row carries: `id` (ULID, PK), `tenant_id`, `slug` (unique per tenant), `display_name`, `canonical_path`, `agent_cli` (default `claude` at MVP), `created_at`, `updated_at`. Persona overrides, skills, and MCP entries live as files on disk (see `09-persona-schema.md`); the DB row tracks identity and ownership only.
6. **Marker file write.** `relay project add` writes `<canonical_path>/.relay/project.json` with the schema from [[nd-07-marker-file-schema]] and appends `.relay/project.json` to the project's `.gitignore` (creating the file if absent). The marker write is part of the `add` operation — there is no separate "create marker" step.
7. **IDE registration parity.** The IDE's "Register this workspace as a new project" quick-pick from `prd/04-ide-extension.md` §4 calls `POST /projects` (the REST primitive) with the workspace root path. The server-side handler is the same code path as `relay project add` — the IDE is not invoking the CLI under the hood.
8. **CLI verb is `add`, not `create`.** Earlier prose colloquially used `relay project create`; the canonical verb is `relay project add <path>`. Doc references to `create` are normalized to `add`.

**Why in-place and not copy-to-`/projects/`:** Copying the working directory inverts the user's git workflow — they would push from `/projects/<name>/` instead of from where they checked out. Symlinking introduces realpath surprises across editors and tools. In-place registration matches how `git`, `cargo`, `npm`, and every other developer tool treats the working tree.

**Why ULID and not a hash of the path:** Path-derived IDs leak path content into the API surface and break if the user moves the checkout. A server-issued opaque ID survives path changes and matches how the rest of the system addresses entities.

**Propagated to:** `prd/03-server.md` §3 (2026-05-15), `prd/03-server.md` §7 (2026-05-15), `prd/04-ide-extension.md` §4 (2026-05-15), `prd/06-distribution.md` Persistence (2026-05-15), `prd/02-architecture.md` filesystem diagram (2026-05-15), `prd/08-acceptance.md` scenario A (2026-05-15).
