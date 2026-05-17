# `persona/` — Module context

Loads, validates, and composes persona YAML from `~/.relay/personas/*.yaml` (tenant) and `<project>/.relay/personas/*.yaml` (project). Surfaces a `PersonaInput` for `session/` to consume. Authoritative schema lives in [`docs/prd/09-persona-schema.md`](../../../../docs/prd/09-persona-schema.md) (D-09); application mechanism in [`docs/arch/persona-application.md`](../../../../docs/arch/persona-application.md).

## Owns

- Reading both persona directories.
- Zod validation against the D-09 schema (shared schema in `@relay/protocol`).
- Tenant→project composition into the `PersonaInput` shape.

## Does NOT own

- Spawning the agent (→ `pty/`).
- Threading the persona onto the agent CLI (→ `session/` orchestrates per [`persona-application.md`](../../../../docs/arch/persona-application.md)).
- Editing user YAML on disk.

## Test isolation

Fixture YAML directories under `packages/server/test/fixtures/personas/`. No reads against `~/.relay/` or any real project's `.relay/`. Default-persona YAMLs at `packages/server/personas/defaults/` (task 1A) are the reference shape.

## Surprising constraints

- **Project file replaces tenant file by name. No per-field merging.** The filename stem is canonical — `dev.yaml` in a project shadows `dev.yaml` at the tenant level wholesale (per D-09 composition rule).
- Non-empty `skills:` lists are advisory at MVP. ND-08 (skill subset enforcement mechanism) is unresolved; the module surfaces the field but does not gate on it.
- `model`, `mcpServers`, and `skills` are all optional. A persona with only `schemaVersion` + `name` + `description` + `systemPrompt` is valid and degrades to "the agent's native capabilities plus a behavior overlay" (per 1A defaults).
- The `persona-yaml-check` skill (`.claude/skills/persona-yaml-check/SKILL.md`) is the authoring-time gate; this module is the runtime enforcer of the same rules.
