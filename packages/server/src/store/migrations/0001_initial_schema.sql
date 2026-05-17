-- 0001_initial_schema.sql
-- Initial Relay schema: tenants, projects, sessions, schema_versions.
-- Body verbatim from docs/arch/sqlite-schema.md §3 + §4 + §6.3.

CREATE TABLE tenants (
  id         TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
) STRICT;

CREATE TABLE projects (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  slug           TEXT NOT NULL,
  display_name   TEXT NOT NULL,
  canonical_path TEXT NOT NULL,
  agent_cli      TEXT NOT NULL DEFAULT 'claude',
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,
  UNIQUE (tenant_id, slug),
  UNIQUE (tenant_id, canonical_path)
) STRICT;

CREATE TABLE sessions (
  id                TEXT PRIMARY KEY,
  project_id        TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  persona_name      TEXT NOT NULL,
  agent_cli         TEXT NOT NULL,
  agent_session_id  TEXT,
  pty_pid           INTEGER,
  status            TEXT NOT NULL CHECK (status IN ('running','idle','killed')),
  terminated_reason TEXT,
  total_bytes       INTEGER NOT NULL DEFAULT 0,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,
  CHECK (
    (status = 'running' AND terminated_reason IS NULL)
    OR (status IN ('idle','killed'))
  )
) STRICT;

CREATE INDEX sessions_project_status ON sessions (project_id, status);
CREATE INDEX sessions_status         ON sessions (status);
CREATE INDEX sessions_created_at     ON sessions (created_at DESC);

INSERT INTO schema_versions (version, name, applied_at)
VALUES (1, 'initial_schema', CAST(strftime('%s','now') AS INTEGER) * 1000);
