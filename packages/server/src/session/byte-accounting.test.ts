/**
 * Coverage map — packages/server/src/session/CLAUDE.md constraints:
 *   Owns:
 *     - Byte-accountant (ND-13): per-session deltas, 1 s batched flush,
 *       synchronous drain on pty.onExit and registry.shutdown()    → describe("happy path") > it("flushNow issues one UPDATE per non-zero session")
 *                                                                  → describe("happy path") > it("100 record(1) calls flush to total_bytes=100")
 *                                                                  → describe("happy path") > it("two sessions isolate their deltas")
 *                                                                  → describe("handle lifecycle") > it("drain flushes one session")
 *                                                                  → describe("handle lifecycle") > it("release flushes + removes")
 *                                                                  → describe("cadence (ND-13)") > it("setInterval triggers one flush per interval")
 *                                                                  → describe("stop discipline") > it("stop clears interval and drains")
 *                                                                  → describe("stop discipline") > it("stop is idempotent")
 *   Surprising constraints:
 *     - total_bytes is eventually consistent within the 1 s flush
 *       window (ND-13)                                              → describe("cadence (ND-13)") covers the window contract
 *     - record(0) does not cause an unnecessary SQL UPDATE          → describe("happy path") > it("record(0) skips the SQL UPDATE")
 *   Properties:
 *     - For any sequence of record(n), flushNow yields sum of n     → describe("properties") > fast-check
 *
 *   Does NOT own (deferred to composition):
 *     - Subscribing to pty.onBytes                                  → enforced in registry.ts (wires onBytes → record); covered by registry.test.ts
 */

import { resolve } from 'node:path';

import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  openDatabase,
  projects,
  runMigrations,
  sessions,
  SINGLETON_TENANT_ID,
  tenants,
  type Database,
  type SessionRow,
} from '../store/index.js';

import { createByteAccountant } from './byte-accounting.js';

const MIGRATIONS_DIR = resolve(import.meta.dirname, '../store/migrations');

function freshDb(): Database {
  const db = openDatabase({ filename: ':memory:' });
  runMigrations(db, MIGRATIONS_DIR);
  return db;
}

function seedSession(db: Database, personaName = 'coder', now = 1_700_000_000_000): string {
  tenants.ensureSingleton(db, now);
  const project = projects.insert(
    db,
    {
      tenantId: SINGLETON_TENANT_ID,
      slug: `proj-${personaName}`,
      displayName: 'Demo',
      canonicalPath: `/home/dev/${personaName}`,
    },
    now,
  );
  const session = sessions.insert(
    db,
    { projectId: project.id, personaName, agentCli: 'claude' },
    now,
  );
  return session.id;
}

describe('createByteAccountant — happy path', () => {
  let db: Database;
  let sid: string;

  beforeEach(() => {
    db = freshDb();
    sid = seedSession(db);
  });

  it('flushNow issues one UPDATE per non-zero session and sets total_bytes', () => {
    const acc = createByteAccountant({ db, intervalMs: 10_000, now: () => 42 });
    const handle = acc.track(sid);

    handle.record(7);
    // Per ND-13: zero-delta entries are skipped before the SQL call. Until
    // a flush fires, total_bytes is still 0.
    expect((sessions.findById(db, sid) as SessionRow).totalBytes).toBe(0);

    acc.flushNow();

    const row = sessions.findById(db, sid) as SessionRow;
    expect(row.totalBytes).toBe(7);
    expect(row.updatedAt).toBe(42);
    acc.stop();
  });

  it('100 record(1) calls plus one flushNow lands total_bytes=100 in a single window', () => {
    const acc = createByteAccountant({ db, intervalMs: 10_000, now: () => 99 });
    const handle = acc.track(sid);

    for (let i = 0; i < 100; i++) handle.record(1);
    acc.flushNow();

    const row = sessions.findById(db, sid) as SessionRow;
    expect(row.totalBytes).toBe(100);
    // Per ND-13 batching: a single flush window collapses all 100 deltas
    // into one UPDATE, so the row's updated_at reflects the flush's `now`.
    expect(row.updatedAt).toBe(99);
    acc.stop();
  });

  it('two sessions isolate their deltas; flushNow updates both', () => {
    const sidB = seedSession(db, 'reviewer');
    const acc = createByteAccountant({ db, intervalMs: 10_000, now: () => 7 });

    const a = acc.track(sid);
    const b = acc.track(sidB);
    a.record(10);
    b.record(25);

    acc.flushNow();

    expect((sessions.findById(db, sid) as SessionRow).totalBytes).toBe(10);
    expect((sessions.findById(db, sidB) as SessionRow).totalBytes).toBe(25);
    acc.stop();
  });

  it('record(0) does not cause a SQL UPDATE on flush', () => {
    const acc = createByteAccountant({ db, intervalMs: 10_000, now: () => 99 });
    const handle = acc.track(sid);

    const preFlush = sessions.findById(db, sid) as SessionRow;
    handle.record(0);
    acc.flushNow();
    const postFlush = sessions.findById(db, sid) as SessionRow;

    // Per ND-13: zero-delta entries are skipped before the SQL call —
    // updated_at must not advance.
    expect(postFlush.totalBytes).toBe(preFlush.totalBytes);
    expect(postFlush.updatedAt).toBe(preFlush.updatedAt);
    acc.stop();
  });
});

