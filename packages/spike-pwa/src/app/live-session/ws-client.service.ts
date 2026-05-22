import { Injectable, inject } from '@angular/core';
import { Observable, Subject } from 'rxjs';

import type { ClientFrame, ServerFrame } from '@relay/protocol';

import { TokenStore } from '../auth/token.store';

// Per ND-36: the PWA passes its bearer token via the WS subprotocol
// because `new WebSocket(...)` cannot set Authorization. Scheme name is
// the same one the server's auth preHandler parses.
const SUBPROTOCOL_SCHEME = 'relay.bearer';

// PWA-side reconnect sentinel events. These are NOT part of the WS
// protocol — they're produced by this service so the live-session
// component can render reconnect banners and session-ended state
// without subscribing to the underlying socket lifecycle directly.
export type ConnectionEvent =
  | { kind: 'connected' }
  | { kind: 'reconnecting'; attempt: number; delayMs: number }
  | { kind: 'closed'; code: number; reason: string }
  | { kind: 'frame'; frame: ServerFrame }
  | { kind: 'bytes'; data: Uint8Array };

interface OpenSocket {
  socket: WebSocket;
  // Set to true when the user calls disconnect(); suppresses reconnect.
  intentionalClose: boolean;
}

@Injectable()
export class WsClientService {
  private readonly tokenStore = inject(TokenStore);
  private open: OpenSocket | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly events$ = new Subject<ConnectionEvent>();
  private sessionId: string | null = null;

  // Per D-G3 + the reconnect plan in the design doc: starts at 500ms,
  // caps at 8s, with ±20% jitter to avoid synchronized retries from
  // many tabs.
  private static readonly BACKOFF_MIN_MS = 500;
  private static readonly BACKOFF_MAX_MS = 8000;
  private static readonly BACKOFF_JITTER = 0.2;

  connect(sessionId: string): Observable<ConnectionEvent> {
    if (this.sessionId !== null && this.sessionId !== sessionId) {
      // Switching sessions — tear down the previous WS first.
      this.disconnect();
    }
    this.sessionId = sessionId;
    this.reconnectAttempt = 0;
    this.openSocket();
    return this.events$.asObservable();
  }

  send(payload: Uint8Array): boolean {
    const open = this.open;
    if (open === null || open.socket.readyState !== WebSocket.OPEN) return false;
    const base64 = bytesToBase64(payload);
    const frame: ClientFrame = { type: 'send', data: base64 };
    open.socket.send(JSON.stringify(frame));
    return true;
  }

  resize(cols: number, rows: number): boolean {
    const open = this.open;
    if (open === null || open.socket.readyState !== WebSocket.OPEN) return false;
    const frame: ClientFrame = { type: 'resize', cols, rows };
    open.socket.send(JSON.stringify(frame));
    return true;
  }

  disconnect(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.open !== null) {
      this.open.intentionalClose = true;
      this.open.socket.close(1000, 'client disconnect');
      this.open = null;
    }
    this.sessionId = null;
    this.reconnectAttempt = 0;
  }

  destroy(): void {
    this.disconnect();
    this.events$.complete();
  }

  private openSocket(): void {
    const paired = this.tokenStore.state();
    const sessionId = this.sessionId;
    if (paired === null || sessionId === null) {
      this.events$.next({ kind: 'closed', code: 1000, reason: 'not paired' });
      return;
    }
    const wsUrl = httpToWsUrl(paired.serverUrl) + `/sessions/${sessionId}/stream`;
    let socket: WebSocket;
    try {
      // RFC 6455 §1.9: subprotocols are an array passed to the constructor.
      // Browsers serialize this as `Sec-WebSocket-Protocol: relay.bearer, <token>`.
      // The server's @fastify/websocket plugin echoes back `relay.bearer`
      // per its handleProtocols hook (see ND-36).
      socket = new WebSocket(wsUrl, [SUBPROTOCOL_SCHEME, paired.token]);
    } catch (err) {
      console.error('WebSocket construction failed', err);
      this.scheduleReconnect();
      return;
    }
    socket.binaryType = 'arraybuffer';
    const open: OpenSocket = { socket, intentionalClose: false };
    this.open = open;

    socket.addEventListener('open', () => {
      this.reconnectAttempt = 0;
      this.events$.next({ kind: 'connected' });
    });
    socket.addEventListener('message', (ev: MessageEvent<string | ArrayBuffer>) => {
      if (typeof ev.data === 'string') {
        try {
          const frame = JSON.parse(ev.data) as ServerFrame;
          this.events$.next({ kind: 'frame', frame });
        } catch (err) {
          console.error('Malformed text frame from server', err, ev.data);
        }
      } else {
        this.events$.next({ kind: 'bytes', data: new Uint8Array(ev.data) });
      }
    });
    socket.addEventListener('close', (ev: CloseEvent) => {
      if (this.open === open) this.open = null;
      this.events$.next({ kind: 'closed', code: ev.code, reason: ev.reason });
      if (!open.intentionalClose) this.scheduleReconnect();
    });
    socket.addEventListener('error', () => {
      // Browser hides the underlying error for cross-origin safety; the
      // close event that follows carries the actionable code. We only
      // log here so a phone-attached debugger sees something.
      console.warn('WebSocket error event (close will follow with details)');
    });
  }

  private scheduleReconnect(): void {
    if (this.sessionId === null) return; // disconnected intentionally
    this.reconnectAttempt += 1;
    const base = Math.min(
      WsClientService.BACKOFF_MAX_MS,
      WsClientService.BACKOFF_MIN_MS * 2 ** (this.reconnectAttempt - 1),
    );
    const jitter = base * WsClientService.BACKOFF_JITTER * (Math.random() * 2 - 1);
    const delayMs = Math.max(WsClientService.BACKOFF_MIN_MS, Math.round(base + jitter));
    this.events$.next({ kind: 'reconnecting', attempt: this.reconnectAttempt, delayMs });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket();
    }, delayMs);
  }
}

function httpToWsUrl(httpUrl: string): string {
  if (httpUrl.startsWith('http://')) return 'ws://' + httpUrl.slice('http://'.length);
  if (httpUrl.startsWith('https://')) return 'wss://' + httpUrl.slice('https://'.length);
  // Same-origin fallback: assume the pair view already validated this.
  return httpUrl;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}
