---
name: prd-link
description: Resolve and verify Relay spec citations (D-NN, ND-NN, <subdoc>.md §N.N, [[kebab-slug]]) against docs/decisions/ and docs/prd/. Quote the referenced source inline so a reader can see what a code comment, PR description, or commit message actually points at. Flag broken references — unknown IDs, missing sections, moved files, renamed anchors — with a precise reason. Trigger when the user asks to resolve, expand, look up, or audit a D-NN/ND-NN/§N.N citation, or pastes a block of text containing such references.
---

# Relay prd-link skill

Code comments, PR descriptions, and commit messages in this repo cite `D-NN` / `ND-NN` decisions and `<subdoc>.md §N.N` spec sections — the CLAUDE.md citation convention requires it for non-obvious behavior. This skill turns those citations from opaque tokens into quoted source text, and flags the ones that no longer resolve as the spec evolves.

The skill is **read-only**: it opens [`docs/decisions/`](../../../docs/decisions/) and the [`docs/prd/`](../../../docs/prd/) subdocs to extract source text, but never edits them. If a reference is broken, the skill reports the failure — the user decides whether to update the citation in the code or fix the spec.

Two authoritative sources:

- **Decisions** — one file per decision under [`docs/decisions/`](../../../docs/decisions/). Filename is `<ID>-<kebab-slug>.md` (uppercase ID, lowercase slug). [`docs/decisions/index.md`](../../../docs/decisions/index.md) is the at-a-glance index but is **not** the source — open the per-decision file for the body.
- **Subdoc sections** — `docs/prd/00-overview.md` … `docs/prd/09-persona-schema.md` and `docs/arch/*.md`. Each subdoc uses numbered headings (`## 1. Foo`, `### 5.1 Bar`); `§N` or `§N.N` in a citation maps directly to the heading whose text begins with that number.

## When to invoke

Trigger phrases:

- "resolve `D-NN`" / "what does `D-NN` say" / "expand `D-NN`" / "look up `ND-NN`"
- "resolve `prd/03-server.md §5.1`" / "what's in `§5.1`"
- "audit citations in this PR" / "check the refs in this commit message" / "audit this block"
- A bare `D-NN`, `ND-NN`, or `[[kebab-slug]]` token in a context where resolution is implied.

If invoked without an input, prompt the user for the reference or block to resolve. Don't guess.

## Inputs the skill reads first

- **The specific per-decision file** for any `D-NN`/`ND-NN` citation. The skill **never reads `docs/decisions/index.md` to get the body** — it goes directly to `D-NN-*.md` via the ID lookup below.
- [`docs/prd.md`](../../../docs/prd.md) — subdoc index. Use it to confirm a cited path is a known subdoc rather than a renamed file.
- The cited subdoc(s) — opened only when a `§N.N` reference is being resolved.

## Reference grammar

The patterns the skill recognizes, with verbatim shapes from the repo:

| Pattern                          | Example                                             | Resolves to                                                                                  |
| -------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `D-NN` or `D-GN`                 | `D-G1`, `D-01`, `D-13`                              | `docs/decisions/D-G1-*.md` — exactly one per-decision file matching `<ID>-*.md`              |
| `ND-NN`                          | `ND-03`, `ND-08`                                    | `docs/decisions/ND-08-*.md` — same pattern                                                   |
| `[[kebab-slug]]`                 | `[[d-g1-persona-application-semantics]]`            | Per-decision file whose filename stem case-insensitively matches the slug                    |
| `<path>.md §N` / `§N.N`          | `prd/03-server.md §5.1` (backticks optional)        | Heading in `<path>.md` whose text starts with `N.` or `N.N`                                  |
| `[D-NN](decisions/D-NN-slug.md)` | `[D-13](../decisions/D-13-first-run-pairing-ux.md)` | Same as `D-NN`; skill verifies the file exists but treats the link as already self-resolving |

A bare `D-` or `ND-` with no number is `malformed`, not a match. A subdoc citation must include `§` — `prd/03-server.md` alone is a file reference, not a section reference, and the skill will report `section_missing` if a verdict is required.

## Resolution rules

- **D-NN / ND-NN.** Glob `docs/decisions/<ID>-*.md` (case-sensitive ID prefix). Expect exactly one match. If zero matches, emit `unknown_id`. If multiple matches, emit `ambiguous_id` (should never happen — IDs are unique by construction). Read the matched file. The **frontmatter** carries `status`, `title`, `resolved-on`/`deferred-until`, `affects`, `surfaced-by` — surface them as header fields. The **body** carries the human-readable Resolution / Question / Context / etc. — capture the `## Resolution` section (or `## Question` if status is `open` or `deferred`) and quote it.

