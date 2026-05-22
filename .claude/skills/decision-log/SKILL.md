---
name: decision-log
description: Work with Relay-style decision logs (one file per decision under docs/decisions/) — resolve open questions, defer entries, add new D-NN decisions or ND-NN sub-questions, propagate resolved decisions into the affected subdocs following the 5-step propagation protocol, audit pending propagations, or bootstrap a new decision-log tree. Trigger when the user asks to resolve, defer, propagate, audit, or extend a Relay decision, or when editing files that use the D-NN/ND-NN + Status/Affects/Surfaced by/Question/Context/Options/Current thinking/Resolution template.
---

# Relay decision-log skill

Relay's decision log lives under `docs/decisions/`, one file per decision. The authoritative template + 5-step propagation protocol live inside [`docs/decisions/protocol.md`](../../../docs/decisions/protocol.md); the at-a-glance index lives at [`docs/decisions/index.md`](../../../docs/decisions/index.md). **Read both** any time you operate on the log: `protocol.md` is the source of truth for the file format and propagation steps; `index.md` is the work surface for status counts and the propagation queue.

The shapes you must preserve:

- **Layout.** One file per decision under `docs/decisions/`. Filename is `<ID>-<kebab-slug>.md` with uppercase ID (`D-G1`, `D-01`, `ND-01`) and lowercase kebab slug of the title.
- **IDs.** `D-NN` for decisions surfaced from the PRD or ad hoc; `ND-NN` for sub-questions surfaced by a parent decision's resolution; `D-Gn` for foundational decisions. Allocate the next free number in sequence; never reuse. The next free number is `max(existing) + 1`, scoped to the prefix.
- **Frontmatter.** Every per-decision file leads with YAML frontmatter: `id`, `status`, `title`, plus `resolved-on` (resolved) or `deferred-until` (deferred), plus `affects` and `surfaced-by` as raw strings. The body **also** carries the same fields as `**Status:**`/`**Affects:**`/`**Surfaced by:**` inline — keep both surfaces in sync so machine lookup (frontmatter) and human read (body) never diverge.
- **Status values.** `open` · `in-deliberation` · `resolved (YYYY-MM-DD)` · `deferred (until <trigger>)`. Always include the date for resolved; always name the trigger for deferred.
- **Cross-links.** `[[slug]]` where `slug` is the kebab-case `<id>-<short-title>` matching the per-decision file's filename stem (lowercase). The [`prd-link`](../prd-link/SKILL.md) skill resolves these case-insensitively to the matching file.
- **Index.** Three subsections in [`docs/decisions/index.md`](../../../docs/decisions/index.md) — Open / in-deliberation, Deferred, Resolved. Every status change updates the index line.
- **Dates.** `YYYY-MM-DD`. Today's date is in the conversation context — use it directly; don't ask.

## Operating modes

### 1. Bootstrap a new decision log

Only when `docs/decisions/` does not exist. Copy the structure from this repo's `docs/decisions/`: create `protocol.md` (template + 5-step propagation protocol — start from this repo's protocol.md verbatim and adapt the project name), create `index.md` with the three empty subsections and a `**Counts.**` line, and stop. No starter per-decision files — the directory is ready for the first `D-01` to be added.

### 2. Resolve an open entry

Open the per-decision file (e.g., `docs/decisions/ND-08-skill-subset-enforcement-mechanism.md`). Match the shape of existing resolved files (e.g. `D-G2`, `D-G3`, `D-G6`, `ND-11`):

1. **Update both surfaces.** Flip the frontmatter `status:` from `open` to `resolved` and add `resolved-on: <today>`. Flip the body's `**Status:**` line to `resolved (<today>)`. They must agree.
2. **Write the Resolution section** as: chosen model in one sentence, then a **numbered contract** (the load-bearing rules), then a **"Why this and not <other option>"** paragraph that names the rejected alternatives by their option letter or short label. The Resolution replaces any `*(unresolved)*` placeholder in the body.
3. **If the resolution surfaces new sub-questions**, list them at the bottom of the Resolution: `**Surfaces new sub-questions:** [[nd-NN-slug]], [[nd-NN-slug]].` Then create those ND stub files (mode 4).
4. **If the resolution promotes or repositions another entry**, call it out: `**Promotes:** [[d-NN-slug]] from Phase 3 to MVP — <one-line reason>.`
5. **Append `**Propagated to:** _(pending — see [protocol](protocol.md))_` as the final line.** Do not skip this — it is what makes propagation queryable later.
6. **Update [`index.md`](../../../docs/decisions/index.md).** Move the entry's line from the Open section to the Resolved section. Resolved is sorted newest-first; insert at the top. Update the `**Counts.**` line.

The Resolution section is the **deliberation record**. The subdoc gets prose describing the **contract**. Don't copy verbatim between them — the subdoc reads as spec, the Resolution reads as "here's what we decided and why."

### 3. Defer an entry

Open the per-decision file.

