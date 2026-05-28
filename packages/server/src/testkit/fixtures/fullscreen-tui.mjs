#!/usr/bin/env node
// Deterministic full-screen TUI fixture for the visual-testing harness.
//
// Stands in for a real agent (claude) inside the server's PTY: it behaves like
// a full-screen TUI — enters the alternate-screen buffer, draws a bordered
// frame sized to ITS pty, and redraws on SIGWINCH — but is fully deterministic
// (no network, no model, no randomness), so the rendered frame is stable and
// assertable.
//
// Plain ESM JavaScript on purpose: the server's real `node-pty` supervisor
// spawns it with bare `node <this file>` (see tui-harness.ts), so the
// in-process visual suite needs no build step. It deliberately ignores any
// persona-derived argv the registry appends.
//
// The frame encodes its own size as a `[ COLSxROWS ]` label and a `> <input>`
// line near the top so BOTH survive on a smaller client's viewport. That is
// what makes ND-39 observable: every attached client receives these exact
// bytes (D-G2 universal output), so a client whose terminal differs from the
// PTY size re-wraps the frame and shows the *wrong* size label — the tear.

const ESC = '\x1b';
const ALT_ENTER = `${ESC}[?1049h`;
const ALT_LEAVE = `${ESC}[?1049l`;
const HIDE_CURSOR = `${ESC}[?25l`;
const SHOW_CURSOR = `${ESC}[?25h`;

let input = '';

function size() {
  const cols = process.stdout.columns ?? 80;
  const rows = process.stdout.rows ?? 24;
  return { cols, rows };
}

function cup(row, col) {
  return `${ESC}[${row};${col}H`;
}

function draw() {
  const { cols, rows } = size();
  if (cols < 4 || rows < 4) return;
  let out = `${ESC}[2J`; // clear the whole screen, then redraw absolutely
  const horizontal = `+${'-'.repeat(cols - 2)}+`;
  out += cup(1, 1) + horizontal; // top border (full width — wraps on a narrow client)
  for (let r = 2; r <= rows - 1; r++) {
    out += cup(r, 1) + '|';
    out += cup(r, cols) + '|';
  }
  out += cup(rows, 1) + horizontal; // bottom border

  // Size label, horizontally centered, on row 2 (exists on any client ≥ 2 rows).
  const label = `[ ${cols}x${rows} ]`;
  const labelCol = Math.max(2, Math.floor((cols - label.length) / 2) + 1);
  out += cup(2, labelCol) + label;

  // Input echo on row 3 (the agent "compose box"); truncated to fit.
  const prompt = `> ${input}`;
  out += cup(3, 2) + prompt.slice(0, Math.max(0, cols - 3));

  process.stdout.write(out);
}

process.stdout.write(ALT_ENTER + HIDE_CURSOR);
draw();

// Node refreshes process.stdout.columns/rows before firing SIGWINCH on a TTY.
process.on('SIGWINCH', draw);

// Read input the server writes into the PTY (a claiming client's keystrokes).
// Printable bytes append to the compose line; everything else just triggers a
// redraw. setRawMode so we see bytes immediately (the pty is our stdin).
if (typeof process.stdin.setRawMode === 'function') process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.on('data', (chunk) => {
  for (const byte of chunk) {
    if (byte >= 0x20 && byte <= 0x7e) input += String.fromCharCode(byte);
  }
  draw();
});

// Restore the terminal if we are ever asked to exit cleanly; the harness
// normally kills us via the supervisor (SIGTERM/SIGHUP).
function shutdown() {
  process.stdout.write(SHOW_CURSOR + ALT_LEAVE);
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGHUP', shutdown);
