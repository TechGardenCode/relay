// Visual regression guards for ND-38 — the ^D detach defects the 7F
// rollout-readiness walk found and the byte-level attach/tty.test.ts cannot see.
//
// Two coupled defects (docs/decisions/ND-38-*.md):
//   (1) overlay  — on a clean ^D, runTty's cleanup() reverts raw mode but never
//                  restores the screen, so the agent's alt-screen frame is left
//                  frozen and the `[relay] detached…` line is painted on top.
//   (2) hang     — in raw mode ^D is a data byte (0x04), not EOF; the socket
//                  closes but stdin is never released, so the event loop stays
//                  alive and the `relay attach` process hangs.
//
// Strategy: each defect gets a "control" test that pins the DECIDED behavior
// that already works (so harness/plumbing breakage fails loudly and cannot be
// masked) plus a guard that trips when the defect is fixed.

import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { spawnHelperReady } from '../testkit/spawn-helper-ready.js';
import {
  bootHarnessServer,
  CRASHING_FIXTURE,
  distFreshness,
  LINE_FIXTURE,
  spawnHarnessClient,
  spawnRealAttachClient,
  waitFor,
  waitForCapture,
  writeArtifact,
  type HarnessServer,
  type RealAttachClient,
} from '../testkit/tui-harness.js';

const helper = spawnHelperReady();
const d = helper.ok ? describe : describe.skip;
if (!helper.ok) console.warn(`[tty-visual] skipped: ${helper.reason}`);

let server: HarnessServer | undefined;
const realClients: RealAttachClient[] = [];

afterEach(async () => {
  for (const c of realClients) c.cleanup();
  realClients.length = 0;
  await server?.cleanup();
  server = undefined;
});

d('ND-38 — ^D detach (in-process: overlay)', () => {
  it('control: a single ^D detaches cleanly with close 1000 + confirmation', async () => {
    server = await bootHarnessServer();
    const client = await spawnHarnessClient(server, { cols: 80, rows: 24 });
    client.resize(80, 24);
    // Per ND-40: with production connect→subscribe ordering the replayed
    // alt-screen enter must still render. Capture DURING attach and assert the
    // client is in the alternate screen — the in-process leg of the 20/20 proof.
    const during = await waitForCapture(client, (c) => c.altActive && c.grid.includes('80x24'));
    writeArtifact(
      'nd40-inproc-during-attach.txt',
      during,
      'ND-40: in-process client DURING attach — replay rendered, altScreen MUST be true.',
    );
    expect(during.altActive).toBe(true);

    client.pressCtrlD();
    const code = await client.done;

    // The decided behavior (ND-25/ND-34): clean detach, session keeps running,
    // operator told how to reattach. This part is intact — only rendering isn't.
    expect(code).toBe(1000);
    expect(client.stderr()).toContain('detached');
    // Raw mode was engaged then reverted.
    expect(client.rawModeLog[0]).toBe(true);
    expect(client.rawModeLog.at(-1)).toBe(false);
  }, 20000);

  it('guard: a clean ^D detach restores the primary screen (ND-38 overlay fixed)', async () => {
    server = await bootHarnessServer();
    const client = await spawnHarnessClient(server, { cols: 80, rows: 24 });
    client.resize(80, 24);
    await waitForCapture(client, (c) => c.altActive && c.grid.includes('80x24'));

    client.pressCtrlD();
    await client.done;

    const after = await client.capture();
    const overlay = await client.captureCombined();
    writeArtifact(
      'nd38-after-detach.txt',
      after,
      'ND-38: client stdout after ^D — a clean detach now restores the primary screen (altScreen=false).',
    );
    writeArtifact(
      'nd38-overlay.txt',
      overlay,
      'ND-38: stdout+stderr on one screen — the [relay] detached line now lands on the restored primary screen.',
    );

    // Per ND-38: cleanup() emits an alt-screen-leave (\x1b[?1049l) + reset
    // before the [relay] line, so the operator's primary screen is restored
    // on BOTH the stdout-only and the stdout∥stderr (combined) views.
    expect(after.altActive).toBe(false);
    expect(overlay.altActive).toBe(false);
  }, 20000);
});

