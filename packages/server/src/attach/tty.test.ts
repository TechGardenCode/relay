// TTY bridge unit tests. Uses PassThrough streams in place of stdin/stdout
// so the test doesn't need a real TTY. Asserts raw-mode toggle, line
// buffering across stdin chunks, ^D close behavior, and forwarding of binary
// frames to stdout.

import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AttachClient } from './client.js';
import { runTty } from './tty.js';

class FakeWebSocket {
  static OPEN = 1;
  readyState = 1;
  sent: unknown[] = [];
  closeCode: number | undefined;
  private messageListeners: ((data: Buffer, isBinary: boolean) => void)[] = [];
  private closeListeners: ((code: number, reason: Buffer) => void)[] = [];
  private openListeners: (() => void)[] = [];

  constructor(
    readonly url: string,
    readonly headers: Record<string, string>,
  ) {
    queueMicrotask(() => {
      for (const cb of this.openListeners) cb();
    });
  }
  on(event: string, cb: (...a: never[]) => void): this {
    if (event === 'message') this.messageListeners.push(cb as never);
    else if (event === 'close') this.closeListeners.push(cb as never);
    else if (event === 'open') this.openListeners.push(cb as never);
    return this;
  }
  once(event: string, cb: (...a: never[]) => void): this {
    const wrapper = (...a: never[]): void => {
      this.removeListener(event, wrapper);
      (cb as (...args: never[]) => void)(...a);
    };
    return this.on(event, wrapper);
  }
  removeListener(event: string, cb: (...a: never[]) => void): this {
    const remove = <T>(list: T[]): T[] => list.filter((c) => c !== (cb as unknown as T));
    if (event === 'message') this.messageListeners = remove(this.messageListeners);
    else if (event === 'close') this.closeListeners = remove(this.closeListeners);
    else if (event === 'open') this.openListeners = remove(this.openListeners);
    return this;
  }
  send(data: string | Buffer): void {
    this.sent.push(typeof data === 'string' ? JSON.parse(data) : data);
  }
  close(code?: number): void {
    this.readyState = 3;
    this.closeCode = code;
    for (const cb of this.closeListeners) cb(code ?? 1006, Buffer.alloc(0));
  }
  receiveBinary(bytes: Buffer): void {
    for (const cb of this.messageListeners) cb(bytes, true);
  }
  receiveText(frame: unknown): void {
    const buf = Buffer.from(JSON.stringify(frame), 'utf8');
    for (const cb of this.messageListeners) cb(buf, false);
  }
}

interface Rig {
  client: AttachClient;
  socket: FakeWebSocket;
  stdin: PassThrough;
  stdout: PassThrough;
  stderr: PassThrough;
  rawCalls: boolean[];
}

async function newRig(): Promise<Rig> {
  let socket: FakeWebSocket | undefined;
  const client = new AttachClient({
    wsUrl: 'ws://test',
    sessionId: '01J7ZXY9PQ2K0M4B6F3HV8C5R7',
    token: 'T',
    wsFactory: (url, headers) => {
      socket = new FakeWebSocket(url, headers);
      return socket as never;
    },
  });
  await client.connect();
  if (socket === undefined) throw new Error('socket not created');
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  return { client, socket, stdin, stdout, stderr, rawCalls: [] };
}

afterEach(() => vi.useRealTimers());

describe('runTty raw-mode lifecycle', () => {
  it('toggles raw mode on at start and off on socket close', async () => {
    const rig = await newRig();
    const rawCalls: boolean[] = [];
    runTty({
      client: rig.client,
      stdin: rig.stdin,
      stdout: rig.stdout,
      stderr: rig.stderr,
      setRawMode: (enabled) => rawCalls.push(enabled),
      installExitHook: () => {}, // suppress process.once registration in tests
    });
    expect(rawCalls).toEqual([true]);
    rig.socket.close(1000);
    expect(rawCalls).toEqual([true, false]);
  });
});

describe('runTty stdin → line submit', () => {
  it('buffers bytes locally until LF is seen, then submits the line as one send', async () => {
    const rig = await newRig();
    runTty({
      client: rig.client,
      stdin: rig.stdin,
      stdout: rig.stdout,
      stderr: rig.stderr,
      setRawMode: () => {},
      installExitHook: () => {},
    });
    rig.stdin.write(Buffer.from('hel'));
    rig.stdin.write(Buffer.from('lo\n'));
    expect(rig.socket.sent).toHaveLength(1);
    expect(rig.socket.sent[0]).toMatchObject({ type: 'claim' });
    // After server claim_ack, the send carries the full buffered line.
    const claim = rig.socket.sent[0] as { id: string };
    rig.socket.receiveText({
      type: 'claim_ack',
      id: claim.id,
      expiresAt: '2026-05-18T10:00:30Z',
    });
    expect(rig.socket.sent).toHaveLength(2);
    const send = rig.socket.sent[1] as { data: string };
    expect(Buffer.from(send.data, 'base64').toString('utf8')).toBe('hello\n');
  });

  it('treats CR (\\r) as a line terminator (raw-mode TTYs send CR on Enter)', async () => {
    const rig = await newRig();
    runTty({
      client: rig.client,
      stdin: rig.stdin,
      stdout: rig.stdout,
      stderr: rig.stderr,
      setRawMode: () => {},
      installExitHook: () => {},
    });
    rig.stdin.write(Buffer.from('hi\r'));
    expect(rig.socket.sent).toHaveLength(1);
    expect(rig.socket.sent[0]).toMatchObject({ type: 'claim' });
  });
});

describe('runTty ^D close handling', () => {
  it('closes the WS cleanly (code 1000) when ^D is received', async () => {
    const rig = await newRig();
    runTty({
      client: rig.client,
      stdin: rig.stdin,
      stdout: rig.stdout,
      stderr: rig.stderr,
      setRawMode: () => {},
      installExitHook: () => {},
    });
    rig.stdin.write(Buffer.from([0x04]));
    expect(rig.socket.closeCode).toBe(1000);
  });

  it('resolves done with the WS close code', async () => {
    const rig = await newRig();
    const { done } = runTty({
      client: rig.client,
      stdin: rig.stdin,
      stdout: rig.stdout,
      stderr: rig.stderr,
      setRawMode: () => {},
      installExitHook: () => {},
    });
    rig.stdin.write(Buffer.from([0x04]));
    await expect(done).resolves.toBe(1000);
  });
});

describe('runTty binary frame forwarding', () => {
  it('writes server binary frames to stdout verbatim (D-G3 universal output)', async () => {
    const rig = await newRig();
    runTty({
      client: rig.client,
      stdin: rig.stdin,
      stdout: rig.stdout,
      stderr: rig.stderr,
      setRawMode: () => {},
      installExitHook: () => {},
    });
    const captured: Buffer[] = [];
    rig.stdout.on('data', (b: Buffer) => captured.push(b));
    rig.socket.receiveBinary(Buffer.from('abc'));
    rig.socket.receiveBinary(Buffer.from([0x1b, 0x5b, 0x32, 0x4a])); // ESC[2J
    // Allow microtasks to flush.
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(Buffer.concat(captured).toString('binary')).toBe('abc[2J');
  });
});
