# `pty/` — Module context

`node-pty` supervisor. Spawns, supervises, signals, and kills the agent process; surfaces a byte-stream and a kill handle. That is the whole contract. Authoritative shape lives in [`docs/prd/03-server.md`](../../../../docs/prd/03-server.md) §5.2.

## Owns

- `node-pty` lifecycle: spawn with persona-derived argv (D-09 + [`persona-application.md`](../../../../docs/arch/persona-application.md)), signal handling, kill semantics.
- 32 KB per-session ring buffer for on-attach replay (per ND-03).

## Does NOT own

- Knowledge of WebSockets, HTTP, sessions, or transcripts. **This module surfaces byte events + a kill handle, and that is the whole contract.**
- Persona resolution (→ `persona/`).
- Transcript persistence (→ `transcript/` subscribes to this module's byte events).
- Claim-lock state (→ `server/ws/`).

## Test isolation

Spawn a benign command (`cat`, `echo`, `printf`) and assert against the byte-stream. No real Claude CLI invocation in unit tests. `fast-check` covers ring-buffer overflow / wrap edge cases.

## Surprising constraints

- The 32 KB ring buffer is bytes, not lines (per ND-03). Don't try to align replay to logical-message boundaries.
- **Universal output**: every byte goes to every subscriber regardless of claim state (per D-G2). The claim-lock state lives in `server/ws/`, not here — this module never inspects it.
- macOS spawn-helper needs explicit `chmod +x` after `pnpm install`; Linux needs `build-essential`. Packaging concern for 6J, but unit tests must skip cleanly with a clear diagnostic if the helper isn't executable (surfaced by the Phase 0 spike).
