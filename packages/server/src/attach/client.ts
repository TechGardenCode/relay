// `relay attach` WS client. Implements the §5.1 client FSM from
// docs/arch/ws-protocol.md, per-keystroke streaming variant (ND-24):
//
//   Idle ── first input bytes ──► Claiming
//   Claiming ── claim_ack ──► Streaming (flush pendingInput as one send)
//   Claiming ── busy      ──► Backoff
//   Streaming ── more input bytes ──► Streaming (each chunk → one send)
//   Streaming ── claim_released { delivered } ──► Idle
//                  (if pendingInput accumulated, re-claim immediately)
//   Streaming ── claim_released { timeout|disconnect|voluntary|session_ended } ──► Idle
//                  (drop pendingInput; no auto-resend, per ND-02)
//   Backoff   ── 4s elapses ──► Claiming if pendingInput; else Idle
//
// Per ND-24, every stdin chunk forwards via `submitInput(bytes: Buffer)` as
// one `send` frame; the server scans the decoded payload for a newline byte
// (`\n` / `\r`) and releases the claim when it finds one. The wire shape
// (claim → claim_ack → send* → claim_released) is unchanged from D-G2; only
// the multi-send semantic widens.
//
// Per ND-17 (narrowed), this client is the canonical raw-mode TTY surface;
// line-mode IDE compose-field clients still use the same FSM with one
// pendingInput buffer per draft, which collapses into a single send.
//
// Per ND-01 / ND-03 nothing here is hardcoded: claimLockTimeoutSeconds and
// replayBufferBytes are read from the inbound `hello` frame and exposed via
// `onHello`. The 4-second backoff dismissal in §5.1 is the only literal we
// keep (per ND-02 "auto-dismisses after ~4 seconds"); during streaming, the
// 4 s window alone drives backoff dismissal — per-keystroke retries would be
// abusive against the rate-limit.

import WebSocket, { type RawData } from 'ws';
import {
  ServerFrameSchema,
  WsCloseCode,
  type ClaimReleasedFrame,
  type ClientFrame,
  type ErrorFrame,
  type HelloFrame,
  type ServerFrame,
  type SessionEndedFrame,
} from '@relay/protocol';

export type ClientState = 'idle' | 'claiming' | 'streaming' | 'backoff' | 'closed';

const BACKOFF_DISMISS_MS = 4_000;

// Per ND-40: defensive cap for the inbound-binary buffer used only when `hello`
// (which carries the real replayBufferBytes) has not been seen yet. In the
// protocol `hello` always precedes the binary snapshot, so this fallback only
// matters if a binary frame somehow arrives first.
const DEFAULT_INBOUND_BUFFER_CAP = 1024 * 1024;

let nextCorrelation = 0;
function makeCorrelationId(): string {
  nextCorrelation = (nextCorrelation + 1) % 1_000_000;
  return `c-${String(Date.now().toString(36))}-${String(nextCorrelation)}`;
}

export interface AttachClientOptions {
  wsUrl: string;
  sessionId: string;
  token: string;
  // Test seam: lets unit specs inject a fake WS factory matching the `ws`
  // module's surface (constructor + on/send/close). The default uses the real
  // `ws` package.
  wsFactory?: (url: string, headers: Record<string, string>) => WebSocket;
}

export interface ClientCallbacks {
  /** PTY binary frames (live and replay). */
  onBytes?: (chunk: Buffer) => void;
  /** Server `hello` frame — exposes session config (timeouts, replay size). */
  onHello?: (frame: HelloFrame) => void;
  /** Bracket the in-memory ring buffer replay. */
  onReplayStart?: (bytes: number) => void;
  onReplayEnd?: () => void;
  /** Server-side `claim_released` broadcast — UX hint for "other device finished". */
  onClaimReleased?: (frame: ClaimReleasedFrame) => void;
  /** Server-side `session_ended` (agent_exit / operator_kill / server_shutdown). */
  onSessionEnded?: (frame: SessionEndedFrame) => void;
  /** Server-side `auth_expired` — token revoked mid-stream. */
  onAuthExpired?: (tokenId: string | undefined) => void;
  /** Server-side `error` frame (malformed, send_without_claim, ...). */
  onError?: (frame: ErrorFrame) => void;
  /** Transport closed. `code` is the WS close code; `reason` is the close payload string. */
  onClose?: (code: number, reason: string) => void;
  /** FSM state transitions. Tests assert on this; production callers use it for status UX. */
  onState?: (next: ClientState, prev: ClientState) => void;
  /** Local socket error (network/parse). Distinct from the in-band `error` frame. */
  onSocketError?: (err: Error) => void;
  /** Server-side `busy` — informational; the FSM transition to backoff is automatic. */
  onBusy?: () => void;
}

