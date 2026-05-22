---
id: D-03
status: resolved
title: "MCP set changes mid-session"
resolved-on: 2026-05-14
affects: "prd/03-server.md"
surfaced-by: "Original PRD §15 Q3"
---

# D-03 — MCP set changes mid-session


**Status:** resolved (2026-05-14)
**Affects:** `prd/03-server.md`
**Surfaced by:** Original PRD §15 Q3

## Question
What happens if a persona's MCP server list changes while a session is running?

## Current thinking
No-op. MCP set is locked at session spawn. Restart for changes to take effect.

## Resolution
**MCP set is locked at session spawn time.** Changes to a persona's MCP server list while a session is running are a no-op for that session — the running agent process continues with whatever MCP set was in effect when it was spawned. Operators apply changes by stopping and restarting the session; surfaced in the IDE/CLI as an explicit restart-required indicator on the session.

**Why:** Mutating MCP wiring on a live agent process risks half-configured tool calls and out-of-band failure modes. A clean "stop, restart, new MCP set" boundary is simpler to reason about and matches how the underlying agent CLIs treat tool configuration.

**Propagated to:** `prd/03-server.md` §9 (2026-05-14).
