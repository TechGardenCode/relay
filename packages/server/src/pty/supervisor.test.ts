import { describe, expect, it } from 'vitest';

import { spawnHelperReady } from '../testkit/spawn-helper-ready.js';

import { createSupervisor } from './supervisor.js';
import { DEFAULT_RING_BUFFER_BYTES } from './types.js';

const helper = spawnHelperReady();
const describePty = helper.ok ? describe : describe.skip;
if (!helper.ok) {
  console.warn(`[pty/supervisor.test] skipped: ${helper.reason}`);
}

function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  return new Promise((resolve_, reject) => {
    const start = Date.now();
    const tick = (): void => {
      if (predicate()) return resolve_();
      if (Date.now() - start > timeoutMs) return reject(new Error('waitFor timed out'));
      setTimeout(tick, 10);
    };
    tick();
  });
}

describePty('createSupervisor — basic lifecycle', () => {
  it('spawns a benign command and exposes a pid', async () => {
    const sup = createSupervisor({
      command: '/bin/echo',
      args: ['hello'],
      cwd: process.cwd(),
      env: { ...(process.env as Record<string, string>) },
    });
    expect(sup.pid).toBeGreaterThan(0);
    await new Promise<void>((r) => {
      sup.onExit(() => r());
    });
  });

  it('emits bytes via onBytes and advances bytesEmitted', async () => {
    const sup = createSupervisor({
      command: '/bin/echo',
      args: ['hello'],
      cwd: process.cwd(),
      env: { ...(process.env as Record<string, string>) },
    });

    const chunks: Buffer[] = [];
    sup.onBytes((b) => chunks.push(b));

    await new Promise<void>((r) => {
      sup.onExit(() => r());
    });

    const all = Buffer.concat(chunks);
    expect(all.includes(Buffer.from('hello'))).toBe(true);
    expect(sup.bytesEmitted).toBe(all.length);
    expect(sup.bytesEmitted).toBeGreaterThan(0);
  });

  it('fans out the same chunk to every subscriber (D-G3 universal output)', async () => {
    const sup = createSupervisor({
      command: '/bin/echo',
      args: ['fanout'],
      cwd: process.cwd(),
      env: { ...(process.env as Record<string, string>) },
    });

    const a: Buffer[] = [];
    const b: Buffer[] = [];
    sup.onBytes((c) => a.push(c));
    sup.onBytes((c) => b.push(c));

    await new Promise<void>((r) => {
      sup.onExit(() => r());
    });

    // Per D-G3: both subscribers must see the same bytes regardless of who
    // attached first. The supervisor never inspects claim state.
    expect(Buffer.concat(a).equals(Buffer.concat(b))).toBe(true);
    expect(Buffer.concat(a).includes(Buffer.from('fanout'))).toBe(true);
  });

  it('unsubscribe stops further byte delivery to that listener', async () => {
    const sup = createSupervisor({
      command: '/bin/cat',
      args: [],
      cwd: process.cwd(),
      env: { ...(process.env as Record<string, string>) },
    });

    const received: Buffer[] = [];
    const unsub = sup.onBytes((b) => received.push(b));

    sup.write('first\n');
    await waitFor(() => Buffer.concat(received).includes(Buffer.from('first')));
    const lenAfterFirst = Buffer.concat(received).length;

    unsub();
    sup.write('second\n');
    // Give the PTY a moment to emit.
    await new Promise((r) => setTimeout(r, 50));
    expect(Buffer.concat(received).length).toBe(lenAfterFirst);

    sup.kill();
    await new Promise<void>((r) => {
      sup.onExit(() => r());
    });
  });

  it('captures bytes in the ring buffer snapshot', async () => {
    const sup = createSupervisor({
      command: '/bin/echo',
      args: ['snapshot-content'],
      cwd: process.cwd(),
      env: { ...(process.env as Record<string, string>) },
      ringBufferBytes: 128,
    });

    await new Promise<void>((r) => {
      sup.onExit(() => r());
    });

    const snap = sup.snapshot();
    expect(snap.length).toBeGreaterThan(0);
    expect(snap.length).toBeLessThanOrEqual(128);
    expect(snap.includes(Buffer.from('snapshot-content'))).toBe(true);
  });

  it('defaults the ring buffer to DEFAULT_RING_BUFFER_BYTES (ND-03)', async () => {
    const sup = createSupervisor({
      command: '/bin/echo',
      args: ['x'],
      cwd: process.cwd(),
      env: { ...(process.env as Record<string, string>) },
    });
    // Snapshot caps at capacity even after the process exits.
    await new Promise<void>((r) => {
      sup.onExit(() => r());
    });
    expect(sup.snapshot().length).toBeLessThanOrEqual(DEFAULT_RING_BUFFER_BYTES);
  });

  it('kill terminates a long-running PTY and emits exit', async () => {
    const sup = createSupervisor({
      command: '/bin/cat',
      args: [],
      cwd: process.cwd(),
      env: { ...(process.env as Record<string, string>) },
    });

    const exitPromise = new Promise<void>((r) => {
      sup.onExit(() => r());
    });
    sup.kill();
    await exitPromise;
    // Subsequent kill is a no-op (best-effort per the type's contract).
    expect(() => sup.kill()).not.toThrow();
  });

  it('writes from the caller round-trip through cat', async () => {
    const sup = createSupervisor({
      command: '/bin/cat',
      args: [],
      cwd: process.cwd(),
      env: { ...(process.env as Record<string, string>) },
    });

    const received: Buffer[] = [];
    sup.onBytes((b) => received.push(b));
    sup.write('round-trip\n');
    await waitFor(() => Buffer.concat(received).includes(Buffer.from('round-trip')));

    sup.kill();
    await new Promise<void>((r) => {
      sup.onExit(() => r());
    });
  });
});
