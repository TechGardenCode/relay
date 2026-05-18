import type { FastifyInstance, FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { ZodError } from 'zod';

import { errorType } from '@relay/protocol';

import { HttpProblemError } from '../http-error.js';

// Per docs/arch/rest-conventions.md §2 + §3. Single setErrorHandler that
// translates every error class the handlers can throw into the
// `application/problem+json` envelope. Route handlers stay free of
// boilerplate — they throw HttpProblemError or let ZodError / RangeError
// propagate.

interface ProblemBody {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance: string;
  // Extension keys ride at the top level alongside the standard members.
  [extension: string]: unknown;
}

const PROBLEM_CONTENT_TYPE = 'application/problem+json';

function instancePath(req: FastifyRequest): string {
  // `req.routeOptions.url` is the templated path with :id placeholders
  // substituted at routing time via `req.url` minus query. Per
  // rest-conventions.md §2: substitute path params, drop the query string —
  // avoids leaking filter values into logs.
  const url = req.url;
  const queryStart = url.indexOf('?');
  return queryStart === -1 ? url : url.slice(0, queryStart);
}

function applyHeaders(reply: FastifyReply, headers: Record<string, string> | undefined): void {
  if (headers === undefined) return;
  for (const [name, value] of Object.entries(headers)) {
    reply.header(name, value);
  }
}

function sendProblem(
  reply: FastifyReply,
  body: ProblemBody,
  headers?: Record<string, string>,
): FastifyReply {
  reply.type(PROBLEM_CONTENT_TYPE);
  applyHeaders(reply, headers);
  return reply.status(body.status).send(body);
}

export async function registerErrorMapper(app: FastifyInstance): Promise<void> {
  app.setErrorHandler((err: FastifyError, req: FastifyRequest, reply: FastifyReply) => {
    const instance = instancePath(req);

    if (err instanceof HttpProblemError) {
      const body: ProblemBody = {
        type: errorType(err.typeSlug),
        title: err.title,
        status: err.status,
        instance,
        ...(err.detail !== undefined ? { detail: err.detail } : {}),
        ...(err.extensions ?? {}),
      };
      return sendProblem(reply, body, err.headers);
    }

    if (err instanceof ZodError) {
      const body: ProblemBody = {
        type: errorType('validation-failed'),
        title: 'Request body failed schema validation',
        status: 400,
        instance,
        validationErrors: err.issues.map((issue) => ({
          path: issue.path.map(String).join('.'),
          code: issue.code,
          message: issue.message,
        })),
      };
      return sendProblem(reply, body);
    }

    if (err instanceof RangeError) {
      const body: ProblemBody = {
        type: errorType('range-error'),
        title: 'Request range invalid',
        status: 400,
        detail: err.message,
        instance,
      };
      return sendProblem(reply, body);
    }

    // Fastify-validation failures (built-in) carry a `validation` array. We
    // do not use Fastify's built-in JSON-schema validator (Zod replaces it),
    // but a malformed-JSON body surfaces as a FastifyError with statusCode
    // 400. Forward as-is.
    if (typeof err.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 500) {
      const body: ProblemBody = {
        type: errorType('bad-request'),
        title: err.message,
        status: err.statusCode,
        instance,
      };
      return sendProblem(reply, body);
    }

    // Unhandled. Log via Fastify's default logger; surface a generic message
    // to the client per rest-conventions.md §3 (500's `detail` is generic).
    req.log.error({ err }, 'Unhandled error in REST handler');
    const body: ProblemBody = {
      type: errorType('internal-error'),
      title: 'Internal server error',
      status: 500,
      detail: 'An unexpected error occurred. The server log carries the cause.',
      instance,
    };
    return sendProblem(reply, body);
  });
}
