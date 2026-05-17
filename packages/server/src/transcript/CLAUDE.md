# `transcript/` — Module context

Append-only capture of PTY bytes to sidecar files at `~/.relay/transcripts/<session-id>.bin`. Offset math and byte-range reads. Authoritative shape lives in [`docs/arch/sqlite-schema.md`](../../../../docs/arch/sqlite-schema.md) §2 (sidecar decision) and [`docs/prd/03-server.md`](../../../../docs/prd/03-server.md) §5.2.

## Owns

- Append-only writes to the sidecar file given a path (provided by the caller via `config/paths.ts:transcriptPath(sid)`).
- Byte-range reads with half-open `[max(0, before - limit), before)` semantics per ND-04 and a silent 1 MB clamp on `limit`.

## Does NOT own

- The on-attach 32 KB ring buffer (that's `pty/`, per ND-03).
- Compression, redaction, or structured parsing — the file is raw PTY bytes (Phase 3 scope per D-07).
- Subscribing to PTY events itself. **`createWriter` returns a `{ append }` handle**; the wiring `supervisor.onBytes(writer.append)` happens in `session/` (6E). This preserves the `repo-layout.md` §4 invariant that `pty/` never imports `transcript/`.
- Knowledge of session ids. The path is opaque; `session/` (6E) composes `transcriptPath(sid)` and passes it in.

## Public surface

- `createWriter({ filePath }): TranscriptWriter` — opens an `O_APPEND` fd with mode `0o600`. Returns `{ append(chunk), bytesWritten, close() }`. Synchronous `append`; idempotent async `close()` does one final `fsync` before closing the fd.
- `readRange({ filePath, before, limit, totalBytes }): Promise<ReadRangeResult>` — pure read helper. Throws `RangeError` on caller bugs (`before > totalBytes`, `before < 0`, `limit ≤ 0`); the one valid edge `before === 0` returns `{ from: 0, to: 0, bytes: empty, hasMore: false }`.
- `MAX_RANGE_LIMIT_BYTES = 1024 * 1024` — exported so 6F can advertise the clamp in API docs without duplicating the constant.
- `transcriptPath(sid, homeOverride?)` re-exported from `config/paths.ts`.
- Types: `CreateWriterArgs`, `TranscriptWriter`, `ReadRangeArgs`, `ReadRangeResult`.

## Implementation notes

- Writer opens once at construction with `fs.openSync(path, 'a', 0o600)`; `append` calls `fs.writeSync(fd, chunk)`. `O_APPEND` gives kernel-level write serialization so we never seek and concurrent appends from another process (e.g., a crash-recovery scenario) compose safely.
- `bytesWritten` tracks bytes this writer contributed, **not** the file size. The cumulative-since-session-start counter is `sessions.total_bytes` in SQLite (sqlite-schema.md §2), which `session/` (6E) advances using `supervisor.bytesEmitted`.
- Reader opens `fs.open(path, 'r')` + `fd.read(buf, 0, count, offset)` per call — open/close on every range read. Acceptable because pagination is at human cadence (scrolling chat history) and pages are bounded to 1 MB.
- Reader does **not** `stat()` the file. `totalBytes` is the authoritative running counter and `fstat` could disagree mid-append. Caller (6F) reads `sessions.total_bytes` and passes it through.
- File mode `0o600` mirrors `auth/store.ts` for `tokens.json` — transcripts contain user prompts and agent output, same privacy class.

## Test isolation

Temp dir per test (`fs.mkdtempSync`); no writes against the dev host's `~/.relay/transcripts/`. `fast-check` property tests for byte-range math live in `reader.test.ts` (per ND-04): half-open width, exclusive upper bound, backward-walk tile invariant, silent clamp, `hasMore` correctness, byte fidelity.

## Surprising constraints

- **Writes are append-only; never seek; offsets are byte counts from session start, never logical messages** (per ND-04). Range-read math is byte-arithmetic against the sidecar file.
- One file per session, named by session id. **Files are never rewritten** — recovery from a partial write is to re-append, not to truncate-and-replay.
- **The sidecar path is computed, not stored.** `sessions` carries `total_bytes` (sqlite-schema.md §2) but no `transcript_path` column — `config/paths.ts:transcriptPath(sid)` is the only source of truth for the on-disk location. Sidecar files live in `~/.relay/transcripts/` and are part of the `~/.relay/` backup boundary.
- `readRange` **throws** on caller bugs (`before > totalBytes`, `limit ≤ 0`). It does NOT silently clamp `before` — the caller (6F) is responsible for passing a valid value (per ND-04 rule 5, the initial scroll-back call uses `before=<total_bytes>` from session metadata). The one valid edge is `before === 0`, which returns an empty result with `hasMore: false`.
- `readRange` clamps `limit` to `MAX_RANGE_LIMIT_BYTES` **silently** (ND-04 rule 2). The response does not carry a "clamped" flag.
- Writer does **not** fsync per append. One final `fsync` on `close()`; crash-loss of trailing bytes is covered by `pty/`'s in-memory ring buffer for the replay window.
- Mid-stream write errors throw out of `append()`. The caller (`session/` 6E) is responsible for killing the PTY and choosing the `terminated_reason` — `transcript/` does not own that vocabulary.
