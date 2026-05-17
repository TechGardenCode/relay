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
- Per-tenant or per-project path resolution: the loader takes absolute directory paths. `config/paths.ts` owns `personasDir()` (tenant) and `projectPersonasDir(canonical)` (project); the caller (typically `session/`) wires them together.
- Centralized logging: errors are returned in `PersonaLoadResult.invalid[]` for the caller to log or surface via REST. The module never calls `console.*`.

## Public surface

- `loadAll({ tenantDir, projectDir? })` — one-shot helper returning `{ personas: Map<string, PersonaInput>, errors: PersonaLoadError[] }`. Most callers want this.
- `loadPersonasFromDirectory(dir, source)` — single-directory loader; returns `{ valid, invalid }`. Useful for tests and the REST list endpoint (6F).
- `composeByName(tenant, project?)` — pure function over already-loaded `PersonaInput[]`. Returns a `Map<string, PersonaInput>` so iteration order is predictable.
- `validatePersona(parsed, filenameStem)` — pure function over a parsed YAML root and the canonical stem. Returns a discriminated union (`{ ok: true, persona } | { ok: false, reason, detail }`).
- Types: `PersonaInput`, `PersonaSource`, `PersonaLoadError`, `PersonaLoadReason`, `PersonaLoadResult`.

## `PersonaLoadReason` taxonomy

Mirrors the eight codes in `.claude/skills/persona-yaml-check/SKILL.md` plus `io_error` (the lint skill assumes files are already readable). Priority order when multiple Zod issues co-fire: `unsupported_schema_version` → `name_format` → `list_type` → `model_type` → `extra_fields` → fallback `parse_error`. `missing_required` and `name_stem_mismatch` are checked outside Zod so they always beat shape errors on the same field.

| Reason                       | Where raised                                                                                         |
| ---------------------------- | ---------------------------------------------------------------------------------------------------- |
| `io_error`                   | `fs.readFileSync` fails for a reason other than ENOENT-on-the-dir                                    |
| `parse_error`                | `js-yaml` throws, or YAML root is not a mapping                                                      |
| `missing_required`           | Pre-Zod check: `schemaVersion` or `name` missing / null                                              |
| `unsupported_schema_version` | `schemaVersion` is not the integer `1` (Zod refine, codified in `SUPPORTED_PERSONA_SCHEMA_VERSIONS`) |
| `name_format`                | `name` fails `PERSONA_NAME_REGEX` (Zod regex)                                                        |
| `name_stem_mismatch`         | Post-Zod check: `persona.name !== filenameStem`                                                      |
| `list_type`                  | `skills` or `mcpServers` present but not an array or null (Zod)                                      |
| `model_type`                 | `model` present but not a string (Zod)                                                               |
| `extra_fields`               | Unknown top-level key (Zod `.strict()` produces `unrecognized_keys`)                                 |

## Test isolation

Fixture YAML directories under `packages/server/test/fixtures/personas/`: `valid/` (4 fixtures, one per legal optional-field combination), `invalid/` (8 fixtures, one per non-`io_error` reason), `compose/{tenant,project}/` (overlapping `dev`/`test` + tenant-only `infra` + project-only `product`). No reads against `~/.relay/` or any real project's `.relay/`. The seven 1A defaults at `packages/server/personas/defaults/` are also asserted clean by a regression smoke test in `loader.test.ts` — if those drift from the schema, the test catches it before any acceptance scenario runs. `io_error` is covered via a chmod-0000 file in a tmp dir, skipped on Windows.

## Surprising constraints

- **Project file replaces tenant file by name. No per-field merging.** The filename stem is canonical — `dev.yaml` in a project shadows `dev.yaml` at the tenant level wholesale (per D-09 composition rule). The compose test asserts this explicitly: tenant `skills` do NOT survive on the project record.
- **Non-empty `skills:` lists are advisory at MVP.** Per ND-08, the module surfaces the field but does not gate on it — there is no Claude Code CLI flag to restrict the agent to a named subset of installed skills today. Citation comment lives in `index.ts`'s `loadAll` doc.
- **`model`, `mcpServers`, and `skills` are all optional. A persona with only `schemaVersion` + `name` + `description` + `systemPrompt` is valid** and degrades to "the agent's native capabilities plus a behavior overlay" (per 1A defaults — all seven defaults take this shape).
- **Strict schema rejects unknown top-level fields.** Typos like `systemprompt:` (lowercase p) surface as `extra_fields` rather than silently passing as a missing-`systemPrompt`. Schema producers (1A's defaults, hand-authored personas) get a clear error instead of a silent drop.
- **Missing directory ≠ error.** `loadPersonasFromDirectory` returns `{ valid: [], invalid: [] }` for ENOENT — the common case for a project with no `.relay/personas/` should not generate diagnostic noise. Other I/O errors (EACCES, EISDIR) still throw, since they indicate a real misconfiguration.
- **Per-file validation failures never throw.** Per D-09 §4, a malformed `infra.yaml` must not block `dev.yaml` from loading. Errors aggregate in the `invalid` array; the caller decides whether to surface them, log them, or ignore them.
- **The `persona-yaml-check` skill (`.claude/skills/persona-yaml-check/SKILL.md`) is the authoring-time gate; this module is the runtime enforcer of the same rules.** The reason enum is intentionally a near-superset of the skill's violation codes so runtime errors map cleanly back to lint codes for operator UX.