/**
 * One AttachClient per relay attach invocation. Drives the §5.1 client FSM
 * over a single WebSocket. Exposes `submitInput(bytes)` for the TTY bridge
 * to call on each stdin chunk (per ND-24), and `release()` for the voluntary
 * release case (user cancelled — Ctrl-C during draft).
 */
export class AttachClient {
  private socket: WebSocket | undefined;
  private state: ClientState = 'idle';
  // Per ND-24: bytes typed while we are not yet in Streaming (Claiming or
  // Backoff) accumulate here. Flushed as one `send` on entry to Streaming.
  // Cleared (without sending) on terminal release reasons or send_without_claim.
  private pendingInput: Buffer | undefined;
  private inflightClaimId: string | undefined;
  private backoffTimer: NodeJS.Timeout | undefined;
  private callbacks: ClientCallbacks;
  private readonly opts: AttachClientOptions;
  private hello: HelloFrame | undefined;
  // Per ND-40: binary frames that arrive before an `onBytes` subscriber exists
  // (the connect()→subscribe() gap, when replay frames coalesce with the 101 +
  // open in one socket read) are buffered here in arrival order, then flushed
  // exactly once when `onBytes` transitions undefined→defined. Once a subscriber
  // exists, binary is delivered directly and this stays empty.
  private inboundBinaryBuffer: Buffer[] = [];
  private inboundBufferedBytes = 0;

  constructor(opts: AttachClientOptions, callbacks: ClientCallbacks = {}) {
    this.opts = opts;
    this.callbacks = { ...callbacks };
  }

  /**
   * Merge additional callbacks into the existing handler set. Each event fires
   * any previously-registered handler first, then the new one. Used by the TTY
   * bridge to layer terminal I/O on top of caller-supplied lifecycle hooks
   * without taking ownership of the handler map.
   */
  subscribe(extras: ClientCallbacks): void {
    const hadOnBytes = this.callbacks.onBytes !== undefined;
    const merged: ClientCallbacks = { ...this.callbacks };
    type CbKey = keyof ClientCallbacks;
    for (const key of Object.keys(extras) as CbKey[]) {
      const extra = extras[key];
      const prev = this.callbacks[key];
      if (extra === undefined) continue;
      if (prev === undefined) {
        (merged[key] as unknown) = extra;
      } else {
        (merged[key] as unknown) = (...args: unknown[]): void => {
          (prev as (...a: unknown[]) => void)(...args);
          (extra as (...a: unknown[]) => void)(...args);
        };
      }
    }
    this.callbacks = merged;
    // Per ND-40: flush binary buffered during the connect()→subscribe() gap,
    // in arrival order, exactly once — only on the undefined→defined transition
    // of onBytes (so a second subscribe() never re-flushes).
    if (!hadOnBytes && this.callbacks.onBytes !== undefined) {
      this.flushInboundBinary();
    }
  }

  get currentState(): ClientState {
    return this.state;
  }

  /** The session this client is attached to. Used by the TTY bridge to print
   * the ND-34 item (i) detach confirmation without re-threading the id. */
  get sessionId(): string {
    return this.opts.sessionId;
  }

  get helloFrame(): HelloFrame | undefined {
    return this.hello;
  }

  async connect(): Promise<void> {
    const url = `${this.opts.wsUrl}/sessions/${this.opts.sessionId}/stream`;
    const headers = { Authorization: `Bearer ${this.opts.token}` };
    const factory =
      this.opts.wsFactory ??
      ((u: string, h: Record<string, string>): WebSocket => new WebSocket(u, { headers: h }));
    const socket = factory(url, headers);
    this.socket = socket;

    socket.on('message', (data: RawData, isBinary: boolean): void => {
      if (isBinary) {
        const buf = rawDataToBuffer(data);
        // Per ND-40: if no subscriber has registered `onBytes` yet (replay
        // frames coalesced with the 101/open before subscribe() ran), buffer
        // in arrival order rather than dropping; otherwise deliver directly.
        if (this.callbacks.onBytes === undefined) {
          this.bufferInboundBinary(buf);
        } else {
          this.callbacks.onBytes(buf);
        }
        return;
      }
      this.handleTextFrame(rawDataToBuffer(data).toString('utf8'));
    });
    socket.on('close', (code: number, reason: Buffer): void => {
      this.transition('closed');
      this.callbacks.onClose?.(code, reason.toString('utf8'));
    });
    socket.on('error', (err: Error): void => {
      this.callbacks.onSocketError?.(err);
    });

    await new Promise<void>((resolve, reject) => {
      const onOpen = (): void => {
        socket.removeListener('error', onError);
        resolve();
      };
      const onError = (err: Error): void => {
        socket.removeListener('open', onOpen);
        reject(err);
      };
      socket.once('open', onOpen);
      socket.once('error', onError);
    });
  }

