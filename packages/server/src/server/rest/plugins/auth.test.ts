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

  // Per ND-36: the /app/* static bundle is public-by-design. The preHandler
  // skips it; everything the bundle calls back into (REST + WS) is still
  // gated by the rest of this suite.
  it('skips auth for the /app/* prefix (Track 8 spike static bundle)', async () => {
    // No token in headers — would normally 401. The path goes through the
    // preHandler skip, then 404s downstream because no static route is
    // registered in this test rig (registerStatic no-ops without a dist).
    const res = await rig.app.inject({ method: 'GET', url: '/app/anything' });
    expect(res.statusCode).toBe(404);
    // Crucially: NOT 401, NOT WWW-Authenticate.
    expect(res.headers['www-authenticate']).toBeUndefined();
  });

  // Regression: the SPA prefix must skip auth for the *bare* `/app` URL too
  // (no trailing slash). `@fastify/static` registers under prefix `/app`, so
  // a browser hitting `http://host:port/app` without a slash MUST reach the
  // static plugin — not get 401'd by the preHandler. Surfaced during the
  // Track 8 desktop validation walk, 2026-05-22.
  it.each(['/app', '/app?ref=x', '/app#frag'])(
    'skips auth for bare `%s` (no trailing slash)',
    async (url) => {
      const res = await rig.app.inject({ method: 'GET', url });
      expect(res.statusCode).not.toBe(401);
      expect(res.headers['www-authenticate']).toBeUndefined();
    },
  );

  // Negative case: `/app` is the boundary — `/applicant` (no slash after `app`)
  // must NOT skip auth. Catches the obvious-but-wrong `startsWith('/app')` fix.
  it('does NOT skip auth for paths that merely begin with /app (e.g. /applicant)', async () => {
    const res = await rig.app.inject({ method: 'GET', url: '/applicant' });
    expect(res.statusCode).toBe(401);
    expect(res.headers['www-authenticate']).toBe('Bearer');
  });

  // Per ND-36: browsers can't set Authorization on `new WebSocket(...)`,
  // so the PWA sends `Sec-WebSocket-Protocol: relay.bearer, <token>`. The
  // preHandler falls back to that header when Authorization is absent.
  // We exercise the auth path against a REST route (test seam — the same
  // preHandler gates REST and WS upgrades).
  it('accepts Sec-WebSocket-Protocol: relay.bearer, <token> when Authorization is absent', async () => {
    const res = await rig.app.inject({
      method: 'GET',
      url: '/tenants',
      headers: { 'Sec-WebSocket-Protocol': `relay.bearer, ${rig.token.plaintext}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it('rejects malformed Sec-WebSocket-Protocol → 401 auth-missing', async () => {
    // Wrong scheme name.
    const res = await rig.app.inject({
      method: 'GET',
      url: '/tenants',
      headers: { 'Sec-WebSocket-Protocol': `wrong.scheme, ${rig.token.plaintext}` },
    });
    expect(res.statusCode).toBe(401);
    const body = res.json() as { type: string };
    expect(body.type).toMatch(/errors\/auth-missing/);
  });

  it('rejects Sec-WebSocket-Protocol with malformed token → 401 auth-malformed', async () => {
    const res = await rig.app.inject({
      method: 'GET',
      url: '/tenants',
      headers: { 'Sec-WebSocket-Protocol': 'relay.bearer, not-a-real-token' },
    });
    expect(res.statusCode).toBe(401);
    const body = res.json() as { type: string };
    expect(body.type).toMatch(/errors\/auth-malformed/);
  });

  // Authorization header takes precedence over the subprotocol fallback.
  // A bad Authorization header is NOT silently masked by a good
  // Sec-WebSocket-Protocol — otherwise a misconfigured client could
  // smuggle credentials through a header browsers can't reach.
  it('Authorization header takes precedence over Sec-WebSocket-Protocol', async () => {
    const res = await rig.app.inject({
      method: 'GET',
      url: '/tenants',
      headers: {
        Authorization: 'Bearer not-a-real-token',
        'Sec-WebSocket-Protocol': `relay.bearer, ${rig.token.plaintext}`,
      },
    });
    expect(res.statusCode).toBe(401);
    const body = res.json() as { type: string };
    expect(body.type).toMatch(/errors\/auth-malformed/);
  });
});
