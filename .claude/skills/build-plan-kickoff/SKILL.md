---
name: build-plan-kickoff
description: Use when the next build-plan task needs a kickoff — phrases like "what's next", "kick off <task ID>", "draft a kickoff for <task ID>", "I finished <task ID>, set me up for the next one", "kick off <task ID> to disk", or a bare build-plan task ID handed over after a prior task lands. Writes the kickoff to docs/kickoffs/<ID>.md (a reviewable artifact), opens it with a re-read/freshness clause, and embeds a closeout Execution protocol the execution session must complete. Read-only against repo state apart from the one kickoff file it writes.
---

# Relay build-plan-kickoff skill

[`docs/build-plan.md`](../../../docs/build-plan.md) is the in-flight tracking artifact for Phase 1. Its Sequencing table lists every task with a `Status`, a `Blocks` chain, and (for Track 6+) a one-line stub of `Goal` / `Output` / `Done when` / `Reads` / `Feeders`. When a task lands, the next task needs a real kickoff prompt — one that has already done the boring upstream work of confirming dependencies are met, pulling the relevant arch-doc context, surfacing the Phase 0 surprises that constrain it, and assembling a decision cheatsheet. This skill does that walk and **persists the kickoff to disk** so it survives the generating session as a reviewable artifact.

The skill is **read-only against the repo state apart from the single kickoff file it writes.** It does not flip build-plan rows to `done`, does not install dependencies, does not write code, and does not invoke the kickoff it produces. Its one side effect is writing `docs/kickoffs/<ID>.md` (or, when the user asks to expand the stub, the build-plan row instead).

## What this skill does

The kickoff walk (resolve target → validate upstream → read context → pull surprises → build the decision cheatsheet → preflight → emit) is the long-standing five-step workflow. On top of it, this skill:

1. **Output → disk.** The kickoff is written to `docs/kickoffs/<ID>.md`; the console gets only the file path plus a one-line launch command. No full-text console dump.
2. **Re-read / freshness clause.** The emitted kickoff's _first_ instruction tells the executor to re-read every Required read and to treat the decision cheatsheet as a point-in-time snapshot to verify, not trust.
3. **Execution protocol (closeout).** The emitted kickoff carries a closeout checklist the execution session must complete before claiming done — the back-of-task discipline from [`CLAUDE.md`](../../../CLAUDE.md), phrased so the `superpowers:executing-plans` skill can drive it as TodoWrite items.

## When to invoke

Trigger phrases:

- "what's next?" / "I finished `<task ID>` — what's next?" — resolves the next `pending` row whose upstream chain is `done`.
- "kick off `<task ID>`" / "draft a kickoff for `<task ID>`" / "set me up for `<task ID>`" / "kick off `<task ID>` to disk".
- A bare build-plan task ID (`6A`, `7E`, `1A`, …) handed over in a context where a kickoff is implied.
- "expand the `<task ID>` stub" — same workflow, but the output is written back into the build-plan row instead of `docs/kickoffs/` (see the expand-the-stub alternative in Step 7).

If a task ID is supplied, use it verbatim. When triggered without one, read the Sequencing table and propose the first `pending` row whose entire upstream chain is `done`, and confirm before running the workflow.

## Inputs the skill reads first

Read these at the start of every invocation:

- [`docs/build-plan.md`](../../../docs/build-plan.md) — Sequencing table (top of file) for the target row's `Goal` / `Output` / `Done when` / `Reads` / `Feeders`, and for upstream `Status` confirmation. The body sections below the table carry the per-task stub.
- [`docs/history/phase-0-report.md`](../../../docs/history/phase-0-report.md) — "What surprised the spike" section. Each surprise is assigned to a task ID; the skill pulls every surprise that names the target task.
- [`../../../docs/decisions/index.md`](../../../docs/decisions/index.md) — anchor for the `D-NN` / `ND-NN` one-liner cheatsheet. Prefer the [`prd-link`](../prd-link/SKILL.md) skill for quotation; fall back to direct read.
- [`docs/arch/repo-layout.md`](../../../docs/arch/repo-layout.md) — §3 (module ownership) and §4 (inter-module flow) when the target is a Track 6 row, to validate the dependency chain and identify the module's place in the boot sequence.
- The target task's `Reads:` line — every PRD subdoc and arch doc named there. Open each before drafting.
- The per-module `CLAUDE.md` if the target touches a load-bearing module (`packages/server/src/{store, persona, pty, transcript}/CLAUDE.md`).

