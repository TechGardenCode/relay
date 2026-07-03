import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from './auth.service';
import { RestClient, RestError } from './rest-client.service';

function pairedAuth(url: string | null): AuthService {
  localStorage.clear();
  const auth = new AuthService();
  auth.setPaired({ token: 'tok-1', url });
  return auth;
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

describe('RestClient', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('attaches the bearer header from AuthService', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ items: [] }));
    vi.stubGlobal('fetch', fetchMock);
    await new RestClient(pairedAuth(null)).get('/sessions');
    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer tok-1');
  });

  it('bases the URL on the ND-47 server url when set, relative when null', async () => {
    // Fresh Response per call — a Response body can only be read once.
    const fetchMock = vi
      .fn()
      .mockImplementation(() => Promise.resolve(jsonResponse({ items: [] })));
    vi.stubGlobal('fetch', fetchMock);

    await new RestClient(pairedAuth('https://relay.lan')).get('/sessions');
    expect(fetchMock.mock.calls[0][0]).toBe('https://relay.lan/sessions');

    fetchMock.mockClear();
    await new RestClient(pairedAuth(null)).get('/sessions');
    expect(fetchMock.mock.calls[0][0]).toBe('/sessions');
  });

  it('returns the parsed body on 200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ items: [{ id: 'a' }] })));
    const out = await new RestClient(pairedAuth(null)).get<{ items: { id: string }[] }>(
      '/sessions',
    );
    expect(out.items[0].id).toBe('a');
  });

  it('on 401 clears the bearer and throws RestError(401)', async () => {
    const auth = pairedAuth(null);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })));
    await expect(new RestClient(auth).get('/sessions')).rejects.toMatchObject({ status: 401 });
    expect(auth.bearer()).toBeNull(); // cleared
  });

  it('parses an RFC 9457 problem+json error body', async () => {
    const problem = {
      type: 'https://relay.dev/errors/project-path-taken',
      title: 'Project path already registered',
      status: 409,
      detail: 'A project is already registered.',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(problem), {
          status: 409,
          headers: { 'content-type': 'application/problem+json' },
        }),
      ),
    );
    const err = await new RestClient(pairedAuth(null)).post('/projects', {}).catch((e) => e);
    expect(err).toBeInstanceOf(RestError);
    expect(err.problem.type).toBe('https://relay.dev/errors/project-path-taken');
  });

  it('post() returns { body, location } from the Location header on 201', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          { id: 'sess-1' },
          {
            status: 201,
            headers: { 'content-type': 'application/json', Location: '/sessions/sess-1' },
          },
        ),
      ),
    );
    const out = await new RestClient(pairedAuth(null)).post<{ id: string }>('/sessions', {
      projectId: 'p1',
    });
    expect(out.body.id).toBe('sess-1');
    expect(out.location).toBe('/sessions/sess-1');
  });

  it('del() resolves on 204', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await expect(new RestClient(pairedAuth(null)).del('/sessions/sess-1')).resolves.toBeUndefined();
  });
});
