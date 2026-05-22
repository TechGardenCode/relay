---
id: D-G1
status: resolved
title: "Persona application semantics"
resolved-on: 2026-05-14
affects: "prd/03-server.md §4"
surfaced-by: "Deep-dive analysis G1 (the v0.3 PRD §11 prescribed CLAUDE.md mutation as the persona-injection mechanism, which has race conditions with /compact re-reads and pollutes concurrent sessions in the same project)"
---

# D-G1 — Persona application semantics


**Status:** resolved (2026-05-14)
**Affects:** `prd/03-server.md` §4
**Surfaced by:** Deep-dive analysis G1 (the v0.3 PRD §11 prescribed CLAUDE.md mutation as the persona-injection mechanism, which has race conditions with `/compact` re-reads and pollutes concurrent sessions in the same project)

## Question
What guarantees must Relay uphold when applying a persona to a spawned session, and how should the PRD describe persona application?

## Resolution
The PRD describes persona application as three behavioral guarantees, not as a specific mechanism:

1. **Lifetime** — persona remains in effect for the session's full lifetime, including across all agent-internal state transitions
2. **Isolation** — persona application for one session does not affect concurrent sessions in the same project
3. **Invisibility** — the mechanism is not visible to the developer in the project working directory

The mechanism choice (CLI flags, env vars, transient state Relay owns under `~/.relay/`, etc.) belongs to the implementation phase. Spec content lives in `prd/03-server.md` §4.

**Surfaces new sub-questions:** [[nd-08-skill-subset-enforcement-mechanism]] (surfaced 2026-05-15 by the implementation-pass arch doc `docs/arch/persona-application.md`).

**Propagated to:** `prd/03-server.md` §4 (2026-05-14).