## Refusal conditions

Emit one consolidated diagnostic and stop. Do not produce a partial kickoff, and do not write a partial file to `docs/kickoffs/`.

| Condition                                                 | Diagnostic                                                                                                                                            |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Target task ID not in the Sequencing table                | `Unknown task <ID>. Sequencing table rows: <comma-separated list of IDs>.`                                                                            |
| An upstream task in the `Blocks` chain is still `pending` | `Cannot kick off <ID>: upstream <upstream-ID> is still pending. Resolve it first (see build-plan.md Sequencing table).`                               |
| Target task is already `done`                             | `Task <ID> is already done. Its artifact is at <artifact path from the Status column>. Run the skill against the next pending row instead.`           |
| A file named in the `Reads:` line does not exist on disk  | `Reads target missing: <path>. Either the build-plan row drifted or the doc was moved; update the row before kicking off.`                            |
| Cwd is not the Relay repo root                            | `Not in Relay repo root. Sentinel docs/build-plan.md is missing; cd to the repo before invoking.`                                                     |
| Two or more rows in Sequencing share the target ID        | `Sequencing table has duplicate <ID> rows at lines <N1>, <N2>. Fix the table before kicking off.`                                                     |
| `docs/kickoffs/<ID>.md` already exists                    | `A kickoff for <ID> already exists at docs/kickoffs/<ID>.md. Kickoffs are reviewable artifacts — confirm before I overwrite it.` (ask, don't clobber) |

Each refusal includes the exact path or line number that triggered it so the user can fix the underlying state.

## Workflow

Run these steps in order. A failure at any step short-circuits to the matching refusal. Steps 1–6 assemble the kickoff; Step 7 emits it to disk.

### Step 1 — Resolve target task

- If the user supplied a task ID, use it verbatim.
- Otherwise scan the Sequencing table for the first row whose `Status = pending` AND whose entire upstream chain (every ID in `Blocks` that points _to_ it) is `done`.
- Print the resolved ID + Goal to the user before continuing. The user can redirect at this point.

### Step 2 — Validate upstream `done`

For the target row, walk its `Blocks` chain _in reverse_ (find every row that lists the target in its `Blocks` column — those are the upstream feeders). For each upstream row:

- Confirm `Status = done`.
- If `pending` or missing, refuse per the table above.

Validation is structural (string match against the Sequencing table column), not semantic. The skill does not re-validate that a "done" artifact still meets its contract — that's [`relay-spec-reviewer`](../../agents/relay-spec-reviewer.md)'s job.

### Step 3 — Read required context

From the target row's `Reads:` line, open every path. For each:

- If the path resolves cleanly, hold it in context for Step 7.
- If the path 404s, refuse per the table above.

If the target row touches `packages/server/src/{store, persona, pty, transcript}/`, also read the matching per-module `CLAUDE.md`. The "Owns" / "Does NOT own" / "Test isolation" / "Surprising constraints" sections become drift dimensions in the kickoff's `Output structure` and `Verification` blocks.

### Step 4 — Pull Phase 0 surprises assigned to this task

Read the "What surprised the spike" section of [`docs/history/phase-0-report.md`](../../../docs/history/phase-0-report.md). For each surprise:

- If it names the target task ID explicitly (`Assigned to 6X` or similar), pull it verbatim.
- If it constrains the target task indirectly (e.g. 6A's `sessions` row shape constrained by 6E's boot-sweep writer-discipline), note the cross-reference rather than including the full bullet.

If no surprises name the target, the kickoff's `Phase 0 surprises that apply` section reads: `None directly assigned. <Optional one-line cross-reference if upstream/downstream surprises shape this task's contract.>`

### Step 5 — Build the D-NN / ND-NN cheatsheet

For every `D-NN` and `ND-NN` cited in the target row's `Reads:` line, the named PRD subdocs, the named arch docs, AND the per-module `CLAUDE.md` (if read in Step 3):

- Pull a one-line summary from [`../../../docs/decisions/index.md`](../../../docs/decisions/index.md). Prefer invoking the [`prd-link`](../prd-link/SKILL.md) skill for the lookup; fall back to direct read if `prd-link` is unavailable.
- Note `Status` (resolved / open / deferred). Open decisions get a one-line note on the implication.

Skip decisions cited only as background ("see also D-G1"); include only decisions the implementation must honor.

### Step 6 — Preflight check

Probe disk state for blockers the target task hits in its first hour:

- Module directory: does `packages/server/src/<module>/` exist? If only the `CLAUDE.md` stub is there, list the missing `index.ts` and any expected sub-directories named in the target row's `Output:` line.
- Required deps: scan `packages/server/package.json` (and `packages/protocol/package.json` where applicable) for dependencies the target needs. Common Phase 1 stack: `fastify`, `@fastify/websocket`, `better-sqlite3`, `node-pty`, `zod`, `supertest`, `fast-check`. Flag any that the target's named subdocs imply but the manifest lacks.
- Test fixtures: does `packages/server/test/fixtures/<area>/` exist? Required by [`relay-test-author`](../../agents/relay-test-author.md) — the sub-agent refuses to write specs without it.
- Sibling stubs: if the target touches `packages/protocol/`, does `packages/protocol/src/` have the expected source-of-truth files (`persona.ts`, `frames.ts`, `ws-frames.ts`)? Empty exports are fine; missing files are a preflight step.

Each missing item becomes a preflight bullet in the kickoff. If everything is present, the `Preflight` section reads: `None — every dependency, directory, and fixture this task needs is in place.`

### Step 7 — Emit the kickoff to disk

Assemble the kickoff using the [output template](#output-template), then **write it to `docs/kickoffs/<ID>.md`**:

- Create the `docs/kickoffs/` directory if it does not exist. It is a committed artifact tree (top-level under `docs/`, consistent with Relay's in-flight-doc convention — not gitignored). The written kickoffs are reviewable and live alongside the spec.
- If `docs/kickoffs/<ID>.md` already exists, **do not overwrite silently** — refuse per the table above and ask first.
- Stamp the kickoff with the date it was written (the freshness clause references it).

Then echo to the console **only two lines** — never the full kickoff text:

```
Wrote docs/kickoffs/<ID>.md
Launch a fresh session with:  claude "Execute the kickoff at docs/kickoffs/<ID>.md"
```

**Expand-the-stub alternative.** If the user asked to expand the build-plan row (e.g. "expand the `<ID>` stub" / "write this into the build-plan row") rather than produce a standalone kickoff, write the assembled kickoff into the target row's body section in [`docs/build-plan.md`](../../../docs/build-plan.md) instead, and skip the `docs/kickoffs/` file. Tell the user which row you updated.

## Output template

The emitted file follows this structure. The first block is mandatory and must come **before** Goal/Preflight.

````markdown
# Kickoff: {ID} — {Task title from Sequencing table}

_Written {date this kickoff was generated}. This kickoff is a point-in-time snapshot._

## ⚠️ Before you write any code (read this first)

1. **Re-read every file under [Required reads](#required-reads) now.** Do not rely on memory or on this kickoff's summaries — open the actual files.
2. **Treat the [D-NN / ND-NN cheatsheet](#d-nn--nd-nn-cheatsheet) as a snapshot captured on {date}, not as current truth.** Verify each cited decision is still `resolved` and unchanged using the [`prd-link`](../../.claude/skills/prd-link/SKILL.md) skill before you depend on it. Arch docs may have moved and decisions may have re-resolved since this was written.
3. **If more than a day has passed since {date}, regenerate this kickoff** (re-run `build-plan-kickoff`) rather than executing a stale one.

**Goal:** {one-line from build-plan row}

**Preflight** (resolve these before writing implementation code):

{If gaps found:}

1. {Missing dep — exact pnpm command, e.g. `pnpm -F @relay/relay add <pkg> <pkg>`}
2. {Missing module dir — exact path and the placeholder content to seed}
3. {Missing protocol schema — exact path and the source-of-truth comment to add}
4. {Missing test fixtures — exact path and the `.gitkeep` to drop}
5. {Workspace sanity — `pnpm typecheck && pnpm lint` after the above lands}

{If no gaps:} None — every dependency, directory, and fixture this task needs is in place.

## Required reads

(in this order)

- [{Subdoc / arch doc}]({relative path}) — {one-line on what part is load-bearing}
- {Per-module CLAUDE.md if applicable}

**Phase 0 surprises that apply:**

- {Verbatim bullet from phase-0-report.md} — see [`docs/history/phase-0-report.md`](../../docs/phase-0-report.md) for full context.

{Or: None directly assigned. <Cross-reference if applicable>.}

## D-NN / ND-NN cheatsheet

> Snapshot — verify each row with `prd-link` before relying on it.

| ID                | Status                 | Implication for this task                              |
| ----------------- | ---------------------- | ------------------------------------------------------ |
| [{D-NN}]({link})  | resolved               | {one-line}                                             |
| [{ND-NN}]({link}) | open / advisory at MVP | {one-line + note that runtime enforcement is deferred} |

**Done when** (from build-plan row): {existing line, with the unblocked scenario ID(s) called out}

**Output structure:**

```
packages/server/src/{module}/
├── {file1}.ts
├── {file2}.ts
└── {sub-dir}/
    └── {file}.{ext}
packages/server/src/{module}/{file1}.test.ts   # co-located per repo-layout.md §8
```

**Verification:**

- `pnpm test --filter @relay/relay {module}` — unit tests green.
- `pnpm typecheck` — no TS errors.
- {Manual smoke command if applicable, e.g. `relay --version` or `relay project list`.}
- {Per-module CLAUDE.md `5D-expand` follow-up: append any DDL/ring-buffer/composition gotchas surfaced.}
- {Scenario-runner letter if applicable: `pnpm exec scenario-runner A` or equivalent.}

## Execution protocol (closeout)

Drive these as TodoWrite items with the `superpowers:executing-plans` skill as the step-loop. **Do not claim this task is done until every box is checked.**

- [ ] **Re-read the Required reads** before writing code (per the freshness clause above).
- [ ] **Author specs via the `relay-test-author` sub-agent and gate on them** — the module's `CLAUDE.md` constraints are the test contract; honor the sub-agent's verification-gate contract (implementation isn't done until its specs pass).
- [ ] **Add `D-NN` / `ND-NN` citation comments** for any non-obvious behavior, per [`CLAUDE.md`](../../CLAUDE.md) → "Code-comment convention". If you introduce behavior that warrants a new decision, file it via the [`decision-log`](../../.claude/skills/decision-log/SKILL.md) skill _before_ writing the citation.
- [ ] **Run the Verification block above and confirm it is green** — `superpowers:verification-before-completion` discipline: evidence before assertions, no "done" claim on unrun or red checks.
- [ ] **Flip the build-plan row to `done`**, link the artifact, and replace this task's kickoff stub with a one-line pointer in [`docs/build-plan.md`](../../docs/build-plan.md) (per CLAUDE.md "How agents should work in this repo").
- [ ] **Hand the diff to the `relay-spec-reviewer` sub-agent** for a drift audit against resolved decisions and per-module constraints before merge.

## Feeders

(skills + sub-agents to invoke during the work)

- [`prd-link`](../../.claude/skills/prd-link/SKILL.md) — verify each cheatsheet citation is current.
- [`decision-log`](../../.claude/skills/decision-log/SKILL.md) — file any new decision a non-obvious behavior warrants.
- [`relay-test-author`](../../.claude/agents/relay-test-author.md) — author and gate the module's specs.
- [`relay-spec-reviewer`](../../.claude/agents/relay-spec-reviewer.md) — diff-time drift audit at closeout.
- {Any task-specific skill, e.g. `sqlite-migration`, `ws-protocol-check`, `scenario-runner`.}
````

> The relative-path prefixes in the template above (`../../`) assume the file lives at `docs/kickoffs/<ID>.md`. When you write the file, resolve every link relative to that location so it clicks through from the kickoff itself.

## Conventions worth restating

- **The skill writes exactly one file.** Its only side effect is `docs/kickoffs/<ID>.md` (or the build-plan row, in expand mode). It does not write code, mutate other rows, run tests, install deps, or invoke the kickoff.
- **Console output is two lines.** Path + launch one-liner. The full kickoff lives in the file, not the scrollback — that's the point of persisting it.
- **Citation discipline carries over.** Every `D-NN` / `ND-NN` in the cheatsheet links to its row in [`../../../docs/decisions/index.md`](../../../docs/decisions/index.md). Every arch doc reference resolves cleanly. The kickoff inherits the [`prd-link`](../prd-link/SKILL.md) contract — broken links are the skill author's bug.
- **Skill names are NOT markdown links.** When the emitted kickoff references a skill (`superpowers:executing-plans`, `relay-test-author`, `decision-log`, …) write it as a bare code span — `` `superpowers:executing-plans` `` — never as `[`superpowers:executing-plans`](executing-plans)`. There is no file at that relative target, so a link form emits a broken link. Only `D-NN`/arch-doc/source-file references that resolve to a real path get a `[…](…)` link.
- **Preflight is opportunistic, not exhaustive.** The skill probes the obvious blockers (missing deps, empty dirs, absent fixtures). A clean preflight is a green light to _start_, not a guarantee the task lands first try.
- **The kickoff is a snapshot — and it says so itself.** The "re-run if paused > a day" note is promoted into the emitted file's first instruction, so it survives independently of the generating session. Regenerate rather than execute stale.
- **Out-of-scope explicitly.** The skill does not: write code; flip [`docs/build-plan.md`](../../../docs/build-plan.md) rows to done; run tests; install dependencies; invoke `relay-architect` / `relay-test-author` / `relay-spec-reviewer`; or judge whether an upstream `done` artifact is _actually_ correct (that's `relay-spec-reviewer`'s job on diffs). Those belong to the execution session that runs the kickoff — and the kickoff's Execution-protocol checklist tells it to.

## Worked example (abbreviated)

User: "Kick off 6A to disk."

Skill walks:

1. **Resolve:** Target = `6A` (Status: pending). Goal: SQLite-backed repository + raw-SQL migration runner.
2. **Upstream check:** `4B` done, `3F` done, `5A` done. Green light.
3. **Required reads:** [`docs/arch/sqlite-schema.md`](../../../docs/arch/sqlite-schema.md), [`docs/prd/03-server.md §3`](../../../docs/prd/03-server.md), [`packages/server/src/store/CLAUDE.md`](../../../packages/server/src/store/CLAUDE.md). All resolve.
4. **Phase 0 surprises:** None directly assigned. Cross-reference: surprise #2 (shutdown race) constrains 6A's `sessions` column shape because 6E will UPDATE rows 6A defines. Note as cross-ref.
5. **Cheatsheet:** `D-11` (boot orphan sweep, resolved), `D-12` (cascade rules, resolved).
6. **Preflight:** five bullets — install deps, scaffold module dirs, seed protocol files, create fixtures, then `pnpm typecheck && pnpm lint`.
7. **Emit to disk:** check `docs/kickoffs/6A.md` does not already exist → write the assembled kickoff (opening with the freshness clause, closing with the Execution-protocol checklist) → echo:

   ```
   Wrote docs/kickoffs/6A.md
   Launch a fresh session with:  claude "Execute the kickoff at docs/kickoffs/6A.md"
   ```

The file is the deliverable. The user opens a fresh session against it; the executor re-reads, builds, and runs the closeout checklist before claiming done.
