// Cell-accurate terminal rendering for the visual-testing harness.
//
// The rest of the server test-suite is byte-level: it asserts on the exact
// bytes the PTY/WS emits. That cannot see a *rendered* defect — a `[relay]`
// message painted on top of an agent's frozen frame (ND-38) or a frame torn
// because it was drawn for the wrong width (ND-39) are invisible to a byte
// diff but obvious on screen. This module closes that gap: it feeds captured
// stdout bytes into a headless xterm VT engine (the same engine vendored as
// `@xterm/xterm` for the Phase 2 PWA) and reads the screen buffer back as a
// plain-text grid an assertion — and a human/agent — can inspect.
//
// `@xterm/headless` is a pure-JS dep (no DOM, no canvas, no native build); it
// is a *test* dependency only and never enters the shipped binary's path.

import { Terminal } from '@xterm/headless';

export interface Capture {
  /** The visible screen, `rows` lines joined by '\n', each line the full `cols`
   *  wide (trailing cells preserved so a torn right-edge border is visible). */
  grid: string;
  /** True when the engine is in the alternate-screen buffer. Per ND-38, a clean
   *  ^D detach must restore the primary screen; alt-screen still active after
   *  close means the agent's TUI frame was left frozen on the operator's
   *  terminal (the "overlay" defect). */
  altActive: boolean;
  cols: number;
  rows: number;
}

/**
 * Render `bytes` as they would appear on a `cols`×`rows` terminal and return
 * the visible grid plus the alt-screen state. Pure: constructs and disposes a
 * fresh engine per call so callers can snapshot a client at successive moments.
 */
export async function renderCapture(bytes: Buffer, cols: number, rows: number): Promise<Capture> {
  // scrollback: 0 keeps baseY pinned at 0 for the normal buffer too, so the
  // visible viewport is always rows [0, rows) — no scrollback bookkeeping.
  const term = new Terminal({ cols, rows, allowProposedApi: true, scrollback: 0 });
  try {
    await writeAll(term, bytes);
    return {
      grid: gridOf(term),
      altActive: term.buffer.active.type === 'alternate',
      cols,
      rows,
    };
  } finally {
    term.dispose();
  }
}

// xterm's write is asynchronous — the VT parser drains on a microtask queue.
// Writing an empty string last and awaiting its callback flushes everything
// queued before it, so the buffer reflects every input byte when we read it.
function writeAll(term: Terminal, bytes: Buffer): Promise<void> {
  return new Promise((resolve) => {
    if (bytes.length > 0) term.write(new Uint8Array(bytes));
    term.write('', () => {
      resolve();
    });
  });
}

function gridOf(term: Terminal): string {
  const buf = term.buffer.active;
  const lines: string[] = [];
  for (let y = 0; y < term.rows; y++) {
    const line = buf.getLine(buf.baseY + y);
    // translateToString(false): keep full width, do not trim trailing blanks —
    // a border drawn into the last column must remain at the last column so a
    // wrap (the ND-39 tear) is detectable.
    lines.push(line ? line.translateToString(false) : '');
  }
  return lines.join('\n');
}

/** Convenience substring check; pairs with the `grid` field for readability. */
export function gridContains(grid: string, needle: string): boolean {
  return grid.includes(needle);
}

/** Count non-overlapping occurrences of `needle` in `grid`. Used to assert a
 *  label/sentinel appears exactly once (intact frame) vs. scattered (torn). */
export function gridCount(grid: string, needle: string): number {
  if (needle === '') return 0;
  let count = 0;
  let from = 0;
  for (;;) {
    const i = grid.indexOf(needle, from);
    if (i === -1) return count;
    count += 1;
    from = i + needle.length;
  }
}
