---
name: build-plan-kickoff
description: Produce a ready-to-execute kickoff prompt for the next task in docs/build-plan.md by walking a fixed five-step workflow — validate upstream done, resolve required reads, pull Phase 0 surprises assigned to the task, build a D-NN/ND-NN cheatsheet, and emit a structured kickoff (goal + preflight + reads + surprises + cheatsheet + done-when + output structure + verification + feeders). Trigger when the user says "what's next", "kick off task X", "draft a kickoff for 6A/6B/...", "I finished 6A, set me up for the next one", or hands a bare build-plan task ID after a prior task lands. Read-only against the codebase; emits a prompt the user pastes into a fresh session or into the build-plan row itself.
---

# Relay build-plan-kickoff skill

[`docs/build-plan.md`](../../../docs/build-plan.md) is the in-flight tracking artifact for Phase 1. Its Sequencing table lists every task with a `Status`, a `Blocks` chain, and (for Track 6) a one-line stub of `Goal` / `Output` / `Done when` / `Reads` / `Feeders`. When a task lands, the next 6x task needs a real kickoff prompt — one that has already done the boring upstream work of confirming dependencies are met, pulling the relevant arch-doc context, surfacing the Phase 0 surprises that constrain it, and assembling a decision cheatsheet. This skill does that walk and produces the kickoff.

The skill is **read-only against the repo state.** It does not flip build-plan rows to `done`, does not install dependencies, does not write code, and does not invoke the kickoff it produces. Its single output is markdown text — a structured kickoff prompt the user (or a fresh agent session) can act on.

## When to invoke

Trigger phrases:

- "what's next?" / "I finished `<task ID>` — what's next?" — resolves the next `pending` row in the Sequencing table.
- "kick off `<task ID>`" / "draft a kickoff for `<task ID>`" / "set me up for `<task ID>`" — targets a specific task.
- A bare task ID (`6A`, `6E`, `6Z`, `1A`, etc.) in a context where a kickoff is implied.
- "expand the `<task ID>` stub" — same workflow, but the user intends to paste the output back into [`docs/build-plan.md`](../../../docs/build-plan.md) to replace the one-line stub.

When triggered without a task ID, read the Sequencing table and propose the first `pending` row whose entire upstream chain is `done`. Prompt the user to confirm before running the workflow.

## Inputs the skill reads first

Read these at the start of every invocation:

- [`docs/build-plan.md`](../../../docs/build-plan.md) — Sequencing table (top of file) for the target row's `Goal` / `Output` / `Done when` / `Reads` / `Feeders`, and for upstream `Status` confirmation. The body sections below the table carry the per-task stub.
- [`docs/phase-0-report.md`](../../../docs/phase-0-report.md) — "What surprised the spike" section. Each surprise is assigned to a 6x task ID; the skill pulls every surprise that names the target task.
- [`../../../docs/decisions/index.md`](../../../docs/decisions/index.md) — anchor for the `D-NN` / `ND-NN` one-liner cheatsheet. Prefer the `prd-link` skill for quotation; fall back to direct read.
- [`docs/arch/repo-layout.md`](../../../docs/arch/repo-layout.md) — §3 (module ownership) and §4 (inter-module flow) when the target is a Track 6 row, to validate the dependency chain and identify the module's place in the boot sequence.
- The target task's `Reads:` line — every PRD subdoc and arch doc named there. Open each before drafting.
- The per-module `CLAUDE.md` if the target touches a load-bearing module (`packages/server/src/{store, persona, pty, transcript}/CLAUDE.md`).

## Refusal conditions

Emit one consolidated diagnostic and stop. Do not produce a partial kickoff.

| Condition                                                 | Diagnostic                                                                                                                                  |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Target task ID not in the Sequencing table                | `Unknown task <ID>. Sequencing table rows: <comma-separated list of IDs>.`                                                                  |
| An upstream task in the `Blocks` chain is still `pending` | `Cannot kick off <ID>: upstream <upstream-ID> is still pending. Resolve it first (see build-plan.md Sequencing table).`                     |
| Target task is already `done`                             | `Task <ID> is already done. Its artifact is at <artifact path from the Status column>. Run the skill against the next pending row instead.` |
| A file named in the `Reads:` line does not exist on disk  | `Reads target missing: <path>. Either the build-plan row drifted or the doc was moved; update the row before kicking off.`                  |
| Cwd is not the Relay repo root                            | `Not in Relay repo root. Sentinel docs/build-plan.md is missing; cd to the repo before invoking.`                                           |
| Two or more rows in Sequencing share the target ID        | `Sequencing table has duplicate <ID> rows at lines <N1>, <N2>. Fix the table before kicking off.`                                           |

