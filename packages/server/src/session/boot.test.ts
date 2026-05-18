/**
 * Coverage map — packages/server/src/session/CLAUDE.md constraints:
 *   Owns:
 *     - The boot orphan sweep at server start (D-11)        → describe("happy path") > it("flips exactly the running rows to killed/server_restart")
 *   Surprising constraints:
 *     - bootOrphanSweep is the ONLY writer of
 *       terminated_reason='server_restart' (D-11)            → describe("orphan sweep (D-11)") > it("...only running rows flip; existing reasons preserved")
 *                                                            → describe("orphan sweep (D-11)") > it("second sweep returns affected: 0 and changes nothing")
 *                                                            → describe("orphan sweep (D-11)") > it("advances updated_at only on flipped rows")
 *                                                            → describe("orphan sweep (D-11)") > it("returns affected: 0 on an empty DB")
 *   Does NOT own (deferred to composition):
 *     - Persistence primitives                              → enforced by import: boot.ts only imports sessions from store/
 */

import { resolve } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

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

import { bootOrphanSweep } from './boot.js';

const MIGRATIONS_DIR = resolve(import.meta.dirname, '../store/migrations');

function freshDb(): Database {
  const db = openDatabase({ filename: ':memory:' });
  runMigrations(db, MIGRATIONS_DIR);
  return db;
}

function seedProject(db: Database, now = 1_700_000_000_000): string {
  tenants.ensureSingleton(db, now);
  const project = projects.insert(
    db,
    {
      tenantId: SINGLETON_TENANT_ID,
      slug: 'demo',
      displayName: 'Demo',
      canonicalPath: '/home/dev/demo',
    },
    now,
  );
  return project.id;
}

describe('bootOrphanSweep — happy path', () => {
  let db: Database;
  let projectId: string;

  beforeEach(() => {
    db = freshDb();
    projectId = seedProject(db);
  });

  it('flips exactly the running rows to killed/server_restart', () => {
    // Seed 3 running + 1 pre-killed (the only other achievable shape without
    // a manual UPDATE that would violate the running+NULL-reason CHECK).
    const r1 = sessions.insert(db, { projectId, personaName: 'a', agentCli: 'claude' }, 1);
    const r2 = sessions.insert(db, { projectId, personaName: 'b', agentCli: 'claude' }, 2);
    const r3 = sessions.insert(db, { projectId, personaName: 'c', agentCli: 'claude' }, 3);

    const k = sessions.insert(db, { projectId, personaName: 'd', agentCli: 'claude' }, 4);
    // Per session/CLAUDE.md: kill() writes 'operator_kill'; that row must NOT
    // be touched by the boot sweep.
    sessions.markKilled(db, k.id, 'operator_kill', 5);

    const result = bootOrphanSweep(db, 100);
    expect(result.affected).toBe(3);

    for (const sid of [r1.id, r2.id, r3.id]) {
      const row = sessions.findById(db, sid) as SessionRow;
      // Per D-11 rule 1: every `running` row transitions to `killed` with
      // terminated_reason='server_restart'.
      expect(row.status).toBe('killed');
      expect(row.terminatedReason).toBe('server_restart');
      expect(row.updatedAt).toBe(100);
    }

    // Per session/CLAUDE.md "Surprising constraints" §1: bootOrphanSweep is
    // the ONLY writer of 'server_restart'. The pre-existing 'operator_kill'
    // row must keep its reason and original updated_at.
    const kRow = sessions.findById(db, k.id) as SessionRow;
    expect(kRow.terminatedReason).toBe('operator_kill');
    expect(kRow.updatedAt).toBe(5);
  });
});

describe('bootOrphanSweep — idempotence (D-11)', () => {
  it('second sweep returns affected: 0 and changes nothing', () => {
    const db = freshDb();
    const projectId = seedProject(db);
    sessions.insert(db, { projectId, personaName: 'a', agentCli: 'claude' }, 1);
    sessions.insert(db, { projectId, personaName: 'b', agentCli: 'claude' }, 2);

    const first = bootOrphanSweep(db, 100);
    expect(first.affected).toBe(2);

    // Snapshot the post-first-sweep state.
    const snapshot = sessions.listByStatus(db, 'killed').map((r) => ({
      id: r.id,
      reason: r.terminatedReason,
      updatedAt: r.updatedAt,
    }));

    // Second sweep: no rows are `running` anymore.
    const second = bootOrphanSweep(db, 200);
    expect(second.affected).toBe(0);

    const after = sessions.listByStatus(db, 'killed').map((r) => ({
      id: r.id,
      reason: r.terminatedReason,
      updatedAt: r.updatedAt,
    }));
    expect(after).toEqual(snapshot);
  });

  it('advances updated_at only on flipped rows', () => {
    const db = freshDb();
    const projectId = seedProject(db);
    const r = sessions.insert(db, { projectId, personaName: 'a', agentCli: 'claude' }, 1);
    const k = sessions.insert(db, { projectId, personaName: 'b', agentCli: 'claude' }, 2);
    sessions.markKilled(db, k.id, 'operator_kill', 3);

    const preFlipped = sessions.findById(db, r.id) as SessionRow;
    const prePreKilled = sessions.findById(db, k.id) as SessionRow;

    bootOrphanSweep(db, 100);

    const postFlipped = sessions.findById(db, r.id) as SessionRow;
    const postPreKilled = sessions.findById(db, k.id) as SessionRow;

    // Flipped row's updated_at advances to the sweep's `now`.
    expect(postFlipped.updatedAt).toBe(100);
    expect(postFlipped.updatedAt).toBeGreaterThan(preFlipped.updatedAt);

    // Pre-existing killed row is untouched — same updated_at.
    expect(postPreKilled.updatedAt).toBe(prePreKilled.updatedAt);
  });

  it('returns affected: 0 on an empty DB', () => {
    const db = freshDb();
    // No tenant, no project, no sessions — the migrations ran but the table
    // is empty.
    const result = bootOrphanSweep(db, 100);
    expect(result.affected).toBe(0);
  });
});
