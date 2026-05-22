---
id: ND-14
status: resolved
title: "Transcript response field naming (camelCase)"
resolved-on: 2026-05-17
affects: "prd/03-server.md §2 (transcript response snippet)"
surfaced-by: "build-plan 6F preflight (2026-05-17) — docs/arch/rest-conventions.md §6 explicitly names the prd/03-server.md §2 transcript snippet as a known inconsistency: it predates the REST conventions doc and uses snake_case keys (session_id, total_bytes, has_more), but the project-wide convention per rest-conventions §6 is camelCase for payload fields. The doc also commits to filing this propagation entry at implementation time (rest-conventions.md §7)."
---

# ND-14 — Transcript response field naming (camelCase)


**Status:** resolved (2026-05-17)
**Affects:** `prd/03-server.md` §2 (transcript response snippet)
**Surfaced by:** build-plan 6F preflight (2026-05-17) — `docs/arch/rest-conventions.md` §6 explicitly names the `prd/03-server.md` §2 transcript snippet as a known inconsistency: it predates the REST conventions doc and uses `snake_case` keys (`session_id`, `total_bytes`, `has_more`), but the project-wide convention per rest-conventions §6 is `camelCase` for payload fields. The doc also commits to filing this propagation entry at implementation time (rest-conventions.md §7).

## Question
When 6F implements the `GET /sessions/:id/transcript` handler, which key naming does the response body use — the `snake_case` shown in `prd/03-server.md` §2 (and historically in [[nd-04-transcript-pagination-api-shape]]'s Resolution example) or the `camelCase` mandated by `docs/arch/rest-conventions.md` §6?

## Resolution
**`camelCase`. The implementation ships `sessionId`, `totalBytes`, `hasMore`; the PRD snippet is rewritten to match.** No other field renames — `range`, `bytes` are unchanged because they are already single-token, `range.from` / `range.to` are unchanged because they were already `camelCase`-by-default.

1. **Wire shape (both modes).**
   ```json
   {
     "sessionId": "<ULID>",
     "range": { "from": 0, "to": 32768 },
     "totalBytes": 1048576,
     "bytes": "<base64-encoded raw PTY bytes>",
     "hasMore": true
   }
   ```
2. **Zod schema location.** `packages/protocol/src/rest/transcript.ts` — co-located with the rest of the 6F REST schemas (per `packages/server/src/server/rest/` plan in 6F).
3. **ND-04 deliberation record stays.** [[nd-04-transcript-pagination-api-shape]]'s Resolution example uses the original `snake_case` rendering. Per the propagation protocol's separation of concerns (Resolution = deliberation record, subdoc = spec), that record is **not** rewritten — the canonical wire shape lives in this entry and in `prd/03-server.md` §2. A reader walking ND-04 should treat the field names there as illustrative-at-time-of-resolution and defer to ND-14 + the propagated PRD snippet for the canonical rendering.
4. **Status codes / cursor semantics unchanged.** Half-open `[max(0, before - limit), before)`, 1 MB silent clamp on `limit`, `hasMore = range.from > 0`, full-export mode returns `range = { from: 0, to: totalBytes }` — all inherited from [[nd-04-transcript-pagination-api-shape]]. ND-14 is **only** about field-name spelling on the wire.

**Why a separate ND and not an in-place edit of ND-04:** ND-04 resolved on 2026-05-15 before `docs/arch/rest-conventions.md` was filed. The convention shift came from 2E, not from re-litigating ND-04. Filing this as a discrete entry keeps the deliberation timeline honest (the inconsistency was identified *after* both ND-04 and the PRD §2 snippet were written) and makes the propagation queryable — anyone scanning the log can see exactly when the field-name shift landed and where it propagated.

**Propagated to:** `prd/03-server.md` §2 (2026-05-17).