  /**
   * Per ND-24: forward a stdin chunk to the server. Drives the FSM from
   * Idle → Claiming on first input; in Streaming, sends each chunk directly
   * as a `send` frame; in Claiming / Backoff, accumulates into `pendingInput`
   * to flush on next Streaming entry. Empty buffers are no-ops.
   */
  submitInput(bytes: Buffer): void {
    if (this.state === 'closed') return;
    if (bytes.length === 0) return;
    if (this.state === 'streaming') {
      // Already holding the claim — fire-and-forget per-chunk send. Server
      // decides whether this chunk's newline content releases the claim.
      this.sendFrame({
        type: 'send',
        id: this.inflightClaimId,
        data: bytes.toString('base64'),
      });
      return;
    }
    // claiming / backoff / idle: accumulate the bytes.
    this.pendingInput =
      this.pendingInput === undefined
        ? Buffer.from(bytes)
        : Buffer.concat([this.pendingInput, bytes]);
    if (this.state === 'idle') {
      this.sendClaim();
    }
    // claiming: in-flight claim will trigger flushPendingToStream on claim_ack.
    // backoff: the 4 s timer dismissal alone drives the retry — per-keystroke
    // re-claim would defeat the rate-limit ND-02 sets.
  }

  /** Voluntary release (user cancelled draft). Best-effort per §2.2. */
  release(): void {
    if (this.state !== 'claiming' && this.state !== 'streaming') return;
    this.sendFrame({ type: 'release', id: this.inflightClaimId });
  }

  /**
   * Per ND-23: resize is a side-channel emitter — no FSM transition, no claim
   * required. `sendFrame` no-ops when the socket isn't OPEN, which is the
   * correct behavior for a fire-and-forget size update.
   */
  resize(cols: number, rows: number): void {
    this.sendFrame({ type: 'resize', cols, rows });
  }

  /** Close the socket cleanly (^D). */
  close(): void {
    this.clearBackoff();
    if (this.socket !== undefined && this.socket.readyState === WebSocket.OPEN) {
      this.socket.close(WsCloseCode.Normal);
    }
  }

  // Per ND-40: append a binary frame to the pre-subscribe buffer, bounded by
  // the session's replayBufferBytes (read from `hello`). On overflow drop the
  // oldest, mirroring the server's ring buffer — so a caller that never
  // subscribes cannot grow this without bound.
  private bufferInboundBinary(buf: Buffer): void {
    const cap = this.hello?.replayBufferBytes ?? DEFAULT_INBOUND_BUFFER_CAP;
    this.inboundBinaryBuffer.push(buf);
    this.inboundBufferedBytes += buf.length;
    while (this.inboundBufferedBytes > cap && this.inboundBinaryBuffer.length > 1) {
      const dropped = this.inboundBinaryBuffer.shift();
      if (dropped !== undefined) this.inboundBufferedBytes -= dropped.length;
    }
  }

  // Per ND-40: deliver buffered binary to the freshly-registered onBytes in
  // arrival order, then clear. Called once, on the undefined→defined transition.
  private flushInboundBinary(): void {
    if (this.inboundBinaryBuffer.length === 0) return;
    const buffered = this.inboundBinaryBuffer;
    this.inboundBinaryBuffer = [];
    this.inboundBufferedBytes = 0;
    const onBytes = this.callbacks.onBytes;
    if (onBytes === undefined) return;
    for (const chunk of buffered) onBytes(chunk);
  }

  private sendFrame(frame: ClientFrame): void {
    if (this.socket === undefined || this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify(frame));
  }

  private sendClaim(): void {
    const id = makeCorrelationId();
    this.inflightClaimId = id;
    this.sendFrame({ type: 'claim', id });
    this.transition('claiming');
  }

