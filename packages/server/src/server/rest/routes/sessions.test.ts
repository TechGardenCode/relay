import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createFakeSupervisor } from '../../../session/test-fakes.js';
import { makeTestRig, type TestRig } from '../test-helpers.js';

describe('routes/sessions', () => {
  let rig: TestRig;
  let workspaces: string[];

  beforeEach(async () => {
    rig = await makeTestRig({
      registryDeps: {
        agentCli: 'cat',
        supervisorFactory: createFakeSupervisor,
        agentSessionIdCapture: async () => null,
      },
    });
    workspaces = [];
  });

  afterEach(async () => {
    await rig.cleanup();
    for (const w of workspaces) rmSync(w, { recursive: true, force: true });
  });

  function workspace(): string {
    const dir = mkdtempSync(join(tmpdir(), 'relay-rest-session-'));
    workspaces.push(dir);
    return realpathSync(dir);
  }

  async function createProject(): Promise<{ id: string; canonicalPath: string }> {
    const ws = workspace();
    const res = await rig.app.inject({
      method: 'POST',
      url: '/projects',
      headers: { Authorization: rig.authHeader },
      payload: { path: ws },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { id: string; canonicalPath: string };
    return body;
  }

  it('POST /sessions creates a session and returns 201 + Location + the row', async () => {
    const project = await createProject();

    const res = await rig.app.inject({
      method: 'POST',
      url: '/sessions',
      headers: { Authorization: rig.authHeader },
      payload: { projectId: project.id },
    });
    expect(res.statusCode).toBe(201);
    expect(res.headers.location).toMatch(/^\/sessions\//);
    const body = res.json() as {
      id: string;
      projectId: string;
      status: string;
      totalBytes: number;
    };
    expect(body.projectId).toBe(project.id);
    expect(body.status).toBe('running');
    expect(body.totalBytes).toBe(0);
  });

  it('POST /sessions with unknown projectId → 404 project-not-found', async () => {
    const res = await rig.app.inject({
      method: 'POST',
      url: '/sessions',
      headers: { Authorization: rig.authHeader },
      payload: { projectId: '01J0000000000000000UNKNOWN' },
    });
    expect(res.statusCode).toBe(404);
    const body = res.json() as { type: string };
    expect(body.type).toMatch(/errors\/project-not-found/);
  });

  it('GET /sessions defaults to ?status=running (per D-11)', async () => {
    const project = await createProject();
    await rig.app.inject({
      method: 'POST',
      url: '/sessions',
      headers: { Authorization: rig.authHeader },
      payload: { projectId: project.id },
    });

    const res = await rig.app.inject({
      method: 'GET',
      url: '/sessions',
      headers: { Authorization: rig.authHeader },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: Array<{ status: string }> };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.status).toBe('running');
  });

  it('GET /sessions?status=killed filters to terminated sessions', async () => {
    const project = await createProject();
    const created = await rig.app.inject({
      method: 'POST',
      url: '/sessions',
      headers: { Authorization: rig.authHeader },
      payload: { projectId: project.id },
    });
    const sid = (created.json() as { id: string }).id;

    // Kill the session via DELETE (per D-11 contract).
    const del = await rig.app.inject({
      method: 'DELETE',
      url: `/sessions/${sid}`,
      headers: { Authorization: rig.authHeader },
    });
    expect(del.statusCode).toBe(204);

    const runningOnly = await rig.app.inject({
      method: 'GET',
      url: '/sessions?status=running',
      headers: { Authorization: rig.authHeader },
    });
    expect((runningOnly.json() as { items: unknown[] }).items).toEqual([]);

    const killed = await rig.app.inject({
      method: 'GET',
      url: '/sessions?status=killed',
      headers: { Authorization: rig.authHeader },
    });
    const body = killed.json() as { items: Array<{ status: string; terminatedReason: string }> };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.status).toBe('killed');
    expect(body.items[0]?.terminatedReason).toBe('operator_kill');
  });

  it('DELETE /sessions/:id is idempotent per D-11 — second DELETE on a killed session is 204', async () => {
    const project = await createProject();
    const created = await rig.app.inject({
      method: 'POST',
      url: '/sessions',
      headers: { Authorization: rig.authHeader },
      payload: { projectId: project.id },
    });
    const sid = (created.json() as { id: string }).id;

    const first = await rig.app.inject({
      method: 'DELETE',
      url: `/sessions/${sid}`,
      headers: { Authorization: rig.authHeader },
    });
    expect(first.statusCode).toBe(204);

    const second = await rig.app.inject({
      method: 'DELETE',
      url: `/sessions/${sid}`,
      headers: { Authorization: rig.authHeader },
    });
    expect(second.statusCode).toBe(204);
  });

  it('DELETE /sessions/:id for unknown id returns 404', async () => {
    const res = await rig.app.inject({
      method: 'DELETE',
      url: '/sessions/01J0000000000000000UNKNOWN',
      headers: { Authorization: rig.authHeader },
    });
    expect(res.statusCode).toBe(404);
    const body = res.json() as { type: string };
    expect(body.type).toMatch(/errors\/session-not-found/);
  });

  it('GET /sessions/:id returns the session row', async () => {
    const project = await createProject();
    const created = await rig.app.inject({
      method: 'POST',
      url: '/sessions',
      headers: { Authorization: rig.authHeader },
      payload: { projectId: project.id },
    });
    const sid = (created.json() as { id: string }).id;

    const res = await rig.app.inject({
      method: 'GET',
      url: `/sessions/${sid}`,
      headers: { Authorization: rig.authHeader },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { id: string };
    expect(body.id).toBe(sid);
  });

  // Per D-17: no /personas routes exist (the route module was removed). This
  // guards against a /personas surface landing before the Phase-2 re-enable.
  it('GET /personas is unmounted → 404 (D-17)', async () => {
    const res = await rig.app.inject({
      method: 'GET',
      url: '/personas',
      headers: { Authorization: rig.authHeader },
    });
    expect(res.statusCode).toBe(404);
  });
});
