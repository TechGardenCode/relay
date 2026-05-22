---
id: D-04
status: resolved
title: "Transcript export endpoint"
resolved-on: 2026-05-14
affects: "prd/03-server.md §2"
surfaced-by: "Original PRD §15 Q4"
---

# D-04 — Transcript export endpoint


**Status:** resolved (2026-05-14)
**Affects:** `prd/03-server.md` §2
**Surfaced by:** Original PRD §15 Q4

## Question
Should the server expose a transcript export endpoint for offline review?

## Current thinking
Yes, `GET /sessions/:id/transcript` returns full JSON. Useful for backups and Phase 4 audit.

## Resolution
**Yes — and promoted to MVP because [[d-g3-reattach-semantics]] depends on it for historical scroll-back.** `GET /sessions/:id/transcript` is a Phase 1 endpoint with two modes:

1. **Full export.** `GET /sessions/:id/transcript?format=full` returns the whole session transcript as JSON. Use case: backups, offline review, future audit.
2. **Paginated read.** `GET /sessions/:id/transcript?before=<offset>&limit=<n>` returns a slice of bytes anchored before a given offset, capped at `<n>`. Use case: client-side infinite scroll-back from D-G3.

Exact pagination shape (offset-vs-cursor, byte-vs-message indices, response framing) → [[nd-04-transcript-pagination-api-shape]].

**Why promoted:** D-G3's "live forward + scroll back" UX needs an API for pulling older bytes on demand. Inventing a parallel history mechanism just for reattach would duplicate this endpoint, so it ships in Phase 1 instead of Phase 3.

**Propagated to:** `prd/03-server.md` §2 (2026-05-14).