  private flushPendingToStream(): void {
    // Per ND-24: on claim_ack, flush whatever the user typed during Claiming
    // (and possibly during Backoff prior) as one `send`. After this the FSM
    // is in Streaming and subsequent submitInput calls send their own chunks
    // directly.
    this.transition('streaming');
    if (this.pendingInput === undefined) return;
    const bytes = this.pendingInput;
    this.pendingInput = undefined;
    this.sendFrame({
      type: 'send',
      id: this.inflightClaimId,
      data: bytes.toString('base64'),
    });
  }

  private handleTextFrame(raw: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      this.callbacks.onSocketError?.(
        new Error(`attach: malformed JSON from server: ${(err as Error).message}`),
      );
      return;
    }
    const result = ServerFrameSchema.safeParse(parsed);
    if (!result.success) {
      this.callbacks.onSocketError?.(
        new Error(`attach: unknown/invalid server frame: ${result.error.message}`),
      );
      return;
    }
    const frame: ServerFrame = result.data;
    switch (frame.type) {
      case 'hello':
        this.hello = frame;
        this.callbacks.onHello?.(frame);
        break;
      case 'replay_start':
        this.callbacks.onReplayStart?.(frame.bytes);
        break;
      case 'replay_end':
        this.callbacks.onReplayEnd?.();
        break;
      case 'claim_ack':
        // Idempotent re-ack while we're already streaming is a no-op; only
        // the initial Claiming → Streaming transition flushes pendingInput.
        if (this.state === 'claiming') {
          this.flushPendingToStream();
        }
        break;
      case 'busy':
        if (this.state === 'claiming') {
          this.callbacks.onBusy?.();
          this.enterBackoff();
        }
        break;
      case 'claim_released':
        this.callbacks.onClaimReleased?.(frame);
        if (this.state === 'streaming' && frame.reason === 'delivered') {
          // Per ND-24: server detected a newline byte in one of our `send`s
          // and released the claim. If `pendingInput` accumulated post-newline
          // (e.g., paste continuation after the first `\n`), kick a fresh
          // claim immediately so the remaining bytes ride the next claim.
          this.inflightClaimId = undefined;
          this.transition('idle');
          if (this.pendingInput !== undefined) {
            this.sendClaim();
          }
        } else if (
          this.state === 'streaming' &&
          (frame.reason === 'timeout' ||
            frame.reason === 'disconnect' ||
            frame.reason === 'voluntary' ||
            frame.reason === 'session_ended')
        ) {
          // Per ND-02: no auto-resend. Drop any post-burst pendingInput; the
          // user retries by typing again.
          this.inflightClaimId = undefined;
          this.pendingInput = undefined;
          this.transition('idle');
        }
        break;
      case 'session_ended':
        this.callbacks.onSessionEnded?.(frame);
        break;
      case 'auth_expired':
        this.callbacks.onAuthExpired?.(frame.tokenId);
        break;
      case 'error':
        this.callbacks.onError?.(frame);
        if (frame.code === 'send_without_claim' || frame.code === 'invalid_send') {
          // Server-side mid-stream release raced our send (or the payload was
          // garbage). Return to idle and drop pendingInput so the next user
          // keystroke claims fresh — auto-retry on the dropped bytes would
          // loop indefinitely under a persistent error.
          this.inflightClaimId = undefined;
          this.pendingInput = undefined;
          this.transition('idle');
        }
        break;
    }
  }

  private enterBackoff(): void {
    this.transition('backoff');
    this.clearBackoff();
    this.backoffTimer = setTimeout(() => {
      this.backoffTimer = undefined;
      if (this.state !== 'backoff') return;
      // Per ND-24 §T10: if the user typed during backoff, the 4 s dismissal
      // re-attempts the claim with the accumulated bytes; if nothing typed,
      // we just go idle and wait for the next input.
      if (this.pendingInput !== undefined) {
        this.sendClaim();
      } else {
        this.transition('idle');
      }
    }, BACKOFF_DISMISS_MS);
  }

  private clearBackoff(): void {
    if (this.backoffTimer !== undefined) {
      clearTimeout(this.backoffTimer);
      this.backoffTimer = undefined;
    }
  }

  private transition(next: ClientState): void {
    const prev = this.state;
    if (prev === next) return;
    this.state = next;
    this.callbacks.onState?.(next, prev);
  }
}

function rawDataToBuffer(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (Array.isArray(data)) return Buffer.concat(data);
  return Buffer.from(data);
}
