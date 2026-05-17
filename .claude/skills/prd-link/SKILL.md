---
name: prd-link
description: Resolve and verify Relay spec citations (D-NN, ND-NN, <subdoc>.md §N.N, [[kebab-slug]]) against docs/open-questions.md and docs/prd/. Quote the referenced source inline so a reader can see what a code comment, PR description, or commit message actually points at. Flag broken references — unknown IDs, missing sections, moved files, renamed anchors — with a precise reason. Trigger when the user asks to resolve, expand, look up, or audit a D-NN/ND-NN/§N.N citation, or pastes a block of text containing such references.
---

# Relay prd-link skill

Code comments, PR descriptions, and commit messages in this repo cite `D-NN` / `ND-NN` decisions and `<subdoc>.md §N.N` spec sections — the CLAUDE.md citation convention requires it for non-obvious behavior. This skill turns those citations from opaque tokens into quoted source text, and flags the ones that no longer resolve as the spec evolves.

The skill is **read-only**: it opens [`docs/open-questions.md`](../../../docs/open-questions.md) and the [`docs/prd/`](../../../docs/prd/) subdocs to extract source text, but never edits them. If a reference is broken, the skill reports the failure — the user decides whether to update the citation in the code or fix the spec.

Two authoritative sources:

- **Decisions** — [`docs/open-questions.md`](../../../docs/open-questions.md). Every `D-NN` and `ND-NN` ID lives here as a `## D-NN: Title` heading.
- **Subdoc sections** — `docs/prd/00-overview.md` … `docs/prd/09-persona-schema.md`. Each subdoc uses numbered headings (`## 1. Foo`, `### 5.1 Bar`); `§N` or `§N.N` in a citation maps directly to the heading whose text begins with that number.

## When to invoke

Trigger phrases:

- "resolve `D-NN`" / "what does `D-NN` say" / "expand `D-NN`" / "look up `ND-NN`"
- "resolve `prd/03-server.md §5.1`" / "what's in `§5.1`"
- "audit citations in this PR" / "check the refs in this commit message" / "audit this block"
- A bare `D-NN`, `ND-NN`, or `[[kebab-slug]]` token in a context where resolution is implied.

If invoked without an input, prompt the user for the reference or block to resolve. Don't guess.

## Inputs the skill reads first

- [`docs/open-questions.md`](../../../docs/open-questions.md) — D-NN/ND-NN anchor source. Heading shape `## D-NN: Title`; status/affects block immediately below; `### Resolution` (for resolved) or `### Question` (for open/deferred) carries the load-bearing prose.
- [`docs/prd.md`](../../../docs/prd.md) — subdoc index. Use it to confirm a cited path is a known subdoc rather than a renamed file.
- The cited subdoc(s) — opened only when a `§N.N` reference is being resolved.

## Reference grammar

The patterns the skill recognizes, with verbatim shapes from the repo:

| Pattern                            | Example                                      | Resolves to                                                                                    |
| ---------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `D-NN` or `D-GN`                   | `D-G1`, `D-01`, `D-13`                       | `docs/open-questions.md` heading `## D-G1: Persona application semantics`                      |
| `ND-NN`                            | `ND-03`, `ND-08`                             | `docs/open-questions.md` heading `## ND-08: …`                                                 |
| `[[kebab-slug]]`                   | `[[d-g1-persona-application-semantics]]`     | Same file; slug matches the GitHub heading anchor without the leading `#`                      |
| `<path>.md §N` / `§N.N`            | `prd/03-server.md §5.1` (backticks optional) | Heading in `<path>.md` whose text starts with `N.` or `N.N`                                    |
| `[D-NN](open-questions.md#anchor)` | `[D-13](open-questions.md#d-13)`             | Same as `D-NN`; skill verifies the anchor exists but treats the link as already self-resolving |

A bare `D-` or `ND-` with no number is `malformed`, not a match. A subdoc citation must include `§` — `prd/03-server.md` alone is a file reference, not a section reference, and the skill will report `section_missing` if a verdict is required.

## Resolution rules

- **D-NN / ND-NN.** Open `docs/open-questions.md`. Locate the heading `## <ID>:` exactly. Capture the body up to the next `## ` heading. Extract `**Status:**`, `**Affects:**`, and the `### Resolution` body (or `### Question` if status is `open` or `deferred`). The captured Resolution is what gets quoted; Status and Affects are surfaced as header fields.

- **`<path>.md §N` or `§N.N`.** Open the file at the repo-relative path (`docs/` is implied when the path begins with `prd/` or `arch/`). Locate a heading whose text starts with the section number followed by a period or whitespace (`## 3. State`, `### 5.1 Input arbitration`). Capture the body up to the next heading of equal or higher level. If two headings start with the same number, emit `ambiguous_section`.

- **`[[kebab-slug]]`.** Treat as a D-NN/ND-NN anchor lookup. Find the heading in `docs/open-questions.md` whose slug (lowercase, non-word chars → `-`, runs collapsed) matches the bracketed string. Then resolve as a D-NN/ND-NN.

- **Already-formed markdown link `[label](path#anchor)`.** Open the target file; verify the heading slug exists. If yes, emit `resolved` with no quote (the link is already self-explanatory). If no, emit `anchor_missing`.

## Broken-reference taxonomy

Every non-`resolved` verdict names exactly one reason:

| Reason              | Means                                                                                                 |
| ------------------- | ----------------------------------------------------------------------------------------------------- |
| `unknown_id`        | `D-NN`/`ND-NN` not present in `docs/open-questions.md`                                                |
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

When a reference resolves but its anchor text has drifted from what the citation seems to expect (e.g., the comment says `§5.1 input arbitration` and the heading now reads `### 5.1 Claim arbitration`), include both in the `Source:` line and let the reader judge — don't downgrade to `broken`, but don't silently paper over the drift either.

## Conventions worth restating

- **Read-only.** The skill never edits `docs/open-questions.md`, `docs/prd/*`, the build-plan, or any source it cites. The only mutation surface is the message it returns.
- **Quote sparingly.** ~12 lines max per reference keeps batch output scannable. On truncation, include the heading + first paragraph + `…`, not a tail-truncated dump.
- **Quote verbatim; don't paraphrase.** Paraphrasing is what code comments already do — this skill exists so a reader can compare the comment against the source without re-reading the spec themselves.
- **Surface drift, don't fix it.** If the citation looks legitimate but the heading text has changed, report both — never silently rewrite the citation in the user's code.
- **Defer to `decision-log` for new IDs.** If an audit surfaces a citation that should exist but doesn't (e.g., a code comment introduces `D-15` and the decision log only goes to `D-13`), point the user at the [`decision-log`](../decision-log/SKILL.md) skill to file the entry. Don't auto-create.
- **The skill is the lowest-priority utility from build-plan task 3C.** When in doubt about scope, prefer the smaller surface — one resolved reference with a verbatim quote is the whole job.
