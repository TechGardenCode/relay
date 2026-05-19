# Relay — Build Plan & Kickoff Prompts

**Status:** v0.1 (living)
**Scope:** Tracks the remaining work to finish the PRD, lay down architecture markdown, set up AI build infra, and start the MVP. Each task carries a ready-to-paste kickoff prompt for a fresh Claude Code session.

This file is an in-flight tracking artifact (peer of `open-questions.md`), not a spec. As tasks land, mark them done in the Sequencing table and let the corresponding deliverable in `docs/` or the repo be the authoritative output.

---

## Sequencing

Work fans out from a single decision (repo layout). Everything after the scaffold can run in parallel — only the dotted edges are hard dependencies.

```
                     2D repo layout (done)
                           │
                           ▼
                  4A repo scaffold + CLAUDE.md (done)
                  ┌────────┼────────┐
                  ▼        ▼        ▼
       3B scenario-runner   4B Phase 0 spike   (parallel architecture docs — all done)
       (done)                    │             ├─ 2A persona mechanism
                                 │             ├─ 2B WS message catalog
                                 │             ├─ 2C SQLite schema
                                 │             └─ 2E REST conventions
                                 ▼
                  ── Track 6: Phase 1 implementation ──
                ┌──────────┬───────────┬───────────────┐
                ▼          ▼           ▼               ▼
              6A store   6B auth   6C persona     6D pty+transcript
                └──────────┴───────────┼───────────────┘
                                       ▼
                                   6E session
                                       │
                              ┌────────┴────────┐
                              ▼                 ▼
                         6F server/rest    6G server/ws
                              └────────┬────────┘
                                       ▼
                               6H cli + attach
                                       ▼
                                  6I extension
                                       ▼
                                 6J distribution
                                       ▼
                            6Z Phase 1 done gate

Feeders:   3F → 6A · 3E → 6C · 3D → 6G · 5D-stubs → 5A/5B/5C · 5A → 6A onward · 5B → 6D · 5D-expand folded into 6A/6C/6D
Track 1:   1A pairs with 6C · 1B pairs with 6B · 1C landed early · 3C optional (done)
```

