// Per docs/arch/rest-conventions.md §2. Throw this from a route handler to
// produce an RFC 9457 problem-details response. `extensions` are flat
// camelCase keys appended to the top of the document (e.g. canonicalPath,
// existingProjectId).

export interface HttpProblemErrorInit {
  status: number;
  // Kebab-slug; the full URI is built with errorType() in
  // @relay/protocol/problem-details.
  typeSlug: string;
  title: string;
  detail?: string;
  extensions?: Record<string, unknown>;
  // Header name → value pairs the mapper should set on the response (e.g.
  // WWW-Authenticate: Bearer). Headers are response-side concerns kept off
  // the JSON body.
  headers?: Record<string, string>;
}

export class HttpProblemError extends Error {
  readonly status: number;
  readonly typeSlug: string;
  readonly title: string;
  readonly detail?: string;
  readonly extensions?: Record<string, unknown>;
  readonly headers?: Record<string, string>;

  constructor(init: HttpProblemErrorInit) {
    super(init.detail ?? init.title);
    this.name = 'HttpProblemError';
    this.status = init.status;
    this.typeSlug = init.typeSlug;
    this.title = init.title;
    this.detail = init.detail;
    this.extensions = init.extensions;
    this.headers = init.headers;
  }
}
