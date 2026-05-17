---
name: sqlite-migration
description: Scaffold a new SQLite migration file at packages/server/src/store/migrations/NNNN_short_description.sql per the convention in docs/arch/sqlite-schema.md §6 — computes the next NNNN from existing files, sanitizes a short description into a snake_case stem, writes a stub with the filename header, a one-line intent comment, a TODO body, and the trailing INSERT INTO schema_versions row. Trigger on phrases like "new migration", "add a migration for X", "scaffold a migration", "create a migration", or any request to add a table / column / index to the SQLite schema (interpret as a scaffold request unless the user is editing docs/arch/sqlite-schema.md itself).
---

# Relay sqlite-migration skill

The SQLite migration convention in [`docs/arch/sqlite-schema.md`](../../../docs/arch/sqlite-schema.md) §6 is the contract that the `store/` module's migration runner ([build-plan 6A](../../../docs/build-plan.md)) reads on every server boot. Every migration is a single `.sql` file at `packages/server/src/store/migrations/NNNN_short_description.sql`, applied in `NNNN` order inside its own transaction, with the final statement of the body being an `INSERT INTO schema_versions (...)` row that bookkeeps the version. Re-reading §6 every time a contributor adds a migration is friction; getting the filename pattern, the trailing INSERT, or the `name` cell wrong silently desynchronizes the runner from disk. This skill scaffolds the file against the §6 convention so the contributor's only job is to fill in the body.

The skill is **write-active under one path only**: it writes exactly one new file per invocation, under `packages/server/src/store/migrations/`. It never edits [`sqlite-schema.md`](../../../docs/arch/sqlite-schema.md), never edits [`open-questions.md`](../../../docs/open-questions.md), and never writes the migration body itself. Boundary discipline mirrors the read-only sibling skills ([`ws-protocol-check`](../ws-protocol-check/SKILL.md), [`persona-yaml-check`](../persona-yaml-check/SKILL.md)) — the audit half stays static; this skill is the authoring half. SQL syntax validation, transaction semantics, and "does this migration actually do the right thing" are the runtime runner's job and the reviewing contributor's job, not the scaffolder's.

## When to invoke

Trigger phrases:

- "new migration" / "add a migration for X" / "scaffold a migration" / "create a migration"
- "I need to add a table / column / index" _in the context of the SQLite schema_ (the answer is a migration file — interpret as a scaffold request).
- "add `<column>` to the `<table>` table" / "drop the `<index>` index" — same intent, phrased as the change rather than the artifact.

**Negative trigger:** when the user is editing [`docs/arch/sqlite-schema.md`](../../../docs/arch/sqlite-schema.md) itself, this skill does not fire — that's a spec change, not a migration. The spec change typically comes _first_, then a migration is scaffolded against the new shape.

If invoked without a short description of what the migration does, prompt the user for one. Don't guess intent from surrounding context; the description ends up in the filename, the intent comment, and the `schema_versions.name` cell, all of which are durable.

## Inputs the skill reads first

- [`docs/arch/sqlite-schema.md`](../../../docs/arch/sqlite-schema.md) §6 — the convention of record. §6.1 names the filename pattern (`NNNN_short_description.sql`, zero-padded 4-digit sequence, snake*case ≤40 chars, forward-only). §6.2 names the runner contract — specifically step 6, *"The final statement of each migration body is `INSERT INTO schema_versions (version, name, applied_at) VALUES (NNNN, '<name>', <unix_millis>)`."\_ §6.3 is the canonical example shape and the stub template is anchored to it.
- [`docs/arch/sqlite-schema.md`](../../../docs/arch/sqlite-schema.md) §3.4 — the `schema_versions` table DDL. The column list (`version`, `name`, `applied_at`) is what the trailing INSERT writes against.
- [`packages/server/src/store/migrations/`](../../../packages/server/src/store/migrations/) — the directory listing. Existing filenames drive the next-number compute and gate the corrupt-dir refusal.

## The five steps

Run in order. Each step short-circuits the run on a refusal — do not proceed to the next step on a refusal verdict.

### Step 1 — Read the next migration number

List `*.sql` files directly in `packages/server/src/store/migrations/`. Do not recurse — migrations don't nest. If the directory does not exist yet, treat the count as zero; the directory is created in Step 4.

For each existing filename, validate the pattern `^[0-9]{4}_[a-z][a-z0-9_]*\.sql$`. Parse the `NNNN` prefix as an integer; collect the set.

