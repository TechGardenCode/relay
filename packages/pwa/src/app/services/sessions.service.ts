import { Injectable, Signal, computed, signal } from '@angular/core';
import { Project, ProjectListResponse, Session, SessionListResponse } from '@relay/protocol';

import { RestClient, RestError } from './rest-client.service';

export type DerivedStatus = 'running' | 'idle';

export interface SessionRow extends Session {
  derivedStatus: DerivedStatus;
}

export interface ProjectGroup {
  project: Project;
  sessions: SessionRow[];
}

export interface SessionGroups {
  projects: ProjectGroup[];
  scratch: SessionRow[];
}

// Per ND-43 (STOPGAP): the server has no running/idle field yet. Derive it
// client-side from updatedAt freshness (interaction-model.md §5: quiet ⇒ idle).
// PREREQ (ND-13): confirm the byte-accounting cadence bumps updatedAt within a
// poll interval; if it lags, switch to totalBytes deltas across polls. Revisit
// when ND-43 lands a real server status field.
const IDLE_AFTER_MS = 10_000;

// Per feature-modules.md §3: "Scratch" grouping is a client-side IA concern —
// partition by whether the owning project's canonical path sits under the
// scratch prefix. Create-by-path is deferred (ND-41), so scratch is normally
// empty at MVP; the group is still rendered.
const SCRATCH_PATH_SEGMENT = '/.relay/scratch/';

@Injectable({ providedIn: 'root' })
export class SessionsService {
  private readonly _sessions = signal<SessionRow[]>([]);
  private readonly _projects = signal<Project[]>([]);
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  // Test seam: overridable clock so ND-43 freshness is deterministic in specs.
  private clock: () => number = () => Date.now();

  readonly sessions = this._sessions.asReadonly();
  readonly projects = this._projects.asReadonly();
  readonly groups: Signal<SessionGroups> = computed(() =>
    this.partition(this._sessions(), this._projects()),
  );

  constructor(private readonly rest: RestClient) {}

  async refresh(): Promise<void> {
    // Per feature-modules.md §3: the home holds no session socket; it polls
    // GET /sessions (+ /projects for the grouping) on a client cadence (ND-37).
    const [sessions, projects] = await Promise.all([
      this.rest.get<SessionListResponse>('/sessions'),
      this.rest.get<ProjectListResponse>('/projects'),
    ]);
    this._projects.set(projects.items);
    this._sessions.set(sessions.items.map((s) => this.derive(s)));
  }

  startPolling(intervalMs = 5000): void {
    if (this.pollTimer !== null) return;
    void this.poll();
    this.pollTimer = setInterval(() => void this.poll(), intervalMs);
  }

  stopPolling(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  // Poll wrapper: refresh() rejects on any non-ok response, and a fire-and-forget
  // `void refresh()` would surface that as an unhandled rejection every tick. Catch
  // it here; on a 401 the bearer is already cleared by RestClient, so stop polling
  // (the home routes to /pair via pairStatus). Transient errors keep polling.
  private async poll(): Promise<void> {
    try {
      await this.refresh();
    } catch (e) {
      if (e instanceof RestError && e.status === 401) this.stopPolling();
    }
  }

  // Per feature-modules.md §5 + FR-8: POST /sessions { projectId } → 201.
  async create(projectId: string): Promise<Session> {
    const { body } = await this.rest.post<Session>('/sessions', { projectId });
    void this.refresh();
    return body;
  }

  // Per feature-modules.md §4.6 + FR-11: DELETE /sessions/:id → 204, idempotent.
  async kill(id: string): Promise<void> {
    await this.rest.del(`/sessions/${id}`);
    void this.refresh();
  }

  /** @internal test seam — override the clock used for ND-43 freshness. */
  _setClock(fn: () => number): void {
    this.clock = fn;
  }

  private derive(s: Session): SessionRow {
    const fresh = this.clock() - Date.parse(s.updatedAt) < IDLE_AFTER_MS;
    return { ...s, derivedStatus: s.status === 'running' && fresh ? 'running' : 'idle' };
  }

  private partition(sessions: SessionRow[], projects: Project[]): SessionGroups {
    const byProject = new Map<string, SessionRow[]>();
    for (const s of sessions) {
      const arr = byProject.get(s.projectId) ?? [];
      arr.push(s);
      byProject.set(s.projectId, arr);
    }
    const scratch: SessionRow[] = [];
    const projectGroups: ProjectGroup[] = [];
    const known = new Set(projects.map((p) => p.id));
    for (const p of projects) {
      const rows = byProject.get(p.id) ?? [];
      if (p.canonicalPath.includes(SCRATCH_PATH_SEGMENT)) scratch.push(...rows);
      else projectGroups.push({ project: p, sessions: rows });
    }
    // A session whose project is absent from /projects (partial/racing response)
    // must NOT vanish from home — surface it under Scratch (catch-all) so it stays
    // openable/killable.
    for (const s of sessions) {
      if (!known.has(s.projectId)) scratch.push(s);
    }
    return { projects: projectGroups, scratch };
  }
}
