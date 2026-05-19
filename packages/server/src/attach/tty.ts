// Raw-mode TTY bridge for `relay attach`. Reads stdin chunks and forwards
// them verbatim to the AttachClient per ND-24 (per-keystroke streaming).
// Forwards binary server frames straight to stdout. Restores TTY state on
// close per Phase 0 surprise §3 (raw mode must be reverted or the user's
// shell is left in a broken state if the process dies abruptly).
//
// Why per-keystroke (replacing the pre-ND-24 line buffering): claude's TUI
// compose box draws its own prompt from the bytes it receives on stdin; a
// line-buffered client makes operators type blind. ND-24 keeps the wire
// shape (claim → send* → claim_released) and lets the server detect
// newlines in the payload to release the claim — so the TTY bridge is dumb:
// each stdin chunk becomes one `client.submitInput(bytes)` call.

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

// Per ND-24: only ^D (clean detach) is special-cased. ^C (0x03) and Enter
// (0x0a / 0x0d) are forwarded as regular bytes — the PTY interprets ^C as
// SIGINT for the agent, and the server detects newlines in the payload to
// release the claim.
const CTRL_D = 0x04;

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
      // Per ND-24: forward each stdin chunk as one `submitInput` call. ^D
      // mid-chunk slices the prefix (if any) and then closes; ^C and Enter
      // are regular bytes (the PTY handles ^C as SIGINT; the server detects
      // the newline in the payload to release the claim).
      const ctrlDIndex = chunk.indexOf(CTRL_D);
      if (ctrlDIndex === -1) {
        if (chunk.length > 0) client.submitInput(chunk);
        return;
      }
      const prefix = chunk.subarray(0, ctrlDIndex);
      if (prefix.length > 0) client.submitInput(prefix);
      // Per prd/03-server.md §7: ^D is a clean detach; the session keeps
      // running, the socket closes 1000, and any bytes after the ^D in the
      // same chunk are dropped (the user's intent was to detach).
      client.close();
    });
  });

  return { done };
}
