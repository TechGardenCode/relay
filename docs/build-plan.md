# Relay — Build Plan & Kickoff Prompts

**Status:** v0.1 (living)
**Scope:** Tracks the remaining work to finish the PRD, lay down architecture markdown, set up AI build infra, and start the MVP. Each task carries a ready-to-paste kickoff prompt for a fresh Claude Code session.

This file is an in-flight tracking artifact (peer of `open-questions.md`), not a spec. As tasks land, mark them done in the Sequencing table and let the corresponding deliverable in `docs/` or the repo be the authoritative output.

---

## Sequencing

Work fans out from a single decision (repo layout). Everything after the scaffold can run in parallel — only the dotted edges are hard dependencies.

```
                     2D repo layout
                           │
                           ▼
                  4A repo scaffold + CLAUDE.md
                  ┌────────┼────────┐
                  ▼        ▼        ▼
       3B scenario-runner  4B Phase 0 spike   (parallel architecture docs)
                                              ├─ 2A persona mechanism
                                              ├─ 2B WS message catalog
                                              ├─ 2C SQLite schema
                                              └─ 2E REST conventions

(late Phase 1, parallel)  1A persona content · 1B threat model · 1C README/deploy guide · 3C prd-link skill (optional)
```

| ID | Task | Blocks | Status |
|---|---|---|---|
| 2D | Repo layout & module boundaries | 4A | **done** → [`docs/arch/repo-layout.md`](arch/repo-layout.md) |
| 4A | Repo scaffold + CLAUDE.md | 3B, 4B, all Phase 1 build | pending |
| 3B | `scenario-runner` skill | — | pending |
| 4B | Phase 0 spike (cross-device PTY attach) | Phase 1 begins | pending |
| 2A | Persona-application mechanism | Phase 1 implementation | **done** → [`docs/arch/persona-application.md`](arch/persona-application.md) |
| 2B | WebSocket message catalog | Phase 1 implementation | **done** → [`docs/arch/ws-protocol.md`](arch/ws-protocol.md) |
| 2C | SQLite schema / migrations | Phase 1 implementation | **done** → [`docs/arch/sqlite-schema.md`](arch/sqlite-schema.md) |
| 2E | REST error response + verb conventions | Phase 1 implementation | **done** → [`docs/arch/rest-conventions.md`](arch/rest-conventions.md) |
| 1A | Default persona content (seven YAMLs) | Phase 1 ship | pending |
| 1B | Threat model one-pager | Phase 1 ship | pending |
| 1C | README + deployment guide | Phase 1 ship | pending |
| 3C | `prd-link` skill (optional) | — | pending |
| 3D | `ws-protocol-check` skill | — | pending (from 2D §11; needs 2B) |
| 3E | `persona-yaml-check` skill | — | pending (from 2D §11) |
| 3F | `sqlite-migration` skill | — | pending (from 2D §11; needs 2C) |
| 5A | `relay-architect` sub-agent | — | pending (from 2D §11; needs 4A) |
| 5B | `relay-test-author` sub-agent | — | pending (from 2D §11; needs 4A) |
| 5C | `relay-spec-reviewer` sub-agent | — | pending (from 2D §11; needs 4A) |
| 5D | Per-module `CLAUDE.md` (load-bearing modules) | — | pending (from 2D §11; needs 4A) |

---

## Track 2 — Architecture markdown (the PRD's deliberate punts)

### 2D. Repo layout & module boundaries — **done**

**Output:** [`docs/arch/repo-layout.md`](arch/repo-layout.md). Locks in monorepo with pnpm workspaces, internal module boundaries inside `packages/server/`, concrete tooling picks (Fastify, Zod, Vitest, better-sqlite3, lefthook, etc.), and AI-first development foundations (project skills, sub-agents, MCP at dev time, CLAUDE.md tiering, code-quality primitives). Surfaced follow-on tasks: **3D, 3E, 3F, 5A, 5B, 5C, 5D** (see Track 5 below).

---

