// AttachClient §5.1 client FSM unit tests. Exercises every transition in
// ws-protocol.md §5.1 plus the CLI-specific collapse of Claimed→Sending and
// the §4.1 error-frame handling.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AttachClient, type ClientState } from './client.js';

// Fake WebSocket matching the parts of the `ws` module's WebSocket surface
// the AttachClient consumes (constructor + on/once/send/close + readyState).
// Tests drive .receive*() to push server frames; assertions read .sent and
// .closeCode.
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static OPEN = 1;
  readyState: number = FakeWebSocket.OPEN;
  sent: unknown[] = [];
  closeCode: number | undefined;
  private messageListeners: ((data: Buffer, isBinary: boolean) => void)[] = [];
  private closeListeners: ((code: number, reason: Buffer) => void)[] = [];
  private errorListeners: ((err: Error) => void)[] = [];
  private openListeners: (() => void)[] = [];

  constructor(
    readonly url: string,
    readonly headers: Record<string, string>,
  ) {
    FakeWebSocket.instances.push(this);
    // Async open: lets the caller wire .on('open') before firing.
    queueMicrotask(() => this.fireOpen());
  }

  on(event: 'message', cb: (data: Buffer, isBinary: boolean) => void): this;
  on(event: 'close', cb: (code: number, reason: Buffer) => void): this;
  on(event: 'error', cb: (err: Error) => void): this;
  on(event: 'open', cb: () => void): this;
  on(event: string, cb: (...a: never[]) => void): this {
    if (event === 'message') this.messageListeners.push(cb as never);
    else if (event === 'close') this.closeListeners.push(cb as never);
    else if (event === 'error') this.errorListeners.push(cb as never);
    else if (event === 'open') this.openListeners.push(cb as never);
    return this;
  }
  once(event: string, cb: (...a: never[]) => void): this {
    // Mimic `ws`'s `once`: wraps a removable callback.
    const wrapper = (...a: never[]): void => {
      this.removeListener(event, wrapper);
      (cb as (...args: never[]) => void)(...a);
    };
    return this.on(event as 'open', wrapper as () => void);
  }
  removeListener(event: string, cb: (...a: never[]) => void): this {
    const remove = <T>(list: T[]): T[] => list.filter((c) => c !== (cb as unknown as T));
    if (event === 'message') this.messageListeners = remove(this.messageListeners);
    else if (event === 'close') this.closeListeners = remove(this.closeListeners);
    else if (event === 'error') this.errorListeners = remove(this.errorListeners);
    else if (event === 'open') this.openListeners = remove(this.openListeners);
    return this;
  }
  send(data: string | Buffer): void {
    this.sent.push(typeof data === 'string' ? JSON.parse(data) : data);
  }
  close(code?: number): void {
    this.readyState = 3; // CLOSED
    this.closeCode = code;
    for (const cb of this.closeListeners) cb(code ?? 1006, Buffer.alloc(0));
  }

  // Test driver:
  receiveText(frame: unknown): void {
    const buf = Buffer.from(JSON.stringify(frame), 'utf8');
    for (const cb of this.messageListeners) cb(buf, false);
  }
  receiveBinary(bytes: Buffer): void {
    for (const cb of this.messageListeners) cb(bytes, true);
  }
  fireOpen(): void {
    for (const cb of this.openListeners) cb();
  }
  fireError(err: Error): void {
    for (const cb of this.errorListeners) cb(err);
  }
}

interface ConnectedRig {
  client: AttachClient;
  socket: FakeWebSocket;
  states: ClientState[];
}

async function newConnected(extraCallbacks = {}): Promise<ConnectedRig> {
  const states: ClientState[] = [];
  const client = new AttachClient(
    {
      wsUrl: 'ws://test',
      sessionId: '01J7ZXY9PQ2K0M4B6F3HV8C5R7',
      token: 'TOKEN',
      wsFactory: (url, headers) => new FakeWebSocket(url, headers) as never,
    },
    {
      onState: (next) => states.push(next),
      ...extraCallbacks,
    },
  );
  await client.connect();
  const socket = FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
  if (socket === undefined) throw new Error('FakeWebSocket instance missing');
  return { client, socket, states };
}

