---
id: ND-04
status: resolved
title: "Transcript pagination API shape"
resolved-on: 2026-05-15
affects: "prd/03-server.md §2"
surfaced-by: "[[d-g3-reattach-semantics]] resolution, [[d-04-transcript-export-endpoint]] resolution"
---

# ND-04 — Transcript pagination API shape


**Status:** resolved (2026-05-15)
**Affects:** `prd/03-server.md` §2
**Surfaced by:** [[d-g3-reattach-semantics]] resolution, [[d-04-transcript-export-endpoint]] resolution

## Question
What is the exact shape of the paginated transcript API (`GET /sessions/:id/transcript?...`)? D-G3 and D-04 reference the endpoint but don't pin down pagination semantics, identifier types, or response framing.

## Resolution
**Byte-offset pagination, exclusive upper bound, base64 byte payload, same response shape for both clients.** Because PTY-layer capture ([[d-07-transcript-stream-capture-layer]]) gives us a flat byte stream with no message structure, bytes are the only natural addressable unit at MVP.

1. **Paginated read.** `GET /sessions/:id/transcript?before=<byte_offset>&limit=<n>` returns bytes in the half-open range `[max(0, before - limit), before)`. `before` is an **exclusive** upper bound (the byte at `before` is *not* included in the response); the client passes the lowest `from` it has previously received as the next call's `before` to walk backward.
2. **`limit`.** Byte count cap. Server enforces a hard maximum of 1 MB per call; requests with larger `limit` are silently clamped to 1 MB.
3. **Response framing.**
   ```json
   {
     "session_id": "<uuid>",
     "range": { "from": 0, "to": 32768 },
     "total_bytes": 1048576,
     "bytes": "<base64-encoded raw PTY bytes>",
     "has_more": true
   }
   ```
   `range.from` and `range.to` are inclusive-from / exclusive-to byte offsets relative to the session's first captured byte (offset 0). `has_more` is `true` when `range.from > 0` — i.e., there is older content to fetch.
4. **Full export.** `GET /sessions/:id/transcript?format=full` returns the same shape with `range = { from: 0, to: total_bytes }` and the entire transcript in `bytes`. The two modes are mutually exclusive query-string shapes.
5. **Initial scroll-back call.** The first call from a freshly-attached client uses `before=<total_bytes>` (returned in the session's metadata on attach) and the client's preferred `limit`.
6. **No cursor opacity.** Offsets are stable for the lifetime of the session — PTY bytes are append-only and never rewritten. Cursor-based pagination buys nothing here and would obscure what the client is asking for.
7. **Both renderings consume the same response.** The IDE terminal widget feeds `bytes` (after base64 decode) straight into its PTY renderer; the PWA chat renderer decodes the same `bytes` and applies its own chat-style framing. Server logic does not branch by client.

**Why byte offsets and not message indices:** D-07 commits the transcript to PTY-layer bytes precisely because message structure is agent-CLI-specific. Adding a message index would either reintroduce that coupling or require a parallel structure pipeline we don't have at MVP.

**Why exclusive `before` and not inclusive:** Walking backward is "give me N bytes ending before what I already have." Exclusive avoids off-by-one duplication when the client chains calls.

**Propagated to:** `prd/03-server.md` §2 (2026-05-15).
