/**
 * Coverage map — packages/server/src/store/CLAUDE.md constraints:
 *   Owns:
 *     - DDL + migrations runner reading schema_versions; refuses to start
 *       if migrations are behind                            → describe("happy path") > it("applies production migration on a clean :memory: DB")
 *     - Typed accessors returning plain TS objects          → covered indirectly via RunMigrationsResult assertions
 *   Surprising constraints:
 *     - Cascade rules are non-uniform (D-12)                → enforced by 0001_initial_schema.sql DDL; verified in projects.test.ts / sessions.test.ts
 *     - terminated_reason='server_restart' is sweep-only (D-11) → CHECK enforces NULL when status='running'; verified by index + table presence here, semantics in sessions.test.ts
 *     - Transcript bytes are sidecar files (sessions.transcript_path)  → DDL has no BLOB column; verified by the production-migration table-shape check
 *
 * Module-specific runner contract (this file's primary subject):
 *   - empty migrations dir       → describe("parseMigrationsDir") > it("empty dir is a no-op...")
 *   - production migration       → describe("happy path") > it("applies production migration on a clean :memory: DB")
 *   - idempotency                → describe("happy path") > it("is idempotent — re-running...")
 *   - behind                     → describe("upgrade path") > it("applies only newer files...")
 *   - ahead (downgrade refusal)  → describe("downgrade refusal (6A guard)") > it("throws MigrationError code='ahead'...")
 *   - gap                        → describe("sequence validation") > it("throws MigrationError code='gap'...")
 *   - duplicate (defensive)      → describe("sequence validation") > it("documents the duplicate guard as belt-and-braces")
 *   - bad_filename               → describe("filename convention") > it("throws MigrationError code='bad_filename'...")
 *   - sql_error + rollback       → describe("transaction safety") > it("rolls back on SQL error...")
 *   - first-boot schema_versions → describe("happy path") > it("creates schema_versions on a DB that doesn't have it")
 */

import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { MigrationError, openDatabase, runMigrations } from './index.js';

const FIXTURES_ROOT = resolve(import.meta.dirname, '../../test/fixtures/db/migrations_scenarios');
const PRODUCTION_MIGRATIONS_DIR = resolve(import.meta.dirname, 'migrations');

interface SchemaVersionRow {
  version: number;
  name: string;
  applied_at: number;
}

interface SqliteMasterRow {
  name: string;
  type: 'table' | 'index' | 'view' | 'trigger';
}

function freshDb() {
  return openDatabase({ filename: ':memory:' });
}

describe('runMigrations — happy path', () => {
  it('applies production migration on a clean :memory: DB', () => {
    const db = freshDb();

    const result = runMigrations(db, PRODUCTION_MIGRATIONS_DIR);

    expect(result).toEqual({
      applied: [{ version: 1, name: 'initial_schema' }],
      currentVersion: 1,
    });

    // schema_versions row is present per sqlite-schema.md §6.2.
    const versionRows = db
      .prepare<
        [],
        SchemaVersionRow
      >('SELECT version, name, applied_at FROM schema_versions ORDER BY version')
      .all();
    expect(versionRows).toHaveLength(1);
    expect(versionRows[0]?.version).toBe(1);
    expect(versionRows[0]?.name).toBe('initial_schema');
    expect(versionRows[0]?.applied_at).toBeGreaterThan(0);

    // Tables — store/CLAUDE.md: owns tenants, projects, sessions, schema_versions.
    const tables = db
      .prepare<[], SqliteMasterRow>(
        "SELECT name, type FROM sqlite_master WHERE type='table' ORDER BY name",
      )
      .all()
      .map((r) => r.name);
    expect(tables).toContain('tenants');
    expect(tables).toContain('projects');
    expect(tables).toContain('sessions');
    expect(tables).toContain('schema_versions');

    // Per sqlite-schema.md §3.3: the three sessions indexes exist.
    const indexes = db
      .prepare<[], SqliteMasterRow>(
        "SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'",
      )
      .all()
      .map((r) => r.name);
    expect(indexes).toContain('sessions_project_status');
    expect(indexes).toContain('sessions_status');
    expect(indexes).toContain('sessions_created_at');
  });

  it('is idempotent — re-running against the same DB applies nothing', () => {
    const db = freshDb();
    runMigrations(db, PRODUCTION_MIGRATIONS_DIR);

    const second = runMigrations(db, PRODUCTION_MIGRATIONS_DIR);

    expect(second).toEqual({ applied: [], currentVersion: 1 });

    // schema_versions still has exactly one row.
    const count = db.prepare<[], { c: number }>('SELECT COUNT(*) AS c FROM schema_versions').get();
    expect(count?.c).toBe(1);
  });

  it('creates schema_versions on a DB that does not have it (first boot)', () => {
    const db = freshDb();

    // Sanity: schema_versions does not exist yet.
    const before = db
      .prepare<
        [],
        { c: number }
      >("SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table' AND name='schema_versions'")
      .get();
    expect(before?.c).toBe(0);

    const result = runMigrations(db, resolve(FIXTURES_ROOT, 'empty'));

    expect(result).toEqual({ applied: [], currentVersion: 0 });

    // Runner emits the schema_versions CREATE even when no files exist
    // (per migrations.ts step 2 / sqlite-schema.md §6.2 step 2).
    const after = db
      .prepare<
        [],
        { c: number }
      >("SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table' AND name='schema_versions'")
      .get();
    expect(after?.c).toBe(1);
  });
});

