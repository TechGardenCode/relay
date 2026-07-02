# Relay Arch — Repo Layout & Tooling

**Status:** v0.1
**Scope:** Locks in (1) repo arrangement across server / IDE extension / Phase 2 PWA, (2) internal package boundaries inside the single binary D-08 committed to, (3) concrete tooling picks, (4) AI-first development foundations. Closes build-plan task 2D and unblocks 4A (repo scaffold).

**Out of scope:** PWA build tooling (Phase 2), Docker image structure (covered in `prd/06-distribution.md`), CI workflow detail (separate task), JetBrains plugin (Phase 3), system-prompt content for sub-agents (follow-on task).

---

## 1. Decision: monorepo with pnpm workspaces

Server, CLI, attach client, IDE extension, and a Phase 2 PWA placeholder all live in **one repo** managed by **pnpm workspaces**.

The cross-cutting artifact in Relay is the wire protocol: REST request/response shapes, WebSocket frames (CLAIM / SEND / RELEASE / BUSY per `prd/03-server.md` §5), and — returning in Phase 2 per [D-17](../decisions/D-17-personas-descoped-from-mvp.md) — the persona YAML schema (`prd/09-persona-schema.md`). The server speaks it; the IDE extension and the Phase 2 PWA consume it. In a polyrepo, every protocol change becomes a coordinated edit across two or three repos with an internal npm publish step in the middle. In a monorepo, the same change is one PR.

D-08 already commits to a single distributed binary on the server side. Coordinated versioning extends naturally to the extension: one tag in the monorepo carries server and extension together, and a user upgrading both sees the same version on the wire. The cost a monorepo classically imposes — independent CI lifecycles, coupled blast radius — is low at single-contributor scale against thin clients whose only contract with the server is the network API.

**pnpm specifically** over npm workspaces: better symlink hygiene (no flattened `node_modules` surprises), faster installs (~10× lighter on-disk than npm), deterministic lockfile, and `pnpm -r run <script>` for fan-out across packages.

## 2. Top-level tree

```
relay/
├── docs/                        PRD, arch, decisions, build-plan (exists)
│   ├── prd.md                   ← entry point
│   ├── prd/                     subdocs 00..09
│   ├── arch/                    this doc + sibling arch decisions
│   ├── decisions/               decision log (one file per D-NN / ND-NN)
│   └── build-plan.md            in-flight task tracker
│
├── packages/
│   ├── server/                  @relay/relay — npm-distributed binary (server, CLI, attach)
│   ├── extension/               VS Code-family extension (.vsix output)
│   ├── protocol/                shared TS types + Zod schemas for REST + WS wire shapes
│   └── pwa/                     Phase 2 placeholder (empty until Phase 2 begins)
│
├── .claude/                     project-scoped agent scaffolding (see §9)
│   ├── skills/                  domain-specific SKILL.md routines
│   ├── agents/                  project sub-agent definitions
│   └── settings.json            Claude Code project config
│
├── .mcp.json                    dev-time MCP server config (Claude Code native)
│
├── package.json                 workspace root, "private": true
├── pnpm-workspace.yaml
├── tsconfig.base.json           shared compiler options
├── lefthook.yml                 pre-commit hooks
├── .gitignore
├── .editorconfig
├── CLAUDE.md                    root agent orientation (see §9.3)
└── README.md
```

The only existing piece at v0.1 of this doc is `docs/`; everything else is created by build-plan task 4A.

## 3. Decision: internal module boundaries inside `packages/server/`

`packages/server/` is the only package that ships as an executable. It contains the server, the `relay` CLI, and the `relay attach` thin client — all sharing the same TypeScript codebase so D-08's "single binary with subcommands" contract holds. The binary entrypoint is `bin/relay.js`; it loads `cli/` and dispatches.

Inside `src/`, code is partitioned into ten modules. The PRD's load-bearing isolation targets — transcript store and PTY supervision — each get their own module. (Persona schema validation was the third target; its module was removed with the [D-17](../decisions/D-17-personas-descoped-from-mvp.md) descope and returns as its own module in Phase 2 — restore point: tag `pre-cleanup-phase1`.)

Each module below names what it **owns**, what it explicitly **does not own** (so boundaries are visible by negation, not just assertion), and how it's **tested in isolation**.

