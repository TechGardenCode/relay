import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from './auth.service';
import { PtyOutputService } from './pty-output.service';
import { IWebSocket, WsClientService } from './ws-client.service';

const ISO = '2026-05-15T14:32:30Z';

class FakeWebSocket implements IWebSocket {
  binaryType = 'blob';
  sent: Record<string, unknown>[] = [];
  onopen: (() => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(
    readonly url: string,
    readonly protocols: string[],
  ) {}

  send(data: string): void {
    this.sent.push(JSON.parse(data) as Record<string, unknown>);
  }
  close(code = 1000): void {
    this.onclose?.({ code });
  }

  emitOpen(): void {
    this.onopen?.();
  }
  emitText(obj: unknown): void {
    this.onmessage?.({ data: JSON.stringify(obj) });
  }
  emitBinary(bytes: Uint8Array): void {
    this.onmessage?.({ data: bytes.buffer });
  }
  emitClose(code: number): void {
    this.onclose?.({ code });
  }
  kinds(): string[] {
    return this.sent.map((f) => f['type'] as string);
  }
}

function make(token: string, serverUrl: string | null = null) {
  localStorage.clear();
  const auth = new AuthService();
  auth.setPaired({ token, url: serverUrl });
  const pty = new PtyOutputService();
  const svc = new WsClientService(auth, pty);
  const sockets: FakeWebSocket[] = [];
  svc._setSocketFactory((url, protocols) => {
    const s = new FakeWebSocket(url, protocols);
    sockets.push(s);
    return s;
  });
  return { svc, pty, sockets, auth };
}

describe('WsClientService', () => {
  afterEach(() => vi.useRealTimers());

  it('opens with the relay.bearer subprotocol (ND-36) and never puts the token in the URL', () => {
    const { svc, sockets } = make('tok-1', 'https://relay.lan');
    svc.attach('01JSESSION');
    expect(sockets[0].protocols).toEqual(['relay.bearer', 'tok-1']);
    expect(sockets[0].url).toBe('wss://relay.lan/sessions/01JSESSION/stream');
    expect(sockets[0].url).not.toContain('tok-1');
  });

  it('control rail (line mode, non-newline ^C) sends claim → send → release (ND-42 stopgap)', () => {
    const { svc, sockets } = make('tok-1');
    svc.attach('s1');
    sockets[0].emitOpen();
    svc.sendControl(new Uint8Array([0x03]));
    sockets[0].emitText({ type: 'claim_ack', expiresAt: ISO });
    expect(sockets[0].kinds()).toEqual(['claim', 'send', 'release']);
    const send = sockets[0].sent.find((f) => f['type'] === 'send');
    expect(atob(send!['data'] as string)).toBe('\x03');
  });

  it('control rail Enter (\\r self-releases, ND-24) sends claim → send with NO explicit release', () => {
    const { svc, sockets } = make('tok-1');
    svc.attach('s1');
    sockets[0].emitOpen();
    svc.sendControl(new Uint8Array([0x0d]));
    sockets[0].emitText({ type: 'claim_ack', expiresAt: ISO });
    expect(sockets[0].kinds()).toEqual(['claim', 'send']); // no spurious release → no error banner
  });

  it('control rail while streaming (claimed-local) just sends — no claim, no release', () => {
    const { svc, sockets } = make('tok-1');
    svc.attach('s1');
    sockets[0].emitOpen();
    svc.setRawMode(true);
    svc.sendInput(new Uint8Array([0x61])); // 'a' — claims
    sockets[0].emitText({ type: 'claim_ack', expiresAt: ISO }); // now claimed-local
    const before = sockets[0].sent.length;
    svc.sendControl(new Uint8Array([0x1b, 0x5b, 0x41])); // Up arrow mid-stream
    expect(sockets[0].sent.slice(before).map((f) => f['type'])).toEqual(['send']);
  });

  it('buffers inbound binary until the consumer subscribes, then drains in order (ND-40)', () => {
    const { svc, pty, sockets } = make('tok-1');
    svc.attach('s1');
    sockets[0].emitOpen();
    sockets[0].emitBinary(new Uint8Array([65])); // 'A' arrives before subscribe
    sockets[0].emitBinary(new Uint8Array([66])); // 'B'
    const got: number[] = [];
    pty.subscribe((c) => got.push(...c)); // consumer subscribes late
    expect(got).toEqual([65, 66]); // drained in order, none dropped
  });

  it('hello sets the hello signal and busy sets claimState to busy-other (ND-02)', () => {
    const { svc, sockets } = make('tok-1');
    svc.attach('s1');
    sockets[0].emitOpen();
    sockets[0].emitText({
      type: 'hello',
      sessionId: '01JSESSION0000000000000000',
      status: 'running',
      replayBufferBytes: 32768,
      claimLockTimeoutSeconds: 30,
      serverTime: ISO,
    });
    expect(svc.hello()?.claimLockTimeoutSeconds).toBe(30);
    svc.sendInput(new Uint8Array([0x68, 0x69, 0x0a])); // "hi\n"
    sockets[0].emitText({ type: 'busy', since: ISO });
    expect(svc.claimState()).toBe('busy-other');
  });

  it('reconnects on unexpected close and gives up (error) after the 10-minute window', () => {
    vi.useFakeTimers();
    const { svc, sockets } = make('tok-1');
    svc.attach('s1');
    sockets[0].emitOpen();
    expect(svc.connectionState()).toBe('attached');

    sockets[0].emitClose(1006); // unexpected
    expect(svc.connectionState()).toBe('reconnecting');
    vi.advanceTimersByTime(5); // first backoff (~0ms) fires → a new socket opens
    expect(sockets.length).toBe(2);

    // Push past the 10-minute window, then let the retry fail again.
    vi.advanceTimersByTime(10 * 60 * 1000);
    sockets[1].emitClose(1006);
    expect(svc.connectionState()).toBe('error'); // manual "tap to reconnect"
  });

  it('a clean detach() does not schedule a reconnect', () => {
    vi.useFakeTimers();
    const { svc, sockets } = make('tok-1');
    svc.attach('s1');
    sockets[0].emitOpen();
    svc.detach();
    expect(svc.connectionState()).toBe('idle');
    vi.advanceTimersByTime(60_000);
    expect(sockets.length).toBe(1); // no reconnect socket
  });
});
