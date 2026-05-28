#!/usr/bin/env node
// Deterministic LINE-ORIENTED (non-TUI) agent fixture for the visual harness.
//
// Unlike fullscreen-tui.mjs, this fixture NEVER enters the alternate-screen
// buffer — it prints to the primary screen and echoes input, like a plain
// shell or a line-mode REPL. It exists to prove the ND-38 teardown reset
// (`\x1b[?1049l`) is a no-op for a non-TUI agent: leaving the alt screen when
// you were never in it must NOT clear the operator's primary-screen output.
//
// Plain ESM JavaScript on purpose: the server's real node-pty supervisor spawns
// it with bare `node <this file>` (see tui-harness.ts), so no build step.

process.stdout.write('LINE-AGENT-READY\r\n');
process.stdout.write('$ ');

// Echo printable input on the primary screen; never switch buffers.
if (typeof process.stdin.setRawMode === 'function') process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.on('data', (chunk) => {
  for (const byte of chunk) {
    if (byte >= 0x20 && byte <= 0x7e) process.stdout.write(String.fromCharCode(byte));
  }
});

function shutdown() {
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGHUP', shutdown);
