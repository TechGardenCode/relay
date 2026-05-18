import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { makeTestRig, type TestRig } from '../test-helpers.js';

describe('plugins/auth', () => {
  let rig: TestRig;

  beforeEach(async () => {
    rig = await makeTestRig();
  });

  afterEach(async () => {
    await rig.cleanup();
  });

  it('rejects requests with no Authorization header → 401 auth-missing', async () => {
    const res = await rig.app.inject({ method: 'GET', url: '/tenants' });
    expect(res.statusCode).toBe(401);
    expect(res.headers['www-authenticate']).toBe('Bearer');
    const body = res.json() as { type: string };
    expect(body.type).toMatch(/errors\/auth-missing/);
  });

  it('rejects malformed bearer tokens → 401 auth-malformed', async () => {
    const res = await rig.app.inject({
      method: 'GET',
      url: '/tenants',
      headers: { Authorization: 'Bearer not-a-real-token' },
    });
    expect(res.statusCode).toBe(401);
    const body = res.json() as { type: string };
    expect(body.type).toMatch(/errors\/auth-malformed/);
  });

  it('rejects unknown well-formed tokens → 401 auth-unknown', async () => {
    // A well-formed token (26 Crockford-Base32) that isn't in the store.
    const fakeToken = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
    const res = await rig.app.inject({
      method: 'GET',
      url: '/tenants',
      headers: { Authorization: `Bearer ${fakeToken}` },
    });
    expect(res.statusCode).toBe(401);
    const body = res.json() as { type: string };
    expect(body.type).toMatch(/errors\/auth-unknown/);
  });

  it('rejects revoked tokens → 401 auth-revoked', async () => {
    rig.tokenStore.revoke(rig.token.record.id);
    const res = await rig.app.inject({
      method: 'GET',
      url: '/tenants',
      headers: { Authorization: rig.authHeader },
    });
    expect(res.statusCode).toBe(401);
    const body = res.json() as { type: string };
    expect(body.type).toMatch(/errors\/auth-revoked/);
  });

  it('rejects non-Bearer auth schemes → 401 auth-missing', async () => {
    const res = await rig.app.inject({
      method: 'GET',
      url: '/tenants',
      headers: { Authorization: 'Basic dXNlcjpwYXNz' },
    });
    expect(res.statusCode).toBe(401);
    const body = res.json() as { type: string };
    expect(body.type).toMatch(/errors\/auth-missing/);
  });
});
