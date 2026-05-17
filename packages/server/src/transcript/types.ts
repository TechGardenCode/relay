// Per ND-04: the server clamps `limit` to 1 MB silently. Callers (6F) should
// advertise this cap in API docs by importing the constant, not by duplicating
// the number.
export const MAX_RANGE_LIMIT_BYTES = 1024 * 1024;

export interface CreateWriterArgs {
  filePath: string;
}

export interface TranscriptWriter {
  /** Append `chunk` to the sidecar. Synchronous; throws on I/O error. */
  append(chunk: Buffer): void;
  /** Running count of bytes written since this writer was created. */
  readonly bytesWritten: number;
  /** Final fsync + fd close. Idempotent. */
  close(): Promise<void>;
}

export interface ReadRangeArgs {
  filePath: string;
  /**
   * Exclusive upper bound, per ND-04. The byte at offset `before` is NOT
   * returned. `before === 0` is a valid terminal call (returns empty + hasMore: false).
   */
  before: number;
  /** Byte count cap requested by the caller. Clamped to MAX_RANGE_LIMIT_BYTES. */
  limit: number;
  /**
   * Authoritative session size, sourced from `sessions.total_bytes`
   * (sqlite-schema.md §2). The reader does not stat() the sidecar.
   */
  totalBytes: number;
}

export interface ReadRangeResult {
  /** Inclusive lower bound (file offset). */
  from: number;
  /** Exclusive upper bound (file offset). */
  to: number;
  /** Raw bytes in `[from, to)`. The HTTP layer (6F) base64-encodes for the wire. */
  bytes: Buffer;
  /** True when `from > 0` — there is older content to fetch. */
  hasMore: boolean;
}
