// Visual regression test for ND-39 — concurrent multi-client attach to a
// full-screen TUI agent, after the clamp-to-smallest fix.
//
// Root cause (docs/decisions/ND-39-*.md): one shared PTY can only be one size.
// ND-23's resize policy WAS last-writer-wins, and D-G2 universal output sends
// every PTY byte to every client — so when two differently-sized clients stayed
// attached, the TUI redrew for whichever client resized last and those
// width-specific cursor/redraw bytes were broadcast to BOTH, re-wrapping into a
// shredded frame on the mismatched client.
//
// ND-39 (resolved 2026-05-28) clamps the shared PTY to the smallest viewport —
// min(cols),min(rows) — while ≥2 clients are attached, reverting to
// last-writer-wins at a single client. So both clients now render the SAME
// coherent (smallest) frame: the smaller client renders it exactly, the larger
// client renders it in the top-left with blank margins (the documented
// residual). These tests are the permanent regression guard for that fix — they
// were the `it.fails` guard before the clamp landed.
//
// Byte-level WS tests (handler.test.ts) cover the size-recompute math; this file
// proves the *rendering* the recompute produces, which a frame-assertion cannot.

import { afterEach, describe, expect, it } from 'vitest';

import { gridCount } from '../../testkit/headless-grid.js';
import { spawnHelperReady } from '../../testkit/spawn-helper-ready.js';
import {
  bootHarnessServer,
  spawnHarnessClient,
  waitForCapture,
  writeArtifact,
  type HarnessClient,
  type HarnessServer,
} from '../../testkit/tui-harness.js';

const helper = spawnHelperReady();
const d = helper.ok ? describe : describe.skip;
if (!helper.ok) console.warn(`[multiclient-resize-visual] skipped: ${helper.reason}`);

let server: HarnessServer | undefined;

afterEach(async () => {
  await server?.cleanup();
  server = undefined;
});

// Attach a mismatched pair: WIDE (120x40) first, then NARROW (80x24). Per ND-39,
// while BOTH are attached the server clamps the single shared PTY to the smallest
// viewport — min(cols),min(rows) = 80x24 — so the fixture draws an 80x24 frame and
// BOTH clients receive it (D-G2 universal output). Settle on that clamped state.
async function attachMismatchedPair(): Promise<{ wide: HarnessClient; narrow: HarnessClient }> {
  server = await bootHarnessServer();
  const wide = await spawnHarnessClient(server, { cols: 120, rows: 40 });
  const narrow = await spawnHarnessClient(server, { cols: 80, rows: 24 });

  // spawnHarnessClient emits each client's resize on creation; the second attach
  // trips the clamp. Wait until BOTH clients have rendered the clamped 80x24
  // frame the fixture redraws on the resulting SIGWINCH.
  await waitForCapture(narrow, (c) => c.grid.includes('[ 80x24 ]'));
  await waitForCapture(wide, (c) => c.grid.includes('[ 80x24 ]'));
  return { wide, narrow };
}

d('ND-39 — concurrent multi-client attach to a TUI agent (clamp-to-smallest)', () => {
  it('the larger client renders the clamped 80x24 frame legibly, with blank margins (documented residual)', async () => {
    const { wide } = await attachMismatchedPair();
    const cap = await wide.capture();
    writeArtifact(
      'nd39-wide-clean.txt',
      cap,
      'ND-39 post-clamp: the wider 120x40 client renders the SHARED 80x24 frame in the top-left with blank right/bottom margins — the documented residual (correct rendering, not the pre-fix shred). It no longer shows its own 120x40 size.',
    );
    // The clamp drives the shared frame to 80x24 — the wide client sees that
    // exact label once, NOT its own 120x40 (which last-writer-wins would keep).
    expect(gridCount(cap.grid, '[ 80x24 ]')).toBe(1);
    expect(gridCount(cap.grid, '[ 120x40 ]')).toBe(0);
    // The 80x24 frame's top border is one contiguous run in the first 80 cols
    // (no tear); the remaining columns are blank margin (the residual).
    const firstLine = cap.grid.split('\n')[0] ?? '';
    expect(firstLine.slice(0, 80)).toMatch(/^\+-+\+$/);
    expect(firstLine.slice(80).trim()).toBe('');
  }, 25000);

  it('the formerly-shredded narrow client now renders its OWN contiguous 80x24 frame; typed input lands in-frame, not bled into a tear (ND-39 fix)', async () => {
    const { wide, narrow } = await attachMismatchedPair();

    // Type on the wide client. Under the clamp both clients render the SAME
    // coherent 80x24 frame, so the echo lands on row 3 of the narrow client's
    // OWN frame (universal output, D-G2) — not bled into a torn wide frame.
    wide.type('ZZZZ');
    await waitForCapture(wide, (c) => c.grid.includes('ZZZZ'));
    const narrowCap = await waitForCapture(narrow, (c) => c.grid.includes('ZZZZ'));

    writeArtifact(
      'nd39-narrow-shredded.txt',
      narrowCap,
      'ND-39 post-clamp: the narrow 80x24 client renders its OWN frame — correct [ 80x24 ] label, one contiguous border, "> ZZZZ" echoed on row 3. The pre-fix shred (the wide 120x40 frame re-wrapped into 80 cols) is gone.',
    );

    // Its own size, intact — exactly one label, not scattered by a re-wrap.
    expect(gridCount(narrowCap.grid, '[ 80x24 ]')).toBe(1);
    // Contiguous top border across the full 80-col width — no tear.
    expect(narrowCap.grid.split('\n')[0]).toMatch(/^\+-+\+$/);
    // The typed input lands inside the frame on row 3 — coherent, not bled.
    expect(narrowCap.grid.split('\n')[2]).toContain('> ZZZZ');
  }, 25000);
});
