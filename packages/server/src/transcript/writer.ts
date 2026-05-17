import { closeSync, fsyncSync, mkdirSync, openSync, writeSync } from 'node:fs';
import { dirname } from 'node:path';

import type { CreateWriterArgs, TranscriptWriter } from './types.js';

// Per sqlite-schema.md §2: transcript files are sidecars at
// `~/.relay/transcripts/<sid>.bin`; writes are append-only with O_APPEND so
// the kernel serializes concurrent appends and we never seek.
// Per ND-09 precedent (auth/store.ts tokens.json mode): 0o600 keeps the
// privacy-sensitive payload owner-readable only — transcripts contain user
// prompts and agent output.
const SIDECAR_FILE_MODE = 0o600;

export function createWriter(args: CreateWriterArgs): TranscriptWriter {
  // Ensure the parent transcripts/ dir exists; mirrors auth/store.ts which
  // does the same for tokens.json's parent. Idempotent on subsequent writers.
  mkdirSync(dirname(args.filePath), { recursive: true });
  const fd = openSync(args.filePath, 'a', SIDECAR_FILE_MODE);
  let bytes = 0;
  let closed = false;

  return {
    append(chunk: Buffer): void {
      if (closed) {
        throw new Error(`transcript/writer: append after close (${args.filePath})`);
      }
      // O_APPEND means the kernel atomically positions at end-of-file per
      // write; no manual seek required.
      const n = writeSync(fd, chunk);
      bytes += n;
    },
    get bytesWritten(): number {
      return bytes;
    },
    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      // One final fsync on close per the per-append-fsync trade-off recorded
      // in the 6D plan: per-chunk fsync would crush throughput; on crash the
      // ring buffer in `pty/` already covers the trailing-byte window.
      fsyncSync(fd);
      closeSync(fd);
    },
  };
}
