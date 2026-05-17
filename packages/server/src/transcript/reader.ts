import { open } from 'node:fs/promises';

import { MAX_RANGE_LIMIT_BYTES, type ReadRangeArgs, type ReadRangeResult } from './types.js';

// Per ND-04: byte-offset pagination over the sidecar file. The range is
// half-open `[max(0, before - limit), before)` — `before` is exclusive so
// chained backward-walk calls never duplicate a byte. `limit` is clamped to
// MAX_RANGE_LIMIT_BYTES silently (rule 2). The reader does not stat() the
// sidecar — `totalBytes` is authoritative, sourced from `sessions.total_bytes`
// (sqlite-schema.md §2).
export async function readRange(args: ReadRangeArgs): Promise<ReadRangeResult> {
  const { filePath, before, limit, totalBytes } = args;

  if (!Number.isInteger(before) || before < 0) {
    throw new RangeError(
      `transcript/readRange: before must be a non-negative integer, got ${before}`,
    );
  }
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new RangeError(`transcript/readRange: limit must be a positive integer, got ${limit}`);
  }
  if (!Number.isInteger(totalBytes) || totalBytes < 0) {
    throw new RangeError(
      `transcript/readRange: totalBytes must be a non-negative integer, got ${totalBytes}`,
    );
  }
  if (before > totalBytes) {
    throw new RangeError(
      `transcript/readRange: before (${before}) past totalBytes (${totalBytes}) — caller should clamp before calling`,
    );
  }

  const effectiveLimit = Math.min(limit, MAX_RANGE_LIMIT_BYTES);
  const from = Math.max(0, before - effectiveLimit);
  const to = before;
  const count = to - from;

  if (count === 0) {
    // Terminal call (before === 0). Valid; not an error.
    return { from: 0, to: 0, bytes: Buffer.alloc(0), hasMore: false };
  }

  const fd = await open(filePath, 'r');
  try {
    const buf = Buffer.allocUnsafe(count);
    const { bytesRead } = await fd.read(buf, 0, count, from);
    if (bytesRead !== count) {
      // sessions.total_bytes claims more than the sidecar holds — a store/
      // ↔ transcript/ invariant violation. Should never happen in practice.
      throw new Error(
        `transcript/readRange: short read at offset ${from} (expected ${count}, got ${bytesRead}) — sidecar shorter than sessions.total_bytes`,
      );
    }
    return { from, to, bytes: buf, hasMore: from > 0 };
  } finally {
    await fd.close();
  }
}
