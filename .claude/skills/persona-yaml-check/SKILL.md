---
name: persona-yaml-check
description: Validate a persona YAML file against the D-09 schema in docs/prd/09-persona-schema.md — checks required fields (schemaVersion, name), schemaVersion is an integer the skill understands, kebab-case name matching the filename stem, optional list fields (skills, mcpServers) actually being lists, and optional model being a string. Per-rule pass/fail report with citations back to 09-persona-schema.md §1–§4. Trigger on phrases like "validate persona", "check this persona YAML", "lint persona file", "audit persona YAML", or being passed a path ending in `.yaml` under a `personas/` directory (e.g., `packages/server/personas/defaults/`, `~/.relay/personas/`, `<project>/.relay/personas/`).
---

# Relay persona-yaml-check skill

The persona YAML schema in [`docs/prd/09-persona-schema.md`](../../../docs/prd/09-persona-schema.md) (resolved by [D-09](../../../docs/decisions/D-09-persona-yaml-schema.md)) is the contract that `relay init` writes against, that the runtime `persona` module (build-plan 6C) loads against, and that the authoring guide for the seven shipped defaults (build-plan 1A) edits against. Drift between any of those producers and the on-disk YAML is what this skill detects. Given one or more persona YAML files, it runs five rules in a fixed order and emits a per-rule pass/fail report with a one-line citation back to the section of `09-persona-schema.md` that defines each rule.

The skill is **read-only**: it parses and inspects the target YAML and quotes spec text; it never edits the target file, the spec, or any other source. Field-by-field runtime validation against every persona load is the job of the Zod schemas in [`@relay/protocol`](../../../packages/protocol/) (build-plan task 4C); this skill is the human-side mirror — useful during authoring, during PR review, and as a gate before checking in a hand-edited persona.

## When to invoke

Trigger phrases:

- "validate persona" / "validate this persona YAML" / "lint persona file"
- "check this persona YAML" / "audit this persona" / "run persona-yaml-check"
- A path ending in `.yaml` under any `personas/` directory is handed to the skill — `packages/server/personas/defaults/*.yaml`, `~/.relay/personas/*.yaml`, `<project>/.relay/personas/*.yaml`.
- A directory path that ends in `personas/` or `personas/defaults/` (multi-file mode below).
- A raw YAML paste that contains a top-level `schemaVersion:` and `name:` and is contextually a persona (the user said "persona" or pasted under a persona-related question).

If invoked without a target file, directory, or paste, prompt the user for one. Don't guess which file to validate.

## Inputs the skill reads first

- [`docs/prd/09-persona-schema.md`](../../../docs/prd/09-persona-schema.md) — the schema of record. The skill cites §1 (file location and filename ↔ name), §2 (field table and required/optional descriptions), and §4 (validation bullets) by number. §3 (composition) and §5 (default-set membership) are out of scope and never cited.
- [`../../../docs/decisions/index.md` §D-09](../../../docs/decisions/D-09-persona-yaml-schema.md) — anchor source for the `D-09` citation token.
- The target persona YAML file(s) the user provides.

## Supported schema versions (frozen in this SKILL.md revision)

This SKILL.md revision understands **`schemaVersion: 1` only**. Any other integer (or any non-integer value) is a Rule 2 violation. When `09-persona-schema.md` adds a v2, this SKILL.md is updated in the same change — same canary discipline as the catalog in [`ws-protocol-check`](../ws-protocol-check/SKILL.md): the SKILL.md is the single point of drift detection between spec and skill.

## The five rules

