// WS handler for `GET /sessions/:id/stream`. Frame catalog + state machine
// live in docs/arch/ws-protocol.md; the four §5.3 races are the test
// contract. This file owns the wiring: Fastify route registration, per-
// connection state, the session-keyed claim-lock map, the auth-revocation
// subscription, and the bracketed-replay sequence on attach.

import { randomUUID } from 'node:crypto';

import fastifyWebsocket from '@fastify/websocket';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { WebSocket } from 'ws';

import {
  ClientFrameSchema,
  WsCloseCode,
  type ClaimReleasedReason,
  type ClientFrame,
  type ErrorFrame,
  type HelloFrame,
  type ServerFrame,
  type SessionEndedFrame,
  type WsErrorCode,
} from '@relay/protocol';

import type { TokenStore } from '../../auth/index.js';
import type { RelayConfig } from '../../config/index.js';
import {
  type AttachedClient,
  type SessionEndInfo,
  type SessionHandle,
  type SessionRegistry,
} from '../../session/index.js';
import { sessions as sessionsRepo, type Database } from '../../store/index.js';

import { createClaimLock, type ClaimLock } from './claim-lock.js';

export interface WsPluginOptions {
  db: Database;
  registry: SessionRegistry;
  tokenStore: TokenStore;
  config: RelayConfig;
}

interface ConnectionContext {
  id: string;
  socket: WebSocket;
  tokenId: string;
  sessionId: string;
  // Set once the connection is registered against the session map. Used by
  // `claim_released` broadcast to find peers.
  alive: boolean;
}

interface SessionWsState {
  lock: ClaimLock;
  // Per-session connection registry. The WS handler iterates this to
  // broadcast `claim_released` and `session_ended`. Distinct from the
  // session/ module's `attached` Set, which is by-byte fan-out only.
  connections: Set<ConnectionContext>;
}

// Per @fastify/websocket: the `socket` argument is a `ws.WebSocket` even
// though the upstream typing has surface-level OPEN/CLOSED constants. Use
// the static enum.
const WS_OPEN = 1;

