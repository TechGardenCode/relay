import type { FastifyInstance, FastifyRequest } from 'fastify';

import {
  TranscriptFullQuerySchema,
  TranscriptPaginatedQuerySchema,
  type TranscriptResponse,
} from '@techgardencode/protocol';

import { sessions as sessionsRepo, type Database } from '../../../store/index.js';
import { readRange, transcriptPath, MAX_RANGE_LIMIT_BYTES } from '../../../transcript/index.js';
import { HttpProblemError } from '../http-error.js';

// Per ND-04 (pagination contract) + ND-14 (camelCase wire). The two modes are
// mutually exclusive query shapes:
//   - ?format=full       → entire transcript in one body
//   - ?before=N&limit=M  → half-open [max(0, before - limit), before)
//
// totalBytes is read from sessions.total_bytes, which can lag the on-disk
// sidecar by up to 1 s per ND-13. We do NOT fstat the sidecar — store/CLAUDE.md
// documents this as future hardening only.

export interface TranscriptRoutesOptions {
  db: Database;
  homeOverride?: string;
}

interface TranscriptParams {
  id: string;
}

interface TranscriptQuery {
  format?: string;
  before?: string;
  limit?: string;
}

export async function registerTranscriptRoutes(
  app: FastifyInstance,
  opts: TranscriptRoutesOptions,
): Promise<void> {
  app.get(
    '/sessions/:id/transcript',
    async (
      req: FastifyRequest<{ Params: TranscriptParams; Querystring: TranscriptQuery }>,
    ): Promise<TranscriptResponse> => {
      const row = sessionsRepo.findById(opts.db, req.params.id);
      if (row === undefined) {
        throw new HttpProblemError({
          status: 404,
          typeSlug: 'session-not-found',
          title: 'Session not found',
          detail: `No session with id ${req.params.id}.`,
        });
      }

      const sidecar = transcriptPath(row.id, opts.homeOverride);

      // Mode discrimination: ?format=full takes precedence; if absent, the
      // ?before=&limit= shape is required. Mixing the two modes in one
      // request is a 400.
      if (req.query.format !== undefined) {
        if (req.query.before !== undefined || req.query.limit !== undefined) {
          throw new HttpProblemError({
            status: 400,
            typeSlug: 'transcript-mode-mixed',
            title: 'Transcript request cannot mix ?format=full with ?before/?limit',
            detail: 'Use either ?format=full or ?before=&limit=, not both.',
          });
        }
        TranscriptFullQuerySchema.parse(req.query);
        // Full export = pagination with limit = total_bytes, before = total_bytes.
        // The reader returns range = { from: 0, to: totalBytes }.
        const totalBytes = row.totalBytes;
        if (totalBytes === 0) {
          return {
            sessionId: row.id,
            range: { from: 0, to: 0 },
            totalBytes: 0,
            bytes: '',
            hasMore: false,
          };
        }
        const result = await readRange({
          filePath: sidecar,
          before: totalBytes,
          limit: totalBytes,
          totalBytes,
        });
        return {
          sessionId: row.id,
          range: { from: result.from, to: result.to },
          totalBytes,
          bytes: result.bytes.toString('base64'),
          hasMore: result.hasMore,
        };
      }

      const query = TranscriptPaginatedQuerySchema.parse(req.query);
      const totalBytes = row.totalBytes;
      if (query.before > totalBytes) {
        // Per ND-04 rule 5: the initial scroll-back call uses
        // before = totalBytes; values past totalBytes are caller bugs.
        throw new HttpProblemError({
          status: 400,
          typeSlug: 'transcript-before-out-of-range',
          title: 'before is past total_bytes',
          detail: `before=${query.before} exceeds total_bytes=${totalBytes}.`,
          extensions: { before: query.before, totalBytes },
        });
      }
      // before === 0 is the documented terminal call (empty + hasMore: false).
      // readRange handles it without an open(); no special-case here.
      const limit = Math.min(query.limit, MAX_RANGE_LIMIT_BYTES);
      const result = await readRange({
        filePath: sidecar,
        before: query.before,
        limit,
        totalBytes,
      });
      return {
        sessionId: row.id,
        range: { from: result.from, to: result.to },
        totalBytes,
        bytes: result.bytes.toString('base64'),
        hasMore: result.hasMore,
      };
    },
  );
}
