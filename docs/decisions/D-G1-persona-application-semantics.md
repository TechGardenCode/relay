---
id: D-G1
status: deferred
title: "Persona application semantics"
deferred-until: "Phase 2 — persona re-enable per D-17"
affects: "prd/03-server.md §4"
surfaced-by: "Deep-dive analysis G1 (the v0.3 PRD §11 prescribed CLAUDE.md mutation as the persona-injection mechanism, which has race conditions with /compact re-reads and pollutes concurrent sessions in the same project)"
---

# D-G1 — Persona application semantics


**Status:** deferred (until Phase 2 — persona re-enable per D-17)
**Affects:** `prd/03-server.md` §4
**Surfaced by:** Deep-dive analysis G1 (the v0.3 PRD §11 prescribed CLAUDE.md mutation as the persona-injection mechanism, which has race conditions with `/compact` re-reads and pollutes concurrent sessions in the same project)
**Superseded-for-MVP by:** [[d-17-personas-descoped-from-mvp]] — personas were descoped from the MVP on 2026-05-28 (originally resolved 2026-05-14). The three application guarantees below still stand as the Phase 2 design, but are **not in force at MVP**: sessions spawn a bare agent with an empty argv, so no persona is applied. They re-enter force when personas return in Phase 2.

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
