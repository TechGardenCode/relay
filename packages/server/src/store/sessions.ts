import { ulid } from './db.js';
import type { Database } from './db.js';

export type SessionStatus = 'running' | 'idle' | 'killed';

// Per D-11 + sqlite-schema.md §3.3: the column is free-form TEXT; these
// are the documented values. New reasons are added by writing the string;
// no schema change.
export type TerminatedReason = 'server_restart' | 'operator_kill' | 'agent_exit';

export interface SessionRow {
  id: string;
  projectId: string;
  personaName: string;
  agentCli: string;
  agentSessionId: string | null;
  ptyPid: number | null;
  status: SessionStatus;
  terminatedReason: string | null;
  totalBytes: number;
  createdAt: number;
  updatedAt: number;
}

export interface SessionInsertInput {
  projectId: string;
  personaName: string;
  agentCli: string;
}

interface SessionDbRow {
  id: string;
  project_id: string;
  persona_name: string;
  agent_cli: string;
  agent_session_id: string | null;
  pty_pid: number | null;
  status: SessionStatus;
  terminated_reason: string | null;
  total_bytes: number;
  created_at: number;
  updated_at: number;
}

const SELECT_COLUMNS =
  'id, project_id, persona_name, agent_cli, agent_session_id, pty_pid, status, terminated_reason, total_bytes, created_at, updated_at';

function mapRow(row: SessionDbRow): SessionRow {
  return {
    id: row.id,
    projectId: row.project_id,
    personaName: row.persona_name,
    agentCli: row.agent_cli,
    agentSessionId: row.agent_session_id,
    ptyPid: row.pty_pid,
    status: row.status,
    terminatedReason: row.terminated_reason,
    totalBytes: row.total_bytes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// New sessions start as 'running' with NULL terminated_reason; the
// compound CHECK in §3.3 enforces this invariant.
export function insert(db: Database, input: SessionInsertInput, now: number): SessionRow {
  const id = ulid();
  db.prepare<[string, string, string, string, number, number]>(
    `INSERT INTO sessions (id, project_id, persona_name, agent_cli, status, terminated_reason, total_bytes, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'running', NULL, 0, ?, ?)`,
  ).run(id, input.projectId, input.personaName, input.agentCli, now, now);

  const row = db
    .prepare<[string], SessionDbRow>(`SELECT ${SELECT_COLUMNS} FROM sessions WHERE id = ?`)
    .get(id);
  if (row === undefined) {
    throw new Error(`sessions.insert: row vanished after INSERT for id=${id}`);
  }
  return mapRow(row);
}

export function findById(db: Database, id: string): SessionRow | undefined {
  const row = db
    .prepare<[string], SessionDbRow>(`SELECT ${SELECT_COLUMNS} FROM sessions WHERE id = ?`)
    .get(id);
  return row === undefined ? undefined : mapRow(row);
}

export function listByProject(
  db: Database,
  projectId: string,
  status?: SessionStatus,
): SessionRow[] {
  if (status === undefined) {
    const rows = db
      .prepare<
        [string],
        SessionDbRow
      >(`SELECT ${SELECT_COLUMNS} FROM sessions WHERE project_id = ? ORDER BY created_at DESC`)
      .all(projectId);
    return rows.map(mapRow);
  }
  const rows = db
    .prepare<
      [string, SessionStatus],
      SessionDbRow
    >(`SELECT ${SELECT_COLUMNS} FROM sessions WHERE project_id = ? AND status = ? ORDER BY created_at DESC`)
    .all(projectId, status);
  return rows.map(mapRow);
}

export function listByStatus(db: Database, status: SessionStatus): SessionRow[] {
  const rows = db
    .prepare<
      [SessionStatus],
      SessionDbRow
    >(`SELECT ${SELECT_COLUMNS} FROM sessions WHERE status = ? ORDER BY created_at DESC`)
    .all(status);
  return rows.map(mapRow);
}

export function markKilled(
  db: Database,
  id: string,
  reason: string,
  now: number,
): { updated: boolean } {
  const info = db
    .prepare<
      [string, number, string]
    >(`UPDATE sessions SET status = 'killed', terminated_reason = ?, updated_at = ? WHERE id = ?`)
    .run(reason, now, id);
  return { updated: info.changes > 0 };
}

// Per D-11 rule 1: the boot orphan sweep is the ONLY writer of
// terminated_reason = 'server_restart'. The SQL lives here next to the
// table; the call site is owned by 6E (session/) at server boot.
export function markRunningAsKilled(
  db: Database,
  reason: 'server_restart',
  now: number,
): { affected: number } {
  const info = db
    .prepare<
      [string, number]
    >(`UPDATE sessions SET status = 'killed', terminated_reason = ?, updated_at = ? WHERE status = 'running'`)
    .run(reason, now);
  return { affected: info.changes };
}

export function updateAgentSessionId(
  db: Database,
  id: string,
  agentSessionId: string,
  now: number,
): void {
  db.prepare<[string, number, string]>(
    'UPDATE sessions SET agent_session_id = ?, updated_at = ? WHERE id = ?',
  ).run(agentSessionId, now, id);
}

// Called by session/registry once the PTY supervisor has spawned the child
// process and reported its OS pid. The column is nullable because the row
// is inserted before spawn (so a spawn-failure path leaves it NULL); a live
// `running` session always has a non-NULL pid after this call lands.
// Operators use `relay session show <id>` to read the pid for ad-hoc
// `kill -9` recovery when the supervisor itself becomes unreachable.
export function updatePtyPid(db: Database, id: string, ptyPid: number, now: number): void {
  db.prepare<[number, number, string]>(
    'UPDATE sessions SET pty_pid = ?, updated_at = ? WHERE id = ?',
  ).run(ptyPid, now, id);
}

// Per ND-04: total_bytes is the running upper bound used by the transcript
// pagination API. Callers in the transcript/ module pass the delta each
// time bytes are appended to the sidecar file.
export function incrementTotalBytes(db: Database, id: string, delta: number, now: number): void {
  db.prepare<[number, number, string]>(
    'UPDATE sessions SET total_bytes = total_bytes + ?, updated_at = ? WHERE id = ?',
  ).run(delta, now, id);
}
