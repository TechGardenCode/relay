---
id: ND-41
status: open
title: "Scratch / create-by-path project registration for client-initiated sessions"
affects: "docs/arch/rest-conventions.md (a create-project-by-path route shape); packages/server/src/server/rest/ (the handler); docs/decisions/D-12-project-record-storage-and-relay-project-add-semantics.md (D-12 today registers an existing path in place); docs/arch/pwa/unresolved-dependencies.md §1.1; docs/arch/pwa/feature-modules.md §5 (FR-9 scratch spawn, FR-10 create-project). No SQLite schema change intended (project_id NOT NULL stands)."
surfaced-by: "[[d-18-pwa-terminal-substrate-and-mvp-scope]] §5 (committed to filing this sub-question during the PWA tech-architecture phase); harvested in docs/arch/pwa/unresolved-dependencies.md §1.1 during P2-PWA-tech (2026-07-02)."
---

# ND-41 — Scratch / create-by-path project registration for client-initiated sessions

**Status:** open
**Affects:** `docs/arch/rest-conventions.md` (a create-project-by-path route shape); `packages/server/src/server/rest/` (the handler); [[d-12-project-record-storage-and-relay-project-add-semantics]] (D-12 today registers an *existing* path in place); [`docs/arch/pwa/unresolved-dependencies.md`](../arch/pwa/unresolved-dependencies.md) §1.1; [`docs/arch/pwa/feature-modules.md`](../arch/pwa/feature-modules.md) §5. No SQLite schema change intended (`project_id NOT NULL` stands).
**Surfaced by:** [[d-18-pwa-terminal-substrate-and-mvp-scope]] §5 (committed to filing this sub-question during the PWA tech-architecture phase); harvested in [`docs/arch/pwa/unresolved-dependencies.md`](../arch/pwa/unresolved-dependencies.md) §1.1 during P2-PWA-tech (2026-07-02).

## Question

The PWA's scratch spawn (FR-9) and create-project-from-client (FR-10) both need the server to
**create a working directory and register it as a project** on the client's behalf — scratch under
`~/.relay/scratch/<id>/`, create-project under a client-specified path or a server `mkdir`. Today
[[d-12-project-record-storage-and-relay-project-add-semantics]] (`relay project add`) registers an
*existing* path in place; there is no path that creates the directory. What is the server-side
create-by-path mechanism, and how is the "Scratch" grouping represented?

## Elaboration prompt

Decide the additive REST shape (e.g. an accept-a-server-side-dir mode on the project-create route, or
a distinct scratch-create route) and whether it `mkdir`s or requires the path to pre-exist. Keep
`sessions.project_id NOT NULL` satisfied with **no schema change** — a scratch session registers a
lightweight project so the FK holds. Settle the three open sub-points from
[`server-touchpoints.md`](../design/pwa/server-touchpoints.md) §1: (a) does the scratch dir get
auto-cleaned, and on what trigger (session kill? age? never?); (b) is "Scratch" a reserved project
flag, a path-prefix convention (`~/.relay/scratch/`), or a purely client-side IA view over the flat
project list; (c) how create-project-by-path relates to D-12's existing-path semantics — additive mode
vs. new route. Validate against NFR-5: the route is canonical and must not privilege the PWA — the CLI
and IDE extension see the same surface, and `relay project add`'s existing behaviour must not regress.

## Resolution

*(unresolved)*
