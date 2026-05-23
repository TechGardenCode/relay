# Relay PRD — Phase 1 Definition of Done

**Status:** v0.4
**Scope:** The acceptance bar for Phase 1 (MVP). Phase 1 ships when all eight scenarios below pass on a single shared installation, without regressing one another. Phase roadmap context lives in `07-phasing.md`.

---

## Why a behavior matrix, not a linear walkthrough

The earlier draft of this document specified a single linear flow (open editor → start session → close editor → reopen the *same* editor → reattach). That flow exercises one value prop (session survives editor restart) and leaves Relay's headline pains untested at the Phase 1 acceptance gate. Phase 1 should not ship until the core hypotheses are demonstrably true.

The eight scenarios below cover both headline pains (cross-device continuity, multi-session context-switching) and the supporting mechanics. Each scenario is independently testable. A single regression in any scenario means Phase 1 is not done.

---

## Scenarios

### A — Server bring-up and project registration

- `relay init` on a fresh host produces a usable bearer token and config
- `relay project add <path>` registers a project; it appears in `relay project list` and via REST. The user-supplied path is registered in place (no copy, no symlink); a `.relay/project.json` marker lands at the project root and `.relay/project.json` is appended to the project's `.gitignore`
- The server can be stopped and restarted; project list, persona definitions, and tokens persist
- After a server restart, any sessions that were `running` at shutdown appear in `relay session list --status killed` with their project, persona, `agent_session_id`, and transcript metadata intact, annotated with `terminated_reason = "server_restart"`. No auto-relaunch occurs.

*Server-restart session handling resolved by [D-11](../decisions/D-11-server-restart-and-session-orphaning.md) on 2026-05-15. Project registration semantics resolved by [D-12](../decisions/D-12-project-record-storage-and-relay-project-add-semantics.md) on 2026-05-15.*

### B — Persona × project composition is real

- The default persona set ships and is enumerable via CLI and REST
- A project-level persona override resolves correctly when listed for that project
- A session spawned with persona X exhibits behavior attributable to that persona — verifiable by inspecting the session's first agent response or the transcript artifact, not just by trusting that a config file was read

### C — Single-client session lifecycle

- IDE extension installs in a Remote-SSH'd Cursor, auto-binds the open workspace to a registered project, starts a session with a chosen persona, and the agent is interactive in the editor terminal

### D — Session survives client disconnect

- Close the IDE entirely; `relay session list` shows the session still running
- Reopen the IDE, attach to the running session, conversation continues with full context
- On reattach the IDE begins receiving live PTY output immediately, with a short replay of recent output sized to roughly one terminal viewport so the user is not staring at a blank screen
- Older context (beyond the viewport-sized replay) is pulled on demand from the transcript endpoint when the user scrolls back, per `03-server.md` §5.2

### E — Cross-device continuation (headline pain A)

- Start a session from Client 1 (e.g., Cursor on the MacBook via Remote-SSH)
- Close Client 1 entirely
- From Client 2 — a different machine, a different editor instance, *or* a plain `relay attach <session-id>` from an SSH terminal — attach to the same session and continue work
- Client 2's attach experience matches `03-server.md` §5.2: live PTY output begins streaming immediately, with a short replay of recent bytes for context; deeper history is pulled on demand via the transcript endpoint
- No PWA dependency; the multi-client *capability* is what's being tested

*Reattach contract for scenarios D and E resolved by [D-G3](../decisions/D-G3-reattach-semantics.md) on 2026-05-14.*

### F — Concurrent multi-client attach

- Two clients attached simultaneously to the same session both observe live agent output (no read-only attach mode)
- When both clients send input simultaneously, exactly one `CLAIM` wins; the other receives `BUSY`, retains its local input buffer, and surfaces a brief notice to the user
- The held claim auto-releases when the message is delivered to the PTY or when the claiming client disconnects mid-message; the previously-rejected client can then claim and send
- Either client can be the "winner" on any given message — there is no persistent control holder; contention is per-message per the contract in `03-server.md` §5.1

*Resolved by [D-G2](../decisions/D-G2-multi-client-input-arbitration.md) on 2026-05-14.*

### G — Multiple concurrent sessions across personas/projects (headline pain B)

- Two sessions running simultaneously in different (project, persona) pairs operate independently — separate working directories, separate transcripts, no cross-contamination of persona context
- `relay session list` and the IDE status bar correctly distinguish them

### H — Distribution paths actually work — **deferred to post-2.0**

> **Deferred to post-2.0 / Track 8** per [D-16](../decisions/D-16-phase-1-ships-without-distribution.md) (2026-05-22). Phase 1 ships on the dev/source-install path that scenarios A–G exercise; the distribution surface below is preserved here so future-us can re-walk it when Track 8 picks up. The Phase 1 gate ([`docs/build-plan.md`](../build-plan.md#6z-phase-1-done-gate) 6Z) requires A–G only.

- `npm install -g` on a fresh Node 22+ host produces a working `relay` binary
- The published Docker image runs scenarios A–E from a clean container
- Documentation walks a new user through bring-up to scenario E without requiring spelunking

*Deferred from Phase 1 by [D-16](../decisions/D-16-phase-1-ships-without-distribution.md) on 2026-05-22.*

---

## Explicit Phase 1 deferrals

The following capabilities are not part of the Phase 1 acceptance bar. They are listed here so a tester does not flag their absence as a regression.

- **Distribution surface (scenario H).** `npm install -g`, the published Docker image, and Docker Compose with Caddy + Tailscale sidecar are deferred to post-2.0 / Track 8 per [D-16](../decisions/D-16-phase-1-ships-without-distribution.md). Phase 1 ships on dev/source-install; scenario H above is preserved as the future bar Track 8 will re-walk.
- **Structured logging and observability.** Phase 1 emits whatever Node's default logger produces; there is no metrics endpoint, no tracing instrumentation, and no log-aggregation guidance beyond "run it under your service manager and collect stdout." Observability landing is a Phase 3 hardening concern.
- **Token rotation.** Per-device tokens are valid indefinitely until revoked; automatic rotation is deferred per [D-05](../decisions/D-05-per-device-token-rotation.md).
- **Multi-tenant client UX.** The tenant routes exist on the API surface but no Phase 1 client surfaces them; see `03-server.md` §2.
- **PWA.** Mobile is Phase 2.
- **`idle` session status.** The status column carries `idle` as a reserved value but no MVP transition uses it; it is documented for a future agent-driven indicator (see `01-conceptual-model.md`).

## Phase 2 extension

Phase 2 (mobile PWA) extends scenario E with a phone as Client 2 — but does not change the Phase 1 bar. If the Phase 1 server contract is sound, the mobile client is a drop-in replacement for one of the desktop attach surfaces.

## Blockers

None outstanding from `../decisions/index.md`. The reattach contract underpinning scenarios D and E lives in `03-server.md` §5.2 (D-G3, propagated 2026-05-14); the input-arbitration contract underpinning scenario F lives in `03-server.md` §5.1 (D-G2, propagated 2026-05-14). Remaining ND-NN sub-questions and P0/P1 doc gaps were resolved on 2026-05-15 — see [`decisions/index.md`](../decisions/index.md) for the propagation record.