- **`<path>.md §N` or `§N.N`.** Open the file at the repo-relative path (`docs/` is implied when the path begins with `prd/`, `arch/`, or `decisions/`). Locate a heading whose text starts with the section number followed by a period or whitespace (`## 3. State`, `### 5.1 Input arbitration`). Capture the body up to the next heading of equal or higher level. If two headings start with the same number, emit `ambiguous_section`.

- **`[[kebab-slug]]`.** Extract the leading `<id>-` token from the slug (case-insensitive `d-gN-`, `d-NN-`, `nd-NN-`). Use that ID prefix in the same glob as `D-NN`/`ND-NN` resolution above. The slug's title-tail is not required to match the filename exactly — the ID is the authoritative key, the slug body is for human readability. If the title-tail does not match the filename's title slug, that's a soft drift signal: report both the citation slug and the resolved filename in the `Source:` line.

- **Already-formed markdown link `[label](path#anchor)`.** Open the target file; verify the heading slug exists if `#anchor` is present. For new-style per-decision-file links like `[D-13](decisions/D-13-first-run-pairing-ux.md)`, verify the file exists. If yes, emit `resolved` with no quote (the link is already self-explanatory). If no, emit `file_missing`.

## Broken-reference taxonomy

Every non-`resolved` verdict names exactly one reason:

| Reason              | Means                                                                                                 |
| ------------------- | ----------------------------------------------------------------------------------------------------- |
| `unknown_id`        | `D-NN`/`ND-NN` not present under `docs/decisions/` (no `<ID>-*.md` file)                              |
| `ambiguous_id`      | Multiple per-decision files matched the ID prefix (data corruption — should never happen)             |
| `file_missing`      | `<path>.md` does not exist (file moved, deleted, or path typo)                                        |
| `section_missing`   | File exists but no heading starts with the requested section number                                   |
| `anchor_missing`    | Markdown link's `#anchor` doesn't match any heading slug in the target                                |
| `ambiguous_section` | Multiple headings start with the same section number (file got desynced)                              |
| `malformed`         | Token matches the surface pattern but can't be parsed (e.g., `D-` with no number, `§` with no number) |

## Output format

One block per reference, matching [`scenario-runner`](../scenario-runner/SKILL.md)'s citation-block style:

```
Ref: <citation as it appeared in input>
Source: <file>:<heading line>  [(Status: <status>)]
Affects: <comma-separated, only for D-NN/ND-NN>
Quote:
  <up to ~12 lines of source text; ellipsis if longer>
Verdict: resolved | broken (<reason>)
```

For a batch (more than one reference), follow the per-ref blocks with a summary table:

```
| Ref                       | Verdict  | Reason / Title                |
| ------------------------- | -------- | ----------------------------- |
| D-G1                      | resolved | Persona application semantics |
| ND-99                     | broken   | unknown_id                    |
| prd/03-server.md §99      | broken   | section_missing               |
```

When a reference resolves but its anchor text has drifted from what the citation seems to expect (e.g., the comment says `§5.1 input arbitration` and the heading now reads `### 5.1 Claim arbitration`), include both in the `Source:` line and let the reader judge — don't downgrade to `broken`, but don't silently paper over the drift either. Same rule for slug-tail drift in `[[kebab-slug]]` resolution.

## Conventions worth restating

- **Read-only.** The skill never edits `docs/decisions/*`, `docs/prd/*`, the build-plan, or any source it cites. The only mutation surface is the message it returns.
- **One file per citation.** This is the whole point of the per-decision-file layout — resolving `D-09` reads exactly `docs/decisions/D-09-persona-yaml-schema.md`, not the full log. Never grep `docs/decisions/*.md` collectively when an ID-targeted glob suffices.
- **Quote sparingly.** ~12 lines max per reference keeps batch output scannable. On truncation, include the heading + first paragraph + `…`, not a tail-truncated dump.
- **Quote verbatim; don't paraphrase.** Paraphrasing is what code comments already do — this skill exists so a reader can compare the comment against the source without re-reading the spec themselves.
- **Surface drift, don't fix it.** If the citation looks legitimate but the heading text has changed (or the slug tail has drifted from the filename's title), report both — never silently rewrite the citation in the user's code.
- **Defer to `decision-log` for new IDs.** If an audit surfaces a citation that should exist but doesn't (e.g., a code comment introduces `D-15` and `docs/decisions/D-15-*.md` doesn't exist), point the user at the [`decision-log`](../decision-log/SKILL.md) skill to file the entry. Don't auto-create.
- **The skill is the lowest-priority utility from build-plan task 3C.** When in doubt about scope, prefer the smaller surface — one resolved reference with a verbatim quote is the whole job.
