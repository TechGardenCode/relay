// Minimal HTTP client used by state-mutating CLI subcommands per the ND-16
// proposal (read-only commands talk to SQLite directly; mutating commands
// hit the running server's REST API over loopback). Wraps Node 22's native
// fetch and translates RFC 9457 problem-details into typed errors so the
// dispatcher can render an operator-facing message + exit code.

import { resolveAttachConfig } from '../attach/config.js';

export interface CliHttpOptions {
  homeOverride?: string;
}

export class CliHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly typeSlug: string,
    readonly body: unknown,
  ) {
    super(message);
    this.name = 'CliHttpError';
  }
}

export class CliHttpUnreachableError extends Error {
  constructor(
    readonly url: string,
    readonly cause: Error,
  ) {
    super(`Could not reach relay server at ${url}: ${cause.message}`);
    this.name = 'CliHttpUnreachableError';
  }
}

export interface CliHttpClient {
  request<T>(method: string, path: string, body?: unknown): Promise<T>;
  /** Lower-level escape for endpoints that return 204 No Content or empty bodies. */
  send(method: string, path: string, body?: unknown): Promise<Response>;
}

interface ProblemDetailsBody {
  type?: string;
  title?: string;
  detail?: string;
}

export function buildCliHttpClient(opts: CliHttpOptions = {}): CliHttpClient {
  const config = resolveAttachConfig({ homeOverride: opts.homeOverride });
  const base = config.httpUrl.replace(/\/$/, '');
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.token}`,
    Accept: 'application/json',
  };

  async function send(method: string, path: string, body?: unknown): Promise<Response> {
    const url = `${base}${path}`;
    const init: RequestInit = {
      method,
      headers: { ...headers },
    };
    if (body !== undefined) {
      (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (err) {
      throw new CliHttpUnreachableError(url, err as Error);
    }
    if (!res.ok) {
      // Read once; problem-details is the canonical 4xx/5xx shape per
      // rest-conventions.md §2.
      const text = await res.text();
      let parsed: ProblemDetailsBody | undefined;
      try {
        parsed = text === '' ? undefined : (JSON.parse(text) as ProblemDetailsBody);
      } catch {
        parsed = undefined;
      }
      const typeSlug = (parsed?.type ?? '').replace(/^.*\//, '');
      const title = parsed?.title ?? `HTTP ${String(res.status)}`;
      const detail = parsed?.detail ?? text;
      throw new CliHttpError(
        detail !== '' ? `${title}: ${detail}` : title,
        res.status,
        typeSlug,
        parsed,
      );
    }
    return res;
  }

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await send(method, path, body);
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  return { request, send };
}