export async function registerWs(app: FastifyInstance, opts: WsPluginOptions): Promise<void> {
  await app.register(fastifyWebsocket, {
    options: {
      // Per ND-36: browsers cannot set the Authorization header on
      // `new WebSocket(...)`, so the PWA passes the bearer through the
      // `Sec-WebSocket-Protocol` header as `['relay.bearer', <token>]`.
      // RFC 6455 §1.9 requires the server to echo back one of the
      // requested subprotocols in the 101 response; without this echo the
      // browser fails the handshake. Authentication itself happens in the
      // REST auth preHandler (auth.ts), which reads the same header — this
      // hook only completes the protocol negotiation. Native `relay attach`
      // doesn't send a subprotocol (it uses Authorization directly), so
      // this hook is not called for it.
      handleProtocols: (protocols: Set<string>) =>
        protocols.has('relay.bearer') ? 'relay.bearer' : false,
    },
  });

  // Per ws-protocol.md §5.2 + §6: the lock is per session, not per
  // connection. A second-connection's `claim` must contend with the first's,
  // so the map is plugin-scoped.
  const sessionStates = new Map<string, SessionWsState>();
  // tokenId → set of contexts. Subscribing once at plugin level beats one
  // EventEmitter listener per connection.
  const connectionsByToken = new Map<string, Set<ConnectionContext>>();

  const unsubRevocation = opts.tokenStore.bus.onRevocation(({ tokenId }) => {
    // Per ws-protocol.md §2.3 `auth_expired` + §4.2 close 4401: send the
    // text frame first so the client can clear secret storage by tokenId,
    // then close 4401 on the same boundary.
    const set = connectionsByToken.get(tokenId);
    if (set === undefined) return;
    // Snapshot the set — disconnectContext mutates it during iteration.
    for (const ctx of Array.from(set)) {
      sendFrame(ctx, { type: 'auth_expired', tokenId });
      closeSocket(ctx, WsCloseCode.AuthExpired, 'token revoked');
    }
  });

  // Per Fastify plugin lifecycle: drop the bus listener on app.close() so
  // tests that instantiate many servers don't leak handlers.
  app.addHook('onClose', async () => {
    unsubRevocation();
  });

  function ensureSessionState(sessionId: string): SessionWsState {
    const existing = sessionStates.get(sessionId);
    if (existing !== undefined) return existing;
    const state: SessionWsState = {
      lock: createClaimLock({
        timeoutSeconds: opts.config.claimLockTimeoutSeconds,
        hooks: {
          onReleased({ heldBy, reason }) {
            // Per ws-protocol.md §5.2: broadcast `claim_released` to ALL
            // attached connections (including the prior holder) so every
            // client UI can transition out of its `Claimed` / `Backoff`
            // state. The lock fires this exactly once per release.
            broadcast(state, {
              type: 'claim_released',
              reason,
              heldBy,
            });
          },
        },
      }),
      connections: new Set<ConnectionContext>(),
    };
    sessionStates.set(sessionId, state);
    return state;
  }

  function disposeSessionState(sessionId: string): void {
    const state = sessionStates.get(sessionId);
    if (state === undefined) return;
    state.lock.dispose();
    sessionStates.delete(sessionId);
  }

  function broadcast(state: SessionWsState, frame: ServerFrame): void {
    for (const ctx of state.connections) {
      sendFrame(ctx, frame);
    }
  }

  app.get(
    '/sessions/:id/stream',
    { websocket: true },
    async (socket: WebSocket, req: FastifyRequest<{ Params: { id: string } }>) => {
      const sessionId = req.params.id;
      // Defer one tick so the WebSocket 101 response flushes ahead of the
      // first application frame. Without this, @fastify/websocket's
      // `injectWS` test harness coalesces the 101 and the first WS frame
      // into a single PassThrough chunk; the client-side onData consumes
      // the 101 and drops the rest. Real-world TCP wouldn't coalesce, but
      // the deferral is harmless there and required here.
      await new Promise<void>((r) => setImmediate(r));
      // Per ws-protocol.md §6: REST auth preHandler already validated the
      // bearer token; if it failed, the upgrade would have aborted with HTTP
      // 401 before this handler ran. tokenId is therefore guaranteed set.
      const tokenId = req.tokenId;
      if (tokenId === undefined) {
        // Defensive: an auth-misconfigured route should not silently elevate
        // an unauthenticated connection. Close immediately.
        socket.close(WsCloseCode.PolicyViolation, 'no token id');
        return;
      }

      const ctx: ConnectionContext = {
        id: `conn-${randomUUID()}`,
        socket,
        tokenId,
        sessionId,
        alive: true,
      };

      const row = sessionsRepo.findById(opts.db, sessionId);
      if (row === undefined) {
        // Per ws-protocol.md §4.2 (4404) + §6: the upgrade succeeded; close
        // immediately. No frames are sent.
        socket.close(WsCloseCode.SessionNotFound, 'session not found');
        return;
      }
      // Per ws-protocol.md §2.3 hello.status: 'running' | 'killed'. The
      // row's status is the source of truth — registry.get may still hold
      // a handle for a session that was just killed (markKilled lands
      // synchronously; the supervisor's onExit fires later). Use the row.
      const sessionRunning = row.status === 'running';

      // Track for token revocation lookup.
      let tokenSet = connectionsByToken.get(tokenId);
      if (tokenSet === undefined) {
        tokenSet = new Set<ConnectionContext>();
        connectionsByToken.set(tokenId, tokenSet);
      }
      tokenSet.add(ctx);

      // Per ws-protocol.md §6 step 2: `hello` is always the first frame.
      const handle: SessionHandle | undefined = sessionRunning
        ? opts.registry.get(sessionId)
        : undefined;
      const status: 'running' | 'killed' =
        sessionRunning && handle !== undefined ? 'running' : 'killed';
      const hello: HelloFrame = {
        type: 'hello',
        sessionId,
        ...(row.agentSessionId !== null ? { agentSessionId: row.agentSessionId } : {}),
        status,
        replayBufferBytes: opts.config.replayBufferBytes,
        claimLockTimeoutSeconds: opts.config.claimLockTimeoutSeconds,
        serverTime: new Date().toISOString(),
      };
      sendFrame(ctx, hello);

      if (handle === undefined) {
        // Per ws-protocol.md §2.3 hello + §6: status=killed → session_ended
        // then close 1000 immediately. No replay; no live stream; no claim.
        const sessionEnded: SessionEndedFrame = {
          type: 'session_ended',
          // Per ws-protocol.md §2.3: 'agent_exit' | 'operator_kill' |
          // 'server_shutdown'. For a row that was killed before this socket
          // attached, the row's terminated_reason carries the truth.
          reason: mapTerminatedReasonToSessionEndedReason(row.terminatedReason),
          ...(row.terminatedReason !== null ? { terminatedReason: row.terminatedReason } : {}),
        };
        sendFrame(ctx, sessionEnded);
        closeSocket(ctx, WsCloseCode.Normal, 'session already ended');
        // Cleanup token tracking — onClose path below also runs, but we
        // never registered with sessionStates so there's nothing else to
        // tear down.
        tokenSet.delete(ctx);
        if (tokenSet.size === 0) connectionsByToken.delete(tokenId);
        return;
      }

      // Per ws-protocol.md §3: bracketed replay. Snapshot the ring buffer
      // BEFORE attaching to the live stream so the bytes between snapshot
      // and attach all land after `replay_end`.
      const snapshot = handle.snapshot();
      sendFrame(ctx, { type: 'replay_start', bytes: snapshot.length });
      if (snapshot.length > 0) {
        sendBinary(ctx, snapshot);
      }
      sendFrame(ctx, { type: 'replay_end' });

      const state = ensureSessionState(sessionId);
      state.connections.add(ctx);

      const attachment: { unsubscribe(): void } = opts.registry.attach(sessionId, {
        id: ctx.id,
        onBytes(chunk: Buffer): void {
          // Per D-G3 (ws-protocol.md §2.4): every byte to every attached
          // client regardless of claim state. The lock is NEVER inspected
          // here — that would be a `claim_gated_output` violation flagged
          // by the ws-protocol-check skill.
          sendBinary(ctx, chunk);
        },
        onSessionEnd(info: SessionEndInfo): void {
          // Per ws-protocol.md §2.3 session_ended + §5.2 final row: emit the
          // frame, broadcast nothing further (the WS is closing), close 1000.
          const frame: SessionEndedFrame = {
            type: 'session_ended',
            reason: info.reason,
            ...(info.exitCode !== null ? { exitCode: info.exitCode } : {}),
            ...(info.terminatedReason !== null ? { terminatedReason: info.terminatedReason } : {}),
          };
          sendFrame(ctx, frame);
          // Per §5.2 final row: release any held claim with reason
          // session_ended BEFORE closing the socket, so every peer's
          // claim_released broadcast goes out while this socket is still
          // counted in state.connections. The lock fires `onReleased`
          // synchronously inside releaseAll → broadcast runs immediately.
          if (state.lock.isHolder(ctx.id)) {
            state.lock.releaseAll('session_ended');
          }
          closeSocket(ctx, WsCloseCode.Normal, 'session ended');
        },
      } satisfies AttachedClient);

      socket.on('message', (raw: Buffer, isBinary: boolean) => {
        if (isBinary) {
          // Per ws-protocol.md §2.2: input is JSON-only on the wire. Binary
          // input is undefined; treat as malformed.
          sendError(ctx, 'malformed_message', 'binary frames are not accepted from client');
          return;
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw.toString('utf8'));
        } catch {
          sendError(ctx, 'malformed_message', 'JSON parse error');
          return;
        }
        const result = ClientFrameSchema.safeParse(parsed);
        if (!result.success) {
          // Per §4.1: distinguish unknown_type from malformed_message. If
          // the input has a string `type` not in the catalog, this is
          // `unknown_type` (graceful additive extension); otherwise schema
          // violation.
          const candidateType =
            typeof parsed === 'object' && parsed !== null && 'type' in parsed
              ? (parsed as { type?: unknown }).type
              : undefined;
          if (typeof candidateType === 'string' && !KNOWN_CLIENT_TYPES.has(candidateType)) {
            sendError(ctx, 'unknown_type', `unknown frame type "${candidateType}"`);
          } else {
            sendError(ctx, 'malformed_message', 'frame failed schema validation');
          }
          return;
        }
        dispatchClientFrame(ctx, state, handle, result.data);
      });

      socket.on('close', () => {
        if (!ctx.alive) return;
        ctx.alive = false;
        // Per ws-protocol.md §5.2 row 9: a holding connection that closes
        // releases the lock with reason `disconnect`. `releaseOnDisconnect`
        // is a no-op when ctx is not the holder.
        state.lock.releaseOnDisconnect(ctx.id);
        state.connections.delete(ctx);
        try {
          attachment.unsubscribe();
        } catch {
          // Defensive: a double-unsubscribe must not throw.
        }
        // Token tracking.
        const set = connectionsByToken.get(tokenId);
        if (set !== undefined) {
          set.delete(ctx);
          if (set.size === 0) connectionsByToken.delete(tokenId);
        }
        // If this was the last connection to a no-longer-live session,
        // discard the lock state so a stray timer can't fire later.
        if (state.connections.size === 0 && opts.registry.get(sessionId) === undefined) {
          disposeSessionState(sessionId);
        }
      });

      socket.on('error', () => {
        // Errors funnel into the close handler; nothing to do here. Keeping
        // the listener prevents Node's default `unhandled error` crash on
        // transient socket failures (mid-replay write, etc.).
      });
    },
  );
}

