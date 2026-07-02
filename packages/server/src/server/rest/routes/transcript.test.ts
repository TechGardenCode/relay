import { mkdirSync, writeFileSync } from 'node:fs';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { sessions as sessionsRepo, projects, tenants } from '../../../store/index.js';
import { transcriptPath, transcriptsDir } from '../../../config/paths.js';
import { makeTestRig, type TestRig } from '../test-helpers.js';

// These tests bypass session/registry.create() entirely — they seed the
// sidecar file on disk and the sessions row in SQLite directly, then exercise
// only the read path. The pagination math + camelCase shape per ND-04 + ND-14
// is what we're verifying here.

describe('routes/transcript', () => {
  let rig: TestRig;

  beforeEach(async () => {
    rig = await makeTestRig();
  });

  afterEach(async () => {
    await rig.cleanup();
  });

  function seedSession(sidecarBytes: Buffer): string {
    const tenant = tenants.ensureSingleton(rig.db, Date.now());
    const project = projects.insert(
      rig.db,
      {
        tenantId: tenant.id,
        slug: 'p1',
        displayName: 'p1',
        canonicalPath: '/tmp/relay-transcript-test',
      },
      Date.now(),
    );
    const row = sessionsRepo.insert(rig.db, { projectId: project.id, agentCli: 'cat' }, Date.now());
    sessionsRepo.incrementTotalBytes(rig.db, row.id, sidecarBytes.length, Date.now());
    mkdirSync(transcriptsDir(rig.homeOverride), { recursive: true });
    writeFileSync(transcriptPath(row.id, rig.homeOverride), sidecarBytes);
    return row.id;
  }

  it('GET /sessions/:id/transcript?format=full returns the entire transcript (camelCase shape per ND-14)', async () => {
    const payload = Buffer.from('hello, world\n');
    const sid = seedSession(payload);

    const res = await rig.app.inject({
      method: 'GET',
      url: `/sessions/${sid}/transcript?format=full`,
      headers: { Authorization: rig.authHeader },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      sessionId: string;
      range: { from: number; to: number };
      totalBytes: number;
      bytes: string;
      hasMore: boolean;
    };
    expect(body.sessionId).toBe(sid);
    expect(body.range).toEqual({ from: 0, to: payload.length });
    expect(body.totalBytes).toBe(payload.length);
    expect(Buffer.from(body.bytes, 'base64').toString('utf8')).toBe('hello, world\n');
    expect(body.hasMore).toBe(false);
  });

  it('GET /sessions/:id/transcript?before=N&limit=M returns half-open [max(0, before - limit), before)', async () => {
    const payload = Buffer.alloc(100);
    for (let i = 0; i < payload.length; i++) payload[i] = i;
    const sid = seedSession(payload);

    const res = await rig.app.inject({
      method: 'GET',
      url: `/sessions/${sid}/transcript?before=80&limit=20`,
      headers: { Authorization: rig.authHeader },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      range: { from: number; to: number };
      bytes: string;
      hasMore: boolean;
    };
    expect(body.range).toEqual({ from: 60, to: 80 });
    expect(body.hasMore).toBe(true);
    const decoded = Buffer.from(body.bytes, 'base64');
    expect(decoded.length).toBe(20);
    expect(decoded[0]).toBe(60);
    expect(decoded[19]).toBe(79);
  });

  it('GET /sessions/:id/transcript with before=0 returns empty + hasMore: false', async () => {
    const payload = Buffer.from('abc');
    const sid = seedSession(payload);

    const res = await rig.app.inject({
      method: 'GET',
      url: `/sessions/${sid}/transcript?before=0&limit=10`,
      headers: { Authorization: rig.authHeader },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      range: { from: number; to: number };
      bytes: string;
      hasMore: boolean;
    };
    expect(body.range).toEqual({ from: 0, to: 0 });
    expect(body.bytes).toBe('');
    expect(body.hasMore).toBe(false);
  });

  it('GET /sessions/:id/transcript with before > totalBytes returns 400 transcript-before-out-of-range', async () => {
    const payload = Buffer.from('abc');
    const sid = seedSession(payload);

    const res = await rig.app.inject({
      method: 'GET',
      url: `/sessions/${sid}/transcript?before=999&limit=10`,
      headers: { Authorization: rig.authHeader },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { type: string };
    expect(body.type).toMatch(/errors\/transcript-before-out-of-range/);
  });

  it('GET /sessions/:id/transcript with both format=full and before/limit → 400 transcript-mode-mixed', async () => {
    const payload = Buffer.from('abc');
    const sid = seedSession(payload);

    const res = await rig.app.inject({
      method: 'GET',
      url: `/sessions/${sid}/transcript?format=full&before=2&limit=1`,
      headers: { Authorization: rig.authHeader },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { type: string };
    expect(body.type).toMatch(/errors\/transcript-mode-mixed/);
  });

  it('GET /sessions/:id/transcript with limit=0 → 400 (Zod positive() rejects)', async () => {
    const payload = Buffer.from('abc');
    const sid = seedSession(payload);

    const res = await rig.app.inject({
      method: 'GET',
      url: `/sessions/${sid}/transcript?before=2&limit=0`,
      headers: { Authorization: rig.authHeader },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { type: string };
    expect(body.type).toMatch(/errors\/validation-failed/);
  });

  it('GET /sessions/:id/transcript for unknown session id → 404', async () => {
    const res = await rig.app.inject({
      method: 'GET',
      url: `/sessions/01J0000000000000000UNKNOWN/transcript?format=full`,
      headers: { Authorization: rig.authHeader },
    });
    expect(res.statusCode).toBe(404);
    const body = res.json() as { type: string };
    expect(body.type).toMatch(/errors\/session-not-found/);
  });

  it('GET /sessions/:id/transcript on an empty session returns range 0..0, bytes "" — no fd open', async () => {
    // Session with no transcribed bytes; no sidecar file written. The handler
    // skips the readRange short-circuit when totalBytes === 0.
    const tenant = tenants.ensureSingleton(rig.db, Date.now());
    const project = projects.insert(
      rig.db,
      {
        tenantId: tenant.id,
        slug: 'pe',
        displayName: 'pe',
        canonicalPath: '/tmp/relay-empty-session',
      },
      Date.now(),
    );
    const row = sessionsRepo.insert(rig.db, { projectId: project.id, agentCli: 'cat' }, Date.now());

    const res = await rig.app.inject({
      method: 'GET',
      url: `/sessions/${row.id}/transcript?format=full`,
      headers: { Authorization: rig.authHeader },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      sessionId: string;
      range: { from: number; to: number };
      totalBytes: number;
      bytes: string;
      hasMore: boolean;
    };
    expect(body.sessionId).toBe(row.id);
    expect(body.range).toEqual({ from: 0, to: 0 });
    expect(body.totalBytes).toBe(0);
    expect(body.bytes).toBe('');
    expect(body.hasMore).toBe(false);
  });
});
