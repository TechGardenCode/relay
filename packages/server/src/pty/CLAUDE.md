# `pty/` — Module context

`node-pty` supervisor. Spawns, supervises, signals, and kills the agent process; surfaces a byte-stream and a kill handle. That is the whole contract. Authoritative shape lives in [`docs/prd/03-server.md`](../../../../docs/prd/03-server.md) §5.2.

## Owns

- `node-pty` lifecycle: spawn with persona-derived argv (D-09 + [`persona-application.md`](../../../../docs/arch/persona-application.md)), signal handling, kill semantics.
- 32 KB per-session ring buffer for on-attach replay (per ND-03).

## Does NOT own

- Knowledge of WebSockets, HTTP, sessions, or transcripts. **This module surfaces byte events + a kill handle, and that is the whole contract.**
- Persona resolution (→ `persona/`).
- Transcript persistence (→ `transcript/` subscribes to this module's byte events; `session/` does the wiring).
- Claim-lock state (→ `server/ws/`).
- Knowledge of session ids, project paths, or any other identity beyond the OS pid.

## Public surface

- `createSupervisor(args): PtySupervisor` — single entry point. Returns an event-emitter-shaped object with `pid`, `onBytes`, `onExit`, `write`, `resize`, `kill`, `snapshot`, `bytesEmitted`.
- `createRingBuffer(capacity): RingBuffer` — exported for use by tests and by any future caller that wants the ring without the supervisor.
- `DEFAULT_RING_BUFFER_BYTES = 32 * 1024` — the ND-03 global default. `session/` (6E) reads `~/.relay/config.yaml`'s `replayBufferBytes` and passes the resolved number on `SpawnArgs`; this constant is the fallback.
- Types: `SpawnArgs`, `PtySupervisor`, `ExitInfo`, `Unsubscribe`.

## Implementation notes

- `PtySupervisor.onBytes(fn): Unsubscribe` — callback registration (not Node `EventEmitter` and not `AsyncIterator`). Chosen so multiple subscribers (1 transcript writer + N attached WebSockets) are first-class without `EventEmitter`'s 10-listener warning and without needing an `AsyncIterator` tee to honor D-G3 universal output. Pattern mirrors `auth/events.ts:RevocationBus.onRevocation`.
- Ring buffer is a fixed-size `Buffer.allocUnsafe(capacity)` with a write cursor and a `filled` flag — zero allocation per byte event (single `Buffer.copy`); one allocation per `snapshot()` bounded by capacity.
- `node-pty` is spawned with `encoding: null` so chunks arrive as `Buffer`. Per ND-03 "bytes are bytes," this avoids UTF-8 round-tripping (which would replace invalid byte sequences with U+FFFD and corrupt the byte stream). The `IPty.onData` typing claims `string`; cast at the boundary.
- `onExit` clears both `byteListeners` and `exitListeners` after dispatch so callers that forget to unsubscribe don't leak references.

## Test isolation

Spawn a benign command (`cat`, `echo`, `printf`) and assert against the byte-stream. No real Claude CLI invocation in unit tests. `fast-check` covers ring-buffer overflow / wrap edge cases. The supervisor test file probes the macOS spawn-helper exec bit and `describe.skip`s with a clear diagnostic (`pnpm --filter @relay/relay fix-pty`) if missing; ring-buffer tests are unaffected (no `node-pty` dep).

## Surprising constraints

- The 32 KB ring buffer is bytes, not lines (per ND-03). Don't try to align replay to logical-message boundaries.
- **Universal output**: every byte goes to every subscriber regardless of claim state (per D-G3). The claim-lock state lives in `server/ws/`, not here — this module never inspects it.
- The supervisor is **session-id-agnostic**. It never sees a session id, file path, or claim state. That coupling lives in `session/` (6E) and `server/ws/` (6G). The kill handle is therefore best-effort — `kill(signal?)` is non-blocking and may race the process; `onExit` is the source of truth.
- `agentSessionId` capture is **not** owned here, and is **not** a stdout scan. Per [ND-11](../../../../docs/decisions/ND-11-agentsessionid-capture-mechanism.md), Claude Code never emits the id on stdout — it appears only as a `<uuid>.jsonl` filename under `~/.claude/projects/<encodedPath>/`. `session/` (6E) snapshots that directory pre-spawn, polls it every 250 ms for up to 30 s post-spawn, and writes the UUID stem to `sessions.agent_session_id` (or leaves it `NULL` on timeout, which is non-fatal). Ownership was assigned to 6E in `phase-0-report.md` §6 (Surprise #6); the mechanism is filesystem-poll, not byte-stream scan.
- macOS spawn-helper needs explicit `chmod +x` after `pnpm install`; Linux needs `build-essential`. Packaging concern for 6J; the supervisor test file skips cleanly with a diagnostic if the helper isn't executable.
