# Relay decisions — template and propagation protocol

This file is the authoritative template + propagation protocol for every decision under `docs/decisions/`. Each resolved or open decision lives in its own file (`D-NN-<slug>.md` / `ND-NN-<slug>.md`) listed in [`index.md`](index.md). When working with this log, also read the [`decision-log` skill](../../.claude/skills/decision-log/SKILL.md), which encodes the operating modes.

The split per-file layout supersedes the prior monolithic decision-log file. The fields, IDs, and 5-step propagation protocol are unchanged — only storage changed.

---

## Decision template

Each per-decision file is structured like this:

```markdown
---
id: D-NN                      # or ND-NN; D-Gn for foundational decisions
status: resolved              # resolved | open | in-deliberation | deferred
title: <short title>
resolved-on: 2026-05-14       # only when status: resolved
deferred-until: <trigger>     # only when status: deferred
affects: "<raw affects string from the body>"
surfaced-by: "<raw surfaced-by string from the body>"
---

# D-NN — <short title>

**Status:** open | in-deliberation | resolved (resolution date) | deferred (until <trigger>)
**Affects:** <which subdoc(s) and section(s) this decision unblocks>
**Surfaced by:** <where this came from — original PRD §15, deep-dive analysis G-NN, ad hoc, etc.>

## Question
<the precise decision to be made, in one sentence>

## Context
<why this matters, what depends on it, what's at stake if it's wrong>

## Options under consideration
- **Option A** — <description, trade-offs>
- **Option B** — <description, trade-offs>

## Current thinking
<provisional lean if any, or "no preference yet">

## Resolution
<filled in when status flips to resolved; captures chosen option and rationale>

**Propagated to:** <which subdoc(s) §N.N (YYYY-MM-DD)> ... or *(pending — see propagation protocol)*
```

The frontmatter is the **machine-readable** lookup surface — the [`prd-link`](../../.claude/skills/prd-link/SKILL.md) and [`decision-log`](../../.claude/skills/decision-log/SKILL.md) skills read it without parsing the body. The body is the **human-readable** deliberation record and ships the full Status/Affects/Surfaced-by/Question/Context/Options/Current thinking/Resolution/Propagated-to structure verbatim.

---

## Propagation protocol for resolved entries

When a decision flips to `resolved`, its spec content has to land in the affected subdoc. This is the checked-in convention so propagation is reproducible and traceable both ways.

**Step 1 — Locate the target section.** The `Affects:` field on the entry names the subdoc(s) and section(s). That field is the work order.

**Step 2 — Replace or fill the placeholder.** Inside the target subdoc section, either replace prior placeholder text (e.g., "either client can send input") with normative spec prose, or add the section if it doesn't exist yet. The spec content is **prose describing the contract**, not a copy of the per-decision Resolution section. The Resolution section is the deliberation record; the subdoc is the spec.

**Step 3 — Add a back-reference.** At the end of the updated subdoc section, append: `*Resolved by [D-NN](../decisions/D-NN-<slug>.md) on <YYYY-MM-DD>.*` so a reader of the spec can trace back to the deliberation if they want the why. Path is relative to the subdoc — adjust depth as needed.

**Step 4 — Annotate the per-decision Resolution.** Append a `Propagated to:` line under the entry's Resolution naming each subdoc section that now carries the spec content. Example: `Propagated to: prd/03-server.md §5.1 (2026-05-14).` This makes propagation idempotent — anyone scanning [`index.md`](index.md) + a per-decision file can tell at a glance whether the resolution has landed.

**Step 5 — Update the Index.** [`index.md`](index.md) groups entries by status — Open / in-deliberation, Deferred, Resolved. Every status change moves the entry's index line between sections.

**Tooling cue:** The `decision-log` skill in mode 6 (Audit) reads every `Propagated to:` line under `docs/decisions/` and surfaces resolved entries whose value is still `*(pending — see propagation protocol)*` as a work queue. The per-decision layout makes the audit cheaper — frontmatter-keyed lookups instead of monolithic-file scans.

---

## Conventions worth restating

- **IDs.** `D-NN` for decisions surfaced from the PRD or ad hoc; `ND-NN` for sub-questions surfaced by a parent decision's resolution; `D-Gn` for the foundational deep-dive set. Allocate the next free number in sequence; never reuse.
- **Status values.** `open` · `in-deliberation` · `resolved (YYYY-MM-DD)` · `deferred (until <trigger>)`. Always include the date for resolved; always name the trigger for deferred.
- **Cross-links.** `[[slug]]` where `slug` is the kebab-case `<id>-<short-title>` matching the per-decision file's filename stem. The [`prd-link`](../../.claude/skills/prd-link/SKILL.md) skill resolves these by reading `docs/decisions/<slug>.md` directly. A slug for an entry not yet written is fine — it marks intent.
- **Dates.** `YYYY-MM-DD`. Today's date is in the conversation context — use it directly; don't ask.
- **Filename casing.** IDs are uppercase (`D-G1`, `D-01`, `ND-01`); slugs are kebab-case. Example filename: `D-G1-persona-application-semantics.md`. The `prd-link` skill resolves `[[d-g1-...]]` case-insensitively against this filename.
- **Per-decision file is self-contained.** Both the frontmatter and the body carry Status / Affects / Surfaced-by. The redundancy is intentional — the frontmatter is for machine lookup, the body is what a human reads. Never let them disagree.
- **Don't refactor the template.** The shape is load-bearing for scannability and for the `decision-log` skill's audit mode.
