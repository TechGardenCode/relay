import { Injectable } from '@angular/core';
import { ProblemDetails, ProblemDetailsSchema } from '@techgardencode/protocol';

import { AuthService } from './auth.service';

// Per rest-conventions.md §2 (RFC 9457 problem-details). A failed REST call
// throws this so callers can branch on `.problem.type` / `.status`.
export class RestError extends Error {
  constructor(
    readonly status: number,
    readonly problem: ProblemDetails | null,
    message: string,
  ) {
    super(message);
    this.name = 'RestError';
  }
}

export interface CreatedResponse<T> {
  body: T;
  location: string | null;
}

@Injectable({ providedIn: 'root' })
export class RestClient {
  // Constructor injection (not inject()) so specs can `new RestClient(fakeAuth)`
  // without a TestBed injection context.
  constructor(private readonly auth: AuthService) {}

  async get<T>(path: string): Promise<T> {
    const res = await this.fetch(path, { method: 'GET' });
    return (await res.json()) as T;
  }

  // Per rest-conventions.md §3: 201 + body + Location header.
  async post<T>(path: string, body: unknown): Promise<CreatedResponse<T>> {
    const res = await this.fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { body: (await res.json()) as T, location: res.headers.get('Location') };
  }

  // Per rest-conventions.md §3: DELETE → 204, idempotent.
  async del(path: string): Promise<void> {
    await this.fetch(path, { method: 'DELETE' });
  }

  private async fetch(path: string, init: RequestInit): Promise<Response> {
    // Per ND-47: base off the pair-link server URL when set, else same-origin.
    const base = this.auth.serverUrl();
    const target = base ? new URL(path, base).toString() : path;

    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    const bearer = this.auth.bearer();
    if (bearer) headers.set('Authorization', `Bearer ${bearer}`);

    const res = await fetch(target, { ...init, headers });
    if (res.ok) return res;

    // Per data-layer.md §2 + L4 §7: a 401 clears the bearer back to unpaired;
    // the pairStatus guard then bounces navigation to /pair.
    if (res.status === 401) this.auth.clear();

    let problem: ProblemDetails | null = null;
    if (res.headers.get('content-type')?.includes('application/problem+json')) {
      try {
        problem = ProblemDetailsSchema.parse(await res.json());
      } catch {
        problem = null;
      }
    }
    throw new RestError(res.status, problem, problem?.detail ?? `HTTP ${res.status} for ${path}`);
  }
}
