// `relay session {list,kill,show}` handlers.
//
// Per the ND-16 proposal:
// - `list` and `show` read SQLite directly. Phase 1 list/show fields are all
//   persisted columns — no in-memory state.
// - `kill` cannot go direct: terminating a running PTY supervisor requires
//   the long-lived `relay server` process (the registry only lives there).
//   We hit `DELETE /sessions/:id` over loopback. Direct-DB would mark the
//   row killed but orphan the child until the next boot orphan sweep
//   (D-11), which is a correctness violation.

import { dbPath } from '../config/paths.js';
import {
  openDatabase,
  sessions as sessionsRepo,
  type SessionRow,
  type SessionStatus,
} from '../store/index.js';

import { buildCliHttpClient } from './http.js';

export interface SessionCliOptions {
  homeOverride?: string;
}

export interface SessionListInput {
  status?: 'running' | 'idle' | 'killed' | 'all';
  projectId?: string;
}

export interface SessionListRow {
  id: string;
  projectId: string;
  personaName: string;
  status: SessionStatus;
  terminatedReason: string | null;
  totalBytes: number;
  agentSessionId: string | null;
  ptyPid: number | null;
  createdAt: string;
  updatedAt: string;
}

function toViewRow(row: SessionRow): SessionListRow {
  return {
    id: row.id,
    projectId: row.projectId,
    personaName: row.personaName,
    status: row.status,
    terminatedReason: row.terminatedReason,
    totalBytes: row.totalBytes,
    agentSessionId: row.agentSessionId,
    ptyPid: row.ptyPid,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

export function runSessionList(
  input: SessionListInput = {},
  opts: SessionCliOptions = {},
): SessionListRow[] {
  const db = openDatabase({ filename: dbPath(opts.homeOverride) });
  try {
    // Per D-11 and 6F's GET /sessions: default is `running` only.
    const status = input.status ?? 'running';
    let rows: SessionRow[];
    if (status === 'all') {
      rows = [];
      for (const s of ['running', 'idle', 'killed'] as const) {
        rows.push(...sessionsRepo.listByStatus(db, s));
      }
    } else {
      rows = sessionsRepo.listByStatus(db, status);
    }
    if (input.projectId !== undefined) {
      rows = rows.filter((r) => r.projectId === input.projectId);
    }
    return rows.map(toViewRow);
  } finally {
    db.close();
  }
}

export function runSessionShow(
  id: string,
  opts: SessionCliOptions = {},
): SessionListRow | undefined {
  const db = openDatabase({ filename: dbPath(opts.homeOverride) });
  try {
    const row = sessionsRepo.findById(db, id);
    return row === undefined ? undefined : toViewRow(row);
  } finally {
    db.close();
  }
}

export async function runSessionKill(
  id: string,
  opts: SessionCliOptions = {},
): Promise<{ killed: boolean }> {
  // Per D-11 the REST DELETE is idempotent — re-deleting a killed row is 204.
  // We treat 204 as a successful kill regardless of whether the registry had
  // the row in memory; the row state is what the operator sees from `list`.
  const http = buildCliHttpClient({ homeOverride: opts.homeOverride });
  await http.send('DELETE', `/sessions/${id}`);
  return { killed: true };
}
