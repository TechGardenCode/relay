// Spec for the shared REST-poll timer (ND-37 #6). PollLoop is the one poll
// contract every live extension surface reuses, so its lifecycle is asserted
// once here: immediate-then-cadence ticking (ND-37 rule 2), idempotent start
// (no two timers), teardown on stop (ND-37 rule 3), and survival of a rejected
// tick (ND-37 rule 4).
//
// Coverage map — packages/extension/CLAUDE.md + ND-37:
//   Owns:
//     - immediate tick + per-interval cadence  → describe('start') > 'fires one immediate tick…'
//     - idempotent start (never two timers)     → describe('start') > 'is idempotent…'
//     - stop halts ticks + running=false        → describe('stop')
//     - rejected tick does not stop the loop     → describe('rejection survival')
//     - running getter reflects start/stop       → describe('running getter')

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { PollLoop } from './poll.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('start', () => {
  it('fires one immediate tick, then one tick per intervalMs', async () => {
    // Per ND-37 rule 2: immediate tick on becoming active, then on cadence.
    vi.useFakeTimers();
    const tick = vi.fn(() => Promise.resolve());
    const loop = new PollLoop(tick, 1000);
    loop.start();
    expect(tick).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(tick).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(tick).toHaveBeenCalledTimes(3);
  });

  it('is idempotent — a second start does not create a second timer', async () => {
    // Per ND-37 rule 6 / source comment: idempotent start, never two timers.
    vi.useFakeTimers();
    const tick = vi.fn(() => Promise.resolve());
    const loop = new PollLoop(tick, 1000);
    loop.start();
    loop.start();
    await vi.advanceTimersByTimeAsync(1000);
    // immediate (1) + one tick (1) = 2; a duplicate timer would add a third.
    expect(tick).toHaveBeenCalledTimes(2);
  });
});

describe('stop', () => {
  it('halts further ticks and reports running=false', async () => {
    // Per ND-37 rule 3: the interval handle is cleared on teardown.
    vi.useFakeTimers();
    const tick = vi.fn(() => Promise.resolve());
    const loop = new PollLoop(tick, 1000);
    loop.start();
    const afterStart = tick.mock.calls.length;
    loop.stop();
    expect(loop.running).toBe(false);
    await vi.advanceTimersByTimeAsync(3000);
    expect(tick).toHaveBeenCalledTimes(afterStart);
  });
});

describe('rejection survival', () => {
  it('keeps ticking after a tick rejects — running stays true', async () => {
    // Per ND-37 rule 4: a rejected tick must never tear the loop down.
    vi.useFakeTimers();
    let shouldReject = true;
    const tick = vi.fn(() => {
      if (shouldReject) {
        shouldReject = false;
        return Promise.reject(new Error('transient'));
      }
      return Promise.resolve();
    });
    const loop = new PollLoop(tick, 1000);
    loop.start();
    // Immediate tick rejected; the timer must survive and keep firing.
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(loop.running).toBe(true);
    // tick kept being called past the rejection (immediate + 2 ticks = 3).
    expect(tick).toHaveBeenCalledTimes(3);
  });
});

describe('running getter', () => {
  it('reflects start and stop', () => {
    const loop = new PollLoop(() => Promise.resolve(), 1000);
    expect(loop.running).toBe(false);
    loop.start();
    expect(loop.running).toBe(true);
    loop.stop();
    expect(loop.running).toBe(false);
  });
});
