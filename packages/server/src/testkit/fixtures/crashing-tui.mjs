#!/usr/bin/env node
// Deterministic full-screen TUI fixture that DIES WITHOUT RESTORING the screen.
//
// Like fullscreen-tui.mjs it enters the alternate-screen buffer and draws a
// sized frame — but it registers NO SIGTERM/SIGHUP handler, so when the
// supervisor kills it (node-pty's default SIGHUP) the process terminates
// immediately, never emitting `\x1b[?1049l`. This faithfully models the ND-38
// Flow B defect: an agent that exits leaving the operator's terminal stuck in
// the alt screen. The relay-side teardown reset is then the ONLY thing that can
// restore the primary screen on the session_ended close path.

const ESC = '\x1b';
const ALT_ENTER = `${ESC}[?1049h`;
const HIDE_CURSOR = `${ESC}[?25l`;

function size() {
  return { cols: process.stdout.columns ?? 80, rows: process.stdout.rows ?? 24 };
}
function cup(row, col) {
  return `${ESC}[${row};${col}H`;
}
function draw() {
  const { cols, rows } = size();
  if (cols < 4 || rows < 4) return;
  let out = `${ESC}[2J`;
  const horizontal = `+${'-'.repeat(cols - 2)}+`;
  out += cup(1, 1) + horizontal;
  for (let r = 2; r <= rows - 1; r++) {
    out += cup(r, 1) + '|' + cup(r, cols) + '|';
  }
  out += cup(rows, 1) + horizontal;
  const label = `[ ${cols}x${rows} ]`;
  out += cup(2, Math.max(2, Math.floor((cols - label.length) / 2) + 1)) + label;
  process.stdout.write(out);
}

process.stdout.write(ALT_ENTER + HIDE_CURSOR);
draw();
process.on('SIGWINCH', draw);

if (typeof process.stdin.setRawMode === 'function') process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.on('data', draw);

// Deliberately NO SIGTERM/SIGHUP handler: on kill the process dies without
// emitting the alt-screen-leave, leaving the client stuck in the alt screen.
