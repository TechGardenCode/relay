# Relay Arch — SQLite Schema & Migrations

**Status:** v0.1
**Scope:** DDL for the entities the PRD names — tenants, projects, sessions — plus the cascade rules, indexes, transcript storage decision, and migration tooling convention. Closes build-plan task 2C; unblocks the `store/` module implementation, build-plan task 3F (the `sqlite-migration` skill), and the `store/CLAUDE.md` write-up under build-plan task 5D.

**Out of scope:** ORM choice and connection-pool configuration (these are tooling decisions outside the schema itself — [`repo-layout.md`](./repo-layout.md) §8 already picks `better-sqlite3` and no ORM); runtime SQLite tuning (journal mode, WAL, page size — implementation phase); the wire format that wraps query results ([`arch/ws-protocol.md`](./ws-protocol.md) and the REST shape doc — build-plan task 2E); the persona YAML schema itself ([`prd/09-persona-schema.md`](../prd/09-persona-schema.md), resolved by [D-09](../open-questions.md#d-09-persona-yaml-schema)).

---

## 1. What lives in SQLite (and what doesn't)

The database file is at `~/.relay/state.db`. It holds **entity identity and lifecycle metadata only** — the small relational core. Everything large, append-only, or operator-readable lives on the filesystem alongside it, inside the same `~/.relay/` backup boundary that [`prd/06-distribution.md`](../prd/06-distribution.md) already commits to.

### In SQLite

| Table | Holds | Source |
|---|---|---|
| `tenants` | Tenant identity (single row at MVP) | [`prd/01-conceptual-model.md`](../prd/01-conceptual-model.md) |
| `projects` | Per-project identity, slug, canonical working-dir path | [D-12](../open-questions.md#d-12-project-record-storage-and-relay-project-add-semantics) rule 5, [`prd/03-server.md`](../prd/03-server.md) §3 |
| `sessions` | Per-session identity, status, agent-session-id, transcript-byte counter | [`prd/01-conceptual-model.md`](../prd/01-conceptual-model.md), [D-11](../open-questions.md#d-11-server-restart-and-session-orphaning) |
| `schema_versions` | Applied migrations | This doc, §6 |

### NOT in SQLite

| State | Lives at | Why | Source |
|---|---|---|---|
| Bearer tokens (hashed) | `~/.relay/tokens.json` | Auth module is self-contained; operator can `cat` the file to audit. `store/` does not own auth state. | [D-13](../open-questions.md#d-13-first-run-pairing-ux) rule 5; [`prd/03-server.md`](../prd/03-server.md) §6 + §8 ownership table; [`repo-layout.md`](./repo-layout.md) §3 (`store/` "does not own ... bearer-token storage") |
| Personas | `~/.relay/personas/*.yaml` (tenant), `<project>/.relay/personas/*.yaml` (project override) | Personas are source-of-truth on disk; override is by file presence, not a DB join. | [D-09](../open-questions.md#d-09-persona-yaml-schema) rules 1 + 4 |
| Transcripts | `~/.relay/transcripts/<session-id>.bin` | Append-only PTY byte streams, megabyte-scale; sidecar files match the workload. See §2. | [D-07](../open-questions.md#d-07-transcript-stream-capture-layer), [ND-04](../open-questions.md#nd-04-transcript-pagination-api-shape), [`repo-layout.md`](./repo-layout.md) §3 `transcript/` |
| MCP configs, spawn audit | `~/.relay/sessions/<sessionId>/{mcp.json,spawn.json}` | Transient per-session artifacts read by the agent at spawn; nothing else queries them. | [`arch/persona-application.md`](./persona-application.md) §2.b, §4.2 |
| Server config | `~/.relay/config.yaml` | Operator-edited; outside the entity graph. | [`prd/03-server.md`](../prd/03-server.md) §3 |
| Project marker files | `<project>/.relay/project.json` | Lives in the working tree (gitignored); pairs the working dir to a project ID. | [D-12](../open-questions.md#d-12-project-record-storage-and-relay-project-add-semantics) rule 6, [ND-07](../open-questions.md#nd-07-marker-file-schema) |

The principle is the same one [`prd/03-server.md`](../prd/03-server.md) §8 calls "native configuration preservation," applied internally: each module owns its own state file under `~/.relay/`, and `store/` is one module among several. Centralizing tokens, personas, or transcripts in SQLite would either bloat the relational core with large or operator-readable state, or force cross-module reaches that the [`repo-layout.md`](./repo-layout.md) §3 module-ownership table explicitly forbids.

Phase 4 (RBAC + audit logging — see [`prd/07-phasing.md`](../prd/07-phasing.md)) is the natural trigger to revisit whether tokens move into SQLite: once tokens need `device_id`, `expires_at`, `last_used_at`, and an audit-log join, the JSON file stops paying its way.

---

## 2. Transcript storage: sidecar files, not BLOBs

Transcripts are stored as **append-only binary files at `~/.relay/transcripts/<session-id>.bin`**, one file per session. The `sessions` row carries a `total_bytes` counter that the pagination API (`GET /sessions/:id/transcript?before=<offset>&limit=<n>`, [ND-04](../open-questions.md#nd-04-transcript-pagination-api-shape)) uses as the upper bound; no `transcript_spans` or BLOB column exists.

Three reasons:

1. **Append-only writes match a flat-file primitive.** PTY-layer capture ([D-07](../open-questions.md#d-07-transcript-stream-capture-layer)) gives Relay a raw byte stream that grows for the session's lifetime. A multi-hour session can produce hundreds of megabytes. A single `O_APPEND` write is one syscall and one filesystem-page flush; the equivalent against a SQLite BLOB column means reading the existing blob, concatenating, and rewriting — quadratic in the worst case, and `better-sqlite3` does not expose incremental BLOB I/O cleanly. A flat file is the right shape for the access pattern.
2. **Byte offsets are the natural addressable unit.** [ND-04](../open-questions.md#nd-04-transcript-pagination-api-shape) rule 1 commits to byte-range pagination with stable offsets for the session's lifetime ([ND-04](../open-questions.md#nd-04-transcript-pagination-api-shape) rule 6). A `pread(fd, buf, len, offset)` against the sidecar file maps to the API one-to-one; a `transcript_spans` indirection would buy nothing because there is nothing to index *into* the stream beyond what `total_bytes` already conveys.
3. **Backup posture is unchanged.** [`prd/06-distribution.md`](../prd/06-distribution.md) already names `~/.relay/` as the backup unit. Sidecar files keep transcripts inside that boundary without bloating `state.db`; a `tar czf` of `~/.relay/` captures the schema, the personas, the tokens, and the transcripts in one pass.

The ring buffer used for on-attach replay ([`prd/03-server.md`](../prd/03-server.md) §5.2, [ND-03](../open-questions.md#nd-03-ring-buffer-size-for-attach-replay)) is an **in-memory** structure held by the session-coordinator module ([`repo-layout.md`](./repo-layout.md) §3 `session/`), not a DB or file artifact. The sidecar file is the source of truth; the ring buffer is a recent-bytes cache.

---

## 3. DDL

All identifiers use lowercase `snake_case` to match SQLite convention. ULIDs are stored as 26-character TEXT (Crockford-Base32); the on-the-wire JSON representation is the same string. Timestamps are stored as INTEGER unix-milliseconds — sortable, byte-cheap, and unambiguous across time zones; the WS/REST surface converts to ISO-8601 strings ([`arch/ws-protocol.md`](./ws-protocol.md) §1 conventions) at the boundary, not in the database.

### 3.1 `tenants`

```sql
CREATE TABLE tenants (
  id         TEXT PRIMARY KEY,                                    -- ULID; D-12 commits to ULIDs for entity IDs
  created_at INTEGER NOT NULL                                     -- unix millis
) STRICT;
```

Single tenant at MVP; the table exists so the foreign-key seam to `projects.tenant_id` is in place for Phase 4 multi-tenant without a migration ([`prd/01-conceptual-model.md`](../prd/01-conceptual-model.md): "Single tenant at MVP, hidden from the user. The seam exists for later multi-user without data migration.").

### 3.2 `projects`

```sql
CREATE TABLE projects (
  id             TEXT PRIMARY KEY,                                -- ULID; D-12 rule 4
  tenant_id      TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  slug           TEXT NOT NULL,                                   -- kebab-case; D-12 rule 3
  display_name   TEXT NOT NULL,                                   -- defaults to canonical_path basename; D-12 rule 3
  canonical_path TEXT NOT NULL,                                   -- realpath result; D-12 rule 2
  agent_cli      TEXT NOT NULL DEFAULT 'claude',                  -- D-12 rule 5
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,

  UNIQUE (tenant_id, slug),                                       -- D-12 rule 3: "unique per tenant"
  UNIQUE (tenant_id, canonical_path)                              -- D-12 rule 2: re-registration is 409 Conflict
) STRICT;
```

Column shape is verbatim from [D-12](../open-questions.md#d-12-project-record-storage-and-relay-project-add-semantics) rule 5 and [`prd/03-server.md`](../prd/03-server.md) §3. The two UNIQUE constraints are the database-level enforcement of [D-12](../open-questions.md#d-12-project-record-storage-and-relay-project-add-semantics) rule 2 ("Re-registering the same canonical path is an error (`409 Conflict`); registering a different path that resolves to the same canonical form is also an error") and rule 3 (slug uniqueness per tenant). Persona overrides, skill lists, and MCP entries are deliberately absent — they live on disk per [D-09](../open-questions.md#d-09-persona-yaml-schema).

### 3.3 `sessions`

```sql
CREATE TABLE sessions (
  id                TEXT PRIMARY KEY,                             -- ULID
  project_id        TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  persona_name      TEXT NOT NULL,                                -- snapshot of persona name at spawn; not an FK (D-09)
  agent_cli         TEXT NOT NULL,                                -- snapshot at spawn; immutable per 01-conceptual-model.md
  agent_session_id  TEXT,                                         -- agent's own session UUID; nullable until agent emits it
  pty_pid           INTEGER,                                      -- node-pty child PID; NULL once killed (01-conceptual-model.md:20)
  status            TEXT NOT NULL CHECK (status IN ('running','idle','killed')),
  terminated_reason TEXT,                                         -- string enum; populated when status -> killed (D-11)
  total_bytes       INTEGER NOT NULL DEFAULT 0,                   -- running count of bytes in ~/.relay/transcripts/<id>.bin (ND-04); eventually consistent within ≤1 s on a live session (ND-13)
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,

  CHECK (
    (status = 'running' AND terminated_reason IS NULL)
    OR (status IN ('idle','killed'))
  )
) STRICT;
```

Column shape comes from [`prd/01-conceptual-model.md`](../prd/01-conceptual-model.md) lines 18-22 plus [D-11](../open-questions.md#d-11-server-restart-and-session-orphaning) (the `terminated_reason` column and its lifecycle). Two notes:

- **`persona_name` is a TEXT snapshot, not a foreign key.** Personas are YAML files on disk ([D-09](../open-questions.md#d-09-persona-yaml-schema)); a session captures the name at spawn time so the row remains coherent if the operator later deletes or renames the persona file. The on-disk YAML can be re-loaded for inspection, but a missing file is not a referential-integrity violation — it's a historical observation.
- **`terminated_reason` is a free-form TEXT, not an enum table.** Documented values: `server_restart` ([D-11](../open-questions.md#d-11-server-restart-and-session-orphaning) rule 1), `operator_kill` ([`prd/03-server.md`](../prd/03-server.md) §7 `relay session kill`), `agent_exit` (PTY child exited on its own; the `exitCode` rides on the `session_ended` WS frame per [`arch/ws-protocol.md`](./ws-protocol.md) §2.3 but is not persisted to the row at MVP). New reasons are added by writing the string; no schema change.

The compound CHECK constraint ensures `terminated_reason` is NULL while a session is live and is *available* (not mandatory — agent crash paths may set it later) once terminal. It enforces the invariant cheaply at insert/update time.

### 3.4 `schema_versions`

```sql
CREATE TABLE schema_versions (
  version    INTEGER PRIMARY KEY,                                 -- the NNNN from migration filename
  name       TEXT NOT NULL,                                       -- short_description from migration filename
  applied_at INTEGER NOT NULL                                     -- unix millis
) STRICT;
```

The migration runner consults this table on boot; see §6.

### 3.5 Why `STRICT` tables

SQLite's [STRICT mode](https://www.sqlite.org/stricttables.html) enforces declared column types instead of SQLite's default type-affinity coercion (which would, for example, silently accept the string `"abc"` into an INTEGER column). The whole schema is small enough that the modest verbosity is worth the type discipline; `better-sqlite3` supports STRICT natively.

---

## 4. Indexes

The primary keys above give SQLite an automatic index on `id` for each table. The UNIQUE constraints on `projects` give automatic composite indexes on `(tenant_id, slug)` and `(tenant_id, canonical_path)`. The additional indexes below cover the two query shapes the entity graph implies — session listing and the boot-time orphan sweep — and one ordering shape the CLI surfaces.

```sql
CREATE INDEX sessions_project_status ON sessions (project_id, status);
CREATE INDEX sessions_status         ON sessions (status);
CREATE INDEX sessions_created_at     ON sessions (created_at DESC);
```

- **`sessions_project_status`** — supports `GET /sessions?project=<id>&status=<s>`, the default UI query when the user opens a project. Composite because `project_id` is the always-present filter and `status` is the secondary filter.
- **`sessions_status`** — supports the boot-time sweep that [D-11](../open-questions.md#d-11-server-restart-and-session-orphaning) rule 1 requires: `UPDATE sessions SET status = 'killed', terminated_reason = 'server_restart' WHERE status = 'running'`. Single-column because the sweep is global, not per-project.
- **`sessions_created_at`** — supports `relay session list` ordering and any future "recent sessions" view ([`prd/03-server.md`](../prd/03-server.md) §7).

No indexes are added on `projects` beyond the UNIQUE constraints; the table is small (≤ a few dozen rows in practice) and the existing composites cover lookups by slug and by canonical path.

---

## 5. Foreign keys and cascade rules

`PRAGMA foreign_keys = ON` is set per-connection by the `store/` module on open; SQLite enforces foreign keys only when this pragma is active. Three rules govern the entity graph:

- **`projects.tenant_id` → `tenants.id` ON DELETE RESTRICT.** No tenant-deletion path exists at MVP — there is one tenant, hidden from the UI. RESTRICT makes any attempted tenant delete a programming error rather than a silent cascade through the entire database.
- **`sessions.project_id` → `projects.id` ON DELETE CASCADE.** [D-12](../open-questions.md#d-12-project-record-storage-and-relay-project-add-semantics) rule 7 and [`prd/03-server.md`](../prd/03-server.md) §7 are explicit: `relay project remove` deletes the project row "and any session rows scoped to it." The same `prd/03-server.md` line is also explicit about what is *not* deleted — "the working directory or the on-disk marker file" — which is a filesystem concern, not a database one. The CASCADE handles only the SQLite half; the on-disk transcript files at `~/.relay/transcripts/<id>.bin` are reaped by the `transcript/` module on session row delete (a separate-from-DB cleanup pass on `sessions` row CASCADE, implementation detail of `store/` × `transcript/` integration — not specified here).
- **`sessions.persona_name`** is a string, not an FK. Persona file deletion does not orphan a session row; the row keeps the historical name. The persona file may be missing when the row is read; that's accepted.

---

## 6. Migration tooling

### 6.1 Convention

Migration files live at `packages/server/src/store/migrations/NNNN_short_description.sql`.

- `NNNN` is a zero-padded 4-digit sequence number starting at `0001`. Numbers are issued sequentially; gaps are not allowed.
- `short_description` is lowercase `snake_case`, ≤ 40 characters, describing what the migration adds or changes. Examples: `0001_initial_schema.sql`, `0017_add_sessions_terminated_reason.sql`.
- Files are **forward-only at MVP** — no `down.sql` counterpart. Rolling back a botched migration means writing the next migration. This matches the deployment model (single self-hosted server per user; no fleet to coordinate) and keeps the runner trivial.

### 6.2 Runner contract

The runner is a small TypeScript module inside `packages/server/src/store/` that runs on server boot, before any query handlers register:

1. Open the database with `better-sqlite3`. Enable `PRAGMA foreign_keys = ON` and `PRAGMA journal_mode = WAL`.
2. Ensure `schema_versions` exists (create it if absent — this is the only DDL the runner emits outside of migration files).
3. Read `MAX(version)` from `schema_versions`. Call it `current`.
4. List `*.sql` files in `migrations/`. Parse `NNNN` from each filename. Reject the boot if any are non-sequential or duplicate.
5. For each file with `NNNN > current`, in ascending order: open a transaction, execute the file's contents as one or more SQL statements, and commit. If the file is rejected by SQLite, the transaction rolls back and boot fails with the offending file path and the SQLite error message.
6. The final statement of each migration body is `INSERT INTO schema_versions (version, name, applied_at) VALUES (NNNN, '<name>', <unix_millis>)` — so the version write is inside the migration's own transaction.

The runner is forward-only and idempotent: re-running it after a clean boot is a no-op because every migration's `NNNN` is already `≤ current`.

### 6.3 Example: `0001_initial_schema.sql`

```sql
-- 0001_initial_schema.sql
-- Initial Relay schema: tenants, projects, sessions, schema_versions.
-- Closes build-plan task 2C.

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
```

The `sqlite-migration` skill (build-plan task 3F) scaffolds new migrations against exactly this convention — it computes the next `NNNN`, writes the stub file with the trailing `INSERT INTO schema_versions ...` already filled in, and lets the contributor fill in the body.

### 6.4 Why not a library

`umzug` and similar tools add a programmatic API for what is, at this scope, "apply SQL files in order with one bookkeeping row each." The runner above is ~60 lines of TypeScript with one external dependency (`better-sqlite3`, already picked by [`repo-layout.md`](./repo-layout.md) §8). Adding `umzug` would mean a new dependency, a new programmatic surface for the `sqlite-migration` skill to learn, and rollback semantics ("down" migrations) that the MVP deployment model doesn't need. The library option becomes attractive later if Relay grows multi-database tenancy or per-environment schema drift — neither is on the [Phase 1-4 roadmap](../prd/07-phasing.md).

---

## 7. Server-boot sequence (the schema's runtime contract)

The schema is consumed in a specific order at `relay server` boot. Calling it out so the `store/` module implementation has a single contract to satisfy:

1. Open `~/.relay/state.db` via `better-sqlite3`. Enable `foreign_keys` and `journal_mode = WAL` pragmas.
2. Run the migration runner (§6.2). After this returns successfully, the schema is at the latest version on disk.
3. Run the orphan sweep that [D-11](../open-questions.md#d-11-server-restart-and-session-orphaning) requires:

   ```sql
   UPDATE sessions
     SET status = 'killed',
         terminated_reason = 'server_restart',
         updated_at = ?
     WHERE status = 'running';
   ```

   The PTYs those rows referenced are already dead — the server is starting fresh. This sweep is the database-level half of [D-11](../open-questions.md#d-11-server-restart-and-session-orphaning) rule 1; the session-coordinator module ([`repo-layout.md`](./repo-layout.md) §3 `session/`) does not need to re-do it.
4. Ensure the singleton tenant row exists (idempotent `INSERT OR IGNORE INTO tenants ...`). The tenant ID is read once into process memory and used as the `tenant_id` foreign key on every `projects` insert until Phase 4 multi-tenant arrives.
5. Hand control to the REST + WS layers.

The boot sequence is the only place outside migration files where the schema is mutated by the server itself.

---

## 8. Open follow-ons

None expected. The schema is small and the PRD already constrained most decisions; this doc closes the remaining gaps. If new entities surface during implementation — for example, an audit-log table when Phase 4 lands, or a `tokens` table if [D-13](../open-questions.md#d-13-first-run-pairing-ux) rule 5 is revisited — they are added via a new migration file plus an amendment to this doc, not by writing a new arch doc.