d('ND-38 — screen restore on other close paths (Fix B)', () => {
  it('restores the primary screen on a session_ended close (not just ^D)', async () => {
    // Crashing fixture: dies on kill WITHOUT emitting its own alt-screen-leave,
    // so only the relay-side reset can restore the screen (faithful to ND-38
    // Flow B, where the agent left the terminal stuck in the alt screen).
    server = await bootHarnessServer({ fixture: CRASHING_FIXTURE });
    const client = await spawnHarnessClient(server, { cols: 80, rows: 24 });
    client.resize(80, 24);
    await waitForCapture(client, (c) => c.altActive && c.grid.includes('80x24'));

    // End the session server-side → client receives session_ended → close 1000.
    server.registry.kill(server.sessionId, 'operator_kill');
    await client.done;

    const after = await client.capture();
    writeArtifact(
      'nd38-session-ended-after.txt',
      after,
      'ND-38: client after a session_ended close — the reset must restore the primary screen here too.',
    );
    // Per ND-38: the screen reset fires on EVERY close path, including the
    // session_ended-driven 1000 close, not only on a local ^D detach.
    expect(after.altActive).toBe(false);
    expect(client.stderr()).toContain('session ended');
  }, 20000);

  it('non-TUI agent: the reset is a no-op — primary-screen output survives detach', async () => {
    server = await bootHarnessServer({ fixture: LINE_FIXTURE });
    const client = await spawnHarnessClient(server, { cols: 80, rows: 24 });
    client.resize(80, 24);
    // The line agent never enters the alt screen; wait for its primary output.
    const attached = await waitForCapture(client, (c) => c.grid.includes('LINE-AGENT-READY'));
    expect(attached.altActive).toBe(false);

    client.pressCtrlD();
    await client.done;

    const after = await client.captureCombined();
    writeArtifact(
      'nd38-nontui-after-detach.txt',
      after,
      'ND-38 non-TUI: after detach the primary-screen output must survive (the \\x1b[?1049l reset is a no-op here).',
    );
    // Per ND-38: \x1b[?1049l must be a no-op for an agent that never entered the
    // alt screen — it must NOT clear the operator's primary-screen output.
    expect(after.altActive).toBe(false);
    expect(after.grid).toContain('LINE-AGENT-READY');
  }, 20000);
});

// The hang is a process-lifecycle defect: only a real child process whose event
// loop stays alive can demonstrate it. The real binary is `dist/cli/relay.js`,
// so the dist MUST post-date its sources or we silently test old code — the
// exact trap that hid ND-38/ND-40. Per Fix D: absence is a clean skip (fresh
// checkout), staleness is a LOUD failure (forgot to rebuild).
const dist = distFreshness();
const realReady = helper.ok && dist.state !== 'absent';
if (!helper.ok) console.warn(`[tty-visual real-binary] skipped: ${helper.reason}`);
if (dist.state === 'absent') console.warn(`[tty-visual real-binary] skipped: ${dist.reason}`);

(realReady ? describe : describe.skip)('ND-38 — ^D detach (real binary: process exit)', () => {
  beforeAll(() => {
    // Staleness is not a skip — it means the suite would test code that does
    // not match src. Fail loud with the rebuild diagnostic.
    if (dist.state === 'stale') throw new Error(dist.reason);
  });

  it('renders the replayed alt-screen frame during attach — altScreen MUST be true (ND-40 real-binary leg)', async () => {
    server = await bootHarnessServer();
    const real = spawnRealAttachClient(server, { cols: 80, rows: 24 });
    realClients.push(real);

    // Wait until the binary has connected and rendered the agent frame.
    const during = await waitForCapture(
      { capture: () => real.capture(80, 24) },
      (c) => c.altActive && c.grid.includes('80x24'),
      12000,
    );
    writeArtifact(
      'nd40-realbinary-during-attach.txt',
      during,
      'ND-40 real binary DURING attach — replay rendered, altScreen MUST be true (pre-fix flapped ~20%).',
    );
    // Pre-Fix-A this flapped false ~20% of loopback runs (the dropped replay);
    // post-fix the buffered replay makes it deterministic.
    expect(during.altActive).toBe(true);
  }, 30000);

  it('exits promptly (≤2s) after a clean ^D detach — no hang (ND-38 hang fixed)', async () => {
    server = await bootHarnessServer();
    const real = spawnRealAttachClient(server, { cols: 80, rows: 24 });
    realClients.push(real);

    // HARD precondition: the real thin client connects and renders the frame.
    // If this fails the binary/plumbing is broken — a loud failure, not a
    // masked one.
    await waitFor(async () => (await real.capture(80, 24)).grid.includes('80x24'), 12000);

    real.pressCtrlD();
    // Per ND-38: a clean raw-mode ^D releases stdin so the event loop drains and
    // the process exits on its own. Assert it exits within 2s rather than
    // hanging until an external ^C (the pre-fix behavior).
    const outcome = await Promise.race([
      real.exited.then(() => 'exited' as const),
      new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), 2000)),
    ]);

    writeArtifact(
      'nd38-realbinary-after-detach.txt',
      await real.capture(80, 24),
      `ND-38 real binary: outcome=${outcome} hasExited=${String(real.hasExited())} after a clean ^D`,
    );

    expect(outcome).toBe('exited');
    expect(real.hasExited()).toBe(true);
  }, 30000);
});
