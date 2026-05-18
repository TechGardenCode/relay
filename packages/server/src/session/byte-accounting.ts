import { sessions, type Database } from '../store/index.js';

// Per ND-13: production cadence is 1 s. Tests pass shorter intervals (e.g.,
// 50 ms with fake timers).
export const DEFAULT_FLUSH_INTERVAL_MS = 1000;

export interface ByteAccountantOptions {
  db: Database;
  intervalMs?: number;
  // Test seam: override Date.now() so SQL `updated_at` values are deterministic.
  now?: () => number;
}

// Per-session handle issued by track(). The registry calls drain() inside
// pty.onExit (per-session) and release() to remove the session from the
// shared map; flushNow() on the accountant covers the global path.
export interface SessionByteHandle {
  record(byteCount: number): void;
  drain(): void;
  release(): void;
}

export interface ByteAccountant {
  track(sid: string): SessionByteHandle;
  flushNow(): void;
  stop(): void;
}

// Single shared setInterval iterates a Map<sid, pendingDelta> once per
// interval and issues one sessions.incrementTotalBytes per session with a
// non-zero delta. Zero-delta entries are skipped before the SQL call so the
// cost scales with active sessions, not tracked sessions.
//
// Per ND-13 §1: the cadence is fixed at construction; not adaptive.
// Per ND-13 §2: ≤1 s lossiness on hard crash is accepted (the on-disk
// transcript sidecar is the disaster-recovery source of truth).
// Per ND-13 §3: flushNow() is part of the public surface for tests and
// the boot orphan sweep's defensive drain.
export function createByteAccountant(opts: ByteAccountantOptions): ByteAccountant {
  const { db } = opts;
  const intervalMs = opts.intervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
  const now = opts.now ?? Date.now;
  const pending = new Map<string, number>();
  let stopped = false;

  function flushOne(sid: string): void {
    const delta = pending.get(sid) ?? 0;
    if (delta === 0) return;
    pending.set(sid, 0);
    sessions.incrementTotalBytes(db, sid, delta, now());
  }

  function flushNow(): void {
    for (const sid of pending.keys()) flushOne(sid);
  }

  const timer = setInterval(flushNow, intervalMs);
  // Don't keep the Node event loop alive on the timer alone — the server
  // entrypoint owns the lifecycle via registry.shutdown().
  timer.unref();

  function track(sid: string): SessionByteHandle {
    if (!pending.has(sid)) pending.set(sid, 0);
    return {
      record(byteCount: number): void {
        const current = pending.get(sid) ?? 0;
        pending.set(sid, current + byteCount);
      },
      drain(): void {
        flushOne(sid);
      },
      release(): void {
        flushOne(sid);
        pending.delete(sid);
      },
    };
  }

  function stop(): void {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    flushNow();
  }

  return { track, flushNow, stop };
}