Rules run in the order below for every candidate file. Order is locked because each rule often depends on the previous one parsing cleanly (you cannot kebab-case-check a `name:` field that isn't there). A failure on rule N does **not** skip rule N+1 — every rule still runs and reports — unless YAML parsing itself fails, in which case `parse_error` short-circuits the file.

### Rule 1 — Required fields present

Top-level keys `schemaVersion` and `name` must both be present and non-null in the parsed YAML mapping.

- **What to look for:** the parsed document has top-level keys `schemaVersion` (any non-null value) and `name` (any non-null value).
- **Violation:** either key missing, or set to YAML `null` / `~`. Emit `missing_required`.
- **Cite:** `09-persona-schema.md §2 "Required fields"`.

### Rule 2 — `schemaVersion` is an integer the skill understands

The value of `schemaVersion` must be a YAML integer (not a quoted string like `"1"`, not a float `1.0`, not `true`/`false`), and must equal `1`.

- **What to look for:** `typeof parsed.schemaVersion === "number" && Number.isInteger(parsed.schemaVersion) && parsed.schemaVersion === 1`. In a raw text scan (no parser available), the YAML literal must be a bare integer on the value side of `schemaVersion:` — `schemaVersion: 1`, never `schemaVersion: "1"`, `schemaVersion: '1'`, or `schemaVersion: 1.0`.
- **Violation:** non-integer type, or integer ≠ 1. Emit `unsupported_schema_version`.
- **Cite:** `09-persona-schema.md §2` (field table row for `schemaVersion`) + `§4` third bullet (_"`schemaVersion` is an integer the server understands"_).

### Rule 3 — `name` is kebab-case and matches the filename stem

The `name:` value must match the kebab-case regex `^[a-z][a-z0-9]*(-[a-z0-9]+)*$`. When a filename was provided, it must also equal the filename stem (the basename with `.yaml` stripped). Reported as two sub-failures so the user sees exactly which half broke.

- **What to look for:**
  - Kebab regex on the string value of `name:`.
  - String equality between `name` and `basename(file).replace(/\.yaml$/, "")`.
- **Violations:**
  - Value fails the kebab regex → `name_format`.
  - Value passes the regex but ≠ filename stem (e.g., `name: dev` in a file called `infra.yaml`) → `name_stem_mismatch`.
  - If no filename was provided (raw YAML paste), emit `ambiguous` for the stem half of the rule and continue. The kebab-format half still runs against the value.
- **Cite:** `09-persona-schema.md §1` (_"The filename stem ... is the persona's canonical name. The `name:` field inside the file must match the stem"_) + `§2` (_"`name` — kebab-case identifier. Must match the filename stem"_).

### Rule 4 — Optional list fields are lists, not strings

If `skills` or `mcpServers` is present, the value must be a YAML sequence or the YAML literal `null` / `~`. An omitted field is valid (per §2: _"omitting the field or setting it to `null` means 'all skills'"_). An empty list (`skills: []`) is also valid (per §2: _"`skills: []` means no skills"_).

- **What to look for:** for each of `skills`, `mcpServers` present in the parsed mapping, the value is either an array or `null`.
- **Violations:**
  - A scalar string (`skills: test-runner`) → `list_type`.
  - A mapping (`skills: { test-runner: true }`) → `list_type`.
  - A number, boolean, or other non-sequence scalar → `list_type`.
- **Cite:** `09-persona-schema.md §2` (field-table rows for `skills` and `mcpServers`) + `§4` fourth bullet (_"Optional list fields are lists (not strings or objects)"_).

### Rule 5 — Optional `model` is a string

If `model` is present, the value must be a YAML scalar string (e.g., `claude-sonnet-4-6`). Omitted is valid (per §2: _"omitted = agent CLI default"_).

- **What to look for:** `typeof parsed.model === "string"` (or `model` absent entirely).
- **Violation:** any non-string value when `model` is present — integer (`model: 123`), boolean, list, mapping. Emit `model_type`.
- **Cite:** `09-persona-schema.md §2` (field-table row for `model`: _"model identifier passed to the agent CLI at session spawn (e.g., `claude-sonnet-4-6`)"_).

## Violation taxonomy

Every non-clean verdict names exactly one code:

| Code                         | Means                                                                                                                                                                               |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `parse_error`                | File isn't valid YAML; no rules can run. Short-circuits the rest of the rules for that file.                                                                                        |
| `missing_required`           | `schemaVersion` or `name` (or both) is missing or null.                                                                                                                             |
| `unsupported_schema_version` | `schemaVersion` is not an integer, or is an integer this SKILL.md revision doesn't understand (≠ 1).                                                                                |
| `name_format`                | `name` value doesn't match the kebab-case regex `^[a-z][a-z0-9]*(-[a-z0-9]+)*$`.                                                                                                    |
| `name_stem_mismatch`         | `name` passes the kebab regex but differs from the filename stem.                                                                                                                   |
| `list_type`                  | `skills` or `mcpServers` is present but isn't a list (or null).                                                                                                                     |
| `model_type`                 | `model` is present but isn't a string.                                                                                                                                              |
| `ambiguous`                  | Skill can't statically decide — e.g., raw YAML paste with no filename (stem half of Rule 3), or YAML anchor/alias machinery the skill won't resolve. Reported, not silently passed. |

`ambiguous` is a real verdict; the user reads it as "go look at this by hand," not as a pass.

## Output format

For each file, a per-rule block followed by a one-line summary. For a clean file:

```
File: dev.yaml

Rule 1 — required fields present:           pass
Rule 2 — schemaVersion=1 understood:        pass
Rule 3 — name kebab-case + matches stem:    pass
Rule 4 — skills/mcpServers are lists:       pass
Rule 5 — model is a string:                 pass

clean: all 5 rules passed
```

For a failing rule, replace the matching line with a violation block:

```
Rule 3 — name kebab-case + matches stem: fail (name_stem_mismatch)
  Where: infra.yaml:2
  Snippet: name: dev
  Expected: name field must equal the filename stem "infra"
  Cite: 09-persona-schema.md §1, §2
```

On a `parse_error`, emit one block in place of the per-rule listing and stop:

```
File: broken.yaml

parse_error
  Where: broken.yaml:7
  Snippet: <up to 6 lines around the parse failure>
  Expected: file must parse as a YAML mapping with top-level schemaVersion and name keys
  Cite: 09-persona-schema.md §2
```

After all per-file output, in multi-file mode, a tail summary table:

```
| File          | Failing rules | Codes                                |
| ------------- | ------------- | ------------------------------------ |
| dev.yaml      | —             | clean                                |
| infra.yaml    | 3             | name_stem_mismatch                   |
| review.yaml   | 2, 4          | unsupported_schema_version, list_type |
```

## Single-file vs multi-file mode

When the input is a single file path or a raw paste, run all five rules and emit one report (no tail table — the per-rule block is already the full picture).

When the input is a directory path (e.g., `packages/server/personas/defaults/`, `~/.relay/personas/`, `<project>/.relay/personas/`), audit every `*.yaml` directly inside that directory. **Do not recurse** — persona files don't nest under §1. Per `09-persona-schema.md` §4 (_"validation failures do not block server startup"_), a failure on one file does not stop the run; every file gets its own block and the tail summary table makes the cross-file picture scannable.

## Out of scope

Mirror the boundary discipline of the sibling skills — say no, clearly, to four classes of question this skill won't answer:

- **Authoring persona content** — build-plan task 1A owns the seven default personas' `systemPrompt`, `skills`, `mcpServers`, and `description` content. This skill validates _shape_; it never proposes prose, never suggests skill names, never rewrites the file. If a `systemPrompt` is empty or a `description` is missing, that's fine — both are optional under §2.
- **§3 composition (project-vs-tenant override)** — selection between `~/.relay/personas/<name>.yaml` and `<project>/.relay/personas/<name>.yaml` is runtime behavior in the `persona` module (6C). The skill validates one file at a time; it doesn't know about the other scope and won't compare them.
- **§5 default-set membership** — the skill doesn't enforce that any particular persona name is present. Whether `~/.relay/personas/` actually contains all seven of `product`, `design`, `dev`, `test`, `infra`, `architect`, `review` is `relay init`'s job (build-plan 1A), not the linter's.
- **Field-shape validation at server load time** — the runtime Zod schemas in [`@relay/protocol`](../../../packages/protocol/) (build-plan task 4C) are the binding check on every persona load. This SKILL.md is the human-review mirror, not a replacement. If asked to validate that the runtime _implementation_ matches these rules, refer the reviewer to the `@relay/protocol` schemas instead.

## Conventions worth restating

- **Read-only.** The skill never edits the target YAML, never edits `09-persona-schema.md`, and never edits `../../../docs/decisions/index.md`. The only mutation surface is the report it returns.
- **Static checks, not a proof.** Rules 1–5 are deterministic against a parsed YAML mapping; if a file uses anchors, aliases, or `!!tags` that change the static shape in ways the skill can't resolve, emit `ambiguous` for the affected rule rather than guessing.
- **Schema version frozen in this SKILL.md.** Rule 2 says "an integer the skill understands"; the integer is `1`. When `09-persona-schema.md` ships a v2, the SKILL.md is updated in the same change. Reviewers of a §2 edit should look for the paired SKILL.md edit.
- **Defer field shapes to `@relay/protocol`.** The Zod schemas in [`packages/protocol/`](../../../packages/protocol/) are the runtime check on every persona load (build-plan 4C). This skill checks the same five things the spec lists in §4; deeper shape questions (e.g., enum membership for `model`) belong to the schemas, not here.
- **Surface new edge cases via the decision log.** If the audit keeps hitting a real-world pattern the rules misclassify (e.g., a persona library that legitimately uses YAML anchors), file an ND-NN via the [`decision-log`](../decision-log/SKILL.md) skill rather than relaxing a rule silently here.
