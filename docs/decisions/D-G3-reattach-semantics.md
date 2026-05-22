---
id: D-G3
status: resolved
title: "Reattach semantics"
resolved-on: 2026-05-14
affects: "prd/03-server.md §5.2, prd/08-acceptance.md scenarios D and E, prd/02-architecture.md"
surfaced-by: "Deep-dive analysis G3 (the v0.3 PRD said \"reattachment is instant\" and \"conversation continues from where it left off\" without specifying what the reattaching client actually sees)"
---

# D-G3 — Reattach semantics


**Status:** resolved (2026-05-14)
**Affects:** `prd/03-server.md` §5.2, `prd/08-acceptance.md` scenarios D and E, `prd/02-architecture.md`
**Surfaced by:** Deep-dive analysis G3 (the v0.3 PRD said "reattachment is instant" and "conversation continues from where it left off" without specifying what the reattaching client actually sees)

## Question
When a client attaches to a session — whether on initial join or after a disconnect — what does it display? Does the answer differ between initial attach and reattach? Does it differ between client surfaces (IDE terminal vs. mobile)?

## Context
The reattach experience *is* the cross-device value prop. If a developer closes their laptop, opens their phone, and sees a blank terminal because reattach starts at the next byte, the product fails its headline test. Conversely, replaying full history may flash ANSI escapes for several seconds on slow networks, which is also bad UX.

This contract also constrains server-side state: a defined "show last N bytes" or "show pre-rendered snapshot" requires the server to maintain a ring buffer or snapshot. The shape of that state must be decided before implementation.

## Options under consideration
- **Option A — New output only.** Reattaching client sees only bytes emitted after attach. Simplest server-side; worst UX for the headline cross-device test.
- **Option B — Server-side ring buffer replayed on attach.** Server keeps the last N bytes (or N lines, or M seconds) of raw PTY output and replays on every attach. Simple; risks ANSI flash on slow networks; requires picking a window size.
- **Option C — Pre-rendered terminal snapshot.** Server maintains a current terminal-state snapshot (e.g., via xterm.js `SerializeAddon`-equivalent) and sends the snapshot on attach, then live deltas. Cleaner UX; more server CPU per session.
- **Option D — Hybrid.** Snapshot for "where am I now" plus structured transcript (from the agent's session JSONL) for "the conversation so far." Aligns naturally with mobile PWA needs. Highest implementation cost.

## Current thinking
No final lean yet. Option B is a reasonable Phase 1 floor; Option D is the natural Phase 2 evolution if mobile diverges from terminal rendering. Worth deciding the floor and whether the contract differs by client surface.

## Resolution
**Live-forward priority on attach, with a paginated transcript API for historical scroll-back.** The contract:

1. **Live stream is immediate.** On attach (initial or reattach), the server begins streaming current PTY output to the client without delay.
2. **Small initial replay for context.** Alongside live streaming, the server sends a short replay of recent output — target one terminal viewport (~24KB raw bytes). This prevents a blank-terminal experience on reattach without an ANSI-flash storm. Exact size → [[nd-03-ring-buffer-size-for-attach-replay]].
3. **Deeper history is pull-on-demand.** For older context, clients call a paginated transcript API (e.g., `GET /sessions/:id/transcript?before=<offset>&limit=<n>`) and render bytes on demand. This supports the "infinite scroll back in time" experience.
4. **Single contract, two renderings.** Server-side behavior does not branch by client surface. The IDE terminal widget renders bytes inline using the terminal's native scrollback; the (future) mobile PWA renders chat-style with scroll-back pulling from the same API.
5. **Server-side state required:** per-session in-memory ring buffer (~256KB) for the on-attach replay; full transcript persisted via the transcript store (SQLite or JSONL) for the paginated API.

**Why this and not full ring-buffer replay (Option B) or snapshot rendering (Option C):** The headline cross-device test ("close laptop, open phone, see what's happening") passes with just the viewport-sized replay — the user gets current state immediately, then pulls more if they want it. Full replay risks long ANSI flash on slow networks. Snapshot rendering requires terminal-state serialization that's heavier than MVP needs. Reusing the transcript endpoint avoids inventing parallel history mechanisms.

**Promotes:** [[d-04-transcript-export-endpoint]] from Phase 3 audit to MVP — the paginated transcript API is now load-bearing for D-G3.

**Surfaces new sub-questions:** [[nd-03-ring-buffer-size-for-attach-replay]], [[nd-04-transcript-pagination-api-shape]].

**Propagated to:** `prd/03-server.md` §5.2 (2026-05-14), `prd/08-acceptance.md` scenarios D and E (2026-05-14), `prd/02-architecture.md` Architectural backbone (2026-05-14).
