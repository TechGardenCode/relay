/**
 * Coverage map — packages/server/src/store/CLAUDE.md constraints:
 *   Owns:
 *     - Typed accessors for sessions table              → describe("happy path") > it(...)
 *     - DDL ownership (CHECK + status enum)             → describe("status invariants") > it(...)
 *   Surprising constraints:
 *     - Boot-time orphan sweep is the ONLY writer of
 *       terminated_reason='server_restart' (D-11)       → describe("orphan sweep (D-11)") > it("markRunningAsKilled only touches running rows")
 *                                                        → describe("orphan sweep (D-11)") > it("type signature names 'server_restart' as the only reason")
 *     - Cascade rules: sessions.project_id is CASCADE   → covered in projects.test.ts ("cascade rules (D-12)")
 *     - Transcript bytes are sidecar files (no BLOB)    → verified by the production-migration table-shape check in migrations.test.ts
 *
 * Module-specific obligations (from invocation brief):
 *   - defaults on insert                       → describe("happy path") > it("insert sets running/null/0/null/null defaults")
 *   - CHECK rejects manual terminated_reason='agent_exit' WHILE status='running'
 *                                              → describe("status invariants") > it("CHECK rejects setting terminated_reason on running")
 *   - status enum rejects unknown values       → describe("status invariants") > it("CHECK rejects unknown status values")
 *   - markKilled transitions running → killed  → describe("happy path") > it("markKilled transitions running → killed with reason")
 *   - markRunningAsKilled('server_restart')    → describe("orphan sweep (D-11)") > it("...only touches running rows")
 *   - updateAgentSessionId                     → describe("happy path") > it("updateAgentSessionId populates the column")
 *   - incrementTotalBytes cumulative           → describe("happy path") > it("incrementTotalBytes accumulates the running upper bound")
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
} from './index.js';

const MIGRATIONS_DIR = resolve(import.meta.dirname, 'migrations');

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

describe('sessions — happy path', () => {
  let db: Database;
  let projectId: string;

  beforeEach(() => {
    db = freshDb();
    projectId = seedProject(db);
  });

  it('insert sets defaults: status=running, terminated_reason=null, total_bytes=0, agent_session_id=null, pty_pid=null', () => {
    const row = sessions.insert(
      db,
      { projectId, personaName: 'coder', agentCli: 'claude' },
      1_700_000_000_000,
    );

    expect(row.projectId).toBe(projectId);
    expect(row.personaName).toBe('coder');
    expect(row.agentCli).toBe('claude');
    // Per sqlite-schema.md §3.3 + sessions.ts: new rows start as 'running'
    // with NULL terminated_reason, NULL agent_session_id, NULL pty_pid, 0 bytes.
    expect(row.status).toBe('running');
    expect(row.terminatedReason).toBeNull();
    expect(row.agentSessionId).toBeNull();
    expect(row.ptyPid).toBeNull();
    expect(row.totalBytes).toBe(0);
    expect(row.createdAt).toBe(1_700_000_000_000);
    expect(row.updatedAt).toBe(1_700_000_000_000);
    // Per D-12 rule 4 (and the ulid factory in db.ts): 26-char Crockford-Base32.
    expect(row.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it('markKilled transitions running → killed with a reason', () => {
    const inserted = sessions.insert(
      db,
      { projectId, personaName: 'coder', agentCli: 'claude' },
      1,
    );

    const result = sessions.markKilled(db, inserted.id, 'operator_kill', 2);
    expect(result.updated).toBe(true);

    const refetched = sessions.findById(db, inserted.id) as SessionRow;
    expect(refetched.status).toBe('killed');
    expect(refetched.terminatedReason).toBe('operator_kill');
    expect(refetched.updatedAt).toBe(2);
  });

  it('updateAgentSessionId populates the agent_session_id column', () => {
    const inserted = sessions.insert(
      db,
      { projectId, personaName: 'coder', agentCli: 'claude' },
      1,
    );

    sessions.updateAgentSessionId(db, inserted.id, 'agent-abc', 5);

    const refetched = sessions.findById(db, inserted.id) as SessionRow;
    expect(refetched.agentSessionId).toBe('agent-abc');
    expect(refetched.updatedAt).toBe(5);
  });

  it('incrementTotalBytes accumulates the running upper bound (ND-04)', () => {
    const inserted = sessions.insert(
      db,
      { projectId, personaName: 'coder', agentCli: 'claude' },
      1,
    );

    // Per ND-04: total_bytes is the running upper bound used by the
    // transcript pagination API. Callers pass the delta on each append.
    sessions.incrementTotalBytes(db, inserted.id, 100, 2);
    sessions.incrementTotalBytes(db, inserted.id, 250, 3);
    sessions.incrementTotalBytes(db, inserted.id, 0, 4);

    const refetched = sessions.findById(db, inserted.id) as SessionRow;
    expect(refetched.totalBytes).toBe(350);
    expect(refetched.updatedAt).toBe(4);
  });
});

describe('sessions — status invariants (DDL CHECK)', () => {
  let db: Database;
  let projectId: string;

  beforeEach(() => {
    db = freshDb();
    projectId = seedProject(db);
  });

  it("CHECK rejects setting terminated_reason while status='running'", () => {
    const inserted = sessions.insert(
      db,
      { projectId, personaName: 'coder', agentCli: 'claude' },
      1,
    );

    // Per sqlite-schema.md §3.3 / 0001_initial_schema.sql:
    //   CHECK ((status='running' AND terminated_reason IS NULL)
    //          OR (status IN ('idle','killed')))
    // A manual UPDATE that violates this must be rejected — the only legal
    // path that sets terminated_reason while leaving status='running' is none.
    expect(() =>
      db
        .prepare<[string, string]>('UPDATE sessions SET terminated_reason = ? WHERE id = ?')
        .run('agent_exit', inserted.id),
    ).toThrowError(/CHECK/);
  });

  it('CHECK rejects unknown status enum values', () => {
    const inserted = sessions.insert(
      db,
      { projectId, personaName: 'coder', agentCli: 'claude' },
      1,
    );

    // Per the DDL: CHECK (status IN ('running','idle','killed')).
    expect(() =>
      db
        .prepare<[string, string]>('UPDATE sessions SET status = ? WHERE id = ?')
        .run('zombie', inserted.id),
    ).toThrowError(/CHECK/);
  });

  it("status='idle' is allowed with NULL terminated_reason", () => {
    const inserted = sessions.insert(
      db,
      { projectId, personaName: 'coder', agentCli: 'claude' },
      1,
    );

    // The CHECK admits status IN ('idle','killed') regardless of
    // terminated_reason; only the running+non-null combination is rejected.
    expect(() =>
      db.prepare<[string]>("UPDATE sessions SET status = 'idle' WHERE id = ?").run(inserted.id),
    ).not.toThrow();
  });
});

describe('sessions — orphan sweep (D-11)', () => {
  let db: Database;
  let projectId: string;

  beforeEach(() => {
    db = freshDb();
    projectId = seedProject(db);
  });

  it("type signature names 'server_restart' as the only legal reason", () => {
    // Per store/CLAUDE.md: the boot-time orphan sweep is the ONLY writer of
    // sessions.terminated_reason = 'server_restart' (per D-11). The reason
    // parameter on markRunningAsKilled is typed as the literal 'server_restart'.
    const inserted = sessions.insert(
      db,
      { projectId, personaName: 'coder', agentCli: 'claude' },
      1,
    );
    const result = sessions.markRunningAsKilled(db, 'server_restart', 9);
    expect(result.affected).toBe(1);
    const refetched = sessions.findById(db, inserted.id) as SessionRow;
    expect(refetched.terminatedReason).toBe('server_restart');
  });

  it('only touches running rows: seed 2 running + 1 killed + 1 idle, affected=2, others untouched', () => {
    // Seed two running sessions.
    const running1 = sessions.insert(
      db,
      { projectId, personaName: 'coder', agentCli: 'claude' },
      1,
    );
    const running2 = sessions.insert(
      db,
      { projectId, personaName: 'reviewer', agentCli: 'claude' },
      2,
    );

    // Seed one already-killed session (with a different reason).
    const killed = sessions.insert(db, { projectId, personaName: 'ghost', agentCli: 'claude' }, 3);
    sessions.markKilled(db, killed.id, 'operator_kill', 4);

    // Seed one idle session.
    const idle = sessions.insert(db, { projectId, personaName: 'idler', agentCli: 'claude' }, 5);
    db.prepare<[string]>("UPDATE sessions SET status = 'idle' WHERE id = ?").run(idle.id);

    // Per D-11 rule 1: the orphan sweep transitions running → killed and is
    // the only writer of terminated_reason='server_restart'.
    const result = sessions.markRunningAsKilled(db, 'server_restart', 100);
    expect(result.affected).toBe(2);

    const r1 = sessions.findById(db, running1.id) as SessionRow;
    const r2 = sessions.findById(db, running2.id) as SessionRow;
    expect(r1.status).toBe('killed');
    expect(r1.terminatedReason).toBe('server_restart');
    expect(r1.updatedAt).toBe(100);
    expect(r2.status).toBe('killed');
    expect(r2.terminatedReason).toBe('server_restart');
    expect(r2.updatedAt).toBe(100);

    // Pre-existing killed row is untouched.
    const k = sessions.findById(db, killed.id) as SessionRow;
    expect(k.terminatedReason).toBe('operator_kill');
    expect(k.updatedAt).toBe(4);

    // Idle row keeps its status and timestamps.
    const i = sessions.findById(db, idle.id) as SessionRow;
    expect(i.status).toBe('idle');
    expect(i.terminatedReason).toBeNull();
  });

  it('returns affected=0 when there are no running rows', () => {
    const inserted = sessions.insert(
      db,
      { projectId, personaName: 'coder', agentCli: 'claude' },
      1,
    );
    sessions.markKilled(db, inserted.id, 'operator_kill', 2);

    const result = sessions.markRunningAsKilled(db, 'server_restart', 3);
    expect(result.affected).toBe(0);

    // And the already-killed row is unmodified.
    const refetched = sessions.findById(db, inserted.id) as SessionRow;
    expect(refetched.terminatedReason).toBe('operator_kill');
    expect(refetched.updatedAt).toBe(2);
  });
});

describe('sessions — listByProject / listByStatus', () => {
  it('listByProject filters by status when provided, orders by created_at DESC', () => {
    const db = freshDb();
    const projectId = seedProject(db);

    const oldest = sessions.insert(db, { projectId, personaName: 'a', agentCli: 'claude' }, 10);
    const middle = sessions.insert(db, { projectId, personaName: 'b', agentCli: 'claude' }, 20);
    const newest = sessions.insert(db, { projectId, personaName: 'c', agentCli: 'claude' }, 30);

    sessions.markKilled(db, middle.id, 'operator_kill', 25);

    const all = sessions.listByProject(db, projectId);
    expect(all.map((s) => s.id)).toEqual([newest.id, middle.id, oldest.id]);

    const running = sessions.listByProject(db, projectId, 'running');
    expect(running.map((s) => s.id)).toEqual([newest.id, oldest.id]);

    const killed = sessions.listByStatus(db, 'killed');
    expect(killed.map((s) => s.id)).toEqual([middle.id]);
  });
});