### 2A. Persona-application mechanism — **done**

**Output:** [`docs/arch/persona-application.md`](arch/persona-application.md). Picks CLI flags as the primary mechanism (`--append-system-prompt`, `--model`, `--mcp-config --strict-mcp-config`, `--disable-slash-commands`) with a transient `~/.relay/sessions/<sid>/` directory for the filtered MCP config and spawn audit. Surfaced one sub-question — **ND-08 (proposed): skill subset enforcement mechanism** — for the decision log; non-empty `skills:` lists are advisory at MVP until that lands.

---

### 2B. WebSocket message catalog — **done**

**Output:** [`docs/arch/ws-protocol.md`](arch/ws-protocol.md). Splits the wire into binary frames for PTY bytes and text/JSON for control; commits the JSON shape for `claim`, `send` (single-frame, base64-encoded `data`), `release`, `hello`, `claim_ack`, `busy`, `claim_released`, `replay_start`/`replay_end`, `error`, `session_ended`, `auth_expired`. Bracketed replay framing preserves UX hooks at the replay/live boundary. Both state machines sketched (ASCII + transition tables) with four race cases called out. Versioning deferred — no `v` field in v1; `unknown_type` error provides graceful degradation for additive future changes. 3D (`ws-protocol-check` skill) is now unblocked.

---

### 2C. SQLite schema / migrations — **done**