function dispatchClientFrame(
  ctx: ConnectionContext,
  state: SessionWsState,
  handle: SessionHandle,
  frame: ClientFrame,
): void {
  if (frame.type === 'claim') {
    handleClaim(ctx, state, frame.id);
    return;
  }
  if (frame.type === 'send') {
    handleSend(ctx, state, handle, frame.id, frame.data);
    return;
  }
  if (frame.type === 'release') {
    handleRelease(ctx, state, frame.id);
    return;
  }
  if (frame.type === 'resize') {
    // Per ND-23: resize is a side-channel; independent of claim state,
    // multi-client last-writer-wins. Schema caps cols/rows at 1000.
    handle.resize(frame.cols, frame.rows);
    return;
  }
}

function handleClaim(
  ctx: ConnectionContext,
  state: SessionWsState,
  correlationId: string | undefined,
): void {
  const result = state.lock.tryClaim(ctx.id);
  if (result.ok) {
    sendFrame(ctx, {
      type: 'claim_ack',
      ...(correlationId !== undefined ? { id: correlationId } : {}),
      expiresAt: result.expiresAt,
    });
    return;
  }
  sendFrame(ctx, {
    type: 'busy',
    ...(correlationId !== undefined ? { id: correlationId } : {}),
    since: result.sinceIso,
  });
}