Each refusal includes the exact path or line number that triggered it so the user can fix the underlying state.

## Workflow

Run these steps in order. A failure at any step short-circuits to the matching refusal.

### Step 1 — Resolve target task

- If the user supplied a task ID, use it verbatim.
- Otherwise scan the Sequencing table for the first row whose `Status = pending` AND whose entire upstream chain (every ID in `Blocks` that points _to_ it) is `done`.
- Print the resolved ID + Goal to the user before continuing. The user can redirect at this point.

### Step 2 — Validate upstream `done`

For the target row, walk its `Blocks` chain _in reverse_ (i.e. find every row that lists the target in its `Blocks` column — those are the upstream feeders). For each upstream row:

- Confirm `Status = done`.
- If `pending` or missing, refuse per the table above.

Validation is structural (string match against the Sequencing table column), not semantic. The skill does not re-validate that an "done" artifact still meets its contract — that's [`relay-spec-reviewer`](../../agents/relay-spec-reviewer.md)'s job.

### Step 3 — Read required context

From the target row's `Reads:` line, open every path. For each:

- If the path resolves cleanly, hold it in context for Step 7.
- If the path 404s, refuse per the table above.

If the target row touches `packages/server/src/{store, persona, pty, transcript}/`, also read the matching per-module `CLAUDE.md`. The "Owns" / "Does NOT own" / "Test isolation" / "Surprising constraints" sections become drift dimensions in the kickoff's `Output structure` and `Verification` blocks.

### Step 4 — Pull Phase 0 surprises assigned to this task

Read the "What surprised the spike" section of [`docs/phase-0-report.md`](../../../docs/phase-0-report.md). For each surprise:

- If it names the target task ID explicitly (`Assigned to 6X` or similar), pull it verbatim.
- If it constrains the target task indirectly (e.g. 6A's `sessions` row shape constrained by 6E's boot-sweep writer-discipline), note the cross-reference rather than including the full bullet.

If no surprises name the target, the kickoff's `Phase 0 surprises that apply` section reads: `None directly assigned. <Optional one-line cross-reference if upstream/downstream surprises shape this task's contract.>`

### Step 5 — Build the D-NN / ND-NN cheatsheet

For every `D-NN` and `ND-NN` cited in the target row's `Reads:` line, the named PRD subdocs, the named arch docs, AND the per-module `CLAUDE.md` (if read in Step 3):

- Pull a one-line summary from [`../../../docs/decisions/index.md`](../../../docs/decisions/index.md). Prefer invoking the [`prd-link` skill](../prd-link/SKILL.md) for the lookup; fall back to direct read if `prd-link` is unavailable.
- Note `Status` (resolved / open / deferred). Open decisions get a one-line note on the implication.

Skip decisions cited only as background ("see also D-G1"); include only decisions the implementation must honor.

### Step 6 — Preflight check

Probe disk state for blockers the target task hits in its first hour:

- Module directory: does `packages/server/src/<module>/` exist? If only the `CLAUDE.md` stub is there, list the missing `index.ts` and any expected sub-directories named in the target row's `Output:` line.
- Required deps: scan `packages/server/package.json` (and `packages/protocol/package.json` where applicable) for dependencies the target needs. Common Phase 1 stack: `fastify`, `@fastify/websocket`, `better-sqlite3`, `node-pty`, `zod`, `supertest`, `fast-check`. Flag any that the target's named subdocs imply but the manifest lacks.
- Test fixtures: does `packages/server/test/fixtures/<area>/` exist? Required by [`relay-test-author`](../../agents/relay-test-author.md) — the sub-agent refuses to write specs without it.
- Sibling stubs: if the target touches `packages/protocol/`, does `packages/protocol/src/` have the expected source-of-truth files (`persona.ts`, `frames.ts`, `ws-frames.ts`)? Empty exports are fine; missing files are a preflight step.

Each missing item becomes a preflight bullet in the kickoff. If everything is present, the `Preflight` section reads: `None — every dependency, directory, and fixture this task needs is in place.`

### Step 7 — Emit the kickoff prompt

Assemble the structured kickoff using the template below. The kickoff is the skill's single output artifact — the user can paste it into a fresh Claude Code session as a starting prompt, or into the build-plan row to replace its one-line stub.

## Output template

```markdown
### {ID}. {Task title from Sequencing table}

**Goal:** {one-line from build-plan row}

**Preflight** (resolve these before writing implementation code):

{If gaps found:}

1. {Missing dep — exact pnpm command, e.g. `pnpm -F @relay/relay add <pkg> <pkg>`}
2. {Missing module dir — exact path and the placeholder content to seed}
3. {Missing protocol schema — exact path and the source-of-truth comment to add}
4. {Missing test fixtures — exact path and the `.gitkeep` to drop}
5. {Workspace sanity — `pnpm typecheck && pnpm lint` after the above lands}