**Output:** [`docs/arch/sqlite-schema.md`](arch/sqlite-schema.md). Locks in the DDL for `tenants`, `projects`, `sessions`, and `schema_versions` (all STRICT) per the PRD-named columns, picks **sidecar files** at `~/.relay/transcripts/<session-id>.bin` for transcript bytes (justified against append-only PTY workload, ND-04 byte-offset model, and the `~/.relay/` backup boundary), names the indexes and cascade rules (`projects.tenant_id` RESTRICT, `sessions.project_id` CASCADE per D-12), and commits to **raw SQL files + a `schema_versions` table** as migration tooling with filename convention `packages/server/src/store/migrations/NNNN_short_description.sql`. Documents the boot-time orphan sweep ([D-11](open-questions.md#d-11-server-restart-and-session-orphaning)) as part of the schema's runtime contract. Unblocks build-plan task 3F (the `sqlite-migration` skill scaffolds against this convention).

---

### 2E. REST error response shape + verb conventions — **done**

**Output:** [`docs/arch/rest-conventions.md`](arch/rest-conventions.md). Locks in **RFC 9457 problem-details** (`application/problem+json`) as the error envelope across all routes, the `400 vs 422 / 401 vs 403 / 404 vs 410 / 409` status-code matrix, **query-params-for-filtering** as the collection-subset rule (per D-11), **opaque cursor `{ items, nextCursor }`** as the list-pagination default with transcripts as the documented byte-offset exception (per ND-04), and **camelCase payload fields + lowercase snake_case enum/type/code values + ISO-8601 timestamps** as the naming rule (matches `ws-protocol.md` §1). Flags the one pre-existing PRD inconsistency: the `prd/03-server.md` §2 transcript example uses snake_case and needs to be aligned to camelCase at implementation time (propagation entry to be filed via the decision-log skill).

---

## Track 4 — AI build infra & repo bootstrap

### 4A. Repo scaffold + CLAUDE.md

**Goal:** create the working repo per the 2D layout decision, with a `CLAUDE.md` that orients agents at the PRD and decision-log.
**Output:** the repo itself (this very directory becomes a working project), plus `CLAUDE.md` at root.
**Done when:** `git init`, package manager bootstrapped, top-level CLAUDE.md present, lint/format/test commands runnable (even if test suite is empty).

```
Read docs/arch/repo-layout.md (output of task 2D) and docs/prd.md.

Set up the working repo:

1. Initialize git in /Users/kianalikhani/Development/Projects/relay if not
   already initialized. First commit should land the existing docs/ tree
   verbatim (it's the PRD; don't touch it).
2. Create the folder structure decided in docs/arch/repo-layout.md. Add
   package.json (or workspace root config), tsconfig, lint config, test
   runner config.
3. Add a top-level CLAUDE.md that:
   - Points new agents at docs/prd.md as the entry point
   - Names docs/open-questions.md as the decision log
   - Names docs/build-plan.md as the in-flight task tracker
   - Sets the convention: code comments that reference a non-obvious
     behavior cite the corresponding D-NN or ND-NN (e.g., "// Per ND-01,
     claim auto-releases after 30s of inactivity")
   - Notes the persona-application mechanism doc (docs/arch/persona-
     application.md) as load-bearing reading before touching session spawn
   - Lists the npm/pnpm script commands an agent can run
4. Add a stub README.md (just the project name + a pointer to docs/prd.md
   for now; full README is task 1C).
5. Verify the lint/format/test commands run cleanly against the empty
   scaffold.

Don't write product code yet — the goal is a runnable shell. The Phase 0
spike (task 4B) is the first product code.
```

---

### 3B. `scenario-runner` skill

**Goal:** a `.claude/skills/scenario-runner/` skill that knows about the eight Phase 1 acceptance scenarios (A–H) and can drive verification of any one of them.
**Output:** `.claude/skills/scenario-runner/SKILL.md` (and supporting scripts if useful).
**Done when:** invoking the skill with a scenario letter walks the verification steps described in `08-acceptance.md`.

```
Read docs/prd/08-acceptance.md (the eight scenarios A through H), and look
at .claude/skills/decision-log/SKILL.md as a reference for skill shape.

Create .claude/skills/scenario-runner/ with a SKILL.md frontmatter + body
that:

1. Triggers on: "run scenario X", "verify scenario X", "check Phase 1
   acceptance", or being passed a scenario letter A–H.
2. For each scenario A–H, encodes the verification steps from
   docs/prd/08-acceptance.md. Each step should be actionable: a CLI command
   to run, a REST call to make, a file to inspect, etc.
3. Reports per-step pass/fail/blocked.
4. References the underlying D-NN / ND-NN entries so a reader can trace
   "why this step exists" back to the PRD.

The skill is read-only against the running system — it verifies, it doesn't
modify state. It can spawn fresh sessions, attach, kill, but should not
mutate persona files or project records.

This skill should be useful from Phase 0 onward (scenarios D and E
specifically gate Phase 0 → Phase 1 transition per 07-phasing.md). Phase 0
won't have everything implemented; the skill should be graceful about
"not-yet-implemented" steps.

Out of scope: a CI-mode that runs all eight scenarios end-to-end in one
shot. That's a Phase 1 deliverable; the skill is the interactive primitive
it would be built on.
```

---

### 4B. Phase 0 spike

**Goal:** prove the architectural backbone works under the cross-device test, per `07-phasing.md` Phase 0.
**Output:** working spike code in the repo; a `docs/phase-0-report.md` summarizing what passed.
**Done when:** all six Phase 0 bullets in `07-phasing.md` pass — including the two-different-machines variant of multi-client attach, which is the load-bearing one.

```
Read docs/prd/07-phasing.md Phase 0 (six bullets), docs/prd/02-architecture.md
(architectural backbone), docs/prd/03-server.md §5 (the contracts the spike
needs to demonstrate the rough shape of). The 2A persona-application doc
should already exist but Phase 0 doesn't need persona logic — a bare
`claude` spawn is enough.

Build the Phase 0 spike:

1. A minimal `relay server` that spawns `claude` under node-pty on a
   POST /sessions request and exposes GET /sessions/:id/stream as a
   WebSocket. No persona handling, no SQLite required if you keep state
   in memory for the spike. Bearer-token check can be the same hardcoded
   token from a config file.
2. A minimal `relay attach <session-id>` that opens the WebSocket and
   proxies stdin/stdout. This is the thin client the IDE extension will
   later wrap.
3. Demonstrate the six Phase 0 bullets in 07-phasing.md, particularly:
   - Two clients attached from TWO DIFFERENT MACHINES, not just two
     terminals on one box. This is the load-bearing test — same-host
     multi-attach proves much less than cross-host.
   - Bidirectional input from either client (per-message claim lock can
     be a stub for Phase 0; 2B's full protocol lands in Phase 1).
   - Disconnect + reattach without losing state.
   - Server restart leaves session metadata recoverable; the agent
     process is acceptably killed (D-11 already commits to this).

4. Write docs/phase-0-report.md when the spike passes: what worked, what
   was deferred, what surprised you, what the Phase 1 work order should
   prioritize based on what you found.

The spike code can live under spike/ or similar — it's not Phase 1 code,
it's permission to start Phase 1. Don't over-engineer; this is a
weekend exercise per 07-phasing.md.
```

---

## Track 1 — PRD close-out (late Phase 1)

### 1A. Default persona content

**Goal:** author the seven default persona YAMLs (`product`, `design`, `dev`, `test`, `infra`, `architect`, `review`) shipping with `relay init`.
**Output:** seven `.yaml` files in the repo (path per 2D's layout, conventionally `packages/server/personas/defaults/*.yaml`).
**Done when:** each YAML validates against the D-09 schema and has a `systemPrompt` that's actually useful, not boilerplate.

```
Read docs/prd/09-persona-schema.md (the YAML schema, D-09) and
docs/prd/01-conceptual-model.md (the conceptual role each persona plays).

Author the seven default persona YAMLs that ship via `relay init`:

  product · design · dev · test · infra · architect · review

For each one:
1. Write a systemPrompt that's actually useful for that role context —
   2-6 paragraphs that frame the agent's mode of work, not a list of dos
   and don'ts.
2. Decide skills and mcpServers postures. Skills referenced should exist
   as installable defaults (or be flagged as "depends on user-installed
   skill X"). mcpServers similarly — many users won't have specific MCP
   servers configured, so the default postures should degrade gracefully
   when omitted.
3. Leave `model` unset unless there's a strong reason — let the agent
   CLI default apply.

Validate each YAML against the schema in 09-persona-schema.md before
considering it done. The schema's filename-equals-name rule matters here.

Place the files where 2D's layout decision says default-config goes —
they ship inside the npm package and get copied to ~/.relay/personas/
by `relay init`.

Out of scope: the persona authoring guide (separate Phase 1 deliverable;
defers until users have actually written a custom persona and surfaced
real friction).
```

---

### 1B. Threat model one-pager

**Goal:** name the security surface of a self-hosted single-user Relay deployment so users and contributors can reason about it.
**Output:** `docs/threat-model.md`
**Done when:** assets, actors, trust boundaries, and known mitigations / deferrals are enumerated in one short doc.

```
Read docs/prd/00-overview.md goal G-7 (network-local trust model, bearer-
token auth) and docs/prd/03-server.md §6 (auth) and D-13 (pairing UX).
The PRD is explicit that MVP is not enterprise-ready; this doc names what
that means concretely.

Write docs/threat-model.md as a short one-pager:

1. Assets being protected (transcripts, project source, model credentials,
   agent capability itself).
2. Actors: legitimate user across N devices, network-adjacent observer
   (LAN/Tailscale peer), opportunistic attacker if the user exposes the
   server publicly without a tunnel.
3. Trust boundaries: server process is trusted; the bearer token is the
   only secret; tokens are plaintext on the wire under bearer-auth, so
   TLS is the user's responsibility (covered by their tunnel choice).
4. Known mitigations: bearer token entropy (D-13), tokens hashed at rest
   (D-13), revocation via CLI, project marker is gitignored by default
   (D-G6).
5. Known deferrals: rotation (D-05), per-tenant credential isolation (D-10
   re-eval trigger), audit logging (Phase 4), RBAC (Phase 4).
6. User-facing guidance: when to put Relay behind Tailscale vs Caddy +
   TLS vs nothing.

Keep it to ~150 lines. This is to orient the user, not to satisfy a SOC2
auditor.
```

---

### 1C. README + deployment guide

**Goal:** the two top-level docs that a new user reads before installing.
**Output:** `README.md` at repo root (full version, replacing the 4A stub); `docs/deployment.md` with the npm and Docker walkthroughs.
**Done when:** a stranger can go from "I have Node 22 and an Anthropic key" to "scenario E works" by following the README + deployment guide.

```
Read docs/prd/00-overview.md (the value-prop framing), docs/prd/06-
distribution.md (packaging), docs/prd/08-acceptance.md scenario E (the
cross-device test the README should help a user reach), and docs/prd/07-
phasing.md (so scope is clearly Phase 1 features).

Write two docs:

1. README.md at the repo root, replacing the stub from 4A:
   - Value prop in 3-4 lines max — what Relay does, what it's not
   - Quick install (npm) and Docker one-liner
   - First-session walkthrough that lands at scenario E (start a session
     from one machine, attach from another)
   - Links to docs/prd.md for the spec, docs/deployment.md for ops, and
     docs/threat-model.md for the security posture
   - Phase status note ("Phase 1 / MVP — desktop only, no mobile yet")

2. docs/deployment.md:
   - Local mode (Node 22+, `npm install -g`, where state lives)
   - Docker (image tag, mount points for ~/.relay/ and project dirs,
     environment variables including ANTHROPIC_API_KEY per D-10)
   - Docker Compose example with Caddy + Tailscale sidecar (per 06-
     distribution.md)
   - Backup posture (just ~/.relay/ and ~/.claude/, per 06-distribution.md)
   - Pointer to docs/threat-model.md for the trust model

Both docs should be runnable — a reader who follows them should land at a
working session. If you find a gap between docs and reality, fix the docs
and note the gap; don't paper over.
```

---

### 3C. `prd-link` skill (optional)

**Goal:** a skill that resolves spec references (`D-NN`, `ND-NN`, `03-server.md §5.1`) to the exact source text, so PRs and code comments can be checked against the spec mechanically.
**Output:** `.claude/skills/prd-link/SKILL.md`
**Done when:** invoking the skill on a reference yields the cited text inline; broken references are flagged.

```
Read docs/open-questions.md (the D-NN / ND-NN format) and docs/prd.md (the
subdoc index). Look at .claude/skills/decision-log/SKILL.md as a shape
reference.

Create .claude/skills/prd-link/ that:

1. Triggers on patterns like "D-NN", "ND-NN", "<file>.md §N.N" in PRs,
   commit messages, or code comments.
2. Resolves the reference to the source text in docs/ and surfaces it
   inline.
3. Flags broken references (unknown ID, missing section, file moved).

This is the lowest-priority task — it's a nice-to-have for keeping code
comments honest as the spec evolves. Defer if anything else surfaces.
```

---

## Track 5 — Agent scaffolding (post-2D follow-ons)

These tasks were surfaced by 2D §11 (`docs/arch/repo-layout.md`). The skill tasks (3D-3F) depend on the arch doc they verify against; the sub-agent and per-module CLAUDE.md tasks (5A-5D) depend on 4A having created the `.claude/` and `packages/server/src/` directory shape.

### 3D. `ws-protocol-check` skill

**Goal:** verify a WS handler implementation matches the 2B message catalog. Catches drift between code and the CLAIM/SEND/RELEASE/BUSY frame contracts during implementation.
**Output:** `.claude/skills/ws-protocol-check/SKILL.md`
**Done when:** invoking the skill against a target file or diff flags any frame whose shape, name, or response code does not match the catalog from 2B. Blocked by 2B.

```
Read docs/arch/ws-protocol.md (output of 2B) and docs/prd/03-server.md §5.
Look at .claude/skills/decision-log/SKILL.md as a shape reference.

Create .claude/skills/ws-protocol-check/ that triggers on patterns like
"WS handler", "WebSocket frame", "CLAIM/SEND/RELEASE/BUSY" and checks a
target file or diff for:

1. All frame types in the catalog have handlers in the code
2. No frame types appear in code that aren't in the catalog
3. Auto-release timeout (ND-01) is configurable, not hardcoded
4. Universal-output rule (D-G3) holds — every attached client gets bytes
   regardless of claim state

Output per-violation citation back to the ws-protocol.md section that
defines the contract. Out of scope: REST endpoints.
```

---

### 3E. `persona-yaml-check` skill

**Goal:** validate a persona YAML against the D-09 schema with precise per-rule error reporting, used both during default-persona authoring (1A) and as a gate before checking in user-edited personas.
**Output:** `.claude/skills/persona-yaml-check/SKILL.md`
**Done when:** invoking the skill on a persona YAML reports pass with the resolved persona shape, or fail with the specific schema rule that broke.

```
Read docs/prd/09-persona-schema.md (the schema, D-09).

Create .claude/skills/persona-yaml-check/ that triggers on patterns like
"validate persona", "check this persona YAML" or being passed a YAML path.

For each candidate file, check in order:

1. Required fields (schemaVersion, name) present
2. schemaVersion is an integer the skill understands
3. name is kebab-case and matches the filename stem
4. Optional list fields (skills, mcpServers) are lists, not strings
5. Optional model is a string

Report per-rule pass/fail with a one-line citation back to
09-persona-schema.md. Out of scope: authoring persona content (1A).
```

---

### 3F. `sqlite-migration` skill

**Goal:** scaffold a new SQLite migration file following the 2C convention so contributors don't have to re-read 2C every time.
**Output:** `.claude/skills/sqlite-migration/SKILL.md`
**Done when:** invoking the skill with a short description creates a new migration file with the correct filename pattern and a starter template. Blocked by 2C.

```
Read docs/arch/sqlite-schema.md (output of 2C) for the migration filename
convention and the schema_version table contract.

Create .claude/skills/sqlite-migration/ that triggers on patterns like
"new migration", "add a migration for X" and:

1. Reads the next migration number from existing files
2. Writes a stub .sql file with the right filename pattern
3. Includes the schema_version INSERT/UPDATE the convention requires
4. Adds a one-line comment summarizing intent
5. Returns the path to the new file

Out of scope: writing the migration body itself — the skill scaffolds, the
contributor fills.
```

---

### 5A. `relay-architect` sub-agent

**Goal:** a read-only sub-agent that evaluates implementation plans for spec-fidelity before code is written.
**Output:** `.claude/agents/relay-architect.md`
**Done when:** invoking the sub-agent with a Plan-style proposal and the proposal's target subdoc(s) yields a fidelity report — which PRD claims hold, which the proposal contradicts, which it silently underspecifies.

```
Read docs/arch/repo-layout.md §9.2 (sub-agent role + tool posture) and
docs/prd.md.

Create .claude/agents/relay-architect.md with:

- name: relay-architect
- description: when to invoke (plan review, design questions, "is this
  consistent with the PRD")
- tools: read-only (Read, Glob, Grep, Explore)
- system prompt: positions the agent as a spec-fidelity reviewer that
  reads PRD subdocs first, names which D-NN / ND-NN entries are load-
  bearing for the question at hand, and reports per-claim pass/fail
  with citations

Out of scope: editing PRD or proposing implementation; this agent is
read-only.
```

---

### 5B. `relay-test-author` sub-agent

**Goal:** a sub-agent that authors Vitest specs for the three isolation targets (persona/transcript/pty) using shared fixtures.
**Output:** `.claude/agents/relay-test-author.md`
**Done when:** invoking the sub-agent with an implementation file and the target module's contract produces a Vitest spec that uses the shared fixture library and exercises both happy-path and every constraint named in the module's CLAUDE.md.

```
Read docs/arch/repo-layout.md §3 (module boundaries) and §9.5 (test-author
context: Vitest, fixtures, property-based tests via fast-check).

Create .claude/agents/relay-test-author.md with:

- name: relay-test-author
- description: when to invoke (writing tests for persona/transcript/pty,
  or any module whose CLAUDE.md names must-know constraints)
- tools: read + edit (Read, Glob, Grep, Edit, Write)
- system prompt: positions the agent as a test author that
  1) reads the module's CLAUDE.md and the module file under test,
  2) reuses fixtures from packages/server/test/fixtures/,
  3) covers happy-path + each constraint named in CLAUDE.md,
  4) uses fast-check for byte-range math (ND-04) where applicable

Out of scope: writing implementation; this agent writes tests only.
```

---

### 5C. `relay-spec-reviewer` sub-agent

**Goal:** a read-only sub-agent that surfaces D-NN / ND-NN drift in a branch diff — code that contradicts or silently ignores a resolved decision.
**Output:** `.claude/agents/relay-spec-reviewer.md`
**Done when:** invoking the sub-agent with a diff range produces a per-decision report: which decisions the diff respects, which it appears to violate, which it silently underspecifies. Used during PR review.

```
Read docs/arch/repo-layout.md §9.2, docs/open-questions.md (the decision
log), and docs/prd.md.

Create .claude/agents/relay-spec-reviewer.md with:

- name: relay-spec-reviewer
- description: when to invoke (PR review, branch-diff audit, "does this
  diff break any resolved decisions")
- tools: read-only (Read, Glob, Grep, Bash for `git diff`)
- system prompt: positions the agent as a drift detector that
  1) takes a diff range or branch name,
  2) extracts which subdocs / D-NN entries are touched,
  3) checks the diff against each touched decision,
  4) reports per-D-NN pass/fail with file:line citations

Out of scope: writing fixes; this agent reports only.
```

---

### 5D. Per-module `CLAUDE.md` (load-bearing modules)

**Goal:** author short CLAUDE.md files for the four load-bearing modules so agents don't re-derive constraints from first principles each session.
**Output:** four files at `packages/server/src/{persona,transcript,pty,store}/CLAUDE.md`, 20–50 lines each.
**Done when:** each file names what the module owns, what it does not own, its test-isolation approach, and one or two surprising constraints with citations to the relevant D-NN / ND-NN.

```
Read docs/arch/repo-layout.md §3 (module ownership tables) and §9.3
(CLAUDE.md tiering examples).

For each of persona/, transcript/, pty/, store/, author a CLAUDE.md
(20–50 lines) at packages/server/src/<module>/CLAUDE.md that covers:

1. What the module owns
2. What it does NOT own (the negation half is what prevents scope creep)
3. The test-isolation approach (in-memory SQLite, fixture YAML dirs, etc.)
4. One or two surprising constraints with D-NN citations

Examples from §9.3:
- transcript: "writes are append-only; never seek; offsets are byte counts
  from session start, never logical messages"
- pty: "this module does not know about sessions or WS; surfacing byte
  events + a kill handle is the whole contract"
- persona: "project file replaces tenant file by name. No per-field
  merging. The filename stem is canonical"

Out of scope: per-module CLAUDE.md for non-load-bearing modules (auth,
session, config, cli, attach, server/rest, server/ws). Add those later
only if re-derivation patterns emerge.
```

---

## How to use this file

1. Pick the next task from the **Sequencing** table (top of file). Start with `4A` (2D is done).
2. Open a fresh Claude Code session, paste the kickoff prompt for that task.
3. When the task lands:
   - Update the row's `Status` column to `done` and link the output artifact path
   - Replace the task's kickoff prompt with a 1–2 line completion pointer (the artifact is now authoritative; the prompt is historical churn)
   - If the task surfaced follow-on tasks, add them to the Sequencing table and write stub kickoff prompts in this file under the appropriate Track (or a new one). Note their source task in the description so future readers can trace why they exist.
4. If a task surfaces new sub-questions (vs. follow-on tasks), file them in `docs/open-questions.md` per the decision-log skill; don't grow this file with deliberation content.