function handleSend(
  ctx: ConnectionContext,
  state: SessionWsState,
  handle: SessionHandle,
  correlationId: string | undefined,
  base64: string,
): void {
  if (!state.lock.isHolder(ctx.id)) {
    // Per ws-protocol.md §4.1: send_without_claim is non-fatal; the offending
    // message is dropped and the connection continues.
    sendError(ctx, 'send_without_claim', 'send received from a non-holder', correlationId);
    return;
  }
  let bytes: Buffer;
  try {
    bytes = Buffer.from(base64, 'base64');
    // Buffer.from with base64 silently truncates invalid input — round-trip
    // to catch obvious garbage. A strict check would be `RegExp` based, but
    // the round-trip is closer to what consumers care about.
    if (bytes.toString('base64').replace(/=+$/, '') !== base64.replace(/=+$/, '')) {
      sendError(ctx, 'invalid_send', 'data is not valid base64', correlationId);
      return;
    }
  } catch {
    sendError(ctx, 'invalid_send', 'data is not valid base64', correlationId);
    return;
  }
  // Per ws-protocol.md §5.3 race 4 (PTY EPIPE): write is best-effort; the
  // release decision is driven by the in-band payload, not by the PTY-write
  // outcome. The session/ orchestrator owns the session_ended emission via
  // its onSessionEnd path; we don't synthesize one here.
  try {
    handle.write(bytes);
  } catch {
    // Best-effort: PTY-write errors after the supervisor died are
    // non-actionable from this layer.
  }
  // Per ND-24 + §5.2 row 4: SEND releases the claim only when the decoded
  // payload contains a newline byte. A non-newline `send` (single keystroke
  // or paste prefix) keeps the claim held so the TUI agent sees in-progress
  // typing; the newline-bearing `send` is what flips the lock to Unclaimed
  // and fires `claim_released { delivered }` via the lock's onReleased hook.
  // Empty `data` falls through here naturally — bytes.includes returns false
  // on a zero-length buffer, so the claim stays held with no broadcast.
  if (containsNewline(bytes)) {
    state.lock.releaseAsHolder(ctx.id, 'delivered');
  }
}

