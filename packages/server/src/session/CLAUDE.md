# `session/` — Module context

Orchestration glue. Spawns the agent under `pty/`, wires `transcript/` as the byte sink, maintains the attached-client registry that 6G layers claim-lock on top of, drives the byte-accountant (per ND-13), and runs the boot orphan sweep (per D-11). Authoritative inter-module flow lives in [`docs/arch/repo-layout.md`](../../../../docs/arch/repo-layout.md) §4.

Per [D-17](../../../../docs/decisions/D-17-personas-descoped-from-mvp.md), personas are descoped from MVP: the `persona/` module is dormant and **not** on the spawn path. `create()` takes no persona and spawns a **bare agent** (empty argv — no `--model`/`--append-system-prompt`/`--mcp-config`/`--disable-slash-commands`). The `sessions.persona_name` column + wire field are retained, carrying a server-stamped sentinel (`'agent'`) that is never user-supplied.

## Owns

- The session lifecycle: insert row → write transient session dir → spawn supervisor → open transcript writer → fan bytes out to attached clients.
- The boot orphan sweep at server start (D-11) — the **only** writer of `sessions.terminated_reason = 'server_restart'`.
- The shutdown discipline that prevents `pty.onExit` from stamping `'agent_exit'` during shutdown (Phase 0 surprise §2).
- The byte-accountant (ND-13): per-session deltas, 1 s batched flush, synchronous drain on `pty.onExit` and `registry.shutdown()`.
- The `agentSessionId` capture (ND-11): pre-spawn snapshot + post-spawn poll on `~/.claude/projects/<encodedPath>/`.
- `initServer({ db, migrationsDir, ... })`: the single entry point 6F calls at boot — runs migrations → ensures the singleton tenant → boot sweep → constructs the registry.

## Does NOT own

- Persistence primitives (→ `store/`). The orchestrator calls `sessions.insert`, `sessions.markKilled`, `sessions.markRunningAsKilled`, `sessions.updateAgentSessionId`, `sessions.incrementTotalBytes`.
- The HTTP/REST surface (→ `server/rest/`, 6F). 6F calls `registry.create()` from the `POST /sessions` handler.
- The WebSocket frames + claim-lock state machine (→ `server/ws/`, 6G). 6G calls `registry.attach()` and layers CLAIM/SEND/RELEASE on top of the `attached` Set this module maintains.
- The `relay session list/kill/show` CLI subcommands (→ `cli/`, 6H).
- Postinstall `node-pty` fixups (macOS spawn-helper chmod, Linux build-essential) — that's 6J per Phase 0 §1.

## Public surface

- `initServer(opts): Promise<{ registry, shutdown }>` — the bootstrap. Imports cleanly into 6F.
- `createRegistry(deps): SessionRegistry` — for tests that want the registry without the migration boot dance.
- `SessionRegistry` — `create`, `get`, `attach`, `kill('operator_kill')`, `shutdown()`, `shuttingDown: boolean`.
- `SessionHandle` — `id`, `row` (fresh read), `pid`, `bytesEmitted`, `write`, `resize`, `snapshot`.
- `SessionCreateError` with code `'session_not_found'` — 6F maps to 404 per [`rest-conventions.md`](../../../../docs/arch/rest-conventions.md) §3. (Per D-17 the `'persona_not_found'` code was removed with the persona spawn path.)
- `bootOrphanSweep(db, now?)` — direct access for tests + ops scripts.
- `captureAgentSessionId(opts)` + `claudeProjectDir(path)` + `encodeClaudeProjectPath(path)` — exported for `agent-session-id.test.ts` and for 6G if it ever needs to compute the path.
- `createByteAccountant(opts)` — exported so tests can exercise the accountant without standing up a registry.
- `writeTransientDir(args)` — exported for `spawn.test.ts`. (Per D-17 `buildArgv`/`hashPersonaFile` were removed with the persona spawn path.)

## Test isolation

In-memory SQLite (`:memory:`) per test plus a fake `PtySupervisor` that matches the `pty/types.ts` interface. No real `node-pty` spawns in `session/` unit tests — that's 6D's territory and the spawn-helper exec-bit issue lives there. Tests pass `homeOverride` so transient session dirs and the agent-session-id poll target a `mkdtempSync` temp dir.

## Surprising constraints

- `bootOrphanSweep` is the **only** writer of `terminated_reason = 'server_restart'`. The type signature on `sessions.markRunningAsKilled` enforces this (it accepts only the literal `'server_restart'`); do not work around it. Per [D-11](../../../../docs/decisions/D-11-server-restart-and-session-orphaning.md) + Phase 0 surprise §2.
- `pty.onExit` listeners early-return when `registry.shuttingDown` is true. Without this guard, shutdown-time exits race the boot sweep and stamp `'agent_exit'` before the server dies. Per Phase 0 surprise §2.
- `kill('operator_kill')` mutates `record.explicitlyKilled = true` **before** signalling the supervisor, so the eventual `pty.onExit` listener skips its own `markKilled('agent_exit')` write. Without this, the row's `terminated_reason` would flip from `'operator_kill'` to `'agent_exit'` after the signal lands.
- PTY bytes fan out to every attached client regardless of claim state (per [D-G3](../../../../docs/decisions/D-G3-reattach-semantics.md)). Claim arbitration lives in 6G's WS handler; this module never inspects claim state.
- `agentSessionId` capture is fire-and-forget and non-fatal (per [ND-11](../../../../docs/decisions/ND-11-agentsessionid-capture-mechanism.md)). `NULL` on `sessions.agent_session_id` is a valid terminal state — the WS `hello` frame simply omits the field.
- `sessions.total_bytes` is eventually consistent within the byte-accountant's 1 s flush window during a session's lifetime (per [ND-13](../../../../docs/decisions/ND-13-byte-accounting-cadence-for-sessions-total-bytes.md)). `total_bytes === fstat(sidecar).size` is guaranteed only after `pty.onExit` (per-session drain) or `registry.shutdown()` (global drain).
- `spawn.json` is validated against [`SpawnRecordSchema`](../../../../packages/protocol/src/spawn-record.ts) (per [ND-12](../../../../docs/decisions/ND-12-spawn-json-schema-location.md)) **before** the write; a malformed record fails loud rather than landing on disk. Per D-17 it carries `argv: [agentCli]` and omits the (now-optional) persona fields.
- A spawn failure after the session row is inserted marks the row `'operator_kill'` so no `running` row is left without a live supervisor.
