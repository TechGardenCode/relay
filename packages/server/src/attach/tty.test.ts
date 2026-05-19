// TTY bridge unit tests. Uses PassThrough streams in place of stdin/stdout
// so the test doesn't need a real TTY. Asserts raw-mode toggle, per-keystroke
// chunk forwarding (ND-24), ^D close behavior including mid-chunk slicing,
// resize emission (ND-23), and forwarding of binary frames to stdout.

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

describe('runTty stdin → per-keystroke streaming (ND-24)', () => {
  it('forwards a single-byte stdin chunk as one submitInput → claim → send carrying the byte', async () => {
    const rig = await newRig();
    runTty({
      client: rig.client,
      stdin: rig.stdin,
      stdout: rig.stdout,
      stderr: rig.stderr,
      setRawMode: () => {},
      installExitHook: () => {},
    });
    rig.stdin.write(Buffer.from('h'));
    expect(rig.socket.sent).toHaveLength(1);
    expect(rig.socket.sent[0]).toMatchObject({ type: 'claim' });
    const claim = rig.socket.sent[0] as { id: string };
    rig.socket.receiveText({
      type: 'claim_ack',
      id: claim.id,
      expiresAt: '2026-05-19T10:00:30Z',
    });
    expect(rig.socket.sent).toHaveLength(2);
    const send = rig.socket.sent[1] as { data: string };
    expect(Buffer.from(send.data, 'base64').toString('utf8')).toBe('h');
  });

  it('forwards a multi-byte chunk verbatim — no line buffering, no special handling for non-newline bytes', async () => {
    const rig = await newRig();
    runTty({
      client: rig.client,
      stdin: rig.stdin,
      stdout: rig.stdout,
      stderr: rig.stderr,
      setRawMode: () => {},
      installExitHook: () => {},
    });
    rig.stdin.write(Buffer.from('hello'));
    expect(rig.socket.sent).toHaveLength(1);
    const claim = rig.socket.sent[0] as { id: string };
    rig.socket.receiveText({
      type: 'claim_ack',
      id: claim.id,
      expiresAt: '2026-05-19T10:00:30Z',
    });
    expect(rig.socket.sent).toHaveLength(2);
    const send = rig.socket.sent[1] as { data: string };
    expect(Buffer.from(send.data, 'base64').toString('utf8')).toBe('hello');
  });

  it('chunks with embedded \\n forward verbatim — newline detection lives server-side, not in tty.ts', async () => {
    const rig = await newRig();
    runTty({
      client: rig.client,
      stdin: rig.stdin,
      stdout: rig.stdout,
      stderr: rig.stderr,
      setRawMode: () => {},
      installExitHook: () => {},
    });
    rig.stdin.write(Buffer.from('hi\n'));
    const claim = rig.socket.sent[0] as { id: string };
    rig.socket.receiveText({
      type: 'claim_ack',
      id: claim.id,
      expiresAt: '2026-05-19T10:00:30Z',
    });
    const send = rig.socket.sent[1] as { data: string };
    expect(Buffer.from(send.data, 'base64').toString('utf8')).toBe('hi\n');
  });

  it('^C (0x03) is forwarded as a regular byte under streaming — no special-case', async () => {
    const rig = await newRig();
    runTty({
      client: rig.client,
      stdin: rig.stdin,
      stdout: rig.stdout,
      stderr: rig.stderr,
      setRawMode: () => {},
      installExitHook: () => {},
    });
    rig.stdin.write(Buffer.from([0x61, 0x03, 0x62])); // 'a' ^C 'b'
    const claim = rig.socket.sent[0] as { id: string };
    rig.socket.receiveText({
      type: 'claim_ack',
      id: claim.id,
      expiresAt: '2026-05-19T10:00:30Z',
    });
    const send = rig.socket.sent[1] as { data: string };
    const decoded = Buffer.from(send.data, 'base64');
    expect(Array.from(decoded)).toEqual([0x61, 0x03, 0x62]);
  });
});

describe('runTty ^D close handling', () => {
  it('closes the WS cleanly (code 1000) when ^D is the only byte in the chunk', async () => {
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
    // No claim or send emitted — the ^D-only chunk is purely a detach.
    expect(rig.socket.sent).toHaveLength(0);
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

  it('^D mid-chunk: forwards the prefix bytes via submitInput then closes (bytes after ^D dropped)', async () => {
    const rig = await newRig();
    runTty({
      client: rig.client,
      stdin: rig.stdin,
      stdout: rig.stdout,
      stderr: rig.stderr,
      setRawMode: () => {},
      installExitHook: () => {},
    });
    // Per ND-24 §T4: prefix bytes forward as one submitInput, then close;
    // bytes after the ^D are dropped because the user's intent was detach.
    rig.stdin.write(Buffer.from([0x61, 0x62, 0x04, 0x63, 0x64])); // 'ab' ^D 'cd'
    expect(rig.socket.sent).toHaveLength(1);
    expect(rig.socket.sent[0]).toMatchObject({ type: 'claim' });
    expect(rig.socket.closeCode).toBe(1000);
  });
});

describe('runTty resize forwarding (ND-23)', () => {
  it('emits resize on startup with current stdout dimensions', async () => {
    const rig = await newRig();
    (rig.stdout as unknown as { columns: number; rows: number }).columns = 100;
    (rig.stdout as unknown as { columns: number; rows: number }).rows = 40;
    runTty({
      client: rig.client,
      stdin: rig.stdin,
      stdout: rig.stdout,
      stderr: rig.stderr,
      setRawMode: () => {},
      installExitHook: () => {},
    });
    expect(rig.socket.sent).toEqual([{ type: 'resize', cols: 100, rows: 40 }]);
  });

  it("re-emits resize when stdout fires 'resize' (SIGWINCH simulation)", async () => {
    const rig = await newRig();
    (rig.stdout as unknown as { columns: number; rows: number }).columns = 80;
    (rig.stdout as unknown as { columns: number; rows: number }).rows = 24;
    runTty({
      client: rig.client,
      stdin: rig.stdin,
      stdout: rig.stdout,
      stderr: rig.stderr,
      setRawMode: () => {},
      installExitHook: () => {},
    });
    expect(rig.socket.sent).toEqual([{ type: 'resize', cols: 80, rows: 24 }]);
    (rig.stdout as unknown as { columns: number; rows: number }).columns = 132;
    (rig.stdout as unknown as { columns: number; rows: number }).rows = 50;
    rig.stdout.emit('resize');
    expect(rig.socket.sent[rig.socket.sent.length - 1]).toEqual({
      type: 'resize',
      cols: 132,
      rows: 50,
    });
    expect(rig.socket.sent.length).toBe(2);
  });

  it('does not emit resize when stdout has no columns/rows (non-TTY)', async () => {
    const rig = await newRig();
    runTty({
      client: rig.client,
      stdin: rig.stdin,
      stdout: rig.stdout,
      stderr: rig.stderr,
      setRawMode: () => {},
      installExitHook: () => {},
    });
    expect(rig.socket.sent).toEqual([]);
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
