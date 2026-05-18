// Per ND-04 (pagination contract) + ND-14 (field naming). camelCase keys per
// rest-conventions.md §6 — the prd/03-server.md §2 snippet was rewritten to
// match this shape on 2026-05-17.
//
// Cursor semantics summary:
//   - paginated: ?before=<exclusive-byte-offset>&limit=<n>
//     returns half-open [max(0, before - limit), before); limit silent-clamps
//     to 1 MB.
//   - full export: ?format=full
//     returns range = { from: 0, to: totalBytes }.
//   - hasMore = range.from > 0.

import { z } from 'zod';

import { UlidSchema } from './common.js';

export const TranscriptRangeSchema = z
  .object({
    from: z.number().int().nonnegative(),
    to: z.number().int().nonnegative(),
  })
  .strict();
export type TranscriptRange = z.infer<typeof TranscriptRangeSchema>;

export const TranscriptResponseSchema = z
  .object({
    sessionId: UlidSchema,
    range: TranscriptRangeSchema,
    totalBytes: z.number().int().nonnegative(),
    bytes: z.string(),
    hasMore: z.boolean(),
  })
  .strict();
export type TranscriptResponse = z.infer<typeof TranscriptResponseSchema>;

// Query shapes are mutually exclusive at the handler layer. Each is its own
// Zod schema so the handler can branch on which one parses.
export const TranscriptFullQuerySchema = z
  .object({
    format: z.literal('full'),
  })
  .strict();
export type TranscriptFullQuery = z.infer<typeof TranscriptFullQuerySchema>;

// `before` and `limit` arrive as query-string strings; coerce to int. The
// 1 MB upper bound is enforced by the transcript reader (per
// MAX_RANGE_LIMIT_BYTES); we only enforce the lower bound here so a `limit=0`
// is a 400 rather than a silently-pointless request.
export const TranscriptPaginatedQuerySchema = z
  .object({
    before: z.coerce.number().int().nonnegative(),
    limit: z.coerce.number().int().positive(),
  })
  .strict();
export type TranscriptPaginatedQuery = z.infer<typeof TranscriptPaginatedQuerySchema>;
