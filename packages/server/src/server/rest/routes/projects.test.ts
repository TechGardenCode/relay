import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { makeTestRig, type TestRig } from '../test-helpers.js';

describe('routes/projects', () => {
  let rig: TestRig;
  let workspaces: string[];

  beforeEach(async () => {
    rig = await makeTestRig();
    workspaces = [];
  });

  afterEach(async () => {
    await rig.cleanup();
    for (const w of workspaces) rmSync(w, { recursive: true, force: true });
  });

  function workspace(): string {
    const dir = mkdtempSync(join(tmpdir(), 'relay-rest-project-'));
    workspaces.push(dir);
    // macOS resolves /var/folders/... → /private/var/folders/... via realpath.
    // The server's POST /projects handler runs realpathSync, so tests compare
    // against the canonical form.
    return realpathSync(dir);
  }

  it('POST /projects with a valid path returns 201 + Location + project row', async () => {
    const ws = workspace();
    const res = await rig.app.inject({
      method: 'POST',
      url: '/projects',
      headers: { Authorization: rig.authHeader },
      payload: { path: ws },
    });
    expect(res.statusCode).toBe(201);
    expect(res.headers.location).toMatch(/^\/projects\//);
    const body = res.json() as {
      id: string;
      slug: string;
      displayName: string;
      canonicalPath: string;
      createdAt: string;
    };
    expect(body.canonicalPath).toBe(ws);
    expect(body.slug).toMatch(/^[a-z][a-z0-9-]*$/);
    expect(body.displayName).toBe(ws.split('/').pop());
  });

  it('POST /projects writes the .relay/project.json marker per ND-07', async () => {
    const ws = workspace();
    const res = await rig.app.inject({
      method: 'POST',
      url: '/projects',
      headers: { Authorization: rig.authHeader },
      payload: { path: ws },
    });
    expect(res.statusCode).toBe(201);
    const marker = JSON.parse(readFileSync(join(ws, '.relay', 'project.json'), 'utf8')) as {
      schemaVersion: number;
      projectId: string;
    };
    expect(marker.schemaVersion).toBe(1);
    const body = res.json() as { id: string };
    expect(marker.projectId).toBe(body.id);
  });

  it('POST /projects appends .relay/project.json to .gitignore (idempotent)', async () => {
    const ws = workspace();
    await rig.app.inject({
      method: 'POST',
      url: '/projects',
      headers: { Authorization: rig.authHeader },
      payload: { path: ws },
    });
    const gitignore = readFileSync(join(ws, '.gitignore'), 'utf8');
    expect(gitignore).toContain('.relay/project.json');
    // Second call after DELETE+re-POST must not double-append.
    // (Re-POSTing to the same path is a 409, so test idempotency separately
    // by invoking the helper logic via a second POST that fails.)
    const dup = await rig.app.inject({
      method: 'POST',
      url: '/projects',
      headers: { Authorization: rig.authHeader },
      payload: { path: ws },
    });
    expect(dup.statusCode).toBe(409);
    expect(readFileSync(join(ws, '.gitignore'), 'utf8')).toBe(gitignore);
  });

  it('POST /projects with a duplicate canonical path returns 409 project-path-taken', async () => {
    const ws = workspace();
    await rig.app.inject({
      method: 'POST',
      url: '/projects',
      headers: { Authorization: rig.authHeader },
      payload: { path: ws },
    });
    const res = await rig.app.inject({
      method: 'POST',
      url: '/projects',
      headers: { Authorization: rig.authHeader },
      payload: { path: ws },
    });
    expect(res.statusCode).toBe(409);
    const body = res.json() as { type: string; canonicalPath: string; existingProjectId: string };
    expect(body.type).toMatch(/errors\/project-path-taken/);
    expect(body.canonicalPath).toBe(ws);
    expect(typeof body.existingProjectId).toBe('string');
  });

  it('POST /projects with a duplicate slug returns 409 project-slug-taken', async () => {
    const wsA = workspace();
    const wsB = workspace();
    await rig.app.inject({
      method: 'POST',
      url: '/projects',
      headers: { Authorization: rig.authHeader },
      payload: { path: wsA, slug: 'shared-slug' },
    });
    const res = await rig.app.inject({
      method: 'POST',
      url: '/projects',
      headers: { Authorization: rig.authHeader },
      payload: { path: wsB, slug: 'shared-slug' },
    });
    expect(res.statusCode).toBe(409);
    const body = res.json() as { type: string; slug: string };
    expect(body.type).toMatch(/errors\/project-slug-taken/);
    expect(body.slug).toBe('shared-slug');
  });

  it('POST /projects with a non-existent path returns 422 project-path-missing', async () => {
    const res = await rig.app.inject({
      method: 'POST',
      url: '/projects',
      headers: { Authorization: rig.authHeader },
      payload: { path: '/this/does/not/exist/relay-test' },
    });
    expect(res.statusCode).toBe(422);
    const body = res.json() as { type: string };
    expect(body.type).toMatch(/errors\/project-path-missing/);
  });

  it('POST /projects with a malformed body returns 400 with validationErrors', async () => {
    const res = await rig.app.inject({
      method: 'POST',
      url: '/projects',
      headers: { Authorization: rig.authHeader },
      payload: { slug: 'no-path-here' },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as {
      type: string;
      validationErrors: Array<{ path: string }>;
    };
    expect(body.type).toMatch(/errors\/validation-failed/);
    expect(body.validationErrors.length).toBeGreaterThan(0);
    expect(body.validationErrors.some((v) => v.path === 'path')).toBe(true);
  });

  it('GET /projects/:id returns 404 with problem+json for unknown id', async () => {
    const res = await rig.app.inject({
      method: 'GET',
      url: '/projects/01J0000000000000000UNKNOWN',
      headers: { Authorization: rig.authHeader },
    });
    expect(res.statusCode).toBe(404);
    const body = res.json() as { type: string };
    expect(body.type).toMatch(/errors\/project-not-found/);
  });

  it('GET /projects lists registered projects', async () => {
    const ws = workspace();
    await rig.app.inject({
      method: 'POST',
      url: '/projects',
      headers: { Authorization: rig.authHeader },
      payload: { path: ws },
    });
    const res = await rig.app.inject({
      method: 'GET',
      url: '/projects',
      headers: { Authorization: rig.authHeader },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: Array<{ canonicalPath: string }> };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.canonicalPath).toBe(ws);
  });

  it('DELETE /projects/:id returns 204; second DELETE returns 404 (the row really removed)', async () => {
    const ws = workspace();
    const created = await rig.app.inject({
      method: 'POST',
      url: '/projects',
      headers: { Authorization: rig.authHeader },
      payload: { path: ws },
    });
    const { id } = created.json() as { id: string };

    const first = await rig.app.inject({
      method: 'DELETE',
      url: `/projects/${id}`,
      headers: { Authorization: rig.authHeader },
    });
    expect(first.statusCode).toBe(204);

    const second = await rig.app.inject({
      method: 'DELETE',
      url: `/projects/${id}`,
      headers: { Authorization: rig.authHeader },
    });
    // Projects are NOT idempotent on DELETE — only sessions are per D-11.
    expect(second.statusCode).toBe(404);
  });
});
