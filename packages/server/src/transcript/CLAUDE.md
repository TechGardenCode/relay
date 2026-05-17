# `transcript/` — Module context

Append-only capture of PTY bytes to sidecar files at `~/.relay/transcripts/<session-id>.bin`. Offset math and byte-range reads. Authoritative shape lives in [`docs/arch/sqlite-schema.md`](../../../../docs/arch/sqlite-schema.md) §3 (sidecar decision) and [`docs/prd/03-server.md`](../../../../docs/prd/03-server.md) §5.2.

## Owns

- Subscribing to `pty/` byte events and writing them to the sidecar file.
- Byte-range reads given `(start, end)` offsets.

## Does NOT own

- The on-attach 32 KB ring buffer (that's `pty/`, per ND-03).
- Compression, redaction, or structured parsing — the file is raw PTY bytes.
- The `sessions.transcript_path` row (→ `store/` writes it; this module reads it to know where to append).

## Test isolation

Temp dir per test (`fs.mkdtemp`); no writes against the dev host's `~/.relay/transcripts/`. `fast-check` property tests for byte-range math (per ND-04).

## Surprising constraints

- **Writes are append-only; never seek; offsets are byte counts from session start, never logical messages** (per ND-04). Range-read math is byte-arithmetic against the sidecar file.
- One file per session, named by session id. Files are never rewritten — recovery from a partial write is to re-append, not to truncate-and-replay.
- Sidecar files live in `~/.relay/transcripts/`, not in the SQLite DB. They are part of the `~/.relay/` backup boundary (per [`sqlite-schema.md`](../../../../docs/arch/sqlite-schema.md) §3).
