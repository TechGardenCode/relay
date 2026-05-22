# Relay Arch — Client Agnosticism

**Status:** v0.1 (audit, 2026-05-22)
**Scope:** Records the architectural state of Relay's client interface. Names where the implementation is genuinely client-neutral (PTY, WS protocol, session lifecycle), names the design choices that look terminal-specific but are intentional, and points at the deferred questions that gate "bring your own client" beyond the three first-party clients (`relay attach`, IDE extension, future PWA).

**Out of scope:** Wire-format details ([`ws-protocol.md`](./ws-protocol.md) is authoritative). REST surface conventions ([`rest-conventions.md`](./rest-conventions.md)). Persona application mechanics ([`persona-application.md`](./persona-application.md)). The build-plan does not contain a "client-agnosticism" task — this doc is a one-shot architectural readout, not a closing artifact for an open task.

---

## 1. Verdict

**The architecture is client-agnostic.** Three independent layers — the `pty/` supervisor, the `server/ws/` handler, and the `session/` orchestrator — were audited against the question "does this assume the client is a terminal?" In every layer the answer is no. The PTY module surfaces bytes and a kill handle and explicitly disowns transport, session identity, and claim state. The WS handler treats output as opaque bytes and input as opaque base64. The session lifecycle has no `clientType` field at any layer (REST input, database row, in-memory handle, fan-out subscriber). `relay attach` is a reference client that happens to ship in the same binary as the server, not a privileged participant in the protocol.

The friction that exists for third-party clients today is **packaging and documentation**, not architecture: `@relay/protocol` is unpublished; the WS endpoint is documented but un-frozen; the only documented credential flow is interactive OAuth; `relay attach` is bundled with the server. None of these are architectural defects — they are commitments not yet made. They are filed as `ND-26` through `ND-29` (see §5).

---

## 2. Evidence by layer

### 2.1 PTY supervisor (`packages/server/src/pty/`)

The supervisor is a pure `node-pty` wrapper. Its CLAUDE.md ([`packages/server/src/pty/CLAUDE.md`](../../packages/server/src/pty/CLAUDE.md)) names what it does *not* own:

> Knowledge of WebSockets, HTTP, sessions, or transcripts. **This module surfaces byte events + a kill handle, and that is the whole contract.**
> … Claim-lock state (→ `server/ws/`). Knowledge of session ids, project paths, or any other identity beyond the OS pid.

The public surface (`createSupervisor`, `onBytes`, `write`, `resize`, `kill`, `snapshot`) is client-neutral. Output fan-out is universal — per `pty/supervisor.ts:40-42`:

```ts
// Per D-G3: every byte reaches every subscriber regardless of claim state.
// The supervisor never inspects claim-lock — that lives in server/ws/.
for (const fn of byteListeners) fn(b);
```

The PTY module never sees a session id, a client identity, or a claim. Swap the WS handler for a gRPC server or a Unix socket and the supervisor works unchanged.

### 2.2 WebSocket protocol (`docs/arch/ws-protocol.md`, `packages/server/src/server/ws/`)

`ws-protocol.md` §1 commits the wire to a deliberately client-neutral framing:

> WebSocket binary frames carry raw PTY output bytes from the server to the client. **No envelope, no encoding, no length prefix** — WebSocket itself is length-delimited. Bytes are appended to the client's scrollback verbatim.

Input is symmetric — a single JSON `send` frame with opaque base64 bytes (`ws-protocol.md` §2.2). The server writes those bytes to PTY stdin without inspecting their semantics. The Zod schemas in [`packages/protocol/src/ws-frames.ts`](../../packages/protocol/src/ws-frames.ts) carry no client-type field at the protocol layer.

The minimum useful client is a **read-only observer**: receive `hello`, `replay_start`, `replay_end`, and binary frames. `claim`, `send`, `release`, and `resize` are all client-optional. A program that just wants to watch a session needs zero terminal awareness.

The output handler (`packages/server/src/server/ws/handler.ts:239-247`) confirms the broadcast model end-to-end:

```ts
opts.registry.attach(sessionId, {
  id: ctx.id,
  onBytes(chunk: Buffer): void {
    // Per D-G3 (ws-protocol.md §2.4): every byte to every attached
    // client regardless of claim state. The lock is NEVER inspected
    // here — that would be a `claim_gated_output` violation flagged
    // by the ws-protocol-check skill.
    sendBinary(ctx, chunk);
  },
  …
})
```

### 2.3 Session lifecycle (`packages/server/src/session/`, `docs/arch/persona-application.md`)

The session `create` input is `{ projectId, personaName, canonicalProjectPath }` ([`packages/server/src/session/types.ts`](../../packages/server/src/session/types.ts) `SessionCreateInput`). There is no `clientType` field. The `AttachedClient` interface is opaque — `id`, `onBytes`, optional `onSessionEnd` — and the registry never asks who is attaching. The persona-application mechanism ([`persona-application.md`](./persona-application.md) §1) composes a Claude Code argv and a transient `~/.relay/sessions/<sid>/` directory; nothing in the spawn path depends on the originating client.

### 2.4 `relay attach` is a reference client, not part of the protocol

