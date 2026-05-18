import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SINGLETON_TENANT_ID } from '../../../store/index.js';
import { makeTestRig, type TestRig } from '../test-helpers.js';

describe('routes/tenants', () => {
  let rig: TestRig;

  beforeEach(async () => {
    rig = await makeTestRig();
  });

  afterEach(async () => {
    await rig.cleanup();
  });

  it('GET /tenants returns the singleton tenant in items[]', async () => {
    const res = await rig.app.inject({
      method: 'GET',
      url: '/tenants',
      headers: { Authorization: rig.authHeader },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: Array<{ id: string; createdAt: string }> };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.id).toBe(SINGLETON_TENANT_ID);
    expect(typeof body.items[0]?.createdAt).toBe('string');
  });

  it('GET /tenants/self returns the singleton tenant directly', async () => {
    const res = await rig.app.inject({
      method: 'GET',
      url: '/tenants/self',
      headers: { Authorization: rig.authHeader },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { id: string };
    expect(body.id).toBe(SINGLETON_TENANT_ID);
  });

  it('GET /tenants/:id returns 404 with problem+json for an unknown id', async () => {
    const res = await rig.app.inject({
      method: 'GET',
      url: '/tenants/01J0000000000000000UNKNOWN',
      headers: { Authorization: rig.authHeader },
    });
    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).toContain('application/problem+json');
    const body = res.json() as { type: string; status: number };
    expect(body.type).toMatch(/errors\/tenant-not-found/);
    expect(body.status).toBe(404);
  });

  it('every route rejects requests without a bearer token (401)', async () => {
    const res = await rig.app.inject({
      method: 'GET',
      url: '/tenants',
    });
    expect(res.statusCode).toBe(401);
    expect(res.headers['www-authenticate']).toBe('Bearer');
    const body = res.json() as { type: string };
    expect(body.type).toMatch(/errors\/auth-missing/);
  });
});
