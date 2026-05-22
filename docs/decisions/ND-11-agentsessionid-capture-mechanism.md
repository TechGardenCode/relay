---
id: ND-11
status: resolved
title: "`agentSessionId` capture mechanism"
resolved-on: 2026-05-17
affects: "docs/arch/persona-application.md §4.3 (new), packages/server/src/session/agent-session-id.ts (implementation), packages/server/src/pty/CLAUDE.md (correction), docs/build-plan.md task 6E (Reads list + Done-when)"
surfaced-by: "build-plan 6E preflight (2026-05-17) — Phase 0 report Surprise §6 explicitly assigned agentSessionId capture to 6E but left the discovery mechanism unspecified."
---

# ND-11 — `agentSessionId` capture mechanism


**Status:** resolved (2026-05-17)
**Affects:** `docs/arch/persona-application.md` §4.3 (new), `packages/server/src/session/agent-session-id.ts` (implementation), `packages/server/src/pty/CLAUDE.md` (correction), `docs/build-plan.md` task 6E (Reads list + Done-when)
**Surfaced by:** build-plan 6E preflight (2026-05-17) — Phase 0 report Surprise §6 explicitly assigned `agentSessionId` capture to 6E but left the discovery mechanism unspecified.

## Question
How does the `session/` orchestrator (6E) discover Claude Code's native session id after spawning the agent under PTY, given that Claude Code writes the id to `~/.claude/projects/<encodedCanonicalProjectPath>/<sessionId>.jsonl` rather than emitting it on stdout?

## Resolution
Filesystem-poll discovery with non-fatal timeout. The mechanism:

1. **Discovery mechanism.** Before spawn, the `session/` orchestrator snapshots the set of `.jsonl` filenames in `~/.claude/projects/<encodedPath>/`, where `encodedPath` is the project's canonical absolute path with every `/` replaced by `-` (including the leading `/`, which becomes the leading `-`). If the directory does not exist pre-spawn, the snapshot is the empty set.

2. **Polling loop.** After spawn, the orchestrator polls the directory every 250 ms for up to 30 s. The capture target is the first newly-appearing directory entry whose name matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jsonl$` (case-insensitive UUID v4 shape with `.jsonl` extension). The UUID stem (without the extension) is written to `sessions.agent_session_id` via the existing `updateAgentSessionId(db, id, ...)` repository function in [`packages/server/src/store/sessions.ts`](../packages/server/src/store/sessions.ts).

3. **Filter rule (both conditions required).** The entry must end in `.jsonl` AND its stem must be UUID-shaped. Claude Code creates three kinds of entries under the project dir: `<uuid>.jsonl` files (the capture target), bare-UUID directories with the same stem (sidecar storage), and a `memory/` directory. Filtering on `.jsonl` alone would let any future non-UUID `.jsonl` through; filtering on UUID-shape alone would match the bare sidecar directories. Empirically verified against a live `~/.claude/projects/` containing 12 project directories on 2026-05-17.

4. **Tunables.** `POLL_INTERVAL_MS = 250` and `CAPTURE_TIMEOUT_MS = 30_000` are named constants at the top of `packages/server/src/session/agent-session-id.ts` with a `Per ND-11` citation. Not server-config, not persona-overridable. Operators have no realistic reason to tune internal discovery cadence; if a real reason emerges (e.g., a slow filesystem layer surfaces in production), a follow-up ND can promote them to `~/.relay/config.yaml` alongside `claimLockTimeoutSeconds` (per ND-01).

5. **Failure mode.** Non-fatal. On timeout, `sessions.agent_session_id` stays `NULL`. When a client later attaches and the server builds the `hello` frame, the `agentSessionId` field is omitted entirely (no string, no null). Matches [`ws-protocol.md`](arch/ws-protocol.md) §2.3 "optional" wording without a wire-schema change. The IDE extension already has to handle the absent case (the agent may simply never write a `.jsonl` — e.g., during a future non-Claude agent integration).

6. **Why not Option B (`fs.watch`).** Platform-specific failure surface on macOS APFS, where `rename` events are documented to be missed under specific timing patterns; the latency win (sub-100ms vs ~250ms) does not justify the testing burden for a one-shot discovery on session spawn. Polling at 250 ms means worst-case 120 `readdir` calls per spawn — bounded and cheap.

7. **Why not Option C (parse stdout).** Claude Code does not emit its session id to stdout or stderr. Rejected on read of actual agent behavior.

**Path-encoding edge case.** The empirical sample used during resolution did not contain a canonical project path with a space character. The implementation should pass spaces through textually (Claude Code's convention appears to be pure `/` → `-` replacement with no other escaping) and ship a unit test against a fixture path containing a space; if the agent's actual behavior diverges, file an ND.

**Why this and not a wire-schema discriminator.** Adding an `agentSessionIdStatus: 'pending' | 'captured' | 'unavailable'` field to `hello` would let the IDE extension show a distinct "correlation unavailable" affordance, but: (i) under Option A the capture is synchronous before `hello` fires, so the `pending` state is a lie; (ii) the absent field already conveys "unavailable" — the extension can branch on `frame.agentSessionId !== undefined`; (iii) adding wire surface for a Phase-2 affordance is premature. If the extension later needs to distinguish "agent has no concept of session id" from "Relay gave up trying," a follow-up ND can extend the frame.

**Propagated to:** `packages/server/src/pty/CLAUDE.md` (2026-05-17), `docs/arch/persona-application.md` §4.3 (2026-05-17), `docs/build-plan.md` task 6E (2026-05-17).
