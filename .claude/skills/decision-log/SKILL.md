---
name: decision-log
description: Work with Relay-style decision logs (e.g. docs/open-questions.md) — resolve open questions, defer entries, add new D-NN decisions or ND-NN sub-questions, propagate resolved decisions into the affected subdocs following the 5-step propagation protocol, audit pending propagations, or bootstrap a new decision-log file. Trigger when the user asks to resolve, defer, propagate, audit, or extend a decisions / open-questions doc, or when editing files that use the D-NN/ND-NN + Status/Affects/Surfaced by/Question/Context/Options/Current thinking/Resolution template.
---

# Relay decision-log skill

Decision logs in this project follow a strict format. The canonical example and the authoritative template + propagation protocol live inside the file itself — typically `docs/open-questions.md`. **Read that file first** any time you operate on it: the template (lines ~10–36) and the propagation protocol (lines ~40–54) are the source of truth.

The shapes you must preserve:

- **IDs.** `D-NN` for decisions surfaced from the PRD or ad hoc; `ND-NN` for sub-questions surfaced by a parent decision's resolution. Allocate the next free number in sequence; never reuse.
- **Status values.** `open` · `in-deliberation` · `resolved (YYYY-MM-DD)` · `deferred (until <trigger>)`. Always include the date for resolved; always name the trigger for deferred.
- **Cross-links.** `[[slug]]` where `slug` is the kebab-case `dnn-short-title` of the linked entry (matches the GitHub heading anchor without the leading `#`).
- **Index.** Three subsections — Open / in-deliberation, Deferred, Resolved. Every status change updates the Index.
- **Dates.** `YYYY-MM-DD`. Today's date is in the conversation context — use it directly; don't ask.

## Operating modes

### 1. Bootstrap a new decision-log file

Only when the file does not exist. Copy the structure from `docs/open-questions.md`: H1 title, status/scope preamble, Decision template fence, Propagation protocol section, Index with the three empty subsections, then a horizontal rule. No starter entries — the file is ready for the first `D-01` to be added.

### 2. Resolve an open entry

Match the shape of existing resolved entries (e.g. `D-G2`, `D-G3`, `D-G6` in `docs/open-questions.md`):

1. Flip `Status:` to `resolved (<today>)`.
2. Write the **Resolution** section as: chosen model in one sentence, then a **numbered contract** (the load-bearing rules), then a **"Why this and not <other option>"** paragraph that names the rejected alternatives by their option letter or short label.
3. If the resolution surfaces new sub-questions, list them at the bottom: `**Surfaces new sub-questions:** [[nd-NN-slug]], [[nd-NN-slug]].` Then create those ND stubs (mode 4).
4. If the resolution promotes or repositions another entry, call it out: `**Promotes:** [[d-NN-slug]] from Phase 3 to MVP — <one-line reason>.`
5. Append `**Propagated to:** *(pending — see propagation protocol)*` as the final line. Do not skip this — it is what makes propagation queryable later.
6. Move the entry from Open to Resolved in the Index, with the date suffix.

The Resolution section is the **deliberation record**. The subdoc gets prose describing the **contract**. Don't copy verbatim between them — the subdoc reads as spec, the Resolution reads as "here's what we decided and why."

### 3. Defer an entry

1. Flip `Status:` to `deferred (until <trigger>)` where `<trigger>` is a concrete event ("Phase 2 PWA work begins", "first multi-tenant deployment surfaces").
2. Replace the Resolution section with three labeled blocks: **MVP behavior** (what ships in the meantime — may be `N/A` if not in current scope), **Default direction when picked up** (provisional lean so future-us doesn't restart cold), **Re-open trigger** (same trigger, restated).
3. Move the entry from Open to Deferred in the Index, with the trigger in parentheses.

`D-02` and `D-05` are the reference shapes.

### 4. Add a sub-question as an ND stub

Used when resolving a parent decision surfaces an open question that isn't worth resolving inline.

1. Allocate the next `ND-NN` id.
2. Status `open`. `Affects:` names the subdoc(s) the answer will land in. `Surfaced by:` is `[[d-NN-slug]] resolution` (link the parent).
3. Write the **Question** as one paragraph stating the precise gap.
4. Write an **Elaboration prompt** paragraph: what to consider, what trade-offs to weigh, what to validate against. This is the prompt for whoever (likely future Claude) picks the entry up.
5. Add to the Open subsection of the Index.
6. Back-link from the parent decision's Resolution `Surfaces new sub-questions:` line.

`ND-01` through `ND-07` are reference shapes.

### 5. Propagate a resolved entry

Follow the 5-step protocol verbatim from `docs/open-questions.md` (Locate → Replace/Fill → Back-reference → Annotate `Propagated to:` → Update Index). One entry at a time so each subdoc diff is reviewable in isolation. Order the queue **smallest blast radius first** — a one-section subdoc edit before a multi-subdoc fan-out.

For each entry:

1. Read the `Affects:` field. That's the work order.
2. Open each named subdoc section. Replace placeholder prose, or add the section if missing. Write **prose describing the contract**, not a copy of the Resolution.
3. Append the back-reference at the end of the updated section: `*Resolved by [D-NN](../open-questions.md#d-nn-<slug>) on <YYYY-MM-DD>.*` (path is relative to the subdoc; adjust depth if the decision-log lives elsewhere).
4. In the decision-log, replace `*(pending — see propagation protocol)*` on the entry's `Propagated to:` line with the concrete list: `Propagated to: prd/03-server.md §5.1 (<YYYY-MM-DD>).` Multiple targets get comma-separated entries, each with its own date.
5. Index already shows the entry as resolved; no Index change unless the entry was previously listed elsewhere.

If a subdoc section doesn't exist yet, create it with a heading that matches what `Affects:` named. Don't invent placement — if `Affects:` is ambiguous, ask before propagating.

### 6. Audit

Report against the decision-log file. Counts:

- **Open / in-deliberation** — entries in the Open Index subsection.
- **Deferred** — entries in the Deferred Index subsection.
- **Resolved, propagation pending** — entries with `Propagated to: *(pending …)*` (the propagation queue).
- **Resolved, fully propagated** — entries with a concrete `Propagated to:` list and no `pending` marker.

Then list the propagation queue ordered smallest blast radius first (single subdoc/section before multi-subdoc fan-out), with each entry's `Affects:` field shown so the user can see the work each one represents.

## Conventions worth restating

- Update the Index on every status change. The Index is the at-a-glance state of the world; if it lies, the doc loses its job.
- Never drop the `Propagated to:` line on a resolved entry. `*(pending — see propagation protocol)*` is the placeholder; a concrete list is the done state. The presence of the line is what makes mode 6 (audit) cheap.
- Cross-link liberally with `[[slug]]`. Slugs are the GitHub heading anchor without the leading `#`. A slug for an entry not yet written is fine — it marks intent.
- Don't refactor the file's structure to be "cleaner." The shape is load-bearing for scannability and for the future tooling cue noted at the end of the propagation protocol section.
