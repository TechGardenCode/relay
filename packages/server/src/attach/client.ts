// `relay attach` WS client. Implements the §5.1 client FSM from
// docs/arch/ws-protocol.md:
//
//   Idle ── line ready (\n) ──► Claiming
//   Claiming ── claim_ack ──► Sending (CLI auto-sends; no second Enter — see below)
//   Claiming ── busy      ──► Backoff
//   Sending  ── claim_released { delivered, heldBy: us } ──► Idle
//   Backoff  ── next stdin byte ──► Idle    (then the next \n re-enters Claiming)
//
// Per ND-17, the CLI collapses Claimed→Sending instead of waiting for a
// second Enter: the IDE compose-field uses two Enters because the first
// Enter is the line commit and the second is the user-driven retry on
// BUSY. In a raw-mode TTY the user has already typed the line and pressed
// Enter once; deferring the send to a second Enter would feel broken. The
// §5.1 server-side FSM is unchanged — the wire still goes claim →
// claim_ack → send → claim_released. ND-17 also covers the Backoff → Idle
// transition firing on the 4-second timer alone (individual keystrokes
// accumulate in tty.ts's line buffer, not in the client).
//
// Per ND-01 / ND-03 nothing here is hardcoded: claimLockTimeoutSeconds and
// replayBufferBytes are read from the inbound `hello` frame and exposed via
// `onHello`. The 4-second backoff dismissal in §5.1 is the only literal we
// keep (per ND-02 "auto-dismisses after ~4 seconds").

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

export type ClientState = 'idle' | 'claiming' | 'sending' | 'backoff' | 'closed';

const BACKOFF_DISMISS_MS = 4_000;

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
 * over a single WebSocket. Exposes `submit(line)` for the TTY bridge to call
 * when stdin produces a complete line (\n or \r\n), and `release()` for the
 * voluntary release case (user cancelled — Ctrl-C during draft).
 */
export class AttachClient {
  private socket: WebSocket | undefined;
  private state: ClientState = 'idle';
  private pendingLine: Buffer | undefined;
  private inflightClaimId: string | undefined;
  private backoffTimer: NodeJS.Timeout | undefined;
  private callbacks: ClientCallbacks;
  private readonly opts: AttachClientOptions;
  private hello: HelloFrame | undefined;

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
  }

  get currentState(): ClientState {
    return this.state;
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
        this.callbacks.onBytes?.(buf);
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

  /** Stdin produced a complete line. Drives Idle → Claiming → Sending. */
  submit(line: Buffer): void {
    if (this.state === 'closed') return;
    this.pendingLine = line;
    if (this.state === 'backoff') {
      // §5.1: typing a key dismisses the notice; the next Enter re-claims.
      // For CLI, the line is already complete (we're in submit()); retry.
      this.clearBackoff();
    }
    if (this.state === 'idle') {
      this.sendClaim();
    }
    // Any other state (claiming / sending): pendingLine queued, takes effect
    // when the in-flight claim resolves. Pasted-line-during-send is rare for
    // a typing user; documented as last-wins.
  }

  /** Voluntary release (user cancelled draft). Best-effort per §2.2. */
  release(): void {
    if (this.state !== 'claiming' && this.state !== 'sending') return;
    this.sendFrame({ type: 'release', id: this.inflightClaimId });
  }

  /** Close the socket cleanly (^D). */
  close(): void {
    this.clearBackoff();
    if (this.socket !== undefined && this.socket.readyState === WebSocket.OPEN) {
      this.socket.close(WsCloseCode.Normal);
    }
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

  private sendBuffered(): void {
    if (this.pendingLine === undefined) return;
    const line = this.pendingLine;
    this.pendingLine = undefined;
    this.sendFrame({
      type: 'send',
      id: this.inflightClaimId,
      data: line.toString('base64'),
    });
    this.transition('sending');
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
        // Idempotent re-ack while we're already claiming or sending is a
        // no-op; only the initial transition triggers the send.
        if (this.state === 'claiming') {
          this.sendBuffered();
        }
        break;
      case 'busy':
        if (this.state === 'claiming') {
          this.callbacks.onBusy?.();
          this.enterBackoff();
        }
        break;
      case 'claim_released':
        // For the CLI we collapsed claim ack → send; on `delivered` from our
        // own send we return to idle. The release-by-other-device branch is
        // purely informational.
        this.callbacks.onClaimReleased?.(frame);
        if (this.state === 'sending' && frame.reason === 'delivered') {
          this.inflightClaimId = undefined;
          // If the user typed another line while the send was in flight,
          // pendingLine !== undefined — kick off the next claim immediately.
          this.transition('idle');
          if (this.pendingLine !== undefined) {
            this.sendClaim();
          }
        } else if (
          this.state === 'sending' &&
          (frame.reason === 'timeout' || frame.reason === 'disconnect')
        ) {
          // Per §5.1: timeout on Sending is treated as send-failed; the user
          // retries. We surface the event and return to Idle without
          // resending — auto-retry would violate ND-02.
          this.inflightClaimId = undefined;
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
          // Server dropped our send; return to idle so the next line claims
          // fresh. The user retries by typing again.
          this.inflightClaimId = undefined;
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
      if (this.state === 'backoff') {
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