beforeEach(() => {
  FakeWebSocket.instances = [];
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AttachClient connection', () => {
  it('opens with Authorization: Bearer <token> on the canonical /sessions/:id/stream path', async () => {
    const { socket } = await newConnected();
    expect(socket.url).toBe('ws://test/sessions/01J7ZXY9PQ2K0M4B6F3HV8C5R7/stream');
    expect(socket.headers).toEqual({ Authorization: 'Bearer TOKEN' });
  });

  it('exposes the inbound hello frame so the TTY can read claimLockTimeoutSeconds (ND-01) and replayBufferBytes (ND-03) without hardcoding', async () => {
    const rig = await newConnected();
    rig.socket.receiveText({
      type: 'hello',
      sessionId: '01J7ZXY9PQ2K0M4B6F3HV8C5R7',
      status: 'running',
      replayBufferBytes: 65536,
      claimLockTimeoutSeconds: 60,
      serverTime: '2026-05-18T10:00:00Z',
    });
    expect(rig.client.helloFrame?.replayBufferBytes).toBe(65536);
    expect(rig.client.helloFrame?.claimLockTimeoutSeconds).toBe(60);
  });
});

describe('AttachClient §5.1 client FSM', () => {
  it('Idle → Claiming → Sending → Idle on the happy path; the wire emits claim then send', async () => {
    const rig = await newConnected();
    rig.client.submit(Buffer.from('ls -la\n'));
    expect(rig.client.currentState).toBe('claiming');
    expect(rig.socket.sent).toHaveLength(1);
    expect(rig.socket.sent[0]).toMatchObject({ type: 'claim' });
    const claim = rig.socket.sent[0] as { id: string };

    // claim_ack — CLI collapses Claimed → Sending and emits the send.
    rig.socket.receiveText({ type: 'claim_ack', id: claim.id, expiresAt: '2026-05-18T10:00:30Z' });
    expect(rig.client.currentState).toBe('sending');
    expect(rig.socket.sent).toHaveLength(2);
    expect(rig.socket.sent[1]).toMatchObject({ type: 'send', id: claim.id });
    expect((rig.socket.sent[1] as { data: string }).data).toBe(
      Buffer.from('ls -la\n').toString('base64'),
    );

    // claim_released { delivered, heldBy: us } returns to Idle.
    rig.socket.receiveText({ type: 'claim_released', reason: 'delivered', heldBy: 'us' });
    expect(rig.client.currentState).toBe('idle');
    expect(rig.states).toEqual(['claiming', 'sending', 'idle']);
  });

  it('Claiming → Backoff on busy; auto-dismisses to Idle after the 4-second window per ND-02', async () => {
    vi.useFakeTimers();
    const onBusy = vi.fn();
    const rig = await newConnected({ onBusy });
    rig.client.submit(Buffer.from('hello\n'));
    const claim = rig.socket.sent[0] as { id: string };
    rig.socket.receiveText({ type: 'busy', id: claim.id });
    expect(onBusy).toHaveBeenCalledOnce();
    expect(rig.client.currentState).toBe('backoff');

    vi.advanceTimersByTime(4_000);
    expect(rig.client.currentState).toBe('idle');
  });

  it('an inbound `send_without_claim` error returns the FSM to Idle (the line is dropped, user retries)', async () => {
    const onError = vi.fn();
    const rig = await newConnected({ onError });
    rig.client.submit(Buffer.from('x\n'));
    // Simulate a race where claim_ack appeared to arrive but the server says
    // the send is unclaimed.
    const claim = rig.socket.sent[0] as { id: string };
    rig.socket.receiveText({ type: 'claim_ack', id: claim.id, expiresAt: '2026-05-18T10:00:30Z' });
    rig.socket.receiveText({
      type: 'error',
      code: 'send_without_claim',
      message: 'no active claim',
      fatal: false,
    });
    expect(onError).toHaveBeenCalledOnce();
    expect(rig.client.currentState).toBe('idle');
  });

  it('claim_released with reason=timeout while Sending returns to Idle without auto-resend (ND-02 user-driven retry)', async () => {
    const rig = await newConnected();
    rig.client.submit(Buffer.from('x\n'));
    const claim = rig.socket.sent[0] as { id: string };
    rig.socket.receiveText({ type: 'claim_ack', id: claim.id, expiresAt: '2026-05-18T10:00:30Z' });
    expect(rig.client.currentState).toBe('sending');
    const sentCount = rig.socket.sent.length;
    rig.socket.receiveText({ type: 'claim_released', reason: 'timeout', heldBy: 'us' });
    expect(rig.client.currentState).toBe('idle');
    expect(rig.socket.sent).toHaveLength(sentCount);
  });

  it('a second line typed while Sending kicks off another claim immediately on delivered', async () => {
    const rig = await newConnected();
    rig.client.submit(Buffer.from('one\n'));
    const claim1 = rig.socket.sent[0] as { id: string };
    rig.socket.receiveText({ type: 'claim_ack', id: claim1.id, expiresAt: '2026-05-18T10:00:30Z' });
    // Mid-send: user types another line.
    rig.client.submit(Buffer.from('two\n'));
    rig.socket.receiveText({ type: 'claim_released', reason: 'delivered', heldBy: 'us' });
    // Should emit a new claim immediately.
    expect(rig.socket.sent.length).toBeGreaterThanOrEqual(3);
    const last = rig.socket.sent[rig.socket.sent.length - 1];
    expect(last).toMatchObject({ type: 'claim' });
  });

  it('release() in Claiming sends a release frame (best-effort per §2.2)', async () => {
    const rig = await newConnected();
    rig.client.submit(Buffer.from('x\n'));
    rig.client.release();
    expect(rig.socket.sent[rig.socket.sent.length - 1]).toMatchObject({ type: 'release' });
  });
});

