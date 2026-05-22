---
id: D-09
status: resolved
title: "Persona YAML schema"
resolved-on: 2026-05-15
affects: "prd/09-persona-schema.md (new), prd/03-server.md §3, prd/01-conceptual-model.md, prd/07-phasing.md"
surfaced-by: "Doc audit (2026-05-15)"
---

# D-09 — Persona YAML schema


**Status:** resolved (2026-05-15)
**Affects:** `prd/09-persona-schema.md` (new), `prd/03-server.md` §3, `prd/01-conceptual-model.md`, `prd/07-phasing.md`
**Surfaced by:** Doc audit (2026-05-15)

## Question
What fields does a persona YAML file contain, where do those files live on disk, and how do tenant- and project-level definitions compose?

## Context
Phase 1 ships seven default personas (`product`, `design`, `dev`, `test`, `infra`, `architect`, `review`) as YAML. The persona authoring guide, `relay persona create` template, and the default-persona set all depend on a stable schema. The conceptual model in `prd/01-conceptual-model.md` names the bundle as (system prompt overlay, skill subset, MCP subset, optional model) but the file format has not been specified.

## Resolution
**A flat YAML schema with required `name` + `schemaVersion` and optional content fields, stored under `~/.relay/personas/<name>.yaml` (tenant) and `<project>/.relay/personas/<name>.yaml` (project override).** The contract:

1. **File location and naming.** Tenant-level definitions live in `~/.relay/personas/<name>.yaml`; project-level overrides live in `<project>/.relay/personas/<name>.yaml`. The filename stem (sans `.yaml`) is the persona's canonical name; the `name:` field inside the file must match the stem and is the authoritative identifier.
2. **Required fields.** `schemaVersion: 1` (integer) and `name: <slug>` (kebab-case, must match filename).
3. **Optional fields.** `description` (one-line human-readable), `systemPrompt` (multi-line string, appended to the agent's own prompt at session spawn — the persona application mechanism is the implementation's choice per [[d-g1-persona-application-semantics]]), `skills` (list of skill names; omitted or `null` means "all skills available to the agent"), `mcpServers` (list of MCP server names; same omitted-means-all rule), `model` (model identifier passed to the agent CLI; omitted means agent default).
4. **Composition: override, not merge.** When a project-level file shares a name with a tenant-level file, the project file fully replaces the tenant file for that session. There is no per-field merging — consistent with [[d-06-persona-inheritance]]'s "no inheritance, no extends" stance.
5. **Validation at load.** The server validates required fields and `schemaVersion` on read. A file that fails validation is logged and excluded from the persona list; it does not block server startup.
6. **Skill and MCP name resolution.** Names in `skills:` refer to directory names under `~/.claude/skills/` and `<project>/.claude/skills/`; names in `mcpServers:` refer to keys in the agent CLI's native MCP configuration (`~/.claude.json`, `<project>/.mcp.json`). Relay does not own these registries — see the native configuration preservation guarantee in `prd/03-server.md` §8.
7. **Schema evolution.** `schemaVersion` is the forward-compat signal: a server that sees a higher `schemaVersion` than it understands logs and excludes the file (same path as validation failure). Breaking schema changes bump the integer.

**Why a flat schema and not a richer one:** Inheritance was already rejected ([[d-06-persona-inheritance]]); adding back nested composition, conditionals, or partial overrides would re-litigate that decision. The flat shape matches the conceptual model 1:1 and keeps the persona authoring guide short.

**Why filename-as-name and not a free-form `name:` field:** Filename collisions are what trigger override resolution (project file replaces tenant file with the same name). Decoupling the filename from the `name:` would require Relay to scan every file just to discover names, and would make override semantics depend on file *contents* rather than file *paths* — fragile and surprising.

**Propagated to:** `prd/09-persona-schema.md` (new, 2026-05-15), `prd/03-server.md` §3 (2026-05-15), `prd/01-conceptual-model.md` Persona entity (2026-05-15), `prd.md` index table (2026-05-15).
