import { SINGLETON_TENANT_ID } from './db.js';
import type { Database } from './db.js';

export interface TenantRow {
  id: string;
  createdAt: number;
}

interface TenantDbRow {
  id: string;
  created_at: number;
}

function mapRow(row: TenantDbRow): TenantRow {
  return { id: row.id, createdAt: row.created_at };
}

// Per prd/01-conceptual-model.md "single tenant at MVP, hidden": idempotent
// INSERT OR IGNORE on the fixed SINGLETON_TENANT_ID. Concurrent callers
// converge on the same row without coordination.
export function ensureSingleton(db: Database, now: number): TenantRow {
  db.prepare<[string, number]>('INSERT OR IGNORE INTO tenants (id, created_at) VALUES (?, ?)').run(
    SINGLETON_TENANT_ID,
    now,
  );

  const row = db
    .prepare<[string], TenantDbRow>('SELECT id, created_at FROM tenants WHERE id = ?')
    .get(SINGLETON_TENANT_ID);

  if (row === undefined) {
    // Unreachable: the INSERT OR IGNORE above guarantees the row exists.
    throw new Error('tenants.ensureSingleton: row vanished after INSERT OR IGNORE');
  }
  return mapRow(row);
}

export function findById(db: Database, id: string): TenantRow | undefined {
  const row = db
    .prepare<[string], TenantDbRow>('SELECT id, created_at FROM tenants WHERE id = ?')
    .get(id);
  return row === undefined ? undefined : mapRow(row);
}
