/**
 * Coverage map — packages/server/src/store/CLAUDE.md constraints:
 *   Owns:
 *     - Typed accessors for projects table             → describe("happy path") > it("insert defaults agent_cli to 'claude'")
 *                                                      → describe("happy path") > it("findByCanonicalPath finds the row")
 *                                                      → describe("happy path") > it("listByTenant orders by created_at ASC")
 *     - DDL ownership (UNIQUE constraints applied)     → describe("UNIQUE constraints") > it(...)
 *   Surprising constraints:
 *     - Cascade rules are non-uniform: projects.tenant_id is RESTRICT (D-12)
 *                                                      → describe("cascade rules (D-12)") > it("RESTRICT prevents tenant deletion...")
 *     - sessions.project_id is CASCADE (D-12)          → describe("cascade rules (D-12)") > it("removing a project cascades to sessions")
 *
 * Module-specific obligations (from invocation brief):
 *   - happy insert + agent_cli default                  → describe("happy path") > it("insert defaults agent_cli to 'claude'")
 *   - UNIQUE(tenant_id, slug) violation                 → describe("UNIQUE constraints") > it("UNIQUE(tenant_id, slug)...")
 *   - UNIQUE(tenant_id, canonical_path) violation       → describe("UNIQUE constraints") > it("UNIQUE(tenant_id, canonical_path)...")
 *   - CASCADE delete                                    → describe("cascade rules (D-12)") > it("removing a project cascades to sessions")
 *   - RESTRICT on tenant delete                         → describe("cascade rules (D-12)") > it("RESTRICT prevents tenant deletion...")
 *   - findByCanonicalPath cross-tenant isolation        → describe("cross-tenant isolation") > it("two tenants can share canonical_path")
 *   - listByTenant ordering ASC by created_at           → describe("happy path") > it("listByTenant orders by created_at ASC")
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
} from './index.js';

const MIGRATIONS_DIR = resolve(import.meta.dirname, 'migrations');

function freshDb(): Database {
  const db = openDatabase({ filename: ':memory:' });
  runMigrations(db, MIGRATIONS_DIR);
  return db;
}

function seedTenant(db: Database): string {
  tenants.ensureSingleton(db, 1_700_000_000_000);
  return SINGLETON_TENANT_ID;
}

function insertExtraTenant(db: Database, id: string, now: number): void {
  db.prepare<[string, number]>('INSERT INTO tenants (id, created_at) VALUES (?, ?)').run(id, now);
}

describe('projects — happy path', () => {
  let db: Database;
  let tenantId: string;

  beforeEach(() => {
    db = freshDb();
    tenantId = seedTenant(db);
  });

  it("insert defaults agent_cli to 'claude' when omitted", () => {
    const row = projects.insert(
      db,
      {
        tenantId,
        slug: 'demo',
        displayName: 'Demo Project',
        canonicalPath: '/home/dev/demo',
      },
      1_700_000_000_000,
    );

    expect(row.tenantId).toBe(tenantId);
    expect(row.slug).toBe('demo');
    expect(row.displayName).toBe('Demo Project');
    expect(row.canonicalPath).toBe('/home/dev/demo');
    // Per the DDL default + projects.ts: agentCli defaults to 'claude'.
    expect(row.agentCli).toBe('claude');
    expect(row.createdAt).toBe(1_700_000_000_000);
    expect(row.updatedAt).toBe(1_700_000_000_000);
    // Per D-12 rule 4: ULID is server-issued (26 Crockford-Base32 chars).
    expect(row.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it('insert respects an explicit agentCli', () => {
    const row = projects.insert(
      db,
      {
        tenantId,
        slug: 'demo',
        displayName: 'Demo',
        canonicalPath: '/home/dev/demo',
        agentCli: 'codex',
      },
      1_700_000_000_000,
    );
    expect(row.agentCli).toBe('codex');
  });

  it('findByCanonicalPath returns the project for the tenant', () => {
    const inserted = projects.insert(
      db,
      {
        tenantId,
        slug: 'demo',
        displayName: 'Demo',
        canonicalPath: '/home/dev/demo',
      },
      1_700_000_000_000,
    );

    const found = projects.findByCanonicalPath(db, tenantId, '/home/dev/demo');
    expect(found?.id).toBe(inserted.id);
  });

  it('listByTenant orders by created_at ASC', () => {
    const a = projects.insert(
      db,
      {
        tenantId,
        slug: 'alpha',
        displayName: 'A',
        canonicalPath: '/home/dev/a',
      },
      100,
    );
    const b = projects.insert(
      db,
      {
        tenantId,
        slug: 'beta',
        displayName: 'B',
        canonicalPath: '/home/dev/b',
      },
      200,
    );
    const c = projects.insert(
      db,
      {
        tenantId,
        slug: 'gamma',
        displayName: 'C',
        canonicalPath: '/home/dev/c',
      },
      150,
    );

    const list = projects.listByTenant(db, tenantId);
    expect(list.map((p) => p.id)).toEqual([a.id, c.id, b.id]);
  });
});

describe('projects — UNIQUE constraints', () => {
  let db: Database;
  let tenantId: string;

  beforeEach(() => {
    db = freshDb();
    tenantId = seedTenant(db);
  });

  it('UNIQUE(tenant_id, slug) — duplicate slug throws SQLITE_CONSTRAINT_UNIQUE', () => {
    projects.insert(
      db,
      {
        tenantId,
        slug: 'demo',
        displayName: 'Demo',
        canonicalPath: '/home/dev/demo',
      },
      1,
    );

    // Per D-12: UNIQUE(tenant_id, slug) is enforced by the DDL;
    // SQLITE_CONSTRAINT_UNIQUE propagates to the caller for 6F to map to 409.
    expect(() =>
      projects.insert(
        db,
        {
          tenantId,
          slug: 'demo',
          displayName: 'Demo 2',
          canonicalPath: '/home/dev/demo-other',
        },
        2,
      ),
    ).toThrowError(/UNIQUE/);
  });

  it('UNIQUE(tenant_id, canonical_path) — duplicate path throws SQLITE_CONSTRAINT_UNIQUE', () => {
    projects.insert(
      db,
      {
        tenantId,
        slug: 'demo',
        displayName: 'Demo',
        canonicalPath: '/home/dev/demo',
      },
      1,
    );

    // Per D-12 rule 2: re-registering the same canonical path is an error
    // (the REST layer maps SQLITE_CONSTRAINT_UNIQUE to 409 Conflict).
    expect(() =>
      projects.insert(
        db,
        {
          tenantId,
          slug: 'other',
          displayName: 'Other',
          canonicalPath: '/home/dev/demo',
        },
        2,
      ),
    ).toThrowError(/UNIQUE/);
  });
});

describe('projects — cascade rules (D-12)', () => {
  let db: Database;
  let tenantId: string;

  beforeEach(() => {
    db = freshDb();
    tenantId = seedTenant(db);
  });

  it('removing a project cascades to its sessions (sessions.project_id ON DELETE CASCADE)', () => {
    const project = projects.insert(
      db,
      {
        tenantId,
        slug: 'demo',
        displayName: 'Demo',
        canonicalPath: '/home/dev/demo',
      },
      1,
    );
    sessions.insert(
      db,
      {
        projectId: project.id,
        agentCli: 'claude',
      },
      2,
    );
    sessions.insert(
      db,
      {
        projectId: project.id,
        agentCli: 'claude',
      },
      3,
    );

    const before = db.prepare<[], { c: number }>('SELECT COUNT(*) AS c FROM sessions').get();
    expect(before?.c).toBe(2);

    const { removed } = projects.remove(db, project.id);
    expect(removed).toBe(true);

    // Per D-12: removing a project cascades to its sessions.
    const after = db.prepare<[], { c: number }>('SELECT COUNT(*) AS c FROM sessions').get();
    expect(after?.c).toBe(0);
  });

  it('RESTRICT prevents tenant deletion when projects reference it (projects.tenant_id ON DELETE RESTRICT)', () => {
    projects.insert(
      db,
      {
        tenantId,
        slug: 'demo',
        displayName: 'Demo',
        canonicalPath: '/home/dev/demo',
      },
      1,
    );

    // Per D-12: cascade rules are non-uniform. projects.tenant_id is
    // RESTRICT — deleting a tenant with projects is rejected at the FK level.
    expect(() =>
      db.prepare<[string]>('DELETE FROM tenants WHERE id = ?').run(tenantId),
    ).toThrowError(/FOREIGN KEY/);
  });
});

describe('projects — cross-tenant isolation', () => {
  it('two tenants can share the same canonical_path (UNIQUE is (tenant_id, canonical_path))', () => {
    const db = freshDb();
    const tenantA = seedTenant(db);
    const tenantB = '01J0000000000000000TENANTB';
    insertExtraTenant(db, tenantB, 1);

    const projectA = projects.insert(
      db,
      {
        tenantId: tenantA,
        slug: 'demo',
        displayName: 'Demo (A)',
        canonicalPath: '/home/dev/demo',
      },
      10,
    );
    const projectB = projects.insert(
      db,
      {
        tenantId: tenantB,
        slug: 'demo',
        displayName: 'Demo (B)',
        canonicalPath: '/home/dev/demo',
      },
      20,
    );

    // Each tenant resolves its own project for the shared path.
    expect(projects.findByCanonicalPath(db, tenantA, '/home/dev/demo')?.id).toBe(projectA.id);
    expect(projects.findByCanonicalPath(db, tenantB, '/home/dev/demo')?.id).toBe(projectB.id);

    // listByTenant shows only that tenant's project.
    expect(projects.listByTenant(db, tenantA).map((p) => p.id)).toEqual([projectA.id]);
    expect(projects.listByTenant(db, tenantB).map((p) => p.id)).toEqual([projectB.id]);
  });
});
