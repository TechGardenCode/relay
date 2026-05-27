---
name: re-orient
description: Reconstruct a Relay re-entry briefing after a break — restate the mission and current phase from docs/prd, surface recent git activity and any interrupted or parallel work, summarize build-plan task state (last shipped, in-flight, next unblocked), and digest the decision log (recently resolved, open decisions blocking active tracks, pending propagations). Read-only; ends by naming which existing skill to invoke next (build-plan-kickoff / decision-log / scenario-runner) with bare invocations and a one-line why. Trigger on "where were we", "catch me up", "re-orient", "what's the state", "I've been away", "/re-orient", or the start of a session after a gap. Does NOT draft kickoff prompts itself — that is build-plan-kickoff.
---

# Relay re-orient skill

Returning to Relay after a break is where context decays: you forget what shipped last, why it's being built, what the current phase gate is, and what is genuinely in-flight versus finished. Acting before re-grounding is how a session drifts into vibe-coding. Relay already records its state durably — the build-plan table, the decision index, the PRD, and git — so this skill aggregates those four sources into one scannable briefing and points at the right next move.

This skill **orients, then hands off**. It reconstructs context and detects in-flight work, then names which existing skill to run next ([`build-plan-kickoff`](../build-plan-kickoff/SKILL.md), [`decision-log`](../decision-log/SKILL.md), [`scenario-runner`](../scenario-runner/SKILL.md)) with a bare invocation and a one-line why. It does **not** draft the next-task kickoff prompt itself — that is `build-plan-kickoff`'s job, and duplicating it would only drift out of sync.

## When to invoke

Trigger phrases:

- "where were we", "catch me up", "what's the state", "I've been away", "pick up where we left off"
- "re-orient" / `/re-orient`
- The first message of a session that opens after a gap

Takes no arguments. Read-only and side-effect-free, so it is always safe to run — including mid-session as a quick status check.

## Inputs the skill reads first

- [`docs/prd/00-overview.md`](../../../docs/prd/00-overview.md) — the mission / value prop (the "why").
- [`docs/prd/07-phasing.md`](../../../docs/prd/07-phasing.md) — phases and their gates; tells you which gate is active.
- [`docs/build-plan.md`](../../../docs/build-plan.md) — the Sequencing table (`| ID | Task | Blocks | Status |`), the in-flight tracker.
- [`docs/decisions/index.md`](../../../docs/decisions/index.md) — `Resolved / Open / Deferred` counts and the per-section decision lists.
- Git, read-only: `git log --oneline -20`, `git status -s`, `git stash list`, `git worktree list`, `git branch -a`.

Read all five before emitting anything — the briefing is an aggregation, not a stream.

## Workflow

### Step 1 — Anchor the why

From `00-overview.md` and `07-phasing.md`, state in 2–3 lines what Relay is and which phase/gate is currently active. Name the gate by its build-plan ID and any decision that re-scoped it (e.g. "Phase 1, acceptance gate at **6Z**, re-scoped to scenarios A–G per [[d-16-phase-1-ships-without-distribution]]; Track 7 gates wider rollout"). This is the line that stops a returning session from re-deriving the strategy from code.

### Step 2 — Read git signals

Newest commits are what changed last — surface 3–5. Then **explicitly** flag interrupted or parallel work, because a clean tree and a dirty tree demand different next moves:

- `git status -s` — uncommitted changes = work in progress that was never landed.
- `git stash list` — stashes = parked work that is easy to forget exists.
- `git worktree list` + `git branch -a` — extra worktrees or feature branches.

Per [[parallel-session-worktree-safety]], treat any secondary worktree or live feature branch as **possibly an active concurrent session**, not abandoned work. Surface it as such and never recommend committing, pushing, stashing, or deleting in it. If the tree is clean with no stashes and only the primary worktree on the main branch, say so plainly ("working tree clean, no parked work") — that is a real and useful signal.

### Step 3 — Build-plan state

Parse the Sequencing table. The Status column vocabulary:

- `**done** → <artifact>` — shipped; the linked deliverable is authoritative.
- `pending → …` or `pending (needs X, Y)` — not started; the parenthetical names blockers.
- `in progress` — live work.
- `deferred → [Track N]` — parked to a later phase.

Extract and report:

- **Last shipped** — the most recently completed task (cross-reference the newest `done` work against the git log date).
- **In flight** — every `in progress` row, plus `pending` rows whose blockers are all `done` (the _next unblocked_ tasks). Distinguish "actively in progress" from "ready to start."
- **Parked** — `deferred` rows, named briefly so they are not mistaken for forgotten work.

### Step 4 — Decision state

From `index.md`:

- Report the `Resolved / Open / Deferred` counts verbatim.
- List the latest ~5 resolved entries with their `resolved-on` dates — this reads as recent velocity and shows what direction decisions have been moving.
- List open `ND-NN` / `D-NN` entries that block an active track (cross-reference the build-plan `pending (needs …)` rows — e.g. an open ND that a pending task depends on).
- Flag any resolved entry whose body still marks propagation as `*(pending …)*` — resolved-but-not-yet-propagated is silent debt.

If verifying a specific decision's status or propagation, defer to [`prd-link`](../prd-link/SKILL.md) rather than re-reading the full file here.

### Step 5 — Synthesize and hand off

Assemble the briefing in the format below, then end with a short **Do this next** list. Each item names a bare skill invocation and a one-line why — derived from Steps 3–4, not invented:

- Next unblocked or in-progress task → `/build-plan-kickoff` (let it draft the actual prompt).
- An open decision blocking an active track → `/decision-log`.
- Sitting at an acceptance/rollout gate → `/scenario-runner <letter>`.

Do not draft the kickoff content here. Recommend at most the top 3 moves, most-leveraged first.

## Output format

```
## Where we are
Mission: <1 line>   ·   Phase: <current phase + active gate + re-scoping decision>

## Since you were away
Last shipped: <task ID> — <artifact> (<date / commit>)
Recent commits:
  - <hash> <subject>
  - …
⚠ Interrupted / parallel work: <uncommitted | stash | worktree | branch — or "none, tree clean">

## In flight
- <task ID> — in progress — <one-line state>
- <task ID> — ready (unblocked) — <next dep, if any>
Parked: <deferred task IDs → track>
Open decisions blocking active work: <ND-NN list — or "none">
Pending propagations: <resolved-but-unpropagated D-NN/ND-NN — or "none">

## Do this next
1. `/build-plan-kickoff`      → <task ID>: <why>
2. `/decision-log`            → <ND-NN>: <why>      (only if a decision blocks)
3. `/scenario-runner <X>`     → <why>               (only if at an acceptance gate)
```

Keep it scannable — this is a briefing, not a report. Trim any section that is genuinely empty rather than padding it.

## Conventions worth restating

- **Read-only.** Reads docs and git; writes nothing and mutates no records. `git status` is unchanged after a run.
- **Orient, don't execute.** Name the next skill and the why; never draft its output or start the work. Drafting the next-task prompt is `build-plan-kickoff`, not this skill.
- **Cite state, don't infer it.** Every claim traces to a build-plan row, an `index.md` line, or a git command — quote the IDs, dates, and counts; never guess at progress.
- **Respect parallel sessions.** A secondary worktree or live feature branch may be a concurrent session — surface it as possibly-active, never as stale, and never recommend mutating it (per [[parallel-session-worktree-safety]]).
- **Degrade, don't fabricate.** If a doc or section is missing, print "not found" for that line and continue; a partial briefing beats an invented one.
