/**
 * Coverage map — packages/server/src/store/CLAUDE.md constraints:
 *   Owns:
 *     - Typed accessors returning plain TS objects shaped from rows
 *                                                       → describe("happy path") > it("ensureSingleton creates the singleton row")
 *                                                       → describe("happy path") > it("findById returns the row when present")
 *   Surprising constraints:
 *     - (no tenant-specific constraints in CLAUDE.md; the singleton-tenant model
 *        comes from prd/01-conceptual-model.md)         → describe("idempotency") > it("ensureSingleton is idempotent...")
 *
 * Module-specific obligations (from invocation brief):
 *   - ensureSingleton idempotency  → describe("idempotency") > it(...)
 *   - findById returns / misses    → describe("happy path") > it("findById returns...")
 *                                  → describe("happy path") > it("findById returns undefined for unknown id")
 */

import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  openDatabase,
  runMigrations,
  SINGLETON_TENANT_ID,
  tenants,
  type Database,
} from './index.js';

const MIGRATIONS_DIR = resolve(import.meta.dirname, 'migrations');

function freshDb(): Database {
  const db = openDatabase({ filename: ':memory:' });
  runMigrations(db, MIGRATIONS_DIR);
  return db;
}

describe('tenants — happy path', () => {
  let db: Database;

  beforeEach(() => {
    db = freshDb();
  });

  it('ensureSingleton creates the singleton row at the fixed ID', () => {
    const row = tenants.ensureSingleton(db, 1_700_000_000_000);

    // Per prd/01-conceptual-model.md "single tenant at MVP, hidden":
    // the singleton uses a fixed ULID so callers don't coordinate an ID handshake.
    expect(row.id).toBe(SINGLETON_TENANT_ID);
    expect(row.createdAt).toBe(1_700_000_000_000);
  });

  it('findById returns the row when present', () => {
    tenants.ensureSingleton(db, 1_700_000_000_000);

    const found = tenants.findById(db, SINGLETON_TENANT_ID);
    expect(found).toBeDefined();
    expect(found?.id).toBe(SINGLETON_TENANT_ID);
    expect(found?.createdAt).toBe(1_700_000_000_000);
  });

  it('findById returns undefined for an unknown id', () => {
    const found = tenants.findById(db, '01J0000000000000000DOESNT0');
    expect(found).toBeUndefined();
  });
});

describe('tenants — idempotency', () => {
  it('ensureSingleton is idempotent — second call returns the same row, keeps original created_at', () => {
    const db = freshDb();

    const first = tenants.ensureSingleton(db, 1_700_000_000_000);
    const second = tenants.ensureSingleton(db, 1_800_000_000_000);

    expect(second.id).toBe(first.id);
    // INSERT OR IGNORE preserves the original row; the second now is dropped.
    expect(second.createdAt).toBe(first.createdAt);

    // And only one row exists.
    const count = db.prepare<[], { c: number }>('SELECT COUNT(*) AS c FROM tenants').get();
    expect(count?.c).toBe(1);
  });
});
