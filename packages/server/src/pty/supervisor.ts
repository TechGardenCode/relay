import { spawn as ptySpawn, type IPty } from 'node-pty';

import { createRingBuffer } from './ring-buffer.js';
import {
  DEFAULT_RING_BUFFER_BYTES,
  type ExitInfo,
  type PtySupervisor,
  type SpawnArgs,
  type Unsubscribe,
} from './types.js';

export function createSupervisor(args: SpawnArgs): PtySupervisor {
  const ringBufferBytes = args.ringBufferBytes ?? DEFAULT_RING_BUFFER_BYTES;
  const ring = createRingBuffer(ringBufferBytes);

  // Per ND-03: bytes are bytes — no line awareness. Setting encoding to null
  // makes node-pty deliver Buffer chunks rather than utf8-decoded strings, so
  // raw byte sequences (e.g., ANSI escapes with high-bit bytes) round-trip
  // without U+FFFD substitution.
  const pty: IPty = ptySpawn(args.command, args.args, {
    cwd: args.cwd,
    env: args.env,
    cols: args.cols ?? 120,
    rows: args.rows ?? 32,
    name: args.name ?? 'xterm-256color',
    encoding: null,
  });

  const byteListeners = new Set<(chunk: Buffer) => void>();
  const exitListeners = new Set<(info: ExitInfo) => void>();
  let bytesEmitted = 0;
  let exited = false;

  // node-pty's IPty.onData types the listener as (data: string) => void, but
  // with encoding: null it delivers Buffer at runtime. Cast at the boundary.
  pty.onData((chunk: string | Buffer): void => {
    const b = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk;
    bytesEmitted += b.length;
    ring.push(b);
    // Per D-G3: every byte reaches every subscriber regardless of claim state.
    // The supervisor never inspects claim-lock — that lives in server/ws/.
    for (const fn of byteListeners) fn(b);
  });

  pty.onExit(({ exitCode, signal }) => {
    exited = true;
    const info: ExitInfo = {
      exitCode: typeof exitCode === 'number' ? exitCode : null,
      signal: typeof signal === 'number' ? signal : null,
    };
    for (const fn of exitListeners) fn(info);
    // Drop listeners after exit so callers that forget to unsubscribe don't
    // leak references via this supervisor.
    byteListeners.clear();
    exitListeners.clear();
  });

  function onBytes(listener: (chunk: Buffer) => void): Unsubscribe {
    byteListeners.add(listener);
    return () => {
      byteListeners.delete(listener);
    };
  }

  function onExit(listener: (info: ExitInfo) => void): Unsubscribe {
    exitListeners.add(listener);
    return () => {
      exitListeners.delete(listener);
    };
  }

  function write(data: Buffer | string): void {
    pty.write(typeof data === 'string' ? data : data.toString('utf8'));
  }

  function resize(cols: number, rows: number): void {
    pty.resize(cols, rows);
  }

  function kill(signal?: string): void {
    if (exited) return;
    try {
      pty.kill(signal);
    } catch {
      // Best-effort: node-pty throws if the process is already dead; onExit is
      // the source of truth either way.
    }
  }

  function snapshot(): Buffer {
    return ring.snapshot();
  }

  return {
    get pid() {
      return pty.pid;
    },
    onBytes,
    onExit,
    write,
    resize,
    kill,
    snapshot,
    get bytesEmitted() {
      return bytesEmitted;
    },
  };
}
