# Relay PRD — Persona YAML Schema

> **Deferred to Phase 2 per [D-17](../decisions/D-17-personas-descoped-from-mvp.md) (2026-05-28).** Personas are descoped from the MVP. This schema still stands as the Phase 2 design, but the persona code and the seven default YAMLs were removed from the tree with the descope (restore point: tag `pre-cleanup-phase1`). At MVP no persona exists: sessions spawn a bare agent, no `/personas` routes exist, `relay init` seeds no defaults, and the IDE shows no persona picker. The body below is unchanged; read it as the Phase 2 contract, not current MVP behavior.

**Status:** v0.4
**Scope:** The on-disk file format for persona definitions, file naming and location, and the tenant-vs-project composition rule. Read `01-conceptual-model.md` for the conceptual entity and `03-server.md` §4 for the persona-application guarantees that this file's content drives.

---

## 1. File location and naming

Persona definitions are YAML files on disk. Two locations:

| Scope | Path | Owner |
|---|---|---|
| Tenant-level | `~/.relay/personas/<name>.yaml` | Relay |
| Project-level | `<project-root>/.relay/personas/<name>.yaml` | Relay (lives alongside the project marker file from `04-ide-extension.md` §4) |

The filename stem (the part before `.yaml`) is the persona's canonical name. The `name:` field inside the file must match the stem; a mismatch is a validation failure. This avoids requiring Relay to scan every file's contents to discover names, and keeps the override resolution rule in §3 a pure filename-match.

## 2. Fields

```yaml
schemaVersion: 1                       # required, integer
name: dev                              # required, kebab-case, must match filename stem

description: "Day-to-day implementation persona."   # optional, one line

systemPrompt: |                        # optional, multi-line string
  You are working as a hands-on implementation engineer...

skills:                                # optional list; omitted / null = all skills
  - test-runner
  - shadcn

mcpServers:                            # optional list; omitted / null = all servers
  - github
  - linear

model: claude-sonnet-4-6               # optional; omitted = agent CLI default
```

**Required fields**

- `schemaVersion` — integer. The forward-compat signal. A server that sees a higher version than it understands logs and excludes the file rather than guessing.
- `name` — kebab-case identifier. Must match the filename stem.

**Optional fields**

- `description` — short human-readable string. Surfaced in the IDE quick-pick when starting a session.
- `systemPrompt` — multi-line string. Appended to the agent's own system prompt when the session is spawned. The exact application mechanism (CLI flag, env var, transient state under `~/.relay/`, etc.) belongs to the implementation; the persona-application guarantees in `03-server.md` §4 are what binds the implementation.
- `skills` — list of skill names. Names refer to directory names under `~/.claude/skills/` and `<project>/.claude/skills/` (Claude Code's native skill registry; Relay does not own this directory — see `03-server.md` §8). Omitting the field or setting it to `null` means "all skills the agent would otherwise have available." An empty list (`skills: []`) means no skills.
- `mcpServers` — list of MCP server names. Names refer to keys in the agent CLI's native MCP configuration (`~/.claude.json`, `<project>/.mcp.json`). Same omitted-means-all rule as `skills`.
- `model` — model identifier passed to the agent CLI at session spawn (e.g., `claude-sonnet-4-6`). Omitted means the agent CLI's own default model.

## 3. Composition: project files override tenant files by name

When a session spawns with persona `dev` and both `~/.relay/personas/dev.yaml` and `<project>/.relay/personas/dev.yaml` exist, the **project file fully replaces** the tenant file for that session. There is no per-field merging.

This matches the no-inheritance stance from `01-conceptual-model.md`: a user who wants the union of two personas creates a third persona; composition is by selection, not by chaining.

## 4. Validation

The server validates each persona file on read:

- Required fields present (`schemaVersion`, `name`).
- `name` matches the filename stem.
- `schemaVersion` is an integer the server understands.
- Optional list fields are lists (not strings or objects).

A file that fails validation is logged and excluded from the persona list. Validation failures do not block server startup — a malformed `infra.yaml` does not prevent `dev` and `test` from loading.

## 5. Default persona set

Phase 2 ships seven default personas as tenant-level YAML in `~/.relay/personas/`, written by `relay init` (per [D-17](../decisions/D-17-personas-descoped-from-mvp.md) nothing ships at MVP; the authored YAMLs live at tag `pre-cleanup-phase1`):

- `product`
- `design`
- `dev`
- `test`
- `infra`
- `architect`
- `review`

Each ships with a `systemPrompt` and a sensible `skills` / `mcpServers` posture; the concrete content is owned by the persona authoring guide (Phase 2 deliverable per `07-phasing.md`). Users edit them in place or override per-project.

*Resolved by [D-09](../decisions/D-09-persona-yaml-schema.md) on 2026-05-15.*