describe('AttachClient frame dispatch', () => {
  it('forwards binary frames straight to onBytes (the D-G3 universal-output path)', async () => {
    const onBytes = vi.fn();
    const rig = await newConnected({ onBytes });
    rig.socket.receiveBinary(Buffer.from([0x68, 0x69]));
    expect(onBytes).toHaveBeenCalledWith(Buffer.from([0x68, 0x69]));
  });

  it('reports replay bracket events; the brackets are required even when replayBufferBytes is 0 per §3', async () => {
    const onReplayStart = vi.fn();
    const onReplayEnd = vi.fn();
    const rig = await newConnected({ onReplayStart, onReplayEnd });
    rig.socket.receiveText({ type: 'replay_start', bytes: 0 });
    rig.socket.receiveText({ type: 'replay_end' });
    expect(onReplayStart).toHaveBeenCalledWith(0);
    expect(onReplayEnd).toHaveBeenCalledOnce();
  });

  it('surfaces session_ended with the server-reported reason', async () => {
    const onSessionEnded = vi.fn();
    const rig = await newConnected({ onSessionEnded });
    rig.socket.receiveText({
      type: 'session_ended',
      reason: 'operator_kill',
      terminatedReason: 'operator_kill',
    });
    expect(onSessionEnded).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'session_ended', reason: 'operator_kill' }),
    );
  });

  it('surfaces auth_expired with the tokenId so the caller can purge revoked credentials', async () => {
    const onAuthExpired = vi.fn();
    const rig = await newConnected({ onAuthExpired });
    rig.socket.receiveText({ type: 'auth_expired', tokenId: 'tok-xyz' });
    expect(onAuthExpired).toHaveBeenCalledWith('tok-xyz');
  });

  it('surfaces socket-level errors when JSON is malformed (distinct from in-band error frames)', async () => {
    const onSocketError = vi.fn();
    const rig = await newConnected({ onSocketError });
    // Push raw bad JSON through the message hook.
    const buf = Buffer.from('{not-json');
    type ML = (data: Buffer, isBinary: boolean) => void;
    interface MsgHolder {
      messageListeners: ML[];
    }
    const listeners = (rig.socket as unknown as MsgHolder).messageListeners;
    for (const cb of listeners) cb(buf, false);
    expect(onSocketError).toHaveBeenCalledOnce();
  });
});

describe('AttachClient subscribe()', () => {
  it('merges callbacks so the existing handler fires first, then the new one', async () => {
    const order: string[] = [];
    const rig = await newConnected({
      onBytes: () => order.push('initial'),
    });
    rig.client.subscribe({ onBytes: () => order.push('extra') });
    rig.socket.receiveBinary(Buffer.from([0]));
    expect(order).toEqual(['initial', 'extra']);
  });
});

describe('AttachClient close()', () => {
  it('initiates WebSocket close 1000 and transitions to closed', async () => {
    const onClose = vi.fn();
    const rig = await newConnected({ onClose });
    rig.client.close();
    expect(rig.socket.closeCode).toBe(1000);
    expect(rig.client.currentState).toBe('closed');
    expect(onClose).toHaveBeenCalledOnce();
  });
});