1. **Update both surfaces.** Flip the frontmatter `status:` to `deferred` and add `deferred-until: "<trigger>"` where `<trigger>` is a concrete event ("Phase 2 PWA work begins", "first multi-tenant deployment surfaces"). Drop `resolved-on` if present. Flip the body's `**Status:**` line to `deferred (until <trigger>)`.
2. **Replace the Resolution section** with three labeled blocks: **MVP behavior** (what ships in the meantime — may be `N/A` if not in current scope), **Default direction when picked up** (provisional lean so future-us doesn't restart cold), **Re-open trigger** (same trigger, restated).
3. **Update [`index.md`](../../../docs/decisions/index.md).** Move the entry's line to the Deferred section, with the trigger in parentheses. Update the `**Counts.**` line.

[`D-02-pwa-initial-server-discovery.md`](../../../docs/decisions/D-02-pwa-initial-server-discovery.md) and [`D-05-per-device-token-rotation.md`](../../../docs/decisions/D-05-per-device-token-rotation.md) are the reference shapes.

### 4. Add a sub-question as an ND stub

Used when resolving a parent decision surfaces an open question that isn't worth resolving inline.

1. Allocate the next `ND-NN` id (scan `ls docs/decisions/ND-*.md`, take `max + 1`).
2. Create `docs/decisions/ND-NN-<title-slug>.md` with frontmatter (`id`, `status: open`, `title`, `affects`, `surfaced-by: "[[d-NN-slug]] resolution"`).
3. Body starts with `# ND-NN — <title>`, then the `**Status:**`/`**Affects:**`/`**Surfaced by:**` triplet matching frontmatter.
4. Write the **Question** as one paragraph stating the precise gap.
5. Write an **Elaboration prompt** paragraph: what to consider, what trade-offs to weigh, what to validate against. This is the prompt for whoever (likely future Claude) picks the entry up.
6. End the file with a `## Resolution` heading whose body is `*(unresolved)*`.
7. Add the entry's line to the Open subsection of [`index.md`](../../../docs/decisions/index.md). Update the `**Counts.**` line.
8. Back-link from the parent decision's Resolution `Surfaces new sub-questions:` line.

[`ND-01`](../../../docs/decisions/ND-01-claim-lock-timeout-duration.md) through [`ND-07`](../../../docs/decisions/ND-07-marker-file-schema.md) are reference shapes for resolved subs; [`ND-08`](../../../docs/decisions/ND-08-skill-subset-enforcement-mechanism.md), [`ND-10`](../../../docs/decisions/ND-10-relay-token-list-subcommand-surface-alignment.md), [`ND-15`](../../../docs/decisions/ND-15-relay-session-show-subcommand-surface-alignment.md) are reference shapes for open ones with `Elaboration prompt` bodies.

### 5. Propagate a resolved entry

Follow the 5-step protocol from [`protocol.md`](../../../docs/decisions/protocol.md) (Locate → Replace/Fill → Back-reference → Annotate `Propagated to:` → Update Index). One entry at a time so each subdoc diff is reviewable in isolation. Order the queue **smallest blast radius first** — a one-section subdoc edit before a multi-subdoc fan-out.

For each entry:

1. Read the `affects:` frontmatter on the per-decision file (also rendered as `**Affects:**` in the body). That's the work order.
2. Open each named subdoc section. Replace placeholder prose, or add the section if missing. Write **prose describing the contract**, not a copy of the Resolution.
3. Append the back-reference at the end of the updated section: `*Resolved by [D-NN](../decisions/D-NN-<slug>.md) on <YYYY-MM-DD>.*` (path is relative to the subdoc — for a file at `docs/prd/03-server.md`, the relative path is `../decisions/D-NN-<slug>.md`; for a file at `packages/server/src/...`, count up to the repo root and walk down to `docs/decisions/`).
4. In the per-decision file, replace `*(pending — see [protocol](protocol.md))*` on the entry's `Propagated to:` line with the concrete list: `Propagated to: prd/03-server.md §5.1 (<YYYY-MM-DD>).` Multiple targets get comma-separated entries, each with its own date.
5. [`index.md`](../../../docs/decisions/index.md) already shows the entry as resolved; no index change unless the entry was previously listed elsewhere.

If a subdoc section doesn't exist yet, create it with a heading that matches what `affects:` named. Don't invent placement — if `affects:` is ambiguous, ask before propagating.

### 6. Audit

Report against the per-decision files under `docs/decisions/`. Counts:

- **Open / in-deliberation** — files with frontmatter `status: open` or `status: in-deliberation`. Cross-check against [`index.md`](../../../docs/decisions/index.md)'s Open section.
- **Deferred** — files with `status: deferred`. Cross-check against the Deferred index section.
- **Resolved, propagation pending** — files with `status: resolved` whose body contains `Propagated to: *(pending …)*` (the propagation queue).
- **Resolved, fully propagated** — files with `status: resolved` whose body has a concrete `Propagated to:` list and no `pending` marker.

Then list the propagation queue ordered smallest blast radius first (single subdoc/section before multi-subdoc fan-out), with each entry's `affects:` shown so the user can see the work each one represents.

Fast audit recipe (no Read calls needed):

```bash
# Open / in-deliberation
grep -l "^status: open\|^status: in-deliberation" docs/decisions/*.md
# Resolved, propagation pending
grep -l "Propagated to:\*\* \*(pending" docs/decisions/*.md
```

## Conventions worth restating

- **Per-decision file is self-contained.** Both frontmatter and body carry Status / Affects / Surfaced-by. Never let them disagree.
- **Update the index on every status change.** [`index.md`](../../../docs/decisions/index.md) is the at-a-glance state of the world; if it lies, the doc loses its job. The `**Counts.**` line near the top is the canary — if it disagrees with grep, the index is stale.
- **Never drop the `Propagated to:` line on a resolved entry.** `*(pending — see [protocol](protocol.md))*` is the placeholder; a concrete list is the done state. The presence of the line is what makes mode 6 (audit) cheap.
- **Cross-link liberally with `[[slug]]`.** Slugs are the per-decision filename stem lowercased. A slug for an entry not yet written is fine — it marks intent. The [`prd-link`](../prd-link/SKILL.md) skill resolves them.
- **Filename casing.** IDs uppercase (`D-G1`, `ND-01`), title slug lowercase. Example: `D-G1-persona-application-semantics.md`.
- **Don't refactor the layout to be "cleaner."** The per-file shape is load-bearing for retrieval — the [`prd-link`](../prd-link/SKILL.md) skill opens exactly one file per citation. Merging back into a single doc would undo that.
