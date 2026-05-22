---
id: ND-13
status: resolved
title: "Byte-accounting cadence for `sessions.total_bytes`"
resolved-on: 2026-05-17
affects: "packages/server/src/session/byte-accounting.ts (new — implemented by 6E), packages/server/src/store/CLAUDE.md (freshness note), packages/server/src/transcript/CLAUDE.md (readRange freshness contract), docs/arch/sqlite-schema.md §3.3 (column comment), docs/build-plan.md §6E + §6F (Reads pointers)"
surfaced-by: "build-plan 6E preflight (2026-05-17) — 6E wires pty.onBytes to transcript.writer.append, and must also keep sessions.total_bytes reasonably accurate for [[nd-04-transcript-pagination-api-shape]]'s before-cursor semantics. The flush cadence has cost vs. accuracy trade-offs that should be resolved deliberately."
---

# ND-13 — Byte-accounting cadence for `sessions.total_bytes`


**Status:** resolved (2026-05-17)
**Affects:** `packages/server/src/session/byte-accounting.ts` (new — implemented by 6E), `packages/server/src/store/CLAUDE.md` (freshness note), `packages/server/src/transcript/CLAUDE.md` (readRange freshness contract), `docs/arch/sqlite-schema.md` §3.3 (column comment), `docs/build-plan.md` §6E + §6F (Reads pointers)
**Surfaced by:** build-plan 6E preflight (2026-05-17) — 6E wires `pty.onBytes` to `transcript.writer.append`, and must also keep `sessions.total_bytes` reasonably accurate for [[nd-04-transcript-pagination-api-shape]]'s `before`-cursor semantics. The flush cadence has cost vs. accuracy trade-offs that should be resolved deliberately.

## Question
When does the `session/` orchestrator call `sessions.incrementTotalBytes(db, sid, delta, now)` to update the `sessions.total_bytes` column — on every PTY byte event (correct but expensive), batched on a timer (lossy on hard crash), or only on `pty.onExit` / `registry.shutdown()` (very lossy but simplest)?

## Elaboration prompt
[[nd-04-transcript-pagination-api-shape]] commits to a `before`-cursor over byte offsets where `totalBytes` is the canonical upper bound the server presents to clients. The transcript sidecar file is the ground truth for which bytes exist on disk (per [`docs/arch/sqlite-schema.md`](arch/sqlite-schema.md) §3); the `total_bytes` column is a denormalized read accelerator that lets `GET /transcript` answer without `fstat`-ing the sidecar on every paginated read.

Three options:

- **Option A — Per-chunk synchronous flush.** Every `pty.onBytes` event calls `incrementTotalBytes`. Accurate to the byte, but at terminal output rates (a `make` invocation can emit thousands of small chunks/sec), this is one SQL UPDATE per chunk — measurable IO load on a host with multiple live sessions. Correctness wins, perf loses.
- **Option B — Batched 1-second flush with shutdown drain.** In-memory pending counter per session; a `setInterval(flush, 1000)` SQL-UPDATEs only sessions with non-zero pending deltas. `registry.shutdown()` and `pty.onExit` both flush synchronously. Lossy by ≤1 s on hard crash (kill -9, power loss) — but the sidecar file is the disaster-recovery source of truth and 6F's transcript pagination can fall back to `fstat()` on the sidecar when `total_bytes` is suspected stale (e.g., on first read after a `running` row's recent boot-sweep transition). Cost: one SQL UPDATE per active session per second, dominated by the rate of inactive sessions (which contribute zero updates). Lean.
- **Option C — Flush only on `pty.onExit` and `registry.shutdown()`.** Zero overhead during the session's lifetime. `total_bytes` reports `0` until the agent exits — `GET /transcript` paginated reads must fall back to `fstat()` on every call for live sessions. Simplest code; pushes complexity into the read path.

