# Relay — Agent Orientation

You are working in the Relay monorepo. Start here before doing anything else.

## Entry points

- **`docs/prd.md`** — the spec entry point. Subdocs `prd/00-overview.md … prd/09-persona-schema.md` are the implementation contract; treat them as authoritative for what Relay does and does not do.
- **`docs/decisions/`** — the decision log, one file per decision. [`docs/decisions/index.md`](docs/decisions/index.md) is the entry point; the per-decision body lives at `D-NN-<slug>.md` (or `ND-NN-<slug>.md`). Resolved entries are tagged `D-NN`; sub-questions surfaced during resolution are tagged `ND-NN`. Pending entries are open design questions, not implementation backlog. Use the [`prd-link`](.claude/skills/prd-link/SKILL.md) skill to resolve a citation by ID without opening the full log; use the [`decision-log`](.claude/skills/decision-log/SKILL.md) skill to file or propagate. The template + 5-step propagation protocol live in [`docs/decisions/protocol.md`](docs/decisions/protocol.md).
- **`docs/build-plan.md`** — the in-flight task tracker. Sequencing table at the top lists every task with Status and a link to its output artifact. Replace a task's kickoff prompt with a 1–2 line completion pointer when its artifact lands.
- **`docs/arch/`** — sibling architecture docs that resolve specific PRD punts. Each one closes a build-plan `2x` task; treat the named arch doc as authoritative for its area.

## Load-bearing arch reading

Read these before touching the matching surface:

| Before you touch…                              | Read                                                                   |
| ---------------------------------------------- | ---------------------------------------------------------------------- |
| session spawn / agent CLI invocation           | [`docs/arch/persona-application.md`](docs/arch/persona-application.md) |
| WebSocket frames or claim/release              | [`docs/arch/ws-protocol.md`](docs/arch/ws-protocol.md)                 |
| SQLite DDL or migrations                       | [`docs/arch/sqlite-schema.md`](docs/arch/sqlite-schema.md)             |
| REST routes or error shapes                    | [`docs/arch/rest-conventions.md`](docs/arch/rest-conventions.md)       |
| repo layout / module boundaries                | [`docs/arch/repo-layout.md`](docs/arch/repo-layout.md)                 |
| client-surface design / new client integration | [`docs/arch/client-agnosticism.md`](docs/arch/client-agnosticism.md)   |

## Per-module context

Each load-bearing module ships a ~25-line `CLAUDE.md` with its must-know constraints (what it owns, what it does NOT own, test isolation, surprising invariants). Claude Code auto-loads these only when an agent reads or edits a file in that subtree — read them explicitly at plan time, before designing changes that touch the module:

| Working on…                                   | Read                                                                                   |
| --------------------------------------------- | -------------------------------------------------------------------------------------- |
| SQLite repository layer or migrations         | [`packages/server/src/store/CLAUDE.md`](packages/server/src/store/CLAUDE.md)           |
| Session lifecycle / registry orchestration    | [`packages/server/src/session/CLAUDE.md`](packages/server/src/session/CLAUDE.md)       |
| `node-pty` supervisor or ring buffer          | [`packages/server/src/pty/CLAUDE.md`](packages/server/src/pty/CLAUDE.md)               |
| Transcript sidecar writes or byte-range reads | [`packages/server/src/transcript/CLAUDE.md`](packages/server/src/transcript/CLAUDE.md) |

Sub-agents (`relay-architect`, `relay-test-author`, `relay-spec-reviewer`) Read these files explicitly in their system prompts — see [`docs/build-plan.md`](docs/build-plan.md) Track 5.

## Code-comment convention

Any code comment that names a non-obvious behavior must cite the `D-NN` or `ND-NN` it traces back to. Examples:

```ts
// Per ND-01, claim auto-releases after 30s of inactivity.
// Per D-G3, every attached client receives PTY bytes regardless of claim state.
// Per ND-04, transcript offsets are byte counts from session start, never logical messages.
```