{If no gaps:} None — every dependency, directory, and fixture this task needs is in place.

**Required reads** (in this order):

- [{Subdoc / arch doc}]({relative path}) — {one-line on what part is load-bearing}
- {Per-module CLAUDE.md if applicable}

**Phase 0 surprises that apply:**

- {Verbatim bullet from phase-0-report.md} — see [`docs/phase-0-report.md`](../../../docs/phase-0-report.md) for full context.

{Or: None directly assigned. <Cross-reference if applicable>.}

**D-NN / ND-NN cheatsheet:**

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
packages/server/src/{module}/{file1}.test.ts # co-located per repo-layout.md §8

```

**Verification:**
- `pnpm test --filter @relay/relay {module}` — unit tests green.
- `pnpm typecheck` — no TS errors.
- {Manual smoke command if applicable, e.g. `relay --version` or `relay project list`.}
- {Per-module CLAUDE.md `5D-expand` follow-up: append any DDL/ring-buffer/composition gotchas surfaced.}
- {Scenario-runner letter if applicable: `pnpm exec scenario-runner A` or equivalent.}

**Feeders** (skills + sub-agents to invoke during the work):
- [`{skill}`](../../../.claude/skills/{skill}/SKILL.md) — {what it does for this task}
- [`{sub-agent}`](../../../.claude/agents/{agent}.md) — {when to invoke during the work}
```

## Conventions worth restating

- **The skill produces text, not actions.** Output is the kickoff prompt and nothing else. The user (or the agent who runs the kickoff) installs deps, scaffolds dirs, and writes code.
- **Citation discipline carries over.** Every `D-NN` / `ND-NN` in the cheatsheet links to its row in [`../../../docs/decisions/index.md`](../../../docs/decisions/index.md). Every arch doc reference resolves cleanly. The kickoff inherits the [`prd-link` skill](../prd-link/SKILL.md)'s contract — broken links are the skill author's bug, not the kickoff consumer's problem.
- **Preflight is opportunistic, not exhaustive.** The skill probes the obvious blockers (missing deps, empty dirs, absent fixtures). It does not run the migration runner, validate Zod schemas, or invoke the Vitest suite. A clean preflight is a green light to _start_, not a guarantee the task will land first try.
- **Out-of-scope explicitly.** The skill does not: write code; mutate [`docs/build-plan.md`](../../../docs/build-plan.md); run tests; install dependencies; invoke `relay-architect` / `relay-test-author` / `relay-spec-reviewer`; or judge whether an upstream `done` artifact is _actually_ correct (that's `relay-spec-reviewer`'s job on diffs).
- **The kickoff is a snapshot.** Re-run the skill if the user pauses work for more than a day — arch docs may have moved, decisions may have resolved, dependencies may have shifted. A stale kickoff is worse than a fresh one.

## Worked example (abbreviated)

User: "I finished Track 5. Kick off 6A."

Skill walks:

1. **Resolve:** Target = `6A` (Status: pending). Goal: SQLite-backed repository + raw-SQL migration runner.
2. **Upstream check:** `4B` done (Phase 0 spike), `3F` done (`sqlite-migration` skill), `5A` done (`relay-architect`). Green light.
3. **Required reads:** [`docs/arch/sqlite-schema.md`](../../../docs/arch/sqlite-schema.md), [`docs/prd/03-server.md §3`](../../../docs/prd/03-server.md), [`packages/server/src/store/CLAUDE.md`](../../../packages/server/src/store/CLAUDE.md). All resolve.
4. **Phase 0 surprises:** None directly assigned to 6A. Cross-reference: surprise #2 (shutdown race writing wrong `terminated_reason`) constrains 6A's `sessions` column shape because 6E will UPDATE rows 6A defines. Note as cross-ref, not as 6A's responsibility.
5. **Cheatsheet:** `D-11` (boot orphan sweep — 6A defines column, 6E executes the sweep, resolved), `D-12` (cascade rules: `projects.tenant_id` RESTRICT, `sessions.project_id` CASCADE, resolved).
6. **Preflight:** `packages/server/src/store/` has the CLAUDE.md stub but no `index.ts`. `packages/server/package.json` is missing `better-sqlite3`, `fastify`, `zod`, etc. Five preflight bullets — install deps, scaffold six missing module dirs, seed three `packages/protocol/src/*.ts` files, create `packages/server/test/fixtures/{personas, migrations}/`, then `pnpm typecheck && pnpm lint`.
7. **Emit kickoff** following the template above.

The kickoff is the deliverable. The user pastes it forward.