// Per ND-24 §5.2 row 4: `\n` (0x0a) or `\r` (0x0d) anywhere in the decoded
// payload triggers release. CRLF releases on the `\r`; the `\n` arrives in
// the next `send` and re-claims via the client-side `pendingInput` path.
function containsNewline(bytes: Buffer): boolean {
  return bytes.includes(0x0a) || bytes.includes(0x0d);
}

function handleRelease(
  ctx: ConnectionContext,
  state: SessionWsState,
  correlationId: string | undefined,
): void {
  const r = state.lock.releaseAsHolder(ctx.id, 'voluntary');
  if (!r.ok) {
    // Per ws-protocol.md §4.1: release_without_claim is non-fatal +
    // idempotent.
    sendError(
      ctx,
      'release_without_claim',
      'release received from a connection that does not hold the active claim',
      correlationId,
    );
  }
}

function sendFrame(ctx: ConnectionContext, frame: ServerFrame): void {
  if (!ctx.alive) return;
  if (ctx.socket.readyState !== WS_OPEN) return;
  try {
    ctx.socket.send(JSON.stringify(frame));
  } catch {
    // Best-effort: a send that fails mid-flight will surface as a `close`
    // event; the disconnect path handles cleanup.
  }
}

function sendBinary(ctx: ConnectionContext, bytes: Buffer): void {
  if (!ctx.alive) return;
  if (ctx.socket.readyState !== WS_OPEN) return;
  try {
    ctx.socket.send(bytes, { binary: true });
  } catch {
    // See sendFrame.
  }
}

function sendError(
  ctx: ConnectionContext,
  code: WsErrorCode,
  message: string,
  correlationId?: string,
): void {
  const frame: ErrorFrame = {
    type: 'error',
    code,
    message,
    ...(correlationId !== undefined ? { id: correlationId } : {}),
    // Per ws-protocol.md §4.1 table: every error in the v1 catalog is
    // `fatal: false`. The handler keeps the connection alive after the
    // frame is sent.
    fatal: false,
  };
  sendFrame(ctx, frame);
}

function closeSocket(ctx: ConnectionContext, code: number, reason: string): void {
  if (!ctx.alive) return;
  ctx.alive = false;
  try {
    ctx.socket.close(code, reason);
  } catch {
    // ws.close can throw on already-closing sockets.
  }
}

const KNOWN_CLIENT_TYPES = new Set<string>(['claim', 'send', 'release', 'resize']);

function mapTerminatedReasonToSessionEndedReason(
  terminatedReason: string | null,
): 'agent_exit' | 'operator_kill' | 'server_shutdown' {
  // Per sqlite-schema.md §3.3: TEXT column with documented values
  // 'server_restart' | 'operator_kill' | 'agent_exit'. Map to the ws frame's
  // 'agent_exit' | 'operator_kill' | 'server_shutdown' enum.
  if (terminatedReason === 'operator_kill') return 'operator_kill';
  if (terminatedReason === 'server_restart') return 'server_shutdown';
  return 'agent_exit';
}

// Silence unused-import lint by re-exporting the type alias the handler
// consumes through @relay/protocol.
export type { ClaimReleasedReason };
