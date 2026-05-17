# `store/` — Module context

SQLite-backed repository layer. Owns DDL, the migrations runner, and typed accessors for `tenants`, `projects`, `sessions`, `schema_versions`. Authoritative DDL lives in [`docs/arch/sqlite-schema.md`](../../../../docs/arch/sqlite-schema.md).

## Owns

- DDL + migrations runner reading `schema_versions`. Refuses to start the server if migrations are behind.
- Typed accessors returning plain TS objects shaped from rows.

## Does NOT own

- Persona YAML (→ `persona/`).
- Transcript bytes (→ `transcript/` writes sidecar files at `~/.relay/transcripts/<sid>.bin`).
- Bearer-token storage (→ `auth/` writes `~/.relay/tokens.json`).
- Session orchestration (→ `session/`).

## Test isolation

In-memory SQLite (`:memory:`) per test. Migrations runner invoked against the fresh DB inside the fixture; no I/O against the dev host's `~/.relay/`.

## Surprising constraints

- Boot-time orphan sweep is the **only** writer of `sessions.terminated_reason = "server_restart"` (per D-11). Any other path writing that value is a bug — caught in the Phase 0 spike.
- Cascade rules are non-uniform: `projects.tenant_id` is RESTRICT, `sessions.project_id` is CASCADE (per D-12). Don't paper over with `ON DELETE NO ACTION`.
- Transcript bytes are sidecar files, not BLOB columns. `sessions` carries `total_bytes` (running byte count per ND-04) but no path column; the sidecar path is computed as `~/.relay/transcripts/<sessionId>.bin` at read time (per [`sqlite-schema.md`](../../../../docs/arch/sqlite-schema.md) §2).
- Migrations runner enforces five error modes via `MigrationError.code`: `ahead` (downgrade detection, 6A-specific guard beyond §6.2), `gap`, `duplicate`, `bad_filename`, `sql_error`. Callers (6E boot, ops tooling) discriminate via `instanceof MigrationError && e.code === ...`.
- `SINGLETON_TENANT_ID = '01J0000000000000000TENANT0'` is the fixed Crockford-Base32 ULID used by `tenants.ensureSingleton` for cross-process idempotent `INSERT OR IGNORE`. Treat it as a project-wide constant; do not generate a fresh ULID for the singleton tenant.
- `better-sqlite3` `SqliteError.code` values surface from repository functions: `SQLITE_CONSTRAINT_UNIQUE` (projects' UNIQUE constraints → 6F maps to 409 Conflict per [`rest-conventions.md`](../../../../docs/arch/rest-conventions.md) §3), `SQLITE_CONSTRAINT_FOREIGNKEY` (RESTRICT on tenant delete), `SQLITE_CONSTRAINT_CHECK` (sessions status/terminated_reason invariant).
- STRICT mode rejects NULL for `NOT NULL` columns even when the column has a `DEFAULT` — the default kicks in only when the column is omitted from the INSERT, not when an explicit NULL is supplied.