The VS Code extension is the clearest evidence: per [`prd/04-ide-extension.md`](../prd/04-ide-extension.md) §4, it spawns `relay attach` as a child process and proxies stdin/stdout to a terminal pane:

> Opens a new terminal in the editor with a custom shell pointing at `relay attach <session-id>`. The `relay attach` command is a tiny client that establishes a WebSocket to `/sessions/:id/stream`…

The extension *could* have spoken WS directly. It shells out because shelling out reuses a known-good TTY bridge — a pragmatic choice, not an architectural one. The wire is open to anyone.

---

## 3. Intentional constraints

Three behaviors look terminal-specific at first read but are deliberate design. They are constraints, not defects, and revisiting any of them is a `decision-log` matter rather than a refactor.

### 3.1 Newline-byte claim release ([[nd-24-per-keystroke-input-streaming-for-tui-agents]])

The server scans each `send` payload for `\n` (0x0a) or `\r` (0x0d) and releases the claim on the first match (`packages/server/src/server/ws/handler.ts:430-432`, `containsNewline` at line 438). This makes Enter the natural unit of conversational arbitration for TUI agents and keeps the server line-agnostic about everything else inside the payload. A hypothetical programmatic client that wants to send structured commands without trailing newlines either appends a synthetic `\n` to trigger release or revisits ND-24. The trade-off is explicit in the decision; it is not an oversight.

### 3.2 Default PTY size 120×32 when no `resize` arrives

`packages/server/src/pty/supervisor.ts:23-24` spawns with `cols: args.cols ?? 120, rows: args.rows ?? 32`. The `resize` frame is client-optional (per [[nd-23-pty-size-negotiation-and-sigwinch-forwarding-for-attach-clients]]); clients without a viewport (a programmatic poller, a future PWA before its first paint) can skip it entirely. The wire grammar accepts `resize` from any attached client regardless of claim state and triggers no acknowledgement — it is a side-channel. The cost of skipping is that TUI agents inside the PTY (claude, vim) render to the 120×32 default until the first `resize` lands. A future server-side option would be to accept `cols`/`rows` on `POST /sessions` so non-TTY clients can declare dimensions out-of-band; not wired today.

### 3.3 No capability negotiation in `hello`

A client cannot declare what frames it supports; the server cannot declare optional features. The only graceful-degradation path is the `unknown_type` error (`ws-protocol.md` §4.1) which lets a v1 server reject a future v2 frame type without dropping the connection. Forward-compatible only. Acceptable at Phase 0/1 because all three first-party clients ship in lockstep with the server; it becomes load-bearing when third-party clients diverge in cadence. See §5.

---

## 4. Integration patterns supported today

Each pattern works against the current implementation with no protocol changes.

### 4.1 Process-level (Herdr pattern)

Spawn `relay attach <session-id>` as a child process. The spawner needs zero protocol awareness — `relay attach` is a well-mannered CLI with raw-mode TTY handling, clean signal forwarding, and a documented detach key sequence. This is how a terminal multiplexer like [Herdr](https://github.com/ogulcancelik/herdr) integrates Claude Code, Codex, and similar agents today; Relay sessions slot into the same shape. The integration is invisible to the multiplexer beyond "this is a CLI that produces terminal output."

### 4.2 Wire-level (custom WS client)

Open a WebSocket to `/sessions/:id/stream` with a bearer token, consume `hello → replay_start → binary frames → replay_end`, optionally send `claim` / `send` / `release` / `resize`. Works today. The friction is downstream of the protocol:

- The third-party tool must copy the Zod schemas from `packages/protocol/src/ws-frames.ts` (the package is unpublished — see ND-26).
- The wire is documented in `ws-protocol.md` but not frozen as a stability commitment (see ND-27).
- Credentials are OAuth-only via `relay init`; a headless integration scenario needs a programmatic auth path (see ND-28).

None of those are protocol violations; they are commitments not yet made.

### 4.3 Subprocess-of-attach (VS Code extension pattern)

Embed `relay attach` as a child process and proxy stdin/stdout to another I/O surface (a terminal pane, a pseudo-tty bridge, an MCP server). The extension uses this shape today (`prd/04-ide-extension.md` §4). Reuses the bundled thin client so the consumer never has to implement the WS state machine.

---

## 5. Deferred questions

Each question below is filed under `docs/decisions/` and will be resolved when the relevant phase makes it load-bearing (most likely Phase 2 / PWA work). The arch doc remains the entry point to the audit; the decision log carries the deliberation.

- [[nd-26-publish-relay-protocol-package-to-npm-as-a-third-party-surface]] — Should `packages/protocol/` be published so third-party clients can `npm install @relay/protocol` instead of copying schemas?
- [[nd-27-stability-commitment-for-the-ws-endpoint-as-a-third-party-surface]] — Do we freeze `/sessions/:id/stream` as a public, breaking-change-controlled surface, and when?
- [[nd-28-programmatic-machine-to-machine-credential-flow]] — Do we add a `POST /tokens` PAT flow (or equivalent) for headless integrations alongside the OAuth path?
- [[nd-29-distribute-relay-attach-as-a-standalone-package]] — Do we extract `relay attach` to `@relay/attach`, or document a "install the server, only run attach" recipe?
