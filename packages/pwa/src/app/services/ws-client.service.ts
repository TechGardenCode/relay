import { Injectable, Signal, signal } from '@angular/core';
import { HelloFrame, SessionEndedFrame, ServerFrameSchema } from '@relay/protocol';

import { AuthService } from './auth.service';
import { PtyOutputService } from './pty-output.service';

export type ConnState = 'idle' | 'connecting' | 'attached' | 'reconnecting' | 'error';
export type ClaimState = 'released' | 'claimed-local' | 'busy-other';

// Minimal WebSocket surface so specs can inject a FakeWebSocket without a real
// socket. The default factory wraps the browser global.
export interface IWebSocket {
  binaryType: string;
  send(data: string): void;
  close(code?: number): void;
  onopen: (() => void) | null;
  onclose: ((ev: { code: number }) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onerror: (() => void) | null;
}
export type SocketFactory = (url: string, protocols: string[]) => IWebSocket;

// Per data-layer.md §3.2 reconnect levers.
const BACKOFF_BASE_MS = 1000;
const BACKOFF_CAP_MS = 30_000;
const RECONNECT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes then manual fallback

function containsNewline(bytes: Uint8Array): boolean {
  return bytes.includes(0x0a) || bytes.includes(0x0d); // \n or \r — ND-24 release trigger
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

// Non-fatal WS error codes that are benign no-ops and must NOT flash the
// user-facing banner (NFR-10). release_without_claim is idempotent
// (ws-protocol.md §2.2); send_without_claim is handled by the claim FSM (§5.1).
const BENIGN_ERROR_CODES = new Set(['release_without_claim', 'send_without_claim']);

@Injectable({ providedIn: 'root' })
export class WsClientService {
  private readonly _connectionState = signal<ConnState>('idle');
  private readonly _claimState = signal<ClaimState>('released');
  private readonly _rawMode = signal(false);
  private readonly _lastError = signal<string | null>(null);
  private readonly _hello = signal<HelloFrame | null>(null);
  private readonly _claimExpiresAt = signal<string | null>(null);
  private readonly _reconnectAttempt = signal(0);
  private readonly _ended = signal<SessionEndedFrame | null>(null);

  readonly connectionState = this._connectionState.asReadonly();
  readonly claimState = this._claimState.asReadonly();
  readonly rawMode = this._rawMode.asReadonly();
  readonly lastError = this._lastError.asReadonly();
  readonly hello = this._hello.asReadonly();
  readonly claimExpiresAt = this._claimExpiresAt.asReadonly(); // ND-01 countdown source
  readonly reconnectAttempt = this._reconnectAttempt.asReadonly();
  readonly ended: Signal<SessionEndedFrame | null> = this._ended.asReadonly();

  private socket: IWebSocket | null = null;
  private socketOpen = false;
  private currentSessionId: string | null = null;
  private intentionalClose = false;
  private corr = 0;

  // ND-40 connect→subscribe replay buffer (owned here, per data-layer.md §3.3).
  private buffer: Uint8Array[] = [];

  private claiming = false;
  private pendingSend: { bytes: Uint8Array; releaseAfter: boolean } | null = null;
  private lastResize: { cols: number; rows: number } | null = null;

  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private windowStartMs: number | null = null;
  private readonly onOnline = () => this.handleOnline();

  private socketFactory: SocketFactory = (url, protocols) =>
    new WebSocket(url, protocols) as unknown as IWebSocket;

  constructor(
    private readonly auth: AuthService,
    private readonly pty: PtyOutputService,
  ) {}

  /** @internal test seam — inject a fake socket factory before attach(). */
  _setSocketFactory(f: SocketFactory): void {
    this.socketFactory = f;
  }

  attach(sessionId: string): void {
    this.detach(); // idempotent reset of any prior attach
    this.currentSessionId = sessionId;
    this.intentionalClose = false;
    this._ended.set(null);
    this.windowStartMs = null;
    this._reconnectAttempt.set(0);
    // ND-40: drain the buffer to the viewport the moment it subscribes.
    this.pty.setDrainHook(() => this.drain());
    window.addEventListener('online', this.onOnline);
    this.open();
  }

  detach(): void {
    this.intentionalClose = true;
    this.clearReconnectTimer();
    window.removeEventListener('online', this.onOnline);
    if (this.socket) {
      // Per feature-modules.md §4.6 + FR-14: close and leave the session running.
      try {
        this.socket.close(1000);
      } catch {
        /* already closing */
      }
    }
    this.socket = null;
    this.socketOpen = false;
    this.buffer = [];
    this.pty.setDrainHook(null);
    this.claiming = false;
    this.pendingSend = null;
    this._connectionState.set('idle');
    this._claimState.set('released');
    this._claimExpiresAt.set(null);
    this._hello.set(null);
    this.currentSessionId = null;
  }

  reconnectNow(): void {
    if (!this.currentSessionId) return;
    this.clearReconnectTimer();
    this.windowStartMs = null; // manual retry resets the 10-minute window
    this._reconnectAttempt.set(0);
    this.intentionalClose = false;
    this.open();
  }

  setRawMode(on: boolean): void {
    this._rawMode.set(on);
  }

  // Compose (FR-6) + raw (FR-7) input. Per ws-protocol.md §5.1 + ND-24.
  sendInput(bytes: Uint8Array): void {
    if (this._claimState() === 'claimed-local') {
      this.sendData(bytes); // streaming — server releases on a newline byte
      return;
    }
    // released (or a manual retry from busy): claim, flush on ack. Compose bytes
    // carry a trailing \n so the server auto-releases (ND-24) — no explicit release.
    this.pendingSend = { bytes, releaseAfter: false };
    this.sendClaim();
  }

  // Control rail (FR-5). Per ND-42 stopgap, claim-aware so it composes with
  // ND-24 streaming and never flashes a spurious error.
  sendControl(bytes: Uint8Array): void {
    if (this._claimState() === 'claimed-local') {
      // Mid-stream: just send. NO release — dropping the held claim here would
      // open a contention window before the next keystroke re-claims (ND-42).
      this.sendData(bytes);
      return;
    }
    // Line mode: claim → send → release, UNLESS the byte self-releases. Enter's
    // \r triggers the server newline-release (ND-24); an explicit release after
    // it would provoke a spurious release_without_claim (NFR-10 regression).
    this.pendingSend = { bytes, releaseAfter: !containsNewline(bytes) };
    this.sendClaim();
  }

  release(): void {
    this.sendFrame({ type: 'release', id: this.nextId() });
  }

  // Per ND-23: side-channel, independent of claim state; also re-sent on reconnect.
  resize(cols: number, rows: number): void {
    this.lastResize = { cols, rows };
    this.sendFrame({ type: 'resize', cols, rows });
  }

  // ----- internals -----

  private open(): void {
    const sessionId = this.currentSessionId;
    const bearer = this.auth.bearer();
    if (!sessionId || !bearer) return;
    this._connectionState.set(this.windowStartMs !== null ? 'reconnecting' : 'connecting');

    // Per ND-36: browser WS auth is the subprotocol-sourced bearer — never a
    // header, never the URL.
    const socket = this.socketFactory(this.streamUrl(sessionId), ['relay.bearer', bearer]);
    socket.binaryType = 'arraybuffer';
    this.socket = socket;
    socket.onopen = () => this.handleOpen();
    socket.onmessage = (ev) => this.handleMessage(ev.data);
    socket.onclose = (ev) => this.handleClose(ev.code);
    socket.onerror = () => {
      /* the close handler drives reconnect; error is informational */
    };
  }

  private handleOpen(): void {
    this.socketOpen = true;
    this._connectionState.set('attached');
    this._reconnectAttempt.set(0);
    this.windowStartMs = null;
    // Re-assert viewport size on (re)connect so the PTY matches (ND-23).
    if (this.lastResize) this.sendFrame({ type: 'resize', ...this.lastResize });
  }

  private handleClose(code: number): void {
    this.socketOpen = false;
    this._claimState.set('released');
    this._claimExpiresAt.set(null);
    if (this.intentionalClose) {
      this._connectionState.set('idle');
      return;
    }
    if (code === 4401) this.auth.clear(); // token revoked mid-stream (ws-protocol §4.2)
    this.scheduleReconnect();
  }

  private handleMessage(data: unknown): void {
    if (typeof data === 'string') {
      let parsed: unknown;
      try {
        parsed = ServerFrameSchema.parse(JSON.parse(data));
      } catch {
        return; // ignore malformed server text frame
      }
      this.dispatch(parsed as ReturnType<typeof ServerFrameSchema.parse>);
      return;
    }
    // Binary PTY output — verbatim bytes to the viewport (no decode). ws-protocol §2.4.
    if (data instanceof ArrayBuffer) this.handleBinary(new Uint8Array(data));
  }

  private dispatch(frame: ReturnType<typeof ServerFrameSchema.parse>): void {
    switch (frame.type) {
      case 'hello':
        this._hello.set(frame);
        this._connectionState.set('attached');
        break;
      case 'replay_start':
        // Per D-G3: clear stale scrollback before the reattach repaint (no-op on
        // first attach). The viewport wires PtyOutputService.reset → terminal.reset.
        this.pty.reset();
        break;
      case 'replay_end':
        break;
      case 'claim_ack':
        this.claiming = false;
        this._claimState.set('claimed-local');
        this._claimExpiresAt.set(frame.expiresAt);
        if (this.pendingSend) {
          const { bytes, releaseAfter } = this.pendingSend;
          this.pendingSend = null;
          this.sendData(bytes);
          if (releaseAfter) this.release();
        }
        break;
      case 'busy':
        // Per ND-02: another connection holds the claim. Draft is preserved in
        // ComposeService; drop the in-flight pending payload, surface BUSY.
        this.claiming = false;
        this.pendingSend = null;
        this._claimState.set('busy-other');
        break;
      case 'claim_released':
        this._claimState.set('released');
        this._claimExpiresAt.set(null);
        // Post-newline leftover (rare paste case) — re-claim to flush it.
        if (this.pendingSend) this.sendClaim();
        break;
      case 'session_ended':
        this._ended.set(frame);
        break;
      case 'auth_expired':
        this.auth.clear();
        break;
      case 'error':
        if (frame.fatal) {
          this._lastError.set(frame.message);
        } else if (!BENIGN_ERROR_CODES.has(frame.code)) {
          this._lastError.set(frame.message);
        }
        break;
    }
  }

  private handleBinary(bytes: Uint8Array): void {
    if (this.pty.hasConsumer()) this.pty.push(bytes);
    else this.buffer.push(bytes); // ND-40: buffer until the viewport subscribes
  }

  private drain(): void {
    for (const chunk of this.buffer) this.pty.push(chunk);
    this.buffer = [];
  }

  private scheduleReconnect(): void {
    if (this.windowStartMs === null) this.windowStartMs = Date.now();
    if (Date.now() - this.windowStartMs >= RECONNECT_WINDOW_MS) {
      // Window expired — stop auto-retry, surface manual "tap to reconnect".
      this._connectionState.set('error');
      return;
    }
    this._connectionState.set('reconnecting');
    const n = this._reconnectAttempt();
    const base = n === 0 ? 0 : Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** (n - 1));
    const jitter = base * 0.2 * (Math.random() * 2 - 1); // ±20%
    const delay = Math.max(0, base + jitter);
    this._reconnectAttempt.set(n + 1);
    this.reconnectTimer = setTimeout(() => this.open(), delay);
  }

  private handleOnline(): void {
    // Per data-layer.md §3.2: cancel pending backoff and reconnect immediately.
    if (this._connectionState() === 'reconnecting' || this._connectionState() === 'error') {
      this.clearReconnectTimer();
      this.open();
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private sendClaim(): void {
    this.claiming = true;
    this.sendFrame({ type: 'claim', id: this.nextId() });
  }

  private sendData(bytes: Uint8Array): void {
    this.sendFrame({ type: 'send', id: this.nextId(), data: toBase64(bytes) });
  }

  private sendFrame(frame: Record<string, unknown>): void {
    if (this.socket && this.socketOpen) this.socket.send(JSON.stringify(frame));
  }

  private nextId(): string {
    return `c-${++this.corr}`;
  }

  private streamUrl(sessionId: string): string {
    const path = `/sessions/${sessionId}/stream`;
    const base = this.auth.serverUrl();
    if (base) {
      const u = new URL(path, base);
      u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
      return u.toString();
    }
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    return `${scheme}://${location.host}${path}`;
  }
}
