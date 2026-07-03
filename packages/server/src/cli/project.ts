// `relay project {add,list,remove}` handlers.
//
// Per the ND-16 proposal:
// - `list` reads SQLite directly so `relay server` does not need to be
//   running for inspection.
// - `add` and `remove` hit the running server's REST API, because the
//   canonicalization, marker-file write, gitignore-append, and CASCADE-aware
//   delete all live in 6F's `POST /projects` / `DELETE /projects/:id` and
//   should not be duplicated.

import { dbPath } from '../config/paths.js';
import { openDatabase, projects, tenants } from '../store/index.js';
import type { Project, ProjectListResponse } from '@techgardencode/protocol';

import { buildCliHttpClient } from './http.js';

export interface ProjectCliOptions {
  homeOverride?: string;
}

export interface ProjectAddInput {
  path: string;
  name?: string;
  slug?: string;
  agentCli?: string;
}

export async function runProjectAdd(
  input: ProjectAddInput,
  opts: ProjectCliOptions = {},
): Promise<Project> {
  const http = buildCliHttpClient({ homeOverride: opts.homeOverride });
  return http.request<Project>('POST', '/projects', {
    path: input.path,
    displayName: input.name,
    slug: input.slug,
    agentCli: input.agentCli,
  });
}

export interface ProjectListRow {
  id: string;
  slug: string;
  displayName: string;
  canonicalPath: string;
}

export function runProjectList(opts: ProjectCliOptions = {}): ProjectListRow[] {
  // Direct read against ~/.relay/relay.db. Works whether or not the server
  // is running; the project rows are owned by the store and 6F is just a
  // veneer.
  const db = openDatabase({ filename: dbPath(opts.homeOverride) });
  try {
    const tenant = tenants.ensureSingleton(db, Date.now());
    return projects.listByTenant(db, tenant.id).map((row) => ({
      id: row.id,
      slug: row.slug,
      displayName: row.displayName,
      canonicalPath: row.canonicalPath,
    }));
  } finally {
    db.close();
  }
}

export async function runProjectRemove(id: string, opts: ProjectCliOptions = {}): Promise<void> {
  const http = buildCliHttpClient({ homeOverride: opts.homeOverride });
  await http.send('DELETE', `/projects/${id}`);
}

// Re-export for tests that want to assert the wire shape directly.
export type { ProjectListResponse };
