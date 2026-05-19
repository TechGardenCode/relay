// Raw-mode TTY bridge for `relay attach`. Reads stdin byte-by-byte, buffers
// into lines, submits each completed line to the AttachClient. Forwards
// binary server frames straight to stdout. Restores TTY state on close per
// Phase 0 surprise §3 (raw mode must be reverted or the user's shell is left
// in a broken state if the process dies abruptly).
//
// Why line-buffered (rather than per-keystroke `send`): D-G2 §5.1 commits to
// line-buffered input as the unit of input arbitration. Per-keystroke sends
// would defeat the claim-lock model and violate the §5.1 contract.

import type { Readable, Writable } from 'node:stream';

import type { AttachClient } from './client.js';

interface RawStdinLike extends Readable {
  setRawMode?: (enabled: boolean) => unknown;
  isTTY?: boolean;
}

interface TtyStdoutLike extends Writable {
  isTTY?: boolean;
  columns?: number;
  rows?: number;
}

function readStdoutSize(stdout: TtyStdoutLike): { cols: number; rows: number } | undefined {
  const cols = stdout.columns;
  const rows = stdout.rows;
  if (typeof cols !== 'number' || typeof rows !== 'number') return undefined;
  if (cols <= 0 || rows <= 0) return undefined;
  return { cols, rows };
}

const CTRL_C = 0x03;
const CTRL_D = 0x04;
const LF = 0x0a;
const CR = 0x0d;

export interface RunTtyOptions {
  client: AttachClient;
  stdin: RawStdinLike;
  stdout: TtyStdoutLike;
  stderr: Writable;
  /** Test seam: when omitted, the bridge calls `setRawMode` on a real TTY. */
  setRawMode?: (enabled: boolean) => void;
  /** Test seam: when set, invoked with a cleanup fn the test can call to revert raw mode. Production wires `process.once('exit', cleanup)`. */
  installExitHook?: (cleanup: () => void) => void;
}

export interface RunTtyResult {
  /** Resolves with the WS close code once the socket closes (1000 on ^D; other codes per ws-protocol.md §4.2). */
  done: Promise<number>;
}

export function runTty(opts: RunTtyOptions): RunTtyResult {
  const { client, stdin, stdout, stderr } = opts;
  let lineBuffer: Buffer[] = [];

  const enableRaw =
    opts.setRawMode ??
    ((enabled: boolean): void => {
      if (stdin.isTTY === true && typeof stdin.setRawMode === 'function') {
        stdin.setRawMode(enabled);
      }
    });

  // Per ND-23: emit current TTY size on startup and on SIGWINCH so the server
  // PTY tracks the client's viewport. The listener is detached during cleanup
  // so a re-run inside the same Node process doesn't leak a handler.
  const onStdoutResize = (): void => {
    const size = readStdoutSize(stdout);
    if (size === undefined) return;
    client.resize(size.cols, size.rows);
  };

  let cleanedUp = false;
  function cleanup(): void {
    if (cleanedUp) return;
    cleanedUp = true;
    enableRaw(false);
    if (typeof stdout.off === 'function') {
      stdout.off('resize', onStdoutResize);
    }
  }

  enableRaw(true);
  if (opts.installExitHook !== undefined) {
    opts.installExitHook(cleanup);
  } else {
    process.once('exit', cleanup);
  }

  const initialSize = readStdoutSize(stdout);
  if (initialSize !== undefined) {
    client.resize(initialSize.cols, initialSize.rows);
  }
  if (typeof stdout.on === 'function') {
    stdout.on('resize', onStdoutResize);
  }

  const done = new Promise<number>((resolve) => {
    client.subscribe({
      onBytes(chunk: Buffer): void {
        stdout.write(chunk);
      },
      onSessionEnded(frame): void {
        stderr.write(`\n[relay] session ended (${frame.reason}).\n`);
      },
      onAuthExpired(): void {
        stderr.write('\n[relay] token revoked; closing.\n');
      },
      onBusy(): void {
        stderr.write('\n[relay] another device is interacting with this session.\n');
      },
      onError(frame): void {
        stderr.write(`\n[relay] server error: ${frame.code} (${frame.message})\n`);
      },
      onSocketError(err): void {
        stderr.write(`\n[relay] socket error: ${err.message}\n`);
      },
      onClose(code: number, reason: string): void {
        cleanup();
        if (reason !== '') {
          stderr.write(`\n[relay] disconnected (${String(code)}: ${reason}).\n`);
        }
        resolve(code);
      },
    });

    stdin.on('data', (chunk: Buffer): void => {
      for (let i = 0; i < chunk.length; i += 1) {
        const byte = chunk[i];
        if (byte === undefined) continue;
        if (byte === CTRL_D) {
          // ^D — clean detach. Per prd/03-server.md §7 the session keeps
          // running; we close 1000 and exit.
          client.close();
          return;
        }
        if (byte === CTRL_C) {
          // Pass ^C through to the remote PTY as a single-byte "line" so the
          // §5.1 claim-lock contract is honored.
          submitLine(Buffer.from([CTRL_C]));
          continue;
        }
        if (byte === CR || byte === LF) {
          submitLine(consumeBuffer(byte));
          continue;
        }
        lineBuffer.push(Buffer.from([byte]));
      }
    });
  });

  function consumeBuffer(terminator: number): Buffer {
    const parts = [...lineBuffer, Buffer.from([terminator])];
    lineBuffer = [];
    return Buffer.concat(parts);
  }

  function submitLine(line: Buffer): void {
    client.submit(line);
  }

  return { done };
}