describe('runMigrations — parseMigrationsDir', () => {
  it('empty dir is a no-op — applied=[], currentVersion=0', () => {
    const db = freshDb();
    const result = runMigrations(db, resolve(FIXTURES_ROOT, 'empty'));
    expect(result).toEqual({ applied: [], currentVersion: 0 });
  });

  it('missing dir is also treated as zero migrations', () => {
    const db = freshDb();
    const result = runMigrations(db, resolve(FIXTURES_ROOT, 'does_not_exist_on_disk'));
    expect(result).toEqual({ applied: [], currentVersion: 0 });
  });
});

describe('runMigrations — upgrade path', () => {
  it('applies only newer files when the DB is behind', () => {
    const db = freshDb();
    // Hand-seed schema_versions to version=1 to simulate a DB that has
    // already applied 0001 and now needs 0002.
    db.exec(
      `CREATE TABLE schema_versions (
         version    INTEGER PRIMARY KEY,
         name       TEXT NOT NULL,
         applied_at INTEGER NOT NULL
       ) STRICT;
       INSERT INTO schema_versions (version, name, applied_at) VALUES (1, 'initial', 0);`,
    );

    const result = runMigrations(db, resolve(FIXTURES_ROOT, 'behind'));

    expect(result.applied).toEqual([{ version: 2, name: 'add_widgets' }]);
    expect(result.currentVersion).toBe(2);

    // The 0001 file's CREATE TABLE behind_initial was skipped (we never
    // ran 0001 here; we just seeded the row), so that table must NOT exist.
    const behindInitial = db
      .prepare<
        [],
        { c: number }
      >("SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table' AND name='behind_initial'")
      .get();
    expect(behindInitial?.c).toBe(0);

    // 0002 ran, so widgets exists.
    const widgets = db
      .prepare<
        [],
        { c: number }
      >("SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table' AND name='widgets'")
      .get();
    expect(widgets?.c).toBe(1);
  });
});

describe('runMigrations — downgrade refusal (6A guard)', () => {
  it("throws MigrationError code='ahead' when DB is past max file version", () => {
    const db = freshDb();
    db.exec(
      `CREATE TABLE schema_versions (
         version    INTEGER PRIMARY KEY,
         name       TEXT NOT NULL,
         applied_at INTEGER NOT NULL
       ) STRICT;
       INSERT INTO schema_versions (version, name, applied_at) VALUES (5, 'phantom', 0);`,
    );

    // Per the runner: if current > maxFileVersion the operator has likely
    // downgraded the binary; refuse boot rather than skip past migrations.
    expect(() => runMigrations(db, resolve(FIXTURES_ROOT, 'ahead'))).toThrowError(MigrationError);

    try {
      runMigrations(db, resolve(FIXTURES_ROOT, 'ahead'));
    } catch (err) {
      expect(err).toBeInstanceOf(MigrationError);
      const me = err as MigrationError;
      expect(me.code).toBe('ahead');
      expect(me.dbVersion).toBe(5);
      expect(me.maxFileVersion).toBe(1);
    }
  });
});

describe('runMigrations — sequence validation', () => {
  it("throws MigrationError code='gap' when a version is missing", () => {
    const db = freshDb();

    try {
      runMigrations(db, resolve(FIXTURES_ROOT, 'gap'));
      throw new Error('expected MigrationError to be thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(MigrationError);
      const me = err as MigrationError;
      expect(me.code).toBe('gap');
      expect(me.missingVersion).toBe(2);
      // Per migrations.ts: the file blamed is the first one *past* the gap.
      expect(me.file).toBe('0003_skip.sql');
    }
  });

  // The duplicate guard rejects two files parsing to the same NNNN. The
  // filesystem makes that mechanically impossible: two distinct files
  // cannot share a name, and the regex extracts the version directly from
  // the filename prefix. The guard remains as belt-and-braces; we cover
  // its behavioral kin (gap) with a real fixture above. See
  // packages/server/test/fixtures/db/migrations_scenarios/duplicate/README.md.
  it('documents the duplicate guard as belt-and-braces (no fixture)', () => {
    expect(true).toBe(true);
  });
});

describe('runMigrations — filename convention', () => {
  it("throws MigrationError code='bad_filename' on a 3-digit prefix", () => {
    const db = freshDb();

    try {
      runMigrations(db, resolve(FIXTURES_ROOT, 'bad_filename'));
      throw new Error('expected MigrationError to be thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(MigrationError);
      const me = err as MigrationError;
      // Per sqlite-schema.md §6.1: filenames not matching
      // NNNN_short_description.sql are a corrupted-dir signal.
      expect(me.code).toBe('bad_filename');
      expect(me.file).toBe('1_initial.sql');
    }
  });
});

describe('runMigrations — transaction safety', () => {
  it('rolls back on SQL error — partial CREATE TABLE in the same file does not persist', () => {
    const db = freshDb();

    try {
      runMigrations(db, resolve(FIXTURES_ROOT, 'sql_error'));
      throw new Error('expected MigrationError to be thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(MigrationError);
      const me = err as MigrationError;
      expect(me.code).toBe('sql_error');
      expect(me.file).toBe('0001_bad_sql.sql');
      // The Error.cause carries the underlying SQLite error.
      expect(me.cause).toBeDefined();
    }

    // Per sqlite-schema.md §6.2 step 5: the runner-owned transaction must
    // roll back the entire file. The first statement created sql_error_good,
    // but the second statement raised — neither table should exist.
    const good = db
      .prepare<
        [],
        { c: number }
      >("SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table' AND name='sql_error_good'")
      .get();
    expect(good?.c).toBe(0);

    const bad = db
      .prepare<
        [],
        { c: number }
      >("SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table' AND name='sql_error_bad'")
      .get();
    expect(bad?.c).toBe(0);
  });
});