What to validate before resolving: (a) whether the 1-second cadence is the right tunable, or whether it should scale with session count (e.g., 100ms when one session, 5s when ten); (b) whether the lossiness on hard crash is acceptable given that the next boot's [[d-11-server-restart-and-session-orphaning]] sweep flips the row to `killed/server_restart` and the `total_bytes` lag becomes user-visible only via `GET /transcript` cursor edge cases (the sidecar `fstat()` fallback covers this); (c) whether the byte-accounting module should also expose a `force-flush` hook for tests and operator commands; (d) whether 6F needs a `transcript/CLAUDE.md` note that `total_bytes` is eventually consistent within the cadence window.

Proposed direction is Option B (1-second batched flush + shutdown drain) with a consistency note added to `packages/server/src/store/CLAUDE.md` so 6F's transcript pagination code is aware of the freshness boundary. Code that touches `packages/server/src/session/byte-accounting.ts` and the consumer in `session/registry.ts` is blocked on this resolution.

## Resolution
**Option B — batched 1-second flush with synchronous drain on `pty.onExit` and `registry.shutdown()`.** A single shared `setInterval` in the byte-accountant module iterates a `Map<sid, pendingDelta>` once per second and issues one `sessions.incrementTotalBytes` SQL UPDATE per session with a non-zero delta. `pty.onBytes` is the upstream; per-session handles are issued by `track(sid)` and exposed back to the `session/` orchestrator so it can call `drain()` synchronously inside its own `onExit` listener.

1. **Cadence is fixed at 1 second.** Production callers do not pass `intervalMs`; tests pass shorter values (e.g., 50 ms) for fake-timer assertions. No adaptive scaling — the flush cost is already proportional to active sessions because zero-delta entries are skipped before the SQL call.
2. **Crash lossiness of ≤1 second is accepted.** The on-disk transcript sidecar is the disaster-recovery source of truth. 6F's `GET /transcript` trusts `sessions.total_bytes` directly; an `fstat(sidecar).size` fallback is documented in `transcript/CLAUDE.md` as future hardening for the boot-orphan-sweep edge case (a `running` row that the next boot's sweep per [[d-11-server-restart-and-session-orphaning]] flips to `killed`/`server_restart` without a drain). On graceful shutdown the synchronous drain in `registry.shutdown()` closes the gap.
3. **Force-flush hook is part of the public surface.** `ByteAccountant.flushNow()` synchronously drains every non-zero pending delta. Used by tests, by the boot orphan sweep (defensive), and as a primitive for future operator commands.
4. **`transcript/CLAUDE.md` carries the freshness note.** 6F's `readRange` caller passes `totalBytes` from `sessions.total_bytes`; that value can lag the on-disk sidecar by up to 1 second on a live session. `total_bytes === fstat(sidecar).size` is guaranteed only after `pty.onExit` (per-session drain) or `registry.shutdown()` (global drain).
5. **Drain order on `pty.onExit`: `writer.close()` (await) → `handle.drain()` (sync) → `handle.release()`.** The `fsync` lands before the SQL UPDATE so the column matches the on-disk sidecar size at the moment the row transitions to `idle`/`killed`.
6. **`pty.onBytes` is the source, not `transcript.writer.bytesWritten`.** Per the `pty/CLAUDE.md` contract that `bytesEmitted` is the authoritative running count of bytes the PTY produced, the byte-accountant subscribes to the same `onBytes` callback the transcript writer does. Both subscribers receive the same byte slice (per D-G3 universal output); the column counts what the PTY emitted.

**Why not Option A:** per-chunk synchronous SQL UPDATE on every `pty.onBytes` event is correct to the byte but couples terminal output rate (thousands of small chunks/sec under `make` or `cargo build`) to SQLite write rate. The accuracy gain over Option B is invisible to clients — 6F's pagination uses `totalBytes` as a `before`-cursor upper bound, and a ≤1 s lag at the leading edge is indistinguishable from network latency.

**Why not Option C:** flush-only-on-exit pushes the cost into the read path: `GET /transcript` on a live session would read `total_bytes = 0` and have to `fstat` the sidecar on every paginated read. That's more state for 6F (discriminating "live, use fstat" from "killed, use column") and the fstat cost compounds across the N range-reads a UI does while scrolling.

**Propagated to:** `store/CLAUDE.md`, `transcript/CLAUDE.md`, `sqlite-schema.md` §3.3 (column comment), `build-plan.md` §6E + §6F (2026-05-17).