describe('createByteAccountant — handle lifecycle (ND-13)', () => {
  let db: Database;
  let sidA: string;
  let sidB: string;

  beforeEach(() => {
    db = freshDb();
    sidA = seedSession(db, 'alpha');
    sidB = seedSession(db, 'beta');
  });

  it('handle.drain() flushes just that session and leaves others pending', () => {
    const acc = createByteAccountant({ db, intervalMs: 10_000, now: () => 50 });
    const a = acc.track(sidA);
    const b = acc.track(sidB);

    a.record(5);
    b.record(11);

    a.drain();

    // Per ND-13 §5 drain order: drain() is synchronous and per-session.
    expect((sessions.findById(db, sidA) as SessionRow).totalBytes).toBe(5);
    // Other session is still pending — its UPDATE has not landed.
    expect((sessions.findById(db, sidB) as SessionRow).totalBytes).toBe(0);

    acc.stop(); // flushes b too
    expect((sessions.findById(db, sidB) as SessionRow).totalBytes).toBe(11);
  });

  it('handle.release() flushes + removes; subsequent flushNow does not re-update', () => {
    const acc = createByteAccountant({ db, intervalMs: 10_000, now: () => 50 });
    const a = acc.track(sidA);

    a.record(7);
    a.release();

    expect((sessions.findById(db, sidA) as SessionRow).totalBytes).toBe(7);
    const updatedAtAfterRelease = (sessions.findById(db, sidA) as SessionRow).updatedAt;

    // A subsequent flushNow must not produce another UPDATE for the released
    // sid (the entry was removed from the pending map).
    acc.flushNow();
    const row = sessions.findById(db, sidA) as SessionRow;
    expect(row.totalBytes).toBe(7);
    expect(row.updatedAt).toBe(updatedAtAfterRelease);
    acc.stop();
  });
});

describe('createByteAccountant — cadence (ND-13)', () => {
  let db: Database;
  let sid: string;

  beforeEach(() => {
    db = freshDb();
    sid = seedSession(db);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('intervalMs: 50 — advancing the clock by 50 ms triggers exactly one flush', () => {
    let nowVal = 1_000;
    const acc = createByteAccountant({
      db,
      intervalMs: 50,
      now: () => nowVal,
    });
    const handle = acc.track(sid);

    handle.record(13);
    expect((sessions.findById(db, sid) as SessionRow).totalBytes).toBe(0);

    // Per ND-13 §1: production cadence is 1 s; tests pass shorter values.
    // The interval is fixed at construction (not adaptive).
    nowVal = 1_050;
    vi.advanceTimersByTime(50);

    const row = sessions.findById(db, sid) as SessionRow;
    expect(row.totalBytes).toBe(13);
    expect(row.updatedAt).toBe(1_050);
    acc.stop();
  });
});

describe('createByteAccountant — stop discipline', () => {
  let db: Database;
  let sid: string;

  beforeEach(() => {
    db = freshDb();
    sid = seedSession(db);
  });

  it('stop() clears the interval AND drains pending deltas', () => {
    const acc = createByteAccountant({ db, intervalMs: 100_000, now: () => 77 });
    const handle = acc.track(sid);
    handle.record(42);

    acc.stop();

    // Per ND-13 §3: stop() must drain so registry.shutdown()'s call does not
    // lose the trailing window.
    const row = sessions.findById(db, sid) as SessionRow;
    expect(row.totalBytes).toBe(42);
    expect(row.updatedAt).toBe(77);
  });

  it('stop() is idempotent', () => {
    const acc = createByteAccountant({ db, intervalMs: 100_000, now: () => 77 });
    acc.track(sid).record(1);

    acc.stop();
    expect(() => acc.stop()).not.toThrow();
    // Second stop does not re-fire a flush.
    const row = sessions.findById(db, sid) as SessionRow;
    expect(row.totalBytes).toBe(1);
    expect(row.updatedAt).toBe(77);
  });
});

describe('createByteAccountant — properties (ND-13)', () => {
  it('for any sequence of record(n), flushNow yields sum(n)', () => {
    fc.assert(
      fc.property(fc.array(fc.nat({ max: 4096 }), { minLength: 0, maxLength: 200 }), (deltas) => {
        const db = freshDb();
        const sid = seedSession(db);
        const acc = createByteAccountant({ db, intervalMs: 100_000, now: () => 1 });
        const handle = acc.track(sid);

        for (const n of deltas) handle.record(n);
        acc.flushNow();

        const expected = deltas.reduce((s, n) => s + n, 0);
        // Per ND-13: total_bytes after a flush window equals the sum of the
        // deltas observed since the prior flush. The byte-accountant never
        // drops or doubles deltas.
        expect((sessions.findById(db, sid) as SessionRow).totalBytes).toBe(expected);
        acc.stop();
        db.close();
      }),
      { numRuns: 50 },
    );
  });
});