The citation lets a future reader (you, next session) trace **why** the behavior exists rather than re-deriving it from first principles. If the behavior isn't tied to a decision, prefer no comment over a citation-free one — the code should speak for itself.

When you introduce behavior that warrants a new decision, file it under `docs/decisions/` (use the `decision-log` skill at `.claude/skills/decision-log/SKILL.md`) before writing the citation in code.

## Repo shape

- **`packages/server/`** — `@techgardencode/relay`, the npm-distributed binary (npm slice implemented per [D-19](docs/decisions/D-19-npm-distribution-posture.md); first publish is operator-gated and has not happened yet). Hosts the HTTP/WS server, the `relay` CLI, and the `relay attach` thin client. Internal module boundaries (ten modules: `config`, `store`, `pty`, `transcript`, `auth`, `session`, `server/rest`, `server/ws`, `cli`, `attach`; the `persona` module was removed per D-17 — restore point: tag `pre-cleanup-phase1`) are documented in [`docs/arch/repo-layout.md`](docs/arch/repo-layout.md) §3.
- **`packages/protocol/`** — `@techgardencode/protocol`, shared Zod schemas and TS types for REST and WS wire shapes. Single source of truth for wire shapes; server validation and client TS types both flow from these schemas. No I/O, no Node-only deps — portable to the browser-bound PWA.
- **`packages/extension/`** — `relay-extension`, the VS Code family extension (`.vsix` output, private/unpublished). Spawns `relay attach` from the user's PATH for terminal integration.
- **`packages/pwa/`** — Phase 2 placeholder. Empty until Phase 2 begins.

Per-module `CLAUDE.md` files ship at the load-bearing modules (`transcript`, `pty`, `store`, `session`) — indexed under [Per-module context](#per-module-context). Build-plan task **5D-stubs** seeded them; bodies expanded as each module's `6x` implementation task landed.

## Scripts

All commands run from the repo root. pnpm fans out to workspaces where applicable.

| Command             | What it does                                                                   |
| ------------------- | ------------------------------------------------------------------------------ |
| `pnpm install`      | Install workspace dependencies; link `@techgardencode/*` packages via symlink. |
| `pnpm typecheck`    | `tsc -b` across all workspaces using project references.                       |
| `pnpm lint`         | ESLint flat config over `packages/**/*.ts`.                                    |
| `pnpm lint:fix`     | ESLint with `--fix`.                                                           |
| `pnpm format`       | Prettier write across the tree (excludes `docs/`).                             |
| `pnpm format:check` | Prettier check; the lefthook pre-commit hook calls this on staged files.       |
| `pnpm test`         | Vitest run; `passWithNoTests: true` until specs exist.                         |
| `pnpm test:watch`   | Vitest in watch mode.                                                          |
| `pnpm build`        | Per-package build (`--if-present`); no-op until packages define `build`.       |

Pre-commit hooks are managed by `lefthook` and run typecheck + lint + format:check on staged TypeScript and config files. `pnpm install` installs hooks via the `prepare` script.

## How agents should work in this repo

1. **Open the relevant PRD subdoc and arch doc first.** Don't reason from the codebase alone — the spec encodes constraints the code may not yet reflect.
2. **Cite decisions in code.** When a behavior is non-obvious, cite the `D-NN`/`ND-NN` that motivated it.
3. **Surface new questions via the decision log skill**, not by inventing answers inline.
4. **Update `docs/build-plan.md`** when you finish a task — flip the row to `done`, link the artifact, replace the kickoff prompt with a pointer.
5. **Prefer skills over re-deriving.** `.claude/skills/decision-log/SKILL.md` exists today; more skills (`scenario-runner`, `ws-protocol-check`, `sqlite-migration`, `prd-link`) landed via build-plan tasks 3B–3F. (`persona-yaml-check` was removed with the D-17 persona descope; restore in Phase 2.)
