// Typed wrapper around the Relay REST surface the extension consumes. Each
// method validates the response with the Zod schema from @relay/protocol and
// surfaces RFC 9457 problem-details (per docs/arch/rest-conventions.md §2) as
// a typed RelayHttpError so callers can render `title` + `detail` in
// vscode.window.showErrorMessage.
//
// Per the relay-architect 2026-05-22 review: the extension's REST calls do
// NOT overlap with `relay attach` (which is pure WebSocket post-spawn) — no
// double-fetch risk, no double-claim risk. CLAIM is WS-only.

import {
  PersonaListResponseSchema,
  ProblemDetailsSchema,
  ProjectSchema,
  SessionListResponseSchema,
  SessionSchema,
  TenantSchema,
  type PersonaListResponse,
  type Project,
  type ProjectCreateRequest,
  type Session,
  type SessionCreateRequest,
  type SessionListResponse,
  type Tenant,
} from '@relay/protocol';

export interface RelayCredentials {
  serverUrl: string;
  token: string;
}

export class RelayHttpError extends Error {
  constructor(
    readonly status: number,
    readonly problem: { title: string; detail?: string; type?: string },
  ) {
    super(problem.detail ?? problem.title);
    this.name = 'RelayHttpError';
  }

  // Surfaced verbatim in showErrorMessage per rest-conventions.md §2 — the
  // user sees the server's own wording, not extension-side prose.
  toUserMessage(): string {
    if (this.problem.detail !== undefined && this.problem.detail !== this.problem.title) {
      return `${this.problem.title}: ${this.problem.detail}`;
    }
    return this.problem.title;
  }
}

export class RelayNetworkError extends Error {
  constructor(
    readonly serverUrl: string,
    cause: unknown,
  ) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    super(`Could not reach ${serverUrl}: ${reason}`);
    this.name = 'RelayNetworkError';
  }
}

function joinUrl(base: string, path: string): string {
  const trimmedBase = base.endsWith('/') ? base.slice(0, -1) : base;
  const prefixedPath = path.startsWith('/') ? path : `/${path}`;
  return `${trimmedBase}${prefixedPath}`;
}

export class RelayRestClient {
  constructor(private readonly creds: RelayCredentials) {}

  get serverUrl(): string {
    return this.creds.serverUrl;
  }

  private async request(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown,
    query?: Record<string, string>,
  ): Promise<unknown> {
    const url = new URL(joinUrl(this.creds.serverUrl, path));
    if (query !== undefined) {
      for (const [key, value] of Object.entries(query)) {
        url.searchParams.set(key, value);
      }
    }
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.creds.token}`,
      accept: 'application/json',
    };
    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      headers['content-type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    let res: Response;
    try {
      res = await fetch(url.toString(), init);
    } catch (err) {
      throw new RelayNetworkError(this.creds.serverUrl, err);
    }
    if (res.status === 204) return undefined;
    const text = await res.text();
    let parsed: unknown = undefined;
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text);
      } catch {
        if (!res.ok) {
          throw new RelayHttpError(res.status, {
            title: `Relay server returned HTTP ${String(res.status)}`,
            detail: text.slice(0, 500),
          });
        }
        throw new RelayHttpError(res.status, {
          title: 'Malformed response from Relay server',
          detail: `Could not parse JSON body for ${method} ${path}.`,
        });
      }
    }
    if (!res.ok) {
      const problem = ProblemDetailsSchema.safeParse(parsed);
      if (problem.success) {
        throw new RelayHttpError(res.status, problem.data);
      }
      throw new RelayHttpError(res.status, {
        title: `Relay server returned HTTP ${String(res.status)}`,
        detail: text.slice(0, 500),
      });
    }
    return parsed;
  }

  // Per D-13: the auth probe for first-run pairing. GET /tenants/self returns
  // 200 + Tenant when the bearer is valid; 401 otherwise.
  async getTenantsSelf(): Promise<Tenant> {
    return TenantSchema.parse(await this.request('GET', '/tenants/self'));
  }

  async listPersonas(): Promise<PersonaListResponse> {
    return PersonaListResponseSchema.parse(await this.request('GET', '/personas'));
  }

  async listProjects(): Promise<Project[]> {
    const wire = await this.request('GET', '/projects');
    const parsed = (wire as { items: unknown[] }).items.map((row) => ProjectSchema.parse(row));
    return parsed;
  }

  async getSession(sessionId: string): Promise<Session> {
    return SessionSchema.parse(await this.request('GET', `/sessions/${sessionId}`));
  }

  async listRunningSessions(): Promise<SessionListResponse> {
    return SessionListResponseSchema.parse(
      await this.request('GET', '/sessions', undefined, { status: 'running' }),
    );
  }

  async createSession(req: SessionCreateRequest): Promise<Session> {
    return SessionSchema.parse(await this.request('POST', '/sessions', req));
  }

  // Per D-G6 + ND-07: POST /projects writes `<canonicalPath>/.relay/project.json`
  // server-side and appends to .gitignore. Extension does NOT write the marker
  // on this branch; it does write the marker on the "bind to existing" branch
  // (registerWorkspace handles new-project; binding.ts handles bind-existing).
  async createProject(req: ProjectCreateRequest): Promise<Project> {
    return ProjectSchema.parse(await this.request('POST', '/projects', req));
  }
}