### `config/`
- **Owns.** Parsing `~/.relay/config.yaml`, applying environment-variable overrides, exposing a typed `Config` object.
- **Does not own.** Reading any file other than the config file. Defaulting paths inside other modules' state files.
- **Test isolation.** Feed YAML strings + env maps; assert the parsed `Config`.

### `store/`
- **Owns.** SQLite-backed repository layer for tenants, projects, sessions. DDL and migration runner. Returns plain TS objects shaped from rows.
- **Does not own.** Persona YAML content (lives on disk per D-09). Transcript bytes (lives in `transcript/`). Bearer-token storage (`auth/`'s `tokens.json` per `prd/03-server.md` §6). Any application logic on top of CRUD.
- **Test isolation.** Fresh in-memory SQLite per test, fixture seed data from `test/fixtures/db/`.

### `persona/` — **removed per [D-17](../decisions/D-17-personas-descoped-from-mvp.md)**
> Personas are descoped from the MVP and the module was deleted from the tree (restore point: tag `pre-cleanup-phase1`). Phase 2 restores it as its own module owning persona YAML loading, D-09 validation, and tenant/project composition; the design contract lives in [`persona-application.md`](./persona-application.md) and `prd/09-persona-schema.md`.

### `pty/`
- **Owns.** node-pty supervisor. Spawning, supervising, signaling, killing the agent process. Per-session 32 KB ring buffer (ND-03) for on-attach replay.
- **Does not own.** Knowledge of WebSockets, sessions, HTTP, transcripts. Persona application.
- **Test isolation.** Spawn benign commands (`cat`, `echo`) and assert the byte stream. The supervisor's interface is "give me a command and I'll give you bytes + a kill handle."

### `transcript/`
- **Owns.** Append-only capture of PTY bytes to `~/.relay/transcripts/<session-id>.bin`. Offset math and range reads backing `GET /sessions/:id/transcript` (ND-04). 1 MB clamp on `limit`.
- **Does not own.** The on-attach ring buffer (that's `pty/`). Compression, redaction, structured parsing — D-07 explicitly punts those to Phase 3.
- **Test isolation.** Write byte streams, assert range reads at offset boundaries; property-based tests for the offset math via `fast-check`.

### `auth/`
- **Owns.** Token generation (26-char Crockford-Base32, ≥128 bits entropy per `prd/03-server.md` §6). Hashing tokens at rest. `~/.relay/tokens.json` I/O. The verify primitive every authenticated endpoint calls.
- **Does not own.** Per-request authorization middleware (lives in `server/rest/`); it provides the verify primitive only.
- **Test isolation.** Pure crypto functions + tmpfile fixtures for the JSON store.

### `session/`
- **Owns.** Session lifecycle coordinator. ~~Resolves persona via `persona/`~~ (descoped per [D-17](../decisions/D-17-personas-descoped-from-mvp.md) — spawns a bare agent with an empty argv). Spawns under `pty/`. Wires `transcript/` as the writer. Maintains the attached-client registry. Implements the per-session claim-lock state (D-G2).
- **Does not own.** The transport (HTTP/WS). The persistence (`store/`). Domain primitives live in the modules above; `session/` is the wiring.
- **Test isolation.** Fake PTY + fake store, drive the lifecycle and assert event emissions.

### `server/rest/`
- **Owns.** Fastify routes for the API surface in `prd/03-server.md` §2. Request validation (Zod schemas from `@relay/protocol`). Error response envelope (locked in by 2E later).
- **Does not own.** Business logic — routes call `session/`, `store/`, `auth/` and format responses.
- **Test isolation.** Supertest against in-memory Fastify.

### `server/ws/`
- **Owns.** WebSocket handler for `/sessions/:id/stream`. CLAIM/SEND/RELEASE/BUSY arbitration per D-G2. 30-second claim auto-release (ND-01). Universal PTY-output fan-out per D-G3.
- **Does not own.** Transcript persistence (`transcript/`). Message-shape definitions (those live in `@relay/protocol`, generated from Zod).
- **Test isolation.** WS client against fake PTY + fake session registry.

### `cli/`
- **Owns.** commander subcommand dispatcher for the subcommands in `prd/03-server.md` §7. Each subcommand is thin: parse args → pick a data plane by the split rule below → render.
- **Data-plane rule (which client per subcommand).** Determined by what the operation touches, not a uniform policy:
  - **Read-only → SQLite/filesystem direct** (`session list`/`show`, `project list`, `token list`). No running server required; offline inspection works. Phase 1 reads render only persisted columns, never in-memory registry state.
  - **Mutates a live session → REST over loopback** (`session kill`). The PTY supervisor lives only in the `relay server` process; a direct DB write would mark the row `killed` while orphaning the `node-pty` child until the next boot sweep ([D-11](../decisions/D-11-server-restart-and-session-orphaning.md)) — a correctness violation.
  - **Logic centralized in a REST handler → REST** (`project add`/`remove`). `POST /projects` owns canonicalization, slug derivation, marker-file write ([ND-07](../decisions/ND-07-marker-file-schema.md)), and `.gitignore` append; the CLI routes through it rather than duplicating.
  - A REST-bound subcommand that can't reach the server **fails loudly (non-zero + "no relay server reachable at `<url>`")** — it never falls back to direct DB mutation. Loopback URL/token resolve as in `attach/config.ts` (`~/.relay/config.yaml` + `--token`/`RELAY_TOKEN`).
- **Does not own.** Direct file I/O outside the read-direct / filesystem-write sets above; in-process duplication of server logic for the REST-bound mutations.
- *CLI data-plane split rule resolved by [ND-16](../decisions/ND-16-cli-data-plane-boundary-rule.md) on 2026-05-27.*
- **Lazy-load contract.** `relay attach`, `relay --help`, `relay --version`, and `relay token *` must NOT transitively load `node-pty`, `better-sqlite3`, or `fastify` at module-init time — a thin-client device (phone-class, IDE-extension spawn target, CI runner with no `claude` binary) must not be forced to compile native deps it never runs. Subcommands that genuinely need a heavy data plane (`init`, `doctor`, `project *`, `session *`, `server`) `await import()` their handler inside the commander `.action()` callback so the cone loads only when that action fires. A `NODE_DEBUG=module` regression test (`cli/dispatcher-deps.test.ts`) enforces this. *Lazy-load contract resolved by [ND-18](../decisions/ND-18-lazy-load-cli-dispatcher-contract.md) on 2026-05-27.*
- **Test isolation.** Snapshot tests of subcommand stdout against fixture state.

### `attach/`
- **Owns.** The thin WebSocket client used by `relay attach` AND spawned directly by the IDE extension's terminal integration (`prd/04-ide-extension.md` §4, Start session step 3). Sets terminal raw mode, opens WS to `/sessions/:id/stream`, proxies stdin/stdout, exits cleanly on `^D`.
- **Does not own.** Session creation; it only attaches to one that already exists.
- **Test isolation.** Pipe fake stdin/stdout, assert the WS frame sequence.

## 4. Inter-module flow

`POST /sessions` arrives carrying `{ projectId }` (per [D-17](../decisions/D-17-personas-descoped-from-mvp.md) — no `personaName`; the persona resolution step returns in Phase 2):

```
HTTP request
    │
    ▼
server/rest/   validates payload via @relay/protocol Zod schema
    │
    ▼
session/       creates session row in store/ (bare agent, D-17)
    │
    ├──── pty/        spawns agent CLI with an empty argv (bare agent, D-17;
    │                 Phase 2: persona threaded in). Returns PtySupervisor
    │                 (event source + kill handle)
    │
    └──── transcript/ opens append-only writer for this session-id;
                      subscribes to PtySupervisor's byte events
    │
    ▼
server/rest/   201 Created with session id
```

Every arrow is a function call across a module boundary. No module reaches across the chain — `pty/` never touches `transcript/` directly; `session/` wires them together. This is what makes the three isolation targets testable independently.

## 5. `packages/protocol/`

A workspace package, not a folder under `packages/server/src/`. Two reasons:

1. **`packages/extension/` imports the same types** without a relative path across a workspace boundary and without an internal npm publish loop.
2. **Zod schemas are the single source of truth.** REST request/response shapes and WS frame shapes are defined as Zod schemas in `protocol/` (the persona YAML schema rejoins them in Phase 2); `z.infer<typeof Schema>` derives the TS types, and the server uses the runtime validators directly. Server validation and client TS types cannot drift — they are literally the same source.

What lives in `protocol/`: Zod schemas, derived TS types, wire constants (e.g., the 32 KB ring buffer default, the 30s claim timeout default).
What does not: business logic, runtime helpers that touch I/O, anything that depends on Node-only modules. `protocol/` is portable to the browser-bound PWA.

## 6. `packages/extension/`

Targets: VS Code, Cursor, VSCodium, Code-OSS — anywhere the VS Code Extension API is implemented (`prd/04-ide-extension.md` §1). Single `.vsix` artifact across all.

Depends on `@relay/protocol` for wire types. Does **not** depend on `@relay/server`. At runtime, the extension spawns `relay attach <session-id>` from the user's `PATH` for terminal integration (`prd/04-ide-extension.md` §4, Start session step 3); the user installs the npm package separately. This keeps the extension's bundle small and lets server and extension upgrade independently.

Build chain: esbuild for source, `@vscode/vsce` for packaging. Released to GitHub Releases at MVP (`prd/04-ide-extension.md` §2), OpenVSX next.

## 7. `packages/pwa/`

Reserved as a top-level workspace package. Empty at v0.1. The Phase 2 mobile PWA (`prd/05-mobile-pwa.md`) ships from here; the directory exists now so the workspace shape doesn't churn when Phase 2 starts. Build tooling is out of scope for this doc.

## 8. Decision: tooling picks

| Concern | Pick | Why |
|---|---|---|
| Language | TypeScript 5.x, `strict: true` | Wire contracts and module boundaries lean on types |
| Module system | ESM only | Node 22 native; no CommonJS interop tax |
| Package manager | pnpm | Best monorepo ergonomics; deterministic; symlink hygiene |
| HTTP framework | Fastify + `@fastify/websocket` | Modern, fast, native WS plugin avoids stitching `ws` separately |
| CLI framework | commander | Clean subcommand ergonomics for 7+ subcommands |
| YAML | `js-yaml` | Standard, mature |
| Schema validation | Zod | Type-first; same schemas serve REST request bodies and WS frames (persona YAML rejoins in Phase 2) |
| SQLite driver | `better-sqlite3` | Synchronous, mature; preferred over still-experimental `node:sqlite` |
| Test runner | Vitest | Fast, native ESM/TS, single config across all packages |
| Linter | ESLint 9+ flat config + `@typescript-eslint` | Standard |
| Formatter | Prettier | Standard |
| Bundler (binary) | tsup (esbuild) → `dist/relay.js` | Single-file bundle simplifies the npm tarball |
| VSIX packaging | `@vscode/vsce` + esbuild | Per VS Code extension authoring docs |
| Pre-commit hooks | lefthook | Go binary, no npm wrapper, fast |
| Property-based tests | `fast-check` | For transcript offset math (ND-04) and ring-buffer boundaries |

Test layout convention: unit tests co-located with source as `*.test.ts`; end-to-end specs and shared fixtures under `packages/server/test/{e2e,fixtures}/`.

The seven default persona YAMLs were removed from the tree with the [D-17](../decisions/D-17-personas-descoped-from-mvp.md) descope (restore point: tag `pre-cleanup-phase1`); nothing persona-related ships in the npm tarball at MVP. The Phase 2 re-enable restores the YAMLs and the `relay init` seeding.

## 9. Decision: AI-first development foundations

Relay is built primarily by AI agents (Claude Code sessions). The scaffolding below is part of the architecture for the same reason `packages/protocol/` is: it eliminates a class of iteration cost that compounds over the project's lifetime.

### 9.1 `.claude/skills/`

Each skill is a `SKILL.md`-backed routine for recurring agent tasks.

| Skill | Purpose | Source |
|---|---|---|
| `decision-log` | Resolve/defer D-NN, propagate decisions into subdocs per the 5-step protocol | exists |
| `scenario-runner` | Drive verification of the 8 Phase 1 acceptance scenarios (`prd/08-acceptance.md`) | build-plan 3B |
| `prd-link` | Resolve `D-NN` / `ND-NN` / `<file>.md §X.Y` refs to source text; flag broken refs | build-plan 3C |
| `ws-protocol-check` | Verify a WS handler implementation against the 2B message catalog (CLAIM/SEND/RELEASE/BUSY) | new |
| `persona-yaml-check` | Validate a persona YAML against D-09 — removed with the D-17 descope (tag `pre-cleanup-phase1`); restore in Phase 2 | removed |
| `sqlite-migration` | Scaffold a new migration file following the 2C convention | new |

The four "new" skills are added to `docs/build-plan.md` as follow-on tasks; this doc commits only to location and naming.

### 9.2 `.claude/agents/`

Three project sub-agents with persistent system prompts and constrained tool allowlists. Defining them upfront removes prompt-engineering cost from every review and test session.

| Sub-agent | Role | Tool posture |
|---|---|---|
| `relay-architect` | Read PRD + arch docs; evaluate implementation plans for spec-fidelity before code is written | read-only |
| `relay-test-author` | Author Vitest specs that exercise the isolation targets (transcript/pty/store/session); enforce fixture-library reuse | read + edit |
| `relay-spec-reviewer` | Given a branch diff, surface D-NN / ND-NN drift — code claims X but spec says Y | read-only |

System-prompt content is deferred to a follow-on task; this doc commits to existence, role, and tool posture only.

### 9.3 CLAUDE.md tiering

Three tiers, each at the right altitude for an agent working at that level:

- **Root `CLAUDE.md`.** Entry point. Points at `docs/prd.md`, `../decisions/index.md`, `docs/build-plan.md`. Lists pnpm script commands. Sets the D-NN citation convention for code comments (per build-plan 4A).
- **Per-package `CLAUDE.md`** at `packages/server/CLAUDE.md` and `packages/extension/CLAUDE.md`. Package-local conventions; the module map (for server); packaging notes (for extension).
- **Per-module `CLAUDE.md`** in load-bearing modules: `packages/server/src/{transcript,pty,store,session}/CLAUDE.md`. 20–50 lines each, naming must-know constraints. Examples:
  - `transcript/CLAUDE.md` — "writes are append-only; never seek; offsets are byte counts from session start, never logical messages."
  - `pty/CLAUDE.md` — "this module does not know about sessions or WebSockets; surfacing byte events + a kill handle is the whole contract."

The per-module tier prevents the dominant friction on a structured-but-AI-built codebase: an agent re-deriving the same constraint from first principles each session.

### 9.4 Dev-time MCP servers

Configured in `.mcp.json` at repo root (Claude Code's native location).

- **GitHub MCP** — PR review, issue management.
- **SQLite MCP (read-only)** — query `~/.relay/state.db` during local dev to inspect session and project rows under test.
- **Filesystem MCP scoped to `~/.relay/` and `~/.claude/`** — read transcripts and state files during debugging without shelling out.

**Relay does not ship its own MCP server.** Relay is the orchestrator that hosts agents; the agents inside a session see whichever MCPs the active persona's `mcpServers` field exposes. Bundling a "Relay MCP" would invert the architecture — the product would be talking to itself.

### 9.5 Code-quality primitives

Picks that compound for AI-built code:

| Primitive | Pick | Failure mode it prevents |
|---|---|---|
| Single source of truth for wire types | Zod schemas in `packages/protocol/`, `z.infer<>` for TS | Server validation and client TS types drifting silently |
| CLI ergonomics | Vitest snapshot tests of `relay <cmd> --help` and key outputs | UX regressions slipping in unnoticed |
| Off-by-one safety | `fast-check` property tests on transcript offset math (ND-04) and ring-buffer wrap | Byte-range edge cases the spec doesn't enumerate |
| Pre-commit hooks | lefthook (typecheck, lint, format on changed files) | Broken commits, format churn |
| End-to-end harness | `packages/server/test/e2e/` spins Relay in-process, runs a real WS client | Acceptance regressions; backed by the `scenario-runner` skill |
| Shared fixtures | `packages/server/test/fixtures/{attach,auth,db,migrations,rest}/` | "Agent reinvents a fixture" sessions; inconsistent test data |

## 10. Out of scope

- **PWA build tooling.** Phase 2; the `packages/pwa/` slot is reserved, nothing more.
- **Docker image structure.** Covered in `prd/06-distribution.md`.
- **CI workflow detail.** Separate task; this doc only commits to pre-commit hooks via lefthook.
- **JetBrains plugin.** Phase 3 (`prd/07-phasing.md`); separate codebase.
- **System-prompt content** for the three sub-agents. Follow-on task; this doc commits to existence, role, and tool posture.

## 11. What this unblocks

- **build-plan task 4A** (repo scaffold) — executable directly against §2 (tree), §8 (tooling), and §9 (AI-first foundations).
- Follow-on `build-plan.md` tasks surfaced by §9, now tracked there:
  - Skill tasks: **3D** `ws-protocol-check`, **3E** `persona-yaml-check`, **3F** `sqlite-migration`.
  - Sub-agent tasks: **5A** `relay-architect`, **5B** `relay-test-author`, **5C** `relay-spec-reviewer`.
  - **5D** Per-module `CLAUDE.md` authoring for the four load-bearing modules (`persona`, `transcript`, `pty`, `store`).
