import { ulid } from './db.js';
import type { Database } from './db.js';

export interface ProjectRow {
  id: string;
  tenantId: string;
  slug: string;
  displayName: string;
  canonicalPath: string;
  agentCli: string;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectInsertInput {
  tenantId: string;
  slug: string;
  displayName: string;
  canonicalPath: string;
  agentCli?: string;
}

interface ProjectDbRow {
  id: string;
  tenant_id: string;
  slug: string;
  display_name: string;
  canonical_path: string;
  agent_cli: string;
  created_at: number;
  updated_at: number;
}

const SELECT_COLUMNS =
  'id, tenant_id, slug, display_name, canonical_path, agent_cli, created_at, updated_at';

function mapRow(row: ProjectDbRow): ProjectRow {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    slug: row.slug,
    displayName: row.display_name,
    canonicalPath: row.canonical_path,
    agentCli: row.agent_cli,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Per D-12 rule 4: ULID generated internally, never caller-supplied.
// UNIQUE(tenant_id, canonical_path) and UNIQUE(tenant_id, slug) are enforced
// by the DDL; SQLITE_CONSTRAINT_UNIQUE propagates to the caller for 6F to
// map to 409 Conflict (per rest-conventions.md §3).
export function insert(db: Database, input: ProjectInsertInput, now: number): ProjectRow {
  const id = ulid();
  const agentCli = input.agentCli ?? 'claude';
  db.prepare<[string, string, string, string, string, string, number, number]>(
    `INSERT INTO projects (id, tenant_id, slug, display_name, canonical_path, agent_cli, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, input.tenantId, input.slug, input.displayName, input.canonicalPath, agentCli, now, now);

  const row = db
    .prepare<[string], ProjectDbRow>(`SELECT ${SELECT_COLUMNS} FROM projects WHERE id = ?`)
    .get(id);
  if (row === undefined) {
    throw new Error(`projects.insert: row vanished after INSERT for id=${id}`);
  }
  return mapRow(row);
}

export function findById(db: Database, id: string): ProjectRow | undefined {
  const row = db
    .prepare<[string], ProjectDbRow>(`SELECT ${SELECT_COLUMNS} FROM projects WHERE id = ?`)
    .get(id);
  return row === undefined ? undefined : mapRow(row);
}

export function findByCanonicalPath(
  db: Database,
  tenantId: string,
  canonicalPath: string,
): ProjectRow | undefined {
  const row = db
    .prepare<
      [string, string],
      ProjectDbRow
    >(`SELECT ${SELECT_COLUMNS} FROM projects WHERE tenant_id = ? AND canonical_path = ?`)
    .get(tenantId, canonicalPath);
  return row === undefined ? undefined : mapRow(row);
}

export function findBySlug(db: Database, tenantId: string, slug: string): ProjectRow | undefined {
  const row = db
    .prepare<
      [string, string],
      ProjectDbRow
    >(`SELECT ${SELECT_COLUMNS} FROM projects WHERE tenant_id = ? AND slug = ?`)
    .get(tenantId, slug);
  return row === undefined ? undefined : mapRow(row);
}

export function listByTenant(db: Database, tenantId: string): ProjectRow[] {
  const rows = db
    .prepare<
      [string],
      ProjectDbRow
    >(`SELECT ${SELECT_COLUMNS} FROM projects WHERE tenant_id = ? ORDER BY created_at ASC`)
    .all(tenantId);
  return rows.map(mapRow);
}

// Per D-12 rule 7: removing a project cascades to its sessions (FK CASCADE
// in the DDL). Transcript-file cleanup is the transcript/ module's job on
// session-row delete; not handled here.
export function remove(db: Database, id: string): { removed: boolean } {
  const info = db.prepare<[string]>('DELETE FROM projects WHERE id = ?').run(id);
  return { removed: info.changes > 0 };
}
