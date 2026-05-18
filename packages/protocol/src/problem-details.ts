// Per docs/arch/rest-conventions.md §2. The error envelope every REST handler
// emits. RFC 9457 problem-details (the RFC 7807 successor) — non-resolving
// `type` URIs are explicitly permitted (§4.1).
//
// Extensions are flat top-level keys (camelCase) carrying error-class-specific
// metadata. `validationErrors` is the one canonical extension shape, populated
// when a Zod schema rejects a request body.

import { z } from 'zod';

export const ValidationErrorEntrySchema = z
  .object({
    path: z.string(),
    code: z.string(),
    message: z.string(),
  })
  .strict();

export type ValidationErrorEntry = z.infer<typeof ValidationErrorEntrySchema>;

// Passthrough so per-error-class extensions (canonicalPath, existingProjectId,
// etc.) ride through validation without per-error-shape Zod schemas. The
// handler is the source of truth for which extensions land on which `type`.
export const ProblemDetailsSchema = z
  .object({
    type: z.string(),
    title: z.string(),
    status: z.number().int(),
    detail: z.string().optional(),
    instance: z.string().optional(),
    validationErrors: z.array(ValidationErrorEntrySchema).optional(),
  })
  .passthrough();

export type ProblemDetails = z.infer<typeof ProblemDetailsSchema>;

// Shorthand for handler authors. Use as `errorType('project-path-taken')`
// rather than re-typing the prefix.
export const ERROR_TYPE_PREFIX = 'https://relay.dev/errors/';

export function errorType(slug: string): string {
  return `${ERROR_TYPE_PREFIX}${slug}`;
}
