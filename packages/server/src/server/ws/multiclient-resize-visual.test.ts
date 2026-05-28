// Visual regression guard for ND-39 — concurrent multi-client attach to a
// full-screen TUI agent renders corrupted on the mismatched client.
//
// Root cause (docs/decisions/ND-39-*.md): one shared PTY can only be one size.
// ND-23's resize policy is last-writer-wins, and D-G2 universal output sends
// every PTY byte to every client. So when two clients of different sizes attach,
// the TUI redraws for whichever client resized last and those width-specific
// cursor/redraw bytes are broadcast to BOTH — the client whose terminal differs
// re-wraps them into a shredded frame, and the other client's input bleeds in.
//
// Byte-level WS tests (handler.test.ts) confirm both clients RECEIVE the bytes
// (the functional contract holds); only the *rendering* breaks, which is exactly
// what a cell-grid can see and a frame-assertion cannot.

import { afterEach, describe, expect, it } from 'vitest';

import { spawnHelperReady } from '../../testkit/spawn-helper-ready.js';
import {
  bootHarnessServer,
  spawnHarnessClient,
  waitFor,
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

// Drive two clients to a known last-writer state: WIDE (120x40) resizes last, so
// the shared PTY is 120x40 and the NARROW (80x24) client is the mismatched one.
async function attachMismatchedPair(): Promise<{ wide: HarnessClient; narrow: HarnessClient }> {
  server = await bootHarnessServer();
  const wide = await spawnHarnessClient(server, { cols: 120, rows: 40 });
  const narrow = await spawnHarnessClient(server, { cols: 80, rows: 24 });

  // Settle last-writer-wins deterministically: narrow first, then wide last.
  narrow.resize(80, 24);
  await waitForCapture(narrow, (c) => c.grid.includes('80x24'));
  wide.resize(120, 40);
  await waitForCapture(wide, (c) => c.grid.includes('120x40'));
  // Both clients have now received the 120x40 redraw (universal output).
  await waitFor(async () => (await narrow.capture()).grid.includes('120x40'));
  return { wide, narrow };
}

d('ND-39 — concurrent multi-client attach to a TUI agent', () => {
  it('control: the last writer (wide) renders its own size cleanly', async () => {
    const { wide } = await attachMismatchedPair();
    const cap = await wide.capture();
    writeArtifact(
      'nd39-wide-clean.txt',
      cap,
      'ND-39: wide client (last writer) — renders the shared 120x40 PTY correctly.',
    );
    expect(cap.grid).toContain('[ 120x40 ]');
    // Its top border is one contiguous full-width run (no tear).
    expect(cap.grid.split('\n')[0]).toMatch(/^\+-+\+$/);
  }, 25000);

  it.fails(
    'guard: the other client SHOULD render its OWN size — currently shows the wide frame, shredded (ND-39)',
    async () => {
      const { wide, narrow } = await attachMismatchedPair();

      // Type on the wide client to show input bleed into the narrow frame.
      wide.type('ZZZZ');
      await waitForCapture(wide, (c) => c.grid.includes('ZZZZ'));
      await waitFor(async () => (await narrow.capture()).grid.includes('ZZZZ'));

      const narrowCap = await narrow.capture();
      writeArtifact(
        'nd39-narrow-shredded.txt',
        narrowCap,
        'ND-39: narrow 80x24 client rendering the wide 120x40 frame — torn border, wrong size label, wide client\'s "ZZZZ" input bled in.',
      );

      // Desired post-fix (e.g. clamp-to-smallest while multi-attached): the
      // narrow client renders its own 80x24 frame. Today it shows 120x40.
      // Remove the `.fails` marker when ND-39 lands.
      expect(narrowCap.grid).toContain('[ 80x24 ]');
    },
    25000,
  );
});
