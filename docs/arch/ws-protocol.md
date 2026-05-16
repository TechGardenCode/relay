# Relay Arch — WebSocket Wire Protocol

**Status:** v0.1
**Scope:** Wire format for the `GET /sessions/:id/stream` WebSocket endpoint specified in [`prd/03-server.md`](../prd/03-server.md) §2 and §5 — frame-type discipline, control-message JSON shapes, initial replay framing, error envelope, both-sides state machines, message ordering on attach, and keepalive posture. Closes build-plan task 2B; unblocks the `ws-protocol-check` skill ([`repo-layout.md`](./repo-layout.md) §9.1) and the WebSocket handler in `packages/server/src/server/ws/`.

**Out of scope:** REST surface ([`prd/03-server.md`](../prd/03-server.md) §2); TLS and token issuance ([`prd/03-server.md`](../prd/03-server.md) §6 — only the upgrade-time bearer check is in scope here); ring-buffer internals ([`prd/03-server.md`](../prd/03-server.md) §5.2 and [ND-03](../open-questions.md#nd-03-ring-buffer-size-for-attach-replay) already commit to mechanics and size); transcript pagination ([ND-04](../open-questions.md#nd-04-transcript-pagination-api-shape)); client renderer behavior ([`prd/04-ide-extension.md`](../prd/04-ide-extension.md), [`prd/05-mobile-pwa.md`](../prd/05-mobile-pwa.md)).

---

## 1. Framing model

The endpoint carries two qualitatively different payloads on one socket: low-volume transactional control messages (claim arbitration, lifecycle, errors) and high-volume PTY byte streams (terminal output, occasionally pasted input). The wire uses both WebSocket frame types natively rather than wrapping everything in JSON:

- **WebSocket binary frames** carry raw PTY output bytes from the server to the client. No envelope, no encoding, no length prefix — WebSocket itself is length-delimited. Bytes are appended to the client's scrollback verbatim.
- **WebSocket text frames** carry control messages as a single JSON object with a `type` discriminator. Used for everything that isn't raw PTY output: claim/ack/busy/release, replay brackets, errors, lifecycle, and the small server-bound `send` carrying base64 input.

This split exists because the cost calculus on the output path is different from the input path. PTY output can be megabyte-scale (compile logs, agent dumps); wrapping it in JSON would force base64 (≈33% bandwidth overhead) and an encode/decode hop on every chunk, on what is the hottest path in the protocol. Relay is LAN-bound so bandwidth is cheap, but the encode/decode CPU is not free at agent-dump volumes. WebSocket frame opcodes already distinguish binary from text natively (RFC 6455 §5.6); the discriminator is therefore free. Both the browser PWA's native `WebSocket` and Node's `ws` library surface frame type per message, so neither client surface pays a complexity tax.

**Conventions used throughout this doc:**

- JSON field names are `camelCase` (matches `claimLockTimeoutSeconds` and `replayBufferBytes` from [`prd/03-server.md`](../prd/03-server.md) §5).
- `type` discriminator values are `snake_case` (matches the `CLAIM` / `SEND` / `RELEASE` / `BUSY` vocabulary already in [`prd/03-server.md`](../prd/03-server.md) §5.1, lowercased on the wire).
- ISO-8601 strings for all timestamps. The server is authoritative on time; clients never assert wall-clock values to the server.
- No protocol version field in v1. See §8.

## 2. Message catalog

### 2.1 Common envelope

Every JSON control message has the shape:

```json
{ "type": "<discriminator>", "id": "<optional-correlation-id>", ... }
```

- `type` (string, required) — message discriminator. One of the values defined below.
- `id` (string, optional) — client-originated correlation id. Set only on client→server messages; the server echoes it on the matching `claim_ack`, `busy`, or `error` so a client that has reissued a `claim` mid-flight can pair the response to the right local request.

Unknown fields are ignored; unknown `type` values are answered with an `error` frame (see §4).

### 2.2 Client → Server

**`claim`** — request the per-session input lock ([D-G2](../open-questions.md#d-g2-multi-client-input-arbitration) §5.1 rule 1).

```json
{ "type": "claim", "id": "c-7f3a" }
```

**`send`** — deliver one line-buffered input to the PTY. Single JSON frame carrying base64-encoded bytes:

```json
{
  "type": "send",
  "id": "c-7f3a",
  "data": "bHMgLWxhCg=="
}
```

- `data` (string, required) — base64 encoding of the raw input bytes. Typically a single Enter-terminated line; pasted input is permitted and the server places no application-layer size cap (server-level limits — WebSocket frame size, configurable — apply).

Input could in principle be sent as a separate binary frame to avoid base64's ≈33% overhead, but input is line-buffered ([D-G2](../open-questions.md#d-g2-multi-client-input-arbitration)) and small (typical 50–200 bytes); on LAN the overhead is invisible and the single-frame design avoids a per-connection "awaiting binary" state machine on the server. Output stays binary precisely because it does not have those properties. The asymmetry is intentional and may be revisited if real-world input volumes ever change the picture.

**`release`** — voluntarily release a held claim. Optional and best-effort:

```json
{ "type": "release", "id": "c-7f3a" }
```

[D-G2](../open-questions.md#d-g2-multi-client-input-arbitration) §5.1 rule 4 specifies three automatic release paths (PTY delivery, WS close, 30-second timeout per [ND-01](../open-questions.md#nd-01-claim-lock-timeout-duration)); none requires a client-initiated release. `release` exists only for "user opens compose, the other device is queued, user changes their mind without pressing Enter" — the client frees the lock immediately instead of letting the other device wait out the 30-second window. A `release` from a connection that does not hold the active claim is a no-op (the server replies `error { code: "release_without_claim", fatal: false }`).

### 2.3 Server → Client (control)

**`hello`** — always the first frame sent after a successful WebSocket upgrade. Communicates the server-configured values in force for the session, so the client UI can render countdowns and scrollback hints without a separate REST roundtrip and without risk of drift if the operator changed config between calls.

```json
{
  "type": "hello",
  "sessionId": "01J7ZXY9PQ2K0M4B6F3HV8C5R7",
  "agentSessionId": "abc-123-de",
  "status": "running",
  "replayBufferBytes": 32768,
  "claimLockTimeoutSeconds": 30,
  "serverTime": "2026-05-15T14:32:00Z"
}
```

- `sessionId` (string, ULID, required) — confirms which session this socket is bound to.
- `agentSessionId` (string, optional) — Claude Code's native session id; present when the agent has surfaced one. Useful for the IDE extension to correlate with `~/.claude/projects/`.
- `status` (string enum, required) — `running` or `killed`. If `killed`, the server emits a `session_ended` frame immediately after `hello` and closes (see §4).
- `replayBufferBytes` (int, required) — the value in force for this session (default 32768, configurable per [ND-03](../open-questions.md#nd-03-ring-buffer-size-for-attach-replay)).
- `claimLockTimeoutSeconds` (int, required) — the value in force for this session (default 30, configurable per [ND-01](../open-questions.md#nd-01-claim-lock-timeout-duration)).
- `serverTime` (string, ISO-8601, required) — for client clock-skew display only; never used for protocol correctness.

**`claim_ack`** — claim granted ([D-G2](../open-questions.md#d-g2-multi-client-input-arbitration) §5.1 rule 1).

```json
{
  "type": "claim_ack",
  "id": "c-7f3a",
  "expiresAt": "2026-05-15T14:32:30Z"
}
```

- `id` — echo of the client correlation id from the `claim` request.
- `expiresAt` (string, ISO-8601, required) — server's computed auto-release deadline (`now + claimLockTimeoutSeconds`). The client may render a countdown using this value.

A duplicate `claim` from the same connection that already holds the lock is idempotent: the server replies with another `claim_ack` carrying the **original** `expiresAt`. This prevents lock extension by ping ([ND-01](../open-questions.md#nd-01-claim-lock-timeout-duration) "no re-arming on activity").

**`busy`** — claim rejected because another connection holds the lock ([D-G2](../open-questions.md#d-g2-multi-client-input-arbitration) §5.1 rule 2).

```json
{
  "type": "busy",
  "id": "c-7f3a",
  "since": "2026-05-15T14:31:58Z"
}
```

- `id` — echo of the rejected claim's correlation id.
- `since` (string, ISO-8601, optional) — when the active claim was granted. Informational only; the client MUST NOT use this to auto-retry. [ND-02](../open-questions.md#nd-02-rejection-ux-for-busy-response) is explicit that retry is user-driven (single Enter), not automatic.

**`claim_released`** — broadcast to **all** attached connections (including the prior holder) whenever the lock transitions back to unclaimed. Lets each client update its UI ("the other device finished — you can now type") regardless of who held the lock.

```json
{
  "type": "claim_released",
  "reason": "delivered",
  "heldBy": "conn-abc"
}
```

- `reason` (string enum, required) — one of `delivered` (the holder's `send` was written to the PTY), `timeout` (30-second window elapsed without a `send`), `disconnect` (the holding WebSocket closed), `voluntary` (the holder sent an explicit `release`), or `session_ended` (the agent process exited or the session was killed).
- `heldBy` (string, optional) — opaque server-assigned connection id of the previous holder. Lets a client distinguish "my own claim just released" from "the other device finished" without correlating against its own `id`. Not a token, not authenticated, informational only.

**`replay_start`** and **`replay_end`** — bracket the initial in-memory ring-buffer flush sent on attach. See §3.

```json
{ "type": "replay_start", "bytes": 32768 }
```

- `bytes` (int, required on `replay_start`) — exact total byte count of the binary frames that follow before `replay_end`. May be 0 for an empty buffer.

```json
{ "type": "replay_end" }
```

**`session_ended`** — the agent process exited or the session was killed. Always followed immediately by a WebSocket close 1000.

```json
{
  "type": "session_ended",
  "reason": "agent_exit",
  "exitCode": 0,
  "terminatedReason": "operator_kill"
}
```

- `reason` (string enum, required) — `agent_exit` (PTY closed because the agent exited normally), `operator_kill` (the session was killed via `relay session kill` or an equivalent API), or `server_shutdown` (the Relay server is shutting down and is draining sessions).
- `exitCode` (int, optional) — present when `reason = agent_exit`.
- `terminatedReason` (string, optional) — mirrors the `terminated_reason` column on the session row ([`prd/03-server.md`](../prd/03-server.md) §3) so the client can render the same vocabulary as `relay session list`.

**`auth_expired`** — the bearer token authenticating this socket was revoked mid-stream. Always followed by a WebSocket close 4401. ([`prd/03-server.md`](../prd/03-server.md) §6 commits to "in-flight WebSockets using a revoked token close on next message boundary"; this is that frame.)

```json
{ "type": "auth_expired", "tokenId": "tok-xyz" }
```

- `tokenId` (string, optional) — opaque id of the revoked token. Lets the IDE extension clear it from its secret storage without prompting the user to do it manually.

**`error`** — see §4.

### 2.4 Server → Client (data)

PTY output bytes travel as WebSocket **binary** frames with no application-layer envelope:

- Live output: each chunk of PTY bytes the server reads is forwarded as one binary frame. The server is permitted to coalesce or split; clients treat the binary stream as opaque bytes and feed them to their terminal renderer in arrival order.
- Replay output: identical framing to live output. The only signal distinguishing replay bytes from live bytes is the `replay_start` / `replay_end` brackets (§3).

Binary frames are unversioned (raw bytes — there is no schema). PTY output is universal per [D-G2](../open-questions.md#d-g2-multi-client-input-arbitration) §5.1 rule 5: every attached client receives the full stream regardless of claim state.

## 3. Initial replay framing

When a client attaches — whether on initial join or after a disconnect — the server immediately sends the per-session in-memory ring buffer (default 32 KB per [ND-03](../open-questions.md#nd-03-ring-buffer-size-for-attach-replay)) followed by live PTY bytes. The wire order is bracketed:

```
→ hello                                    (text)
→ replay_start { bytes: N }                (text)
→ <up to N raw bytes across 0..M binary frames>   (binary)
→ replay_end                               (text)
→ <live PTY bytes>                         (binary, ongoing)
```

The bracket exists because clients may want UX hooks at the replay/live boundary that the byte stream itself cannot signal:

- The IDE extension may render a subtle separator ("—— resumed ——") between the replay and the live stream so the user can see where they last left off.
- The PWA chat renderer may suppress incremental animations during the replay flush, since those bytes already happened and re-animating them looks wrong.
- The `relay attach` CLI may implement a `--no-replay` flag by discarding all bytes received between `replay_start` and `replay_end`.

None of these are protocol-mandatory; each is a UX choice the client surface owns. But the bracket has to be on the wire for any of them to be possible — once shipped, an indistinguishable-bytes design locks all clients out of those hooks forever.

**Empty buffer.** A just-spawned session has no replay content. The server still emits `replay_start { bytes: 0 }` immediately followed by `replay_end`. Clients always see the bracket; the only difference is zero binary frames in between. This keeps the wire shape uniform.

**Snapshot semantics.** The server takes the ring-buffer snapshot at attach time and drains the snapshot in order before any live bytes are sent on that connection. Bytes the agent emits *during* the replay flush are queued behind the snapshot on this connection and sent as live bytes after `replay_end`. This preserves the bracketing invariant: every byte before `replay_end` is older than every byte after it on this connection. Other already-attached connections see the new bytes as live in real time; nothing about replay framing slows down the live stream for them.

**Non-blocking.** The replay snapshot is an in-memory read, not a disk fetch. There is no "load history first" phase that blocks live bytes from arriving on the wire, which is the property [D-G3](../open-questions.md#d-g3-reattach-semantics) §5.2 rule 1 calls out. The first binary frame (or `replay_end` if the buffer is empty) is on the wire within the same event-loop tick as the upgrade response.

## 4. Errors and close codes

The protocol distinguishes **in-band protocol errors** (carried as `error` frames; the connection may continue) from **transport-level termination** (the WebSocket closes with a specific code; the connection is gone).

### 4.1 `error` frame

```json
{
  "type": "error",
  "code": "send_without_claim",
  "message": "send received from connection that does not hold the active claim",
  "id": "c-7f3a",
  "fatal": false
}
```

- `code` (string enum, required) — machine-readable code, one of the values listed below.
- `message` (string, required) — human-readable string, not parsed by clients. Useful in logs and during development.
- `id` (string, optional) — echoed correlation id from the client message that triggered the error, if any.
- `fatal` (bool, required) — when `true`, the server closes the WebSocket immediately after this frame (with a transport close code per §4.2). When `false`, the offending message is dropped and the connection continues normally.

**Codes:**

| Code | Trigger | `fatal` |
|---|---|---|
| `malformed_message` | JSON parse error or schema violation on a client control frame. | `false` (best-effort; client may recover by sending well-formed messages) |
| `unknown_type` | Client sent a `type` value the server does not recognize. | `false` — graceful degradation. Lets future minor revisions add optional client→server message types without breaking strict clients, independent of any versioning scheme. |
| `invalid_send` | A `send` frame's `data` field is missing, not a string, or not valid base64. | `false` |
| `send_without_claim` | A `send` arrived from a connection that does not hold the active claim. | `false` |
| `release_without_claim` | A `release` arrived from a connection that does not hold the active claim. | `false` — idempotent no-op |
| `rate_limited` | Reserved; not enforced in v1. | `false` |

### 4.2 WebSocket close codes

| Code | Meaning | Notes |
|---|---|---|
| `1000` | Normal closure. | Client `^D`, server clean shutdown after `session_ended`, normal hangup. |
| `1008` | Policy violation. | Bearer token missing or invalid at WebSocket upgrade time. Closed before any frames are sent. |
| `1011` | Server error. | Unexpected exception in the WS handler, or missed pong (§7). Not used for protocol-level errors — those use `error` frames. |
| `4401` | Token revoked mid-stream. | Always preceded by an `auth_expired` frame on the same socket. |
| `4404` | Session not found at upgrade, or session was killed before any frame was sent. | Closed before any frames are sent. |
| `4409` | Connection cap exceeded (reserved). | Not enforced in v1. |

The two-frame sequence for `auth_expired` (text frame, then close 4401) is deliberate: it lets clients distinguish "token revoked" from "transient network drop" without inspecting close codes alone, and it carries the `tokenId` so the IDE extension can clear that specific entry from secret storage without prompting the user.

## 5. State machines

### 5.1 Client lock state

```
            user hits Enter, draft non-empty
            ┌────────────────────────────────┐
            │                                ▼
        ┌───┴──┐  send claim   ┌──────────┐  claim_ack  ┌─────────┐
 start ►│ Idle │──────────────►│ Claiming │────────────►│ Claimed │
        └──┬───┘               └────┬─────┘             └────┬────┘
           ▲                        │                        │ user hits Enter again
           │                        │ busy                   │
           │                        ▼                        ▼
           │                  ┌──────────┐             ┌─────────┐
           │ 4 s or keystroke │ Backoff  │             │ Sending │
           ├──────────────────┤  (BUSY)  │             └────┬────┘
           │                  └──────────┘                  │
           │                                                │ claim_released
           │                                                │   { reason: delivered }
           └────────────────────────────────────────────────┘
```

| From | Event | To | Side effects |
|---|---|---|---|
| `Idle` | User hits Enter, draft is non-empty | `Claiming` | Send `claim` frame; keep draft buffered |
| `Claiming` | `claim_ack` received for our `id` | `Claimed` | Start client-side timer to `expiresAt` |
| `Claiming` | `busy` received for our `id` | `Backoff` | Show one-shot notice ([ND-02](../open-questions.md#nd-02-rejection-ux-for-busy-response)); keep draft |
| `Claimed` | User hits Enter again on same draft | `Sending` | Send `send { data: base64(draft) }` |
| `Claimed` | `expiresAt` reached on client timer | `Idle` | Clear UI countdown; server has also released |
| `Claimed` | User cancels (e.g., clears the draft) | `Idle` | Send `release` (best-effort) |
| `Sending` | `claim_released { reason: "delivered", heldBy: us }` | `Idle` | Clear draft; normal completion |
| `Sending` | `claim_released { reason: "timeout", heldBy: us }` | `Idle` | Treat as send-failed; user retries |
| `Backoff` | 4 seconds elapse or user types any key | `Idle` | Dismiss notice; no auto-retry |
| Any | Socket close | `Idle` | Reconnect logic is out of scope here |

The `Backoff → Idle` transition implements [ND-02](../open-questions.md#nd-02-rejection-ux-for-busy-response) exactly: the notice auto-dismisses after 4 seconds or the next keystroke, the draft is preserved unchanged, and the client never auto-retries. Retry is one Enter — which takes the FSM straight from `Idle` to `Claiming`.

### 5.2 Server per-session lock state

```
                                CLAIM from conn-A
                                ┌──────────────┐
                                │              ▼
                       ┌────────┴───┐      ┌──────────────────┐
        session ─────► │ Unclaimed  │      │ ClaimedBy(A,     │
        spawn          │            │ ◄────│   expiresAt)     │
                       └────────────┘      └──────────────────┘
                                                released by:
                                                  - SEND delivered to PTY
                                                  - A's WS close
                                                  - 30 s timeout (ND-01)
                                                  - explicit RELEASE
                                                ↳ broadcast claim_released
                                                   to all connections
```

| From | Event | To | Side effects |
|---|---|---|---|
| `Unclaimed` | `claim` from `conn-X` | `ClaimedBy(X, now + 30s)` | Reply `claim_ack` to X; no broadcast |
| `ClaimedBy(X)` | `claim` from `conn-Y` (Y ≠ X) | `ClaimedBy(X)` (no change) | Reply `busy` to Y |
| `ClaimedBy(X)` | `claim` from `conn-X` (duplicate) | `ClaimedBy(X)` (no change) | Reply `claim_ack` again with original `expiresAt` (idempotent) |
| `ClaimedBy(X)` | `send` from `conn-X` delivered to PTY | `Unclaimed` | Broadcast `claim_released { reason: "delivered", heldBy: X }` to all connections |
| `ClaimedBy(X)` | `send` from `conn-Y` (Y ≠ X) | `ClaimedBy(X)` (no change) | Reply `error { code: "send_without_claim" }` to Y |
| `ClaimedBy(X)` | `release` from `conn-X` | `Unclaimed` | Broadcast `claim_released { reason: "voluntary", heldBy: X }` |
| `ClaimedBy(X)` | `release` from `conn-Y` (Y ≠ X) | `ClaimedBy(X)` (no change) | Reply `error { code: "release_without_claim" }` to Y |
| `ClaimedBy(X)` | 30 seconds since grant (no `send`) | `Unclaimed` | Broadcast `claim_released { reason: "timeout", heldBy: X }` |
| `ClaimedBy(X)` | `conn-X` WebSocket closes (any cause) | `Unclaimed` | Broadcast `claim_released { reason: "disconnect", heldBy: X }` |
| Any | Session killed / agent exits | (terminal) | Broadcast `session_ended` to all connections; close all sockets |

Note that the timeout is a single fixed window from grant time ([ND-01](../open-questions.md#nd-01-claim-lock-timeout-duration) "no re-arming on activity") and the only activity that clears the timer is a `send` that reaches the PTY — duplicate `claim`s do not extend it.

### 5.3 Tricky races

**Two simultaneous claims.** First-arrival-wins is by server event-loop ordering. The WS handler must process per-session claims on a single-threaded queue: the "check Unclaimed" and "set ClaimedBy" steps must be atomic. In Node/Fastify this falls out naturally from the event loop, but the implementation must take care not to yield (e.g., `await` an unrelated I/O) between the check and the set.

**Disconnect mid-`send`.** A `send` carries `data` in the same JSON frame, so partial delivery at the application layer is not possible — either the JSON parses, or it doesn't. If the socket closes after the server reads the frame but before the PTY write completes, the server retains the bytes it had committed to write (PTY writes are non-blocking; partial writes are buffered by the OS pty), transitions to `Unclaimed` with `reason: "disconnect"`, and the broadcast goes out. There is no "partial send" state to recover.

**Auth expired mid-claim.** The server sends `auth_expired`, closes with 4401, and the disconnect path subsumes the release: `ClaimedBy(X) → Unclaimed` with `reason: "disconnect"`. Other clients see only the `claim_released` broadcast; they do not see the auth event for the dead client.

**PTY EPIPE on `send`.** If the PTY write returns EPIPE because the agent has already exited, the server still transitions `ClaimedBy(X) → Unclaimed` with `reason: "delivered"` (the lock is gone either way), then separately emits `session_ended { reason: "agent_exit" }` to all connections. The two events may interleave with other connections' claim attempts; that is fine — `Unclaimed` is the correct intermediate state, and a successful new `claim` followed by `session_ended` is consistent with what actually happened (the agent died first, then the new client tried).

## 6. Reattach inline message ordering

The complete wire sequence from upgrade to first bytes:

1. **HTTP `Upgrade: websocket`.** The server validates the bearer token at upgrade time. If the token is missing, invalid, or revoked, the upgrade fails before the WebSocket is established and the client sees a 401 / 403 from the upgrade request. If the upgrade succeeds but the session does not exist, the server completes the upgrade and immediately closes with 4404.
2. **Server → `hello`.** Always the first frame. Carries `sessionId`, `agentSessionId?`, `status`, `replayBufferBytes`, `claimLockTimeoutSeconds`, `serverTime`. If `status: "killed"`, the next frame is `session_ended` and the socket closes 1000.
3. **Server → `replay_start { bytes: N }`.** Always sent (even for `bytes: 0`).
4. **Server → 0..M binary frames.** Total payload sums to exactly N bytes.
5. **Server → `replay_end`.** Closes the replay bracket.
6. **Server → binary frames (live).** Begin streaming current PTY output. Continues for the life of the connection.
7. **Client → `claim`** (any time after step 1). The client is permitted to send a `claim` before receiving `hello`, but a well-behaved client waits for `hello` so it knows the `claimLockTimeoutSeconds` value to render in its countdown UI.

The reason `hello` exists rather than a separate REST roundtrip for session metadata: `replayBufferBytes` and `claimLockTimeoutSeconds` are server-configured per `~/.relay/config.yaml`. A REST call before the WebSocket attach would either double the round-trips or risk drift if the operator edited the config between the REST call and the attach. Pinning these values into the first WS frame makes the WebSocket authoritative for the session it owns.

## 7. Keepalive and liveness

**WebSocket native ping/pong is the only liveness mechanism.** The server sends a WS ping every 30 seconds; if a pong does not arrive within 30 seconds of the most recent ping, the server closes the socket with 1011 and treats it as a normal disconnect (any held claim releases with `reason: "disconnect"`).

**No application-layer keepalive is recognized during a claim.** [ND-01](../open-questions.md#nd-01-claim-lock-timeout-duration) is explicit that the 30-second window does not re-arm on activity; the only thing that clears the timer is a `send` that reaches the PTY. In particular:

- A duplicate `claim` is idempotent and returns the **original** `expiresAt` — clients cannot extend a claim by reclaiming.
- WS pings and pongs are pure liveness signals; the server does not treat them as application activity for claim purposes.

The combination matters because a TCP connection that has been silently dropped (Wi-Fi off, NAT entry expired) may not surface to the server as a WS close until the OS-level TCP keepalive fires, which can be minutes. Without WS-level ping/pong, a claim held by a vanished laptop would block the other device until that OS keepalive timeout. The 30-second claim timeout ([ND-01](../open-questions.md#nd-01-claim-lock-timeout-duration)) is the safety net for this case; WS ping/pong is what releases the claim faster on the typical disconnect path.

Clients SHOULD respond to pings automatically — every standard WS library does this without application intervention. Clients MAY send their own pings; the server replies with pong but does not treat client-side pings as application activity.

## 8. Summary of decisions

| # | Decision | Choice | Anchor |
|---|---|---|---|
| 1 | Output framing | Binary WS frames for PTY bytes; text/JSON for control | §1 — avoids ≈33% base64 overhead and encode/decode CPU on the hottest path |
| 2 | Send-path framing | Single JSON frame with base64-encoded `data` | §2.2 — input is small and transactional; atomic single-frame beats inter-frame state on the server |
| 3 | Replay framing | Bracketed `replay_start` / `replay_end` | §3 — preserves UX hooks at the replay/live boundary at near-zero protocol cost |
| 4 | Client `release` | Optional and best-effort; server releases on PTY delivery / disconnect / timeout | §2.2 — [D-G2](../open-questions.md#d-g2-multi-client-input-arbitration) lifecycle is server-driven |
| 5 | Server `hello` frame | Required, always first | §6 — pins server config (`replayBufferBytes`, `claimLockTimeoutSeconds`) without a separate REST roundtrip |
| 6 | Error model | In-band `error` frame with `fatal` flag, plus WS close codes for transport-level termination | §4 — distinguishes protocol error from connection death |
| 7 | Keepalive | WS native ping/pong only; no application-layer claim extension | §7 — [ND-01](../open-questions.md#nd-01-claim-lock-timeout-duration) forbids re-arming |

**Versioning deferred.** v1 messages carry no `v` field. Relay's deployment model (self-hosted server, IDE extension and PWA shipped by the same project) means client/server upgrade cadence is effectively coupled and the "v1 client in the wild meets v3 server" scenario that justifies versioning ceremony does not arise. If a v2 ever becomes necessary, the migration rule is "absence of `v` ≡ v1" — a one-line server change. The `unknown_type` error code (§4.1) already provides graceful degradation for additive minor changes (new optional message types) independent of any versioning scheme.

## 9. What this unblocks

- Build-plan task 2B (this doc itself).
- The `ws-protocol-check` skill ([`repo-layout.md`](./repo-layout.md) §9.1) can now mechanically verify a handler implementation against §2's message catalog.
- Implementation in `packages/server/src/server/ws/` ([`repo-layout.md`](./repo-layout.md) §3) — types in `@relay/protocol` ([`repo-layout.md`](./repo-layout.md) §5) derive directly from §2's JSON shapes via Zod.
- The `relay attach` thin client (`packages/server/src/attach/`) and the IDE extension's terminal integration both consume the §5.1 client state machine.

---

*Resolves the wire-format question raised by [D-G2](../open-questions.md#d-g2-multi-client-input-arbitration) and [D-G3](../open-questions.md#d-g3-reattach-semantics); pins down on-the-wire shape for [ND-01](../open-questions.md#nd-01-claim-lock-timeout-duration), [ND-02](../open-questions.md#nd-02-rejection-ux-for-busy-response), and [ND-03](../open-questions.md#nd-03-ring-buffer-size-for-attach-replay).*