| ID | Task | Blocks | Status |
|---|---|---|---|
| 2D | Repo layout & module boundaries | 4A | **done** → [`docs/arch/repo-layout.md`](arch/repo-layout.md) |
| 4A | Repo scaffold + CLAUDE.md | 3B, 4B, all Phase 1 build | **done** → [`CLAUDE.md`](../CLAUDE.md) |
| 3B | `scenario-runner` skill | — | **done** → [`.claude/skills/scenario-runner/SKILL.md`](../.claude/skills/scenario-runner/SKILL.md) |
| 4B | Phase 0 spike (cross-device PTY attach) | Phase 1 begins | **done** → [`spike/`](../spike/) · [`docs/phase-0-report.md`](phase-0-report.md) |
| 2A | Persona-application mechanism | Phase 1 implementation | **done** → [`docs/arch/persona-application.md`](arch/persona-application.md) |
| 2B | WebSocket message catalog | Phase 1 implementation | **done** → [`docs/arch/ws-protocol.md`](arch/ws-protocol.md) |
| 2C | SQLite schema / migrations | Phase 1 implementation | **done** → [`docs/arch/sqlite-schema.md`](arch/sqlite-schema.md) |
| 2E | REST error response + verb conventions | Phase 1 implementation | **done** → [`docs/arch/rest-conventions.md`](arch/rest-conventions.md) |
| 1A | Default persona content (seven YAMLs) | 6C, 6Z | **done** → [`packages/server/personas/defaults/`](../packages/server/personas/defaults/) |
| 1B | Threat model one-pager | 6Z | **done** → [`docs/threat-model.md`](threat-model.md) |
| 1C | README + deployment guide | 6Z | **done** → [`README.md`](../README.md) · [`docs/deployment.md`](deployment.md) |
| 3C | `prd-link` skill (optional) | — | **done** → [`.claude/skills/prd-link/SKILL.md`](../.claude/skills/prd-link/SKILL.md) |
| 3D | `ws-protocol-check` skill | 6G | **done** → [`.claude/skills/ws-protocol-check/SKILL.md`](../.claude/skills/ws-protocol-check/SKILL.md) |
| 3E | `persona-yaml-check` skill | 6C, 1A | **done** → [`.claude/skills/persona-yaml-check/SKILL.md`](../.claude/skills/persona-yaml-check/SKILL.md) |
| 3F | `sqlite-migration` skill | 6A | **done** → [`.claude/skills/sqlite-migration/SKILL.md`](../.claude/skills/sqlite-migration/SKILL.md) |
| 5D-stubs | Per-module `CLAUDE.md` stubs + root index | 5A, 5B, 5C | **done** → [`packages/server/src/{store,persona,pty,transcript}/CLAUDE.md`](../packages/server/src/) · root index in [`CLAUDE.md`](../CLAUDE.md) |
| 5A | `relay-architect` sub-agent | 6A onward | **done** → [`.claude/agents/relay-architect.md`](../.claude/agents/relay-architect.md) |
| 5B | `relay-test-author` sub-agent | 6D | **done** → [`.claude/agents/relay-test-author.md`](../.claude/agents/relay-test-author.md) |
| 5C | `relay-spec-reviewer` sub-agent | PR review | **done** → [`.claude/agents/relay-spec-reviewer.md`](../.claude/agents/relay-spec-reviewer.md) |
| 5D-expand | Per-module `CLAUDE.md` body fill | (folded into 6A/6C/6D) | tracked inside each 6x Done-when |
| 6A | `store/` module + migrations runner | 6E, 6F, scenario A | **done** → [`packages/server/src/store/`](../packages/server/src/store/) |
| 6B | `auth/` module + token CLI subcommands | 6F, scenario A | **done** → [`packages/server/src/auth/`](../packages/server/src/auth/) · [`packages/server/src/cli/`](../packages/server/src/cli/) |
| 6C | `persona/` module + composition rule | 6E, 6F, scenario B | **done** → [`packages/server/src/persona/`](../packages/server/src/persona/) · [`packages/protocol/src/persona.ts`](../packages/protocol/src/persona.ts) |
| 6D | `pty/` + `transcript/` modules (paired) | 6E, 6G, scenarios C/D | **done** → [`packages/server/src/pty/`](../packages/server/src/pty/) · [`packages/server/src/transcript/`](../packages/server/src/transcript/) |
| 6E | `session/` orchestrator + boot orphan sweep | 6F, 6G, scenarios C/D/G | **done** → [`packages/server/src/session/`](../packages/server/src/session/) |
| 6F | `server/rest/` routes + Zod validation | 6H, scenarios A/B/C/G | **done** → [`packages/server/src/server/`](../packages/server/src/server/) · [`packages/protocol/src/rest/`](../packages/protocol/src/rest/) · [`packages/protocol/src/problem-details.ts`](../packages/protocol/src/problem-details.ts) |
| 6G | `server/ws/` handler + claim-lock state machine | 6H, scenarios D/E/F | **done** → [`packages/server/src/server/ws/`](../packages/server/src/server/ws/) |
| 6H | `cli/` subcommands + `attach/` thin client | 6I, 6K, scenarios C/D/E | **done** → [`packages/server/src/cli/`](../packages/server/src/cli/) · [`packages/server/src/attach/`](../packages/server/src/attach/) |
| 6K | PTY size negotiation + SIGWINCH ([ND-23](../open-questions.md#nd-23-pty-size-negotiation-and-sigwinch-forwarding-for-attach-clients)) | 6I, scenarios C/D/E/F with TUI agents | **done** → [`packages/protocol/src/ws-frames.ts`](../packages/protocol/src/ws-frames.ts) · [`packages/server/src/server/ws/handler.ts`](../packages/server/src/server/ws/handler.ts) · [`packages/server/src/attach/`](../packages/server/src/attach/) · [`docs/arch/ws-protocol.md`](arch/ws-protocol.md) §2.2 |
| 6L | Per-keystroke input streaming for TUI agents ([ND-24](open-questions.md#nd-24-per-keystroke-input-streaming-for-tui-agents)) | 6I, scenarios E/F/H with claude TUI | **done** → [`packages/server/src/server/ws/handler.ts`](../packages/server/src/server/ws/handler.ts) (newline-conditional release) · [`packages/server/src/attach/tty.ts`](../packages/server/src/attach/tty.ts) · [`packages/server/src/attach/client.ts`](../packages/server/src/attach/client.ts) (Streaming state) · [`packages/protocol/src/ws-frames.ts`](../packages/protocol/src/ws-frames.ts) · [`docs/arch/ws-protocol.md`](arch/ws-protocol.md) §2.2 + §5.1 + §5.2 + §5.3 + §8 |
| 6I | IDE extension wire-up (`packages/extension/`) | scenarios C/D/E | pending (needs 6H, 6K, 6L) |
| 6J | Distribution: npm tarball, Docker image, Compose | scenario H | pending (needs 6H, 6I) |
| 6Z | Phase 1 done gate — `scenario-runner` walks A–H + 1A/1B/1C land | — | pending |

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

### 4A. Repo scaffold + CLAUDE.md — **done**

**Output:** repo bootstrapped per [`docs/arch/repo-layout.md`](arch/repo-layout.md) §2 (tree) and §8 (tooling): pnpm workspace with `packages/{server,protocol,extension,pwa}`, TypeScript project references with `strict` + `noUncheckedIndexedAccess`, ESLint 9 flat config, Prettier 3, Vitest 2 with `passWithNoTests`, and lefthook pre-commit hooks running typecheck / lint / format:check. Root [`CLAUDE.md`](../CLAUDE.md) orients new agents to the PRD entry point, the decision log, the build-plan tracker, the load-bearing arch reading, the `D-NN`/`ND-NN` code-comment citation convention, and the pnpm script surface. Per-package and per-module `CLAUDE.md` are deferred (per-module is task 5D; per-package will land as packages get real code). Unblocks **3B** (`scenario-runner` skill), **4B** (Phase 0 spike), and all of Track 1 (1A/1B/1C) and Track 5 (5A–5D).

---

### 3B. `scenario-runner` skill — **done**

**Output:** [`.claude/skills/scenario-runner/SKILL.md`](../.claude/skills/scenario-runner/SKILL.md). Markdown-only skill (no scripts) that walks one Phase 1 acceptance scenario per invocation. Each check carries a `pass`/`fail`/`blocked`/`n/a` verdict with a `because:` reason and a citation to the originating `D-NN`/`ND-NN` or subdoc section. Read-only discipline enforced by an explicit `USER:`/`VERIFY:` action grammar — the skill spawns and kills sessions but never runs `relay project add`/`persona create`/`token create`. Three-layer check model (capability preflight → per-scenario preconditions → per-check verdicts) gracefully degrades for Phase 0 (D and E sub-checks emit `blocked (because: not in Phase 0 scope)` rather than `fail`) and for the unimplemented `relay` binary today (preflight short-circuits with one consolidated verdict). Phase-gate map at the top of the skill calls out D and E as the Phase 0 → Phase 1 gating scenarios; full A–H is the Phase 1 ship gate. CI-mode (run all eight non-stop) explicitly out of scope.

---

### 4B. Phase 0 spike — **done**

**Output:** [`spike/`](../spike/) (HTTP+WS server, `attach` thin client, in-memory `Map` plus `~/.relay-spike/state.json` sidecar for D-11 metadata recovery, 32 KB on-attach ring-buffer replay). Report at [`docs/phase-0-report.md`](phase-0-report.md). All six Phase 0 bullets pass — including the load-bearing cross-LAN attach (MacBook ↔ Ubuntu 24.04 VM at 10.0.60.221) and the D-11 boot sweep with `terminatedReason: "server_restart"`. The cross-device run surfaced six surprises that reshape the Phase 1 work order — most load-bearing: (a) make boot sweep the *only* writer of `terminated_reason = "server_restart"` in 6E (caught a real shutdown-race bug in the spike); (b) ship claim-lock arbitration in 6G before 6I wires up the IDE; (c) fold node-pty install fixups (macOS spawn-helper chmod + Linux build-essential) into 6J; (d) ship `relay attach` as a real bin in 6H to avoid pnpm-run TTY breakage; (e) assign `agentSessionId` capture to 6E. Full list in the report.

---

## Track 1 — PRD close-out (late Phase 1)

These three are the user-facing close-out deliverables. They pair with specific Track 6 tasks rather than landing as one batch at the end: **1A** (default personas) pairs with **6C** so the validator and the YAMLs it validates land together; **1B** (threat model) pairs with **6B** because the auth module is the locus of the trust boundaries the doc describes; **1C** (README + deployment) landed early as forward-looking docs with an explicit pre-MVP status banner, so packaging work (**6J**) and operator UX converge on the same shape. **3C** (prd-link skill) is optional and can land anywhere.

### 1A. Default persona content — **done**

**Output:** seven persona YAMLs at [`packages/server/personas/defaults/`](../packages/server/personas/defaults/) (`product`, `design`, `dev`, `test`, `infra`, `architect`, `review`). Each ships `schemaVersion: 1`, a one-line `description`, and a 5–6 paragraph `systemPrompt` framing the agent's mode of work; `skills`, `mcpServers`, and `model` are omitted on every file so the persona degrades to "all the agent's native capabilities" plus a behavior overlay — the honest default given that Relay does not own `~/.claude/skills/` or `~/.claude.json` and that ND-08 (non-empty `skills:` enforcement) is unresolved. Users curate per-project once they hit real friction; the persona authoring guide stays deferred until they do.

---

### 1B. Threat model one-pager — **done**

**Output:** [`docs/threat-model.md`](threat-model.md). One-pager covering assets, actors, trust boundaries, Phase 1 mitigations (token entropy + hashing + revocation per D-13, marker file gitignored per D-G6, credentials never persisted per D-10, boot orphan sweep per D-11, WS upgrade-time bearer check), Phase 3/4 deferrals (rotation D-05, per-tenant credential isolation D-10 re-eval, RBAC, audit logging, SSO, multi-tenant runtime enforcement), and a network-shape decision tree (localhost / Tailscale / Caddy + TLS / don't). Pairs with **6B** — the auth module implements against the trust boundaries this doc names.

---

### 1C. README + deployment guide — **done**

**Output:** [`README.md`](../README.md) at the repo root (value prop, npm + Docker quick install, machine-A → machine-B walkthrough that lands at scenario E, phase-status note) and [`docs/deployment.md`](deployment.md) (local Node 22+ mode, Docker, Docker Compose with Caddy + Tailscale sidecar, backup posture). Both ship an explicit pre-MVP status banner: the binary and Docker image are not yet published, but the docs describe the eventual Phase 1 surface so packaging work (6J) and operator UX converge on the same shape.

---

### 3C. `prd-link` skill (optional)

**Done.** See [`.claude/skills/prd-link/SKILL.md`](../.claude/skills/prd-link/SKILL.md) — resolves `D-NN` / `ND-NN` / `<subdoc>.md §N.N` / `[[kebab-slug]]` citations against `docs/open-questions.md` and `docs/prd/`, quotes the source inline, flags broken refs by reason (unknown_id, file_missing, section_missing, anchor_missing, ambiguous_section, malformed). On-demand only; read-only against the docs.

---

## Track 5 — Agent scaffolding (post-2D follow-ons)

These tasks were surfaced by 2D §11 (`docs/arch/repo-layout.md`). The skill tasks (3D-3F) depend on the arch doc they verify against; the sub-agent and per-module CLAUDE.md tasks (5A-5D) depend on 4A having created the `.claude/` and `packages/server/src/` directory shape.

**Dependency flow within Track 5.** Claude Code auto-loads root `CLAUDE.md` at session start but pulls per-module `CLAUDE.md` files in only when an agent reads/edits a file in that subtree. Sub-agents (5A/5B/5C) need the per-module context at design time, **before** they touch files. The fix is two-step:

1. **5D-stubs lands first** (single task, four files + a root-CLAUDE.md index). After this, every load-bearing module has a ~25-line `CLAUDE.md` with its must-know constraints, and root `CLAUDE.md` lists them so any agent — root session or sub-agent — can discover and Read them at plan time.
2. **5A/5B/5C each require their sub-agent's system prompt to Read the relevant per-module `CLAUDE.md`** before designing/writing. Belt-and-braces: works whether or not Claude Code's directory-scoped auto-load fires.

**5D-expand** (the per-module body fill) is folded into each `6x` task's Done-when rather than tracked as a separate row — the constraints expand as the module's real code lands.

### 3D. `ws-protocol-check` skill — **done**

**Output:** [`.claude/skills/ws-protocol-check/SKILL.md`](../.claude/skills/ws-protocol-check/SKILL.md) — read-only audit of a WS handler file or diff against the 2B message catalog. Four checks: catalog coverage (every `type` discriminator has a handler), no extras (every code-side discriminator is in the catalog), `ND-01` configurability (auto-release timeout reads `claimLockTimeoutSeconds`, not a hardcoded literal), and `D-G2` universal output (binary PTY-output writes are not gated by claim state). Per-violation report with `ws-protocol.md` §N.N citations. REST out of scope.

---

### 3E. `persona-yaml-check` skill — **done**

**Output:** [`.claude/skills/persona-yaml-check/SKILL.md`](../.claude/skills/persona-yaml-check/SKILL.md). Five rules in fixed order against the D-09 schema in [`09-persona-schema.md`](prd/09-persona-schema.md) — required fields, `schemaVersion=1` integer, `name` kebab-case + matches filename stem, optional list fields are lists, optional `model` is a string. Per-rule pass/fail report with one-line citations to §1, §2, §4 of the schema. Read-only; runtime field-shape validation deferred to `@relay/protocol` (4C). 6C and 1A are now unblocked on the linter dimension.

---

### 3F. `sqlite-migration` skill — **done**

**Output:** [`.claude/skills/sqlite-migration/SKILL.md`](../.claude/skills/sqlite-migration/SKILL.md). Scaffolds a new migration at `packages/server/src/store/migrations/NNNN_short_description.sql` against the [`sqlite-schema.md`](arch/sqlite-schema.md) §6 convention — reads the next `NNNN` from existing files (refusing if the sequence has gaps, duplicates, or filenames that fail the §6.1 regex), sanitizes a short description into a ≤40-char snake_case stem (confirming with the user when sanitization materially changes the input), writes a stub with filename header, one-line intent comment, `-- TODO:` body, and the trailing `INSERT INTO schema_versions (version, name, applied_at) VALUES (<N>, '<stem>', CAST(strftime('%s','now') AS INTEGER) * 1000)` filled in. Out of scope: the migration body itself, SQL syntax validation, running migrations, down migrations. 6A is now unblocked on the scaffold dimension.

---

### 5A. `relay-architect` sub-agent — **done**

**Output:** [`.claude/agents/relay-architect.md`](../.claude/agents/relay-architect.md) — read-only spec-fidelity reviewer. Frontmatter `tools: Read, Glob, Grep, Task` (Task scoped to read-only sub-agent delegation, e.g. `Explore`). System prompt locks the four-step workflow from the kickoff (PRD → open-questions → relevant arch doc → per-module `CLAUDE.md` when proposal touches `{persona, transcript, pty, store}`) and enforces a strict three-section output (load-bearing references / per-claim verdicts with citations / sub-questions surfaced). Explicit guardrails route diff review to 5C, test authoring to 5B, and editing to the user via the `decision-log` skill. Unblocks plan-time review for 6A onward.

---

### 5B. `relay-test-author` sub-agent — **done**

**Output:** [`.claude/agents/relay-test-author.md`](../.claude/agents/relay-test-author.md) — write-capable Vitest spec author for the four load-bearing modules (`persona`, `transcript`, `pty`, `store`) and any other module that ships a `CLAUDE.md`. Frontmatter `tools: Read, Glob, Grep, Edit, Write`. System prompt makes the per-module `CLAUDE.md` Read a hard precondition (every "Owns" / "Surprising constraints" / "Does NOT own" bullet becomes a required obligation in the spec), routes per-module fixture dirs + `fast-check` requirements via a recipe table (ND-04 byte-range math for `transcript/`, ND-03 ring-buffer wrap for `pty/`), commits to co-located `*.test.ts` per [`repo-layout.md`](arch/repo-layout.md) §8, and refuses (no spec written, configured diagnostic) when the module `CLAUDE.md`, the shared fixture dir, or the module-under-test file is missing — never inlines fixtures. Verification deferred to first `6x` integration (likely 6C or 6D). Unblocks 6D.

---

### 5C. `relay-spec-reviewer` sub-agent — **done**

**Output:** [`.claude/agents/relay-spec-reviewer.md`](../.claude/agents/relay-spec-reviewer.md) — read-only drift detector for branch diffs. Frontmatter `tools: Read, Glob, Grep, Bash` (Bash scoped to read-only git verbs — `diff`, `log`, `show`, `rev-parse`, `ls-files`). Accepts a branch name, a `<ref-a>...<ref-b>` range, `--cached` / `--staged`, or no argument (defaults to `git diff main...HEAD`). Required reads mirror `relay-architect`'s skeleton, driven by the touched-files list from the diff: open-questions Index → PRD subdoc(s) → relevant arch doc (per the load-bearing-arch table) → per-module `CLAUDE.md` mandatory when the diff touches `packages/server/src/{persona, transcript, pty, store}/`, with every "Owns" / "Does NOT own" / "Test isolation" / "Surprising constraints" bullet becoming a drift dimension. Output is strict two-section: §1 per-decision verdicts (`pass` / `fail` / `underspecified`, one row per touched `D-NN` / `ND-NN`); §2 per-module `CLAUDE.md` constraint verdicts (`pass` / `fail`, one row per named constraint), skipped entirely when no load-bearing module is touched. Every non-`pass` row cites `path:Lstart-Lend` from the diff's post-image line numbers. No "Recommended changes", no "Sub-questions surfaced" section — `underspecified` rows in §1 are the channel for missing decisions, and filing an `ND-NN` is the user's job via the `decision-log` skill. Refuses with a verbatim diagnostic when the diff is empty, the range is malformed, the cwd is not a git work tree, or a touched `CLAUDE.md` cites a `D-NN` / `ND-NN` that does not resolve. Verification deferred to first real PR review during Track 6. Closes the third sub-agent committed by [`docs/arch/repo-layout.md`](arch/repo-layout.md) §9.2.

---

### 5D-stubs. Per-module `CLAUDE.md` stubs + root index — **done**

**Output:** four stub files (~25 lines each) at [`packages/server/src/store/CLAUDE.md`](../packages/server/src/store/CLAUDE.md), [`packages/server/src/persona/CLAUDE.md`](../packages/server/src/persona/CLAUDE.md), [`packages/server/src/pty/CLAUDE.md`](../packages/server/src/pty/CLAUDE.md), [`packages/server/src/transcript/CLAUDE.md`](../packages/server/src/transcript/CLAUDE.md). Each names what the module owns, what it does NOT own, its test-isolation approach, and two-to-three surprising constraints with D-NN / ND-NN citations. Content seeded from [`docs/arch/repo-layout.md`](arch/repo-layout.md) §3 (module ownership tables) and §9.3 (CLAUDE.md tiering examples) — no new module-design work. Root [`CLAUDE.md`](../CLAUDE.md) gained a "Per-module context" index immediately after the "Load-bearing arch reading" table so every agent — root session or sub-agent — discovers them at plan time. Unblocks 5A/5B/5C.

---

### 5D-expand. Per-module `CLAUDE.md` body fill — folded into 6A/6C/6D

Not tracked as a separate row. As each `6x` task lands, the relevant per-module `CLAUDE.md` expands from stub to full constraint list:

- **6A** expands [`packages/server/src/store/CLAUDE.md`](../packages/server/src/store/CLAUDE.md) with the migration runner's invariants and any DDL-specific gotchas the implementation surfaces.
- **6C** expands [`packages/server/src/persona/CLAUDE.md`](../packages/server/src/persona/CLAUDE.md) with composition edge cases and any persona-application choices not captured in [`persona-application.md`](arch/persona-application.md).
- **6D** expands [`packages/server/src/pty/CLAUDE.md`](../packages/server/src/pty/CLAUDE.md) and [`packages/server/src/transcript/CLAUDE.md`](../packages/server/src/transcript/CLAUDE.md) with ring-buffer / byte-range edge cases that fall out of implementation.

Per-module `CLAUDE.md` for non-load-bearing modules (`auth`, `session`, `config`, `cli`, `attach`, `server/rest`, `server/ws`) remains out of scope; add only if re-derivation patterns emerge.

---

## Track 6 — Phase 1 implementation (module-by-module)

Phase 1 implementation, decomposed by module per [`docs/arch/repo-layout.md`](arch/repo-layout.md) §3 and anchored to the acceptance scenarios in [`docs/prd/08-acceptance.md`](prd/08-acceptance.md). The dependency chain follows the inter-module flow in `repo-layout.md` §4: foundation modules (`store`, `auth`, `persona`, `pty+transcript`) are parallel; `session/` synthesizes; transport (`server/rest`, `server/ws`) sits on top of `session/`; client surfaces (`cli+attach`, then extension) sit on top of transport; distribution closes it out.

**Kickoff prompts are written when each 6x task is ready to start, not pre-emptively** — per step 3 of "How to use this file" below. The arch docs are detailed enough that a fresh session can draft a kickoff against the named subdoc + arch doc in the **Reads** line.

**Phase 1 ships when:** `.claude/skills/scenario-runner/SKILL.md` reports `pass` on every check of scenarios A–H (no `blocked`, no `fail`) AND tasks 1A, 1B, 1C are all `done`. See task **6Z** below.

---

### 6A. `store/` module + migrations runner — **done**

**Output:** [`packages/server/src/store/`](../packages/server/src/store/) — `db.ts` (better-sqlite3 factory + monotonic ULID + `SINGLETON_TENANT_ID`), `migrations.ts` (runner per [`sqlite-schema.md`](arch/sqlite-schema.md) §6.2 + 6A's ahead-detection guard via `MigrationError.code: 'ahead'|'gap'|'duplicate'|'bad_filename'|'sql_error'`), `tenants.ts` / `projects.ts` / `sessions.ts` (typed accessors), `migrations/0001_initial_schema.sql` (§6.3 body verbatim). 35 Vitest tests across four `*.test.ts` files cover the runner contract, CASCADE/RESTRICT/CHECK invariants, and `markRunningAsKilled('server_restart')` semantics (call site owned by 6E). Repo-wide preflight closed for all subsequent 6x: Phase 1 deps installed on `@relay/relay` + `@relay/protocol`, seven previously-missing module dirs (`auth`, `session`, `server/rest`, `server/ws`, `cli`, `attach`, `config`) carry `index.ts` ownership stubs, `packages/protocol/src/{persona,frames,ws-frames}.ts` seeded as `export {}` placeholders, and `packages/server/test/fixtures/{personas,migrations,db}/` exist with `.gitkeep`. [`packages/server/src/store/CLAUDE.md`](../packages/server/src/store/CLAUDE.md) expanded with the `MigrationError.code` taxonomy, the `SINGLETON_TENANT_ID` constant, the `SqliteError.code` surface 6F maps to 409, and a correction of the original "transcript_path" stub line (the column doesn't exist — the sidecar path is computed from session id at read time).

---

### 6B. `auth/` module + token CLI subcommands — **done**

**Output:** [`packages/server/src/auth/`](../packages/server/src/auth/) (`tokens.ts` Crockford-Base32 26-char generator, `hash.ts` SHA-256 + 16-byte salt per [ND-09](open-questions.md#nd-09-bearer-token-hashing-algorithm), `store.ts` `TokenStore` with atomic 0600 `~/.relay/tokens.json` I/O + `verify(plaintext) → { ok, tokenId | reason }`, `events.ts` `RevocationBus` for 6G to subscribe to) and [`packages/server/src/cli/`](../packages/server/src/cli/) (`relay.ts` commander entrypoint with `#!/usr/bin/env node` shebang preserved through `tsc -b`, `init.ts` scaffolds `~/.relay/{config.yaml,tokens.json,personas/,last-pairing.txt}` + emits `relay://pair?url=…&token=…` snippet per [D-13](open-questions.md#d-13-first-run-pairing-ux), `token.ts` create/revoke/list handlers). `bin: { relay: ./dist/cli/relay.js }` added to `packages/server/package.json`; `commander` + `js-yaml` deps installed. `packages/server/src/config/paths.ts` shared helper for `relayHome()` / `tokensPath()` / `configPath()` / `personasDir()` / `transcriptsDir()` / `sessionsDir()` / `lastPairingPath()`. 51 Vitest tests across six `*.test.ts` files (tokens, hash, store, paths, init, token). Two ND entries filed during preflight and propagated: [ND-09](open-questions.md#nd-09-bearer-token-hashing-algorithm) (resolved; landed in `prd/03-server.md` §6 and `docs/threat-model.md` §4) and [ND-10](open-questions.md#nd-10-relay-token-list-subcommand-surface-alignment) (open; PRD §7 propagation is the work item — 6B ships `list` regardless per the build-plan-canonicalizes-task-surface rule).

<details>
<summary>Original kickoff (historical)</summary>

**Goal:** Bearer-token issuance and verification for Relay. Generate 26-char Crockford-Base32 tokens with ≥128 bits of entropy, store them hashed in `~/.relay/tokens.json`, expose a verify primitive that 6F (REST) and 6G (WS upgrade) will call. Ship the four operator-facing CLI subcommands: `relay init`, `relay token create`, `relay token revoke`, `relay token list`.

**Preflight** (resolve these before writing implementation code):

1. **Add the missing deps.** No CLI framework, no hashing primitive, no YAML writer is installed yet. Recommended:
   ```bash
   pnpm -F @relay/relay add commander js-yaml
   pnpm -F @relay/relay add -D @types/js-yaml
   ```
   Hashing: prefer Node built-ins (`node:crypto` `scrypt` or `createHash('sha256')` + per-token salt) over `argon2`/`bcrypt` — see the open decision below. Native-compile-free is the goal for Phase 1.

2. **Resolve the hashing algorithm with the user before coding.** Spec says "hashed at rest" (D-13, threat-model §4) but does not name an algorithm. Tokens carry ≥128 bits of entropy, so a fast hash (SHA-256 + per-token random salt) is cryptographically sufficient and avoids native deps. Slow KDFs (`scrypt`, `argon2id`) are overkill for high-entropy random secrets. **File this via the `decision-log` skill as a new `ND-NN` before writing `auth/hash.ts`.** Proposed answer: SHA-256 with 16-byte per-token salt, stored as `{ id, deviceLabel, saltB64, hashB64, createdAt, revokedAt }` per record.

3. **Confirm `relay token list` is in scope.** [`docs/prd/03-server.md`](prd/03-server.md) §7 enumerates `relay token create` and `relay token revoke` but does NOT list `relay token list`. The build-plan 6B row names all four. Treat the build-plan as the canonical task surface (it's the newer artifact) and ship `list` — but flag the PRD §7 omission to the user; it likely needs a one-line propagation via the `decision-log` skill.

4. **Add a `bin` entry to `packages/server/package.json`.** No `relay` binary exists yet. Add:
   ```json
   "bin": { "relay": "./dist/cli/relay.js" }
   ```
   and a source entrypoint at `packages/server/src/cli/relay.ts` that wires the subcommands via `commander`. 6H will extend this entrypoint with the session/project/persona subcommands later — design the dispatcher so 6H can plug in without rewriting.

5. **Create a `~/.relay/` path helper.** Grep confirms no `homedir()` / `~/.relay/` helpers exist yet. Place this in `packages/server/src/config/paths.ts` (not `auth/`) since `config/`, `auth/`, and `persona/` all need it. Functions: `relayHome()`, `tokensPath()`, `configPath()`, `personasDir()`, `transcriptsDir()`, `sessionsDir()`, `lastPairingPath()`.

6. **Create the auth test fixtures dir.** `packages/server/test/fixtures/` exists with `db/`, `migrations/`, `personas/` — add `packages/server/test/fixtures/auth/` with a `.gitkeep` so [`relay-test-author`](../.claude/agents/relay-test-author.md) can drop a sample `tokens.json` there.

7. **Workspace sanity after the above:** `pnpm typecheck && pnpm lint` clean before writing the first implementation file.

**Required reads** (in this order):

- [`docs/prd/03-server.md`](prd/03-server.md) §6 (token contract: format, entropy, storage, lifecycle, revocation semantics) and §7 (CLI surface: `relay init`, `relay token create --device <name>`, `relay token revoke <id>`).
- [`docs/open-questions.md`](open-questions.md) [D-13](open-questions.md#d-13) — first-run pairing UX, the canonical `relay init` output spec including the `relay://pair?url=…&token=…` deep link.
- [`docs/threat-model.md`](threat-model.md) §4 ("Known mitigations") — token entropy, hashing at rest, immediate revocation. This is the doc the auth module implements against; every mitigation bullet that names auth becomes a test.
- [`docs/arch/rest-conventions.md`](arch/rest-conventions.md) §3 — 401 vs 403 distinction, `WWW-Authenticate: Bearer` header, RFC 9457 problem-details shape for auth errors. 6B exposes the verify primitive; 6F maps failures to this shape.
- [`docs/arch/ws-protocol.md`](arch/ws-protocol.md) — find the `auth_expired` frame and close-code 4401. 6G owns the handler, but 6B's revocation flow must mark the token in a way that lets the WS handler detect "this connection's token just got revoked" on the next message boundary. Sketch the revocation-observer contract here; 6G consumes it.

**Phase 0 surprises that apply:** None directly assigned to 6B. The Phase 0 spike used a shared plaintext bearer in `config.json` and explicitly deferred real token issuance to 6B — there are no spike gotchas constraining this surface. (Surprise §6 — `agentSessionId` capture — is assigned to 6E, not 6B.)

**D-NN / ND-NN cheatsheet:**

| ID | Status | Implication for this task |
| -- | -- | -- |
| [D-13](open-questions.md#d-13) | resolved | The canonical contract. 26-char Crockford-Base32, ≥128 bits, hashed at rest, shown plaintext exactly once, `relay init` emits the pairing snippet + writes `~/.relay/last-pairing.txt`. Build everything against this. |
| [D-05](open-questions.md#d-05) | deferred to Phase 3 | Per-device token rotation is out of scope. MVP tokens are indefinite until revoked. Do NOT add rotation hooks; do NOT add expiry timestamps to the on-disk shape. |
| [D-10](open-questions.md#d-10) | resolved | Agent model credentials are server-level env pass-through (D-10 mechanism); docs lead with `claude login` OAuth per ND-19, `ANTHROPIC_API_KEY` is the fallback. Either way, NOT stored in `~/.relay/tokens.json`. 6B owns only bearer tokens for Relay's own auth. |
| [ND-19](open-questions.md#nd-19-claude-login-oauth-as-the-documented-credential-default-anthropic_api_key-as-fallback) | resolved | Docs default for credential surface. No code change required for 6B — the env pass-through in `session/registry.ts` already inherits `$HOME` / process credentials and `~/.claude/` rides for free. |
| [ND-NN] hashing algorithm | **open — file before coding** | See preflight #2. Propose SHA-256 + per-token salt; resolve via `decision-log` skill before `auth/hash.ts` lands. |
| [ND-NN] `relay token list` | **open — file before coding** | See preflight #3. Build-plan canonicalizes the four-subcommand surface; PRD §7 omits `list`. File a propagation note to align §7 with the build-plan. |

**Done when:**

- `relay init` on a fresh host writes `~/.relay/config.yaml`, scaffolds the seven default personas into `~/.relay/personas/` (copies from [`packages/server/personas/defaults/`](../packages/server/personas/defaults/) shipped by 1A), generates the initial bearer token, prints the `relay://pair?url=…&token=…` snippet + plain-text URL + token on stdout, and writes the same snippet to `~/.relay/last-pairing.txt`. **Unblocks scenario A bullet 1.**
- `relay token create --device <name>` generates a new token, prints the plaintext exactly once, persists `{ id, deviceLabel, saltB64, hashB64, createdAt }` to `~/.relay/tokens.json`.
- `relay token revoke <id>` sets `revokedAt` on the row and emits a server-side observable that 6G can subscribe to (so in-flight WSs close with `auth_expired` + 4401 on the next message boundary — 6G implements the close, 6B publishes the event).
- `relay token list` prints `{ id, deviceLabel, createdAt, revokedAt | "active" }` rows; never prints the plaintext or the hash.
- Verify primitive: `verify(plaintextToken: string): { ok: true, tokenId: string } | { ok: false, reason: 'unknown' | 'revoked' | 'malformed' }`. Constant-time hash comparison.
- Vitest specs co-located: `auth/tokens.test.ts`, `auth/hash.test.ts`, `auth/store.test.ts`, `cli/init.test.ts`, `cli/token.test.ts`. Each [`relay-test-author`](../.claude/agents/relay-test-author.md)-authored.
- 1B (threat model) is the natural companion deliverable here.

**Output structure:**

```
packages/server/
├── package.json                     # add `bin` + `commander`/`js-yaml` deps
└── src/
    ├── config/
    │   ├── paths.ts                 # relayHome(), tokensPath(), etc. (shared utility)
    │   └── paths.test.ts
    ├── auth/
    │   ├── index.ts                 # public surface: verify(), generateToken(), revoke(), list()
    │   ├── tokens.ts                # Crockford-Base32 generation, ≥128-bit entropy
    │   ├── hash.ts                  # hash + constant-time verify (algorithm per ND-NN resolution)
    │   ├── store.ts                 # ~/.relay/tokens.json I/O, schema
    │   ├── events.ts                # revocation observer for 6G to subscribe to
    │   ├── tokens.test.ts
    │   ├── hash.test.ts
    │   └── store.test.ts
    └── cli/
        ├── relay.ts                 # commander-based entrypoint (bin target)
        ├── init.ts                  # `relay init` command handler
        ├── token.ts                 # `relay token {create,revoke,list}` handlers
        ├── init.test.ts
        └── token.test.ts
packages/server/test/fixtures/auth/  # mkdir + .gitkeep for sample tokens.json fixtures
```

**Verification:**

- `pnpm -F @relay/relay test auth cli` — unit tests green.
- `pnpm typecheck` — no TS errors across the workspace.
- `pnpm lint` — clean.
- Manual smoke (against a clean `$HOME` — use a temp `HOME=/tmp/relay-smoke` to avoid clobbering real state):
  1. `HOME=/tmp/relay-smoke pnpm -F @relay/relay exec relay init` — verify `~/.relay/{config.yaml,tokens.json,last-pairing.txt,personas/}` all created; pairing snippet on stdout matches the format in D-13.
  2. `HOME=/tmp/relay-smoke pnpm -F @relay/relay exec relay token create --device laptop` — token printed once.
  3. `HOME=/tmp/relay-smoke pnpm -F @relay/relay exec relay token list` — shows two active tokens.
  4. `HOME=/tmp/relay-smoke pnpm -F @relay/relay exec relay token revoke <id>` — list now shows one active, one revoked.
- File the two new `ND-NN` entries via the [`decision-log`](../.claude/skills/decision-log/SKILL.md) skill (hashing algorithm; `relay token list` PRD propagation) BEFORE the implementation lands them as code.
- Update this row to `done` with link to `packages/server/src/auth/`; replace this kickoff with a 1–2 line completion pointer.

**Feeders** (skills + sub-agents to invoke during the work):

- [`decision-log`](../.claude/skills/decision-log/SKILL.md) — file the two `ND-NN` entries flagged in preflight #2 and #3 before writing the affected code.
- [`relay-architect`](../.claude/agents/relay-architect.md) — invoke before writing code to spec-check the planned `auth/` API surface (verify primitive shape, revocation-observer contract for 6G) against D-13 + threat-model §4.
- [`relay-test-author`](../.claude/agents/relay-test-author.md) — invoke per `*.test.ts` file. Note: `auth/` has no per-module `CLAUDE.md` (5D-stubs scoped to load-bearing modules only), so the test author will need the spec contracts via prompt rather than auto-load.
- [`relay-spec-reviewer`](../.claude/agents/relay-spec-reviewer.md) — invoke on the final branch diff before opening the 6B PR; will surface any drift against D-13 / D-05 / D-10.

</details>

---

### 6C. `persona/` module + composition rule — **done**

**Output:** [`packages/server/src/persona/`](../packages/server/src/persona/) — `loader.ts` (readdir + `js-yaml` parse with ENOENT-on-dir tolerance), `validator.ts` (pre-Zod required-field check + Zod wrap + filename-stem match, mapping Zod issues to the nine-value `PersonaLoadReason` enum), `compose.ts` (Map-keyed project-overrides-tenant-by-name with full-struct replacement per D-09 §3), `index.ts` (`loadAll({ tenantDir, projectDir? })` one-shot helper). Strict Zod schema at [`packages/protocol/src/persona.ts`](../packages/protocol/src/persona.ts) exporting `PersonaSchema` + type `Persona` + `PERSONA_NAME_REGEX` + `SUPPORTED_PERSONA_SCHEMA_VERSIONS`; rejects unknown top-level keys so typos surface as `extra_fields`. 37 Vitest tests across four `*.test.ts` files cover every `reason` enum value, all six composition scenarios, missing-dir/empty-dir/non-yaml/io-error edge cases, and a regression smoke test that loads the seven 1A defaults clean. `packages/server/src/config/paths.ts` gained a `projectPersonasDir(canonicalProjectPath)` helper. ND-08 (skills-subset enforcement) remains open and is honored by passing `skills:` through to `PersonaInput` unenforced; citation comment lives at the `loadAll` boundary. [`packages/server/src/persona/CLAUDE.md`](../packages/server/src/persona/CLAUDE.md) expanded with the public surface, the priority order of the reason enum, and the strict-mode-on / missing-dir-isn't-error / no-merge invariants.

---

### 6D. `pty/` + `transcript/` modules (paired) — **done**

**Output:** [`packages/server/src/pty/`](../packages/server/src/pty/) — `supervisor.ts` (node-pty wrap, `encoding: null` for byte fidelity, callback-registration fan-out per D-G3, listener cleanup on exit), `ring-buffer.ts` (pure `Buffer.allocUnsafe(capacity)` + write cursor + `filled` flag — zero allocation per byte event, one allocation per `snapshot()` bounded by capacity per ND-03), `index.ts` barrel + `DEFAULT_RING_BUFFER_BYTES`. [`packages/server/src/transcript/`](../packages/server/src/transcript/) — `writer.ts` (`O_APPEND` fd, mode `0o600`, single final `fsync` on close), `reader.ts` (pure `readRange` over the sidecar with ND-04 half-open math, silent 1 MB clamp, throws on caller bugs, `before === 0` is the valid terminal call), `index.ts` re-exports the new `transcriptPath(sid)` helper from `config/paths.ts`. 40 Vitest tests across five `*.test.ts` files cover every ND-03 / ND-04 / D-G3 invariant; `fast-check` properties (5 ring-buffer + 4 reader) tile the boundary math. macOS spawn-helper skip guard at the top of `supervisor.test.ts` names `pnpm --filter @relay/spike fix-pty` as the fix. [`packages/server/src/pty/CLAUDE.md`](../packages/server/src/pty/CLAUDE.md) and [`packages/server/src/transcript/CLAUDE.md`](../packages/server/src/transcript/CLAUDE.md) expanded with public surface and implementation notes; the latter also corrects an inaccurate "sessions.transcript_path row" mention (path is computed, not stored, per sqlite-schema.md §2).

---

### 6E. `session/` orchestrator + boot orphan sweep — **done**

**Output:** [`packages/server/src/session/`](../packages/server/src/session/) — `boot.ts` (one-line wrapper over `sessions.markRunningAsKilled('server_restart', …)`, the type-narrowed only-writer per D-11), `byte-accounting.ts` (1 s batched flush per ND-13 with synchronous drain on `pty.onExit` and `registry.shutdown()`), `spawn.ts` (persona-application.md §4.1/§5 argv composition + transient `~/.relay/sessions/<sid>/` writer validated against the `SpawnRecordSchema` from ND-12), `agent-session-id.ts` (pre/post-spawn directory diff on `~/.claude/projects/<encodedPath>/` per ND-11; 250 ms × 30 s; UUID-and-`.jsonl` dual filter; non-fatal timeout), `registry.ts` (D-G3 universal-output fan-out at the supervisor `onBytes` site, the Phase 0 §2 `shuttingDown` flag preventing `pty.onExit` from racing the boot sweep, the `explicitlyKilled` guard preventing `kill('operator_kill')` from being overwritten by `'agent_exit'`, the ND-13 §5 `writer.close()`→`drain`→`release` Promise chain), `initServer({ db, migrationsDir, … })` factory that 6F mounts at boot (migrations → singleton tenant → boot sweep → registry). 55 Vitest tests across 5 `*.test.ts` files cover every Surprising-constraint bullet in the new [`packages/server/src/session/CLAUDE.md`](../packages/server/src/session/CLAUDE.md) (the fifth load-bearing module's `CLAUDE.md`); `relay-spec-reviewer` ran clean on the final diff. `packages/server/src/config/paths.ts` gained `sessionWorkDir(sid, homeOverride?)`. ND-12 propagation closed with `Propagated to: packages/protocol/src/spawn-record.ts (2026-05-17), docs/arch/persona-application.md §4.2 (2026-05-17)`.

---

### 6F. `server/rest/` routes + Zod validation — **done**

**Output:** [`packages/server/src/server/`](../packages/server/src/server/) — `index.ts` `buildServer({ db, registry, tokenStore, config })` Fastify factory, `rest/plugins/auth.ts` (D-13 bearer preHandler — 401 with `WWW-Authenticate: Bearer` on missing/unknown/revoked/malformed, slug-discriminated `auth-missing | auth-malformed | auth-revoked | auth-unknown`), `rest/plugins/error-mapper.ts` (RFC 9457 envelope: `HttpProblemError` extensions ride at the top level; `ZodError` → 400 with `validationErrors[]`; `RangeError` → 400; Fastify 4xx forwarded; default 500), and `rest/routes/{tenants,projects,personas,sessions,transcript}.ts`. POST /projects canonicalizes via `realpathSync`, derives a kebab slug from the basename (or 422 `project-slug-undeducible`), writes `.relay/project.json` per ND-07, idempotently appends to `.gitignore`, maps `SQLITE_CONSTRAINT_UNIQUE` to 409 (`project-path-taken` vs `project-slug-taken`). POST /personas writes to `~/.relay/personas/<name>.yaml` (0o600); PATCH refuses rename; DELETE is non-idempotent for personas/projects but idempotent for sessions per D-11. GET /sessions defaults to `?status=running` per D-11; GET transcript ships camelCase `sessionId/range/totalBytes/bytes/hasMore` per the new ND-14. Config loader at `config/loader.ts` reads `~/.relay/config.yaml` with strict Zod and defaults `host=127.0.0.1`, `port=7777`, `claimLockTimeoutSeconds=30` (ND-01), `replayBufferBytes=32768` (ND-03). 53 new Vitest specs (4 tenants + 10 projects + 10 personas + 8 sessions + 8 transcript + 5 auth + 8 config) green; pnpm typecheck + lint clean across all workspaces. ND-14 (transcript field naming) filed + propagated to `prd/03-server.md` §2.

---

### 6G. `server/ws/` handler + claim-lock state machine

**Done.** Artifact: [`packages/server/src/server/ws/`](../packages/server/src/server/ws/). `@relay/protocol` ws-frames Zod schemas + 11-discriminator catalog, pure `ClaimLock` FSM (§5.2 transitions + ND-01 timer, no socket coupling), Fastify route mounted from `buildServer`. 36 new tests across `claim-lock.test.ts` (FSM unit + §5.3 race-1 ordering) and `handler.test.ts` (integration via `app.injectWS`, covering §6 attach sequence, §3 empty replay, D-G3 universal fan-out, §4.2 4404 + 4401, all §5.2 transitions, all four §5.3 races). `AttachedClient.onSessionEnd` added to `session/types.ts` so the WS handler emits `session_ended` without owning supervisor `onExit`.

---

### 6H. `cli/` subcommands + `attach/` thin client — **done**

**Output:** [`packages/server/src/cli/`](../packages/server/src/cli/) — `project.ts` (add/list/remove), `persona.ts` (list/create with `$EDITOR` spawn), `session.ts` (list/kill/show), `server.ts` (long-lived REST+WS boot via `initServer` → `buildServer`), `attach.ts` (thin-client dispatcher), `http.ts` (loopback REST client wrapping Node 22's fetch with RFC 9457 problem-details → typed `CliHttpError`/`CliHttpUnreachableError`), `migrations-dir.ts` (dist-then-source fallback resolver for the migrations dir, since 6J's distribution copy is pending). `relay.ts` extended with the seven new commander entries; bin shebang preserved through `tsc -b`. [`packages/server/src/attach/`](../packages/server/src/attach/) — `client.ts` (WS connection, `Authorization: Bearer` header, §5.1 client FSM with the ND-17 collapsed-Claimed variant for raw-mode TTYs, hello/replay/binary/control frame dispatch, `subscribe()` for TTY-layer callback layering), `tty.ts` (raw-mode stdin → line-buffered submit, ^D clean close, ^C single-byte send pass-through, binary frames → stdout, raw-mode restore on close), `config.ts` (URL/token precedence: `--url`/`--token` → `~/.relay/config.yaml`/`RELAY_TOKEN` → defaults). 50 new Vitest tests across 8 `*.test.ts` files (15 FSM + 6 TTY + 7 config + 8 project + 7 persona + 9 session + 3 server + 2 attach-dispatcher); full suite 371 green, typecheck + lint clean. `runInit` now also opens `~/.relay/relay.db` and runs migrations so direct-read CLIs (`project list`, `session list`, `session show`) work immediately on a fresh scaffold without requiring a prior `relay server` start. Scenario A walks pass (checks 1–6 verified live; check 7 requires a real `claude` binary, `n/a` for this gate). Three NDs filed and propagation-pending: [ND-15](open-questions.md#nd-15-relay-session-show-subcommand-surface-alignment) (`relay session show` PRD §7 alignment, same shape as ND-10), [ND-16](open-questions.md#nd-16-cli--data-plane-boundary-rule) (read-direct / mutate-via-REST split — the rule the 6H implementation ships against), [ND-17](open-questions.md#nd-17-relay-attach-raw-mode-tty-variant-of-the-51-client-fsm) (§5.1 raw-mode TTY FSM variant — collapses `Claimed → Sending` and dismisses `Backoff` on timer only).

---

### 6L. Per-keystroke input streaming for TUI agents

**Status:** done (2026-05-19). ND-24 resolved with Option A (multi-send per claim, server-side newline-byte detection as the release trigger). Implementation in `handleSend` (newline scan via `containsNewline(bytes)`), `attach/tty.ts` (drops line-buffering; per-chunk `submitInput` forward; `^D` mid-chunk slices the prefix; `^C` is a regular byte), and `attach/client.ts` (FSM gains `Streaming` between `Claiming` and `Idle`; `pendingInput: Buffer` accumulating queue; Backoff queues bytes silently and the 4 s timer alone dismisses, re-claiming if `pendingInput` non-empty). Spec edits in `ws-protocol.md` §2.2 + §5.1 + §5.2 + §5.3 + §8 row 9; `ws-protocol-check` SKILL gains the `unconditional_send_release` audit rule. Test baseline: 386 → 403 (+17 ND-24 specs covering multi-send happy path, newline-triggers-release, CRLF, empty send no-op, busy-then-delivered ordering, ND-01 timeout under sustained typing, Streaming-state transitions, pendingInput continuation, Backoff queueing, all `claim_released` reasons, and mid-stream `send_without_claim`).

---

### 6I. IDE extension wire-up (`packages/extension/`)

**Goal:** VS Code-family `.vsix`. First-run pairing (`relay://pair` deep link + manual URL+token), project marker discovery + bind, start-session command, attach-to-session command, status bar item. Spawns `relay attach` from the user's PATH for terminal integration.
**Output:** `packages/extension/`. Build chain via esbuild + `@vscode/vsce`.
**Done when:** scenarios C (single-client lifecycle in Cursor over Remote-SSH), D (close + reopen + reattach), E (cross-device with desktop as one of the clients) all pass with the extension as the client.
**Reads:** [`docs/prd/04-ide-extension.md`](prd/04-ide-extension.md), [D-G6](open-questions.md#d-g6), [ND-05](open-questions.md#nd-05), [ND-07](open-questions.md#nd-07).

---

### 6J. Distribution: npm tarball, Docker image, Compose

**Goal:** npm-publishable tarball (`tsup` bundle → `dist/relay.js`); Docker image; Docker Compose example with Caddy + Tailscale sidecar; GitHub Releases vsix attachment.
**Output:** root `Dockerfile`, `docker-compose.example.yml`, npm publish workflow, release workflow attaching the `.vsix`.
**Done when:** scenario H — `npm install -g` on Node 22+ produces a working `relay`; the Docker image runs scenarios A–E from a clean container; the `.vsix` installs into VS Code from a GitHub Release.
**Reads:** [`docs/prd/06-distribution.md`](prd/06-distribution.md).
**Pre-6J ND-19 validation (2026-05-18):** Docker named-volume OAuth path (`-v relay_claude:/root/.claude` + `docker exec -it relay claude auth login`) validated on a macOS Docker host (Docker 29.4.1) with a stand-in `node:22-alpine` + `@anthropic-ai/claude-code` image; credentials persisted across `docker stop`/`docker start` and `claude -p` round-tripped without `ANTHROPIC_API_KEY`. Linux Docker host validation still outstanding (no Linux host reachable from this session). VM headless `claude auth login` device-flow over SSH validated on Ubuntu 24.04 (`techgardencode@10.0.60.221`, Node v22.22.2); ND-19's "deploying Relay on a headless Linux host" claim now empirically grounded. See [ND-19](open-questions.md#nd-19-claude-login-oauth-as-the-documented-credential-default-anthropic_api_key-as-fallback) for the full validation log.

---

### 6Z. Phase 1 done gate

**Goal:** Phase 1 ships.
**Done when:** `.claude/skills/scenario-runner/SKILL.md` walks scenarios A–H and reports `pass` on every check (no `blocked`, no `fail`). Tasks 1A (default personas), 1B (threat model), 1C (README + deployment guide) all complete. Every Phase 1 row in the Sequencing table at the top of this file is marked `done` with an artifact link.
**Reads:** [`docs/prd/07-phasing.md`](prd/07-phasing.md), [`docs/prd/08-acceptance.md`](prd/08-acceptance.md), [`.claude/skills/scenario-runner/SKILL.md`](../.claude/skills/scenario-runner/SKILL.md).

---

## How to use this file

1. Pick the next task from the **Sequencing** table (top of file). Start with `4A` (2D is done).
2. **Draft the kickoff prompt** for that task. For Track 6 (and any later track that ships with one-line stubs), invoke the [`build-plan-kickoff` skill](../.claude/skills/build-plan-kickoff/SKILL.md) — it walks the five-step workflow (validate upstream `done` → resolve required reads → pull Phase 0 surprises assigned to the task → build a `D-NN` / `ND-NN` cheatsheet → probe preflight gaps) and emits a structured kickoff (Goal / Preflight / Required reads / Phase 0 surprises / Cheatsheet / Done when / Output structure / Verification / Feeders). 6A's row is the worked reference. Paste the output back into the row to replace its one-line stub, or feed it directly into a fresh Claude Code session.
3. When the task lands:
   - Update the row's `Status` column to `done` and link the output artifact path
   - Replace the task's kickoff prompt with a 1–2 line completion pointer (the artifact is now authoritative; the prompt is historical churn)
   - If the task surfaced follow-on tasks, add them to the Sequencing table and write stub kickoff prompts in this file under the appropriate Track (or a new one). Note their source task in the description so future readers can trace why they exist.
4. If a task surfaces new sub-questions (vs. follow-on tasks), file them in `docs/open-questions.md` per the decision-log skill; don't grow this file with deliberation content.