- **Empty/missing dir:** next number is `0001`.
- **Well-formed dir:** next number is `max(existing) + 1`, zero-padded to 4 digits.
- **Refusal (`dir_corrupt`):** any filename fails the regex, OR the set of `NNNN` values has duplicates, OR the sequence has gaps (i.e., the set is not `{1, 2, …, max}`). Name the offending file(s) in the report and stop. §6.2 step 4 already says the runner rejects this state at boot; matching that strictness here prevents bad state from shipping.

Cite `sqlite-schema.md §6.1` (the filename pattern and "Numbers are issued sequentially; gaps are not allowed") and `§6.2` step 4 (the runner's matching reject).

### Step 2 — Sanitize the description into a snake_case stem

Take the user-supplied short description and produce a stem matching `^[a-z][a-z0-9_]*$` with length ≤40.

Sanitization rules, in order:

1. Lowercase.
2. Replace every maximal run of non-`[a-z0-9]` characters with a single `_`.
3. Strip leading and trailing `_`.
4. If the result starts with a digit, prefix with `m_` (the §6.1 stem must start with a letter; this is the rare-case fallback).
5. If the result exceeds 40 characters, truncate at the last `_` boundary inside the 40-char window when one exists; otherwise hard-truncate at 40 and re-strip trailing `_`.
6. If the result is empty after these steps, emit `ambiguous_description` (Step 5's refusal taxonomy) and prompt the user to refine. Do not invent a stem from thin air.

**Confirm on material changes.** If the sanitized stem differs from the input in any way beyond trivial whitespace stripping — i.e., any uppercase letters were lowercased, any non-`[a-z0-9_]` characters were replaced, any truncation happened, or the leading-digit prefix fired — show the user the proposed stem and ask one yes/no confirmation before writing:

```
Input: "Add Token's Table!!! (v2)"
Proposed stem: add_tokens_table_v2
Write 0002_add_tokens_table_v2.sql? [yes/no]
```

If the only "change" was stripping leading/trailing whitespace from an otherwise-clean snake_case input, write without prompting — the confirmation prompt is for cases where intent could shift, not for cosmetic noise. On `no`, prompt the user for a refined description and re-run Step 2.

Cite `sqlite-schema.md §6.1` (the ≤40-char snake_case rule).

### Step 3 — Compose the stub file body

The stub is a fixed template, anchored verbatim to `sqlite-schema.md §6.3`. Substitute `<NNNN>` (zero-padded), `<N>` (integer, no padding — `schema_versions.version` is INTEGER per §3.4), `<stem>`, and `<intent>` (the user's description, lightly cleaned: capitalize the first letter, end with a period, leave internal punctuation alone):

```sql
-- <NNNN>_<stem>.sql
-- <intent>

-- TODO: write the migration body here (DDL / DML).

INSERT INTO schema_versions (version, name, applied_at)
VALUES (<N>, '<stem>', CAST(strftime('%s','now') AS INTEGER) * 1000);
```

Four invariants in this template are load-bearing:

- **The `name` value in the trailing INSERT must equal the filename stem.** §6.2 step 6 is explicit about the bookkeeping shape; mismatched values are a silent runner-confuses-row class of bug.
- **The version number must equal the parsed `NNNN`** with no leading zeros (integer column).
- **The `applied_at` expression is `CAST(strftime('%s','now') AS INTEGER) * 1000`** — unix millis, computed at apply time inside the migration's own transaction (§3 _"Timestamps are stored as INTEGER unix-milliseconds"_; §6.3 example).
- **The trailing INSERT is the last statement of the body.** §6.2 step 6 wants the bookkeeping inside the same transaction as the schema change so a partial migration cannot persist a version row.

The `-- TODO:` line is the contributor's fill-in marker. It surfaces in `grep TODO` sweeps and PR diff review if the contributor forgets to delete it — a deliberate nudge, not noise.

Cite `sqlite-schema.md §6.2` step 6 (trailing INSERT contract) and `§6.3` (example shape).

### Step 4 — Write the file

Target path: `packages/server/src/store/migrations/<NNNN>_<stem>.sql`.

- Create the `migrations/` directory if it doesn't exist. The convention places it at a fixed path (`packages/server/src/store/migrations/`); there is no ambiguity about location and the runner expects it to be present.
- **Refusal (`destination_exists`):** if the destination file already exists, refuse and stop. The next-number compute in Step 1 makes this impossible in a well-formed dir; tripping this guard means the dir is corrupt in a way Step 1 didn't catch (e.g., a hidden Unicode-lookalike duplicate) — surface it rather than overwriting.

Use the `Write` tool to create the file. Do not use shell heredocs or `echo` — `Write` is the dedicated tool and produces a cleaner audit trail.

### Step 5 — Return the path

Single-line report, exactly:

```
Wrote packages/server/src/store/migrations/<NNNN>_<stem>.sql. Fill in the body between the intent comment and the trailing INSERT; don't change the INSERT itself.
```

The "don't change the INSERT" half is load-bearing: the bookkeeping row is the runner's index. A contributor who reorders, edits, or deletes it has broken the runner's invariant; the explicit nudge in the return line catches the easy mistake.

## Refusal taxonomy

Every refusal names exactly one code:

| Code                    | Means                                                                                                                                                                |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dir_corrupt`           | An existing filename in `migrations/` fails the §6.1 pattern, or the `NNNN` sequence has gaps or duplicates. Repair the dir first.                                   |
| `ambiguous_description` | The user-supplied description sanitizes to an empty stem (e.g., all-punctuation, all-whitespace, or empty input). Prompt the user to refine.                         |
| `destination_exists`    | Defensive guard: the computed destination file already exists. Should never trip in a well-formed dir; surfaces the case where Step 1's validation missed something. |

A refusal stops the run; no file is written. The skill emits the code, a one-line "Where" pointer, and a "Fix" line telling the user what to do next:

```
Refusal: dir_corrupt
  Where: packages/server/src/store/migrations/03_partial.sql
  Reason: filename 03_partial.sql does not match ^[0-9]{4}_[a-z][a-z0-9_]*\.sql$ (NNNN must be 4 digits)
  Fix: rename to a 4-digit prefix (0003_partial.sql) and re-run.
  Cite: sqlite-schema.md §6.1
```

## Out of scope

Mirror the boundary discipline of the sibling skills — say no, clearly, to four classes of question this skill won't answer:

- **Writing the migration body itself.** DDL/DML for the new feature (`CREATE TABLE`, `ALTER TABLE`, `CREATE INDEX`, etc.) is the contributor's job; this skill scaffolds, the contributor fills. The `-- TODO:` line is the seam. If asked to draft the body, decline and refer the user to `sqlite-schema.md` §3 (the current DDL) for shape conventions (STRICT tables, `snake_case` identifiers, INTEGER unix-millis timestamps, ULIDs as TEXT) — the scaffold lands; the body is a separate write.
- **Validating SQL syntax inside the body.** The migration runner (build-plan 6A) is the binding judge: §6.2 step 5 says SQLite rejects bad SQL and rolls back the transaction at boot. This skill checks the _envelope_ (filename pattern, stem, trailing INSERT), not the _cargo_ (SQL inside the body).
- **Running the migration.** The boot-time runner in `packages/server/src/store/` (build-plan 6A) is the runtime component. This skill is an authoring helper invoked at edit time; it doesn't connect to a database, doesn't apply files, and doesn't read `state.db`.
- **Down migrations / rollback files.** `sqlite-schema.md` §6.1 commits to forward-only at MVP — _"Rolling back a botched migration means writing the next migration."_ This skill does not scaffold a `down.sql` counterpart; if the deployment model changes (§8 names _"audit-log table when Phase 4 lands"_ as the kind of trigger that revisits §6), update `sqlite-schema.md` §6 first, then revise this SKILL.md in the same change.

## Conventions worth restating

- **Write-active under one path only.** The skill writes one new file per invocation, always under `packages/server/src/store/migrations/`. It never edits `sqlite-schema.md`, never edits `open-questions.md`, never edits any other source file. The only mutation surface is the new `.sql` stub.
- **Convention frozen in this SKILL.md.** The filename pattern, the stub template, and the trailing-INSERT shape are inlined here on purpose — the SKILL.md is the canary if `sqlite-schema.md` §6 grows or shifts. Same discipline as the catalog in [`ws-protocol-check`](../ws-protocol-check/SKILL.md) and the schema version in [`persona-yaml-check`](../persona-yaml-check/SKILL.md): a §6 edit should land paired with a SKILL.md edit, and reviewers of either should look for the other.
- **Refuse on corrupt dir state, don't paper over.** The migration runner rejects boot if filenames are non-sequential or duplicated (`sqlite-schema.md` §6.2 step 4); the skill matches that strictness. A skill that silently renumbered or skipped past corruption would let bad state ship past PR review and break the next contributor's run.
- **The trailing INSERT is part of the migration's transaction.** Don't move it outside, don't split it across statements, don't replace `<N>` with `LAST_INSERT_ROWID()` cleverness. §6.2 step 6 is explicit about the shape; the runner trusts every migration file to follow it.
- **Surface new edge cases via the decision log.** If repeated invocations expose a real-world pattern the rules misclassify (e.g., the ≤40-char limit cramping legitimately long descriptive stems, or the forward-only stance proving insufficient for a real deployment), file an `ND-NN` via the [`decision-log`](../decision-log/SKILL.md) skill rather than relaxing a rule silently here.
