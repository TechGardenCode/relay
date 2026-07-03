import { Project, Session } from '@techgardencode/protocol';
import { describe, expect, it, vi } from 'vitest';

import { RestClient } from './rest-client.service';
import { SessionsService } from './sessions.service';

const T = 1_700_000_000_000; // fixed "now" for deterministic ND-43 freshness

function session(over: Partial<Session>): Session {
  return {
    id: 's1',
    projectId: 'p1',
    agentCli: 'claude',
    agentSessionId: null,
    ptyPid: 123,
    status: 'running',
    terminatedReason: null,
    totalBytes: 0,
    createdAt: new Date(T).toISOString(),
    updatedAt: new Date(T).toISOString(),
    ...over,
  };
}

function project(over: Partial<Project>): Project {
  return {
    id: 'p1',
    tenantId: 't1',
    slug: 'demo',
    displayName: 'Demo',
    canonicalPath: '/Users/me/demo',
    agentCli: 'claude',
    createdAt: new Date(T).toISOString(),
    updatedAt: new Date(T).toISOString(),
    ...over,
  };
}

function fakeRest(sessions: Session[], projects: Project[]) {
  return {
    get: vi.fn((path: string) =>
      Promise.resolve(path === '/sessions' ? { items: sessions } : { items: projects }),
    ),
    post: vi.fn(() => Promise.resolve({ body: session({ id: 'new' }), location: '/sessions/new' })),
    del: vi.fn(() => Promise.resolve()),
  } as unknown as RestClient;
}

describe('SessionsService', () => {
  it('refresh() populates sessions and projects from the list responses', async () => {
    const svc = new SessionsService(fakeRest([session({ id: 'a' })], [project({})]));
    svc._setClock(() => T);
    await svc.refresh();
    expect(svc.sessions().map((s) => s.id)).toEqual(['a']);
    expect(svc.projects().map((p) => p.id)).toEqual(['p1']);
  });

  it('derives running when updatedAt is fresh, idle when stale (ND-43 stopgap)', async () => {
    const fresh = session({ id: 'fresh', updatedAt: new Date(T - 5_000).toISOString() });
    const stale = session({ id: 'stale', updatedAt: new Date(T - 20_000).toISOString() });
    const svc = new SessionsService(fakeRest([fresh, stale], [project({})]));
    svc._setClock(() => T);
    await svc.refresh();
    const byId = Object.fromEntries(svc.sessions().map((s) => [s.id, s.derivedStatus]));
    expect(byId['fresh']).toBe('running');
    expect(byId['stale']).toBe('idle');
  });

  it('a killed session is never derived as running', async () => {
    const killed = session({ id: 'k', status: 'killed', updatedAt: new Date(T).toISOString() });
    const svc = new SessionsService(fakeRest([killed], [project({})]));
    svc._setClock(() => T);
    await svc.refresh();
    expect(svc.sessions()[0].derivedStatus).toBe('idle');
  });

  it('partitions Projects vs Scratch groups by canonical path (~/.relay/scratch/)', async () => {
    const proj = project({ id: 'p1', canonicalPath: '/Users/me/demo' });
    const scratchProj = project({ id: 'p2', canonicalPath: '/Users/me/.relay/scratch/abc' });
    const svc = new SessionsService(
      fakeRest(
        [session({ id: 's1', projectId: 'p1' }), session({ id: 's2', projectId: 'p2' })],
        [proj, scratchProj],
      ),
    );
    svc._setClock(() => T);
    await svc.refresh();
    const g = svc.groups();
    expect(g.projects.map((x) => x.project.id)).toEqual(['p1']);
    expect(g.projects[0].sessions.map((s) => s.id)).toEqual(['s1']);
    expect(g.scratch.map((s) => s.id)).toEqual(['s2']);
  });

  it('create() POSTs { projectId } and returns the created session (FR-8)', async () => {
    const rest = fakeRest([], [project({})]);
    const svc = new SessionsService(rest);
    svc._setClock(() => T);
    const created = await svc.create('p1');
    expect(rest.post).toHaveBeenCalledWith('/sessions', { projectId: 'p1' });
    expect(created.id).toBe('new');
  });

  it('kill() DELETEs /sessions/:id (FR-11)', async () => {
    const rest = fakeRest([], []);
    const svc = new SessionsService(rest);
    svc._setClock(() => T);
    await svc.kill('s9');
    expect(rest.del).toHaveBeenCalledWith('/sessions/s9');
  });
});
