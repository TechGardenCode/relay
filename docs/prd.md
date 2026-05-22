# PRD: Relay — AI Coding Session Orchestration Layer

**Working name:** Relay (TBD)
**Owner:** Kian
**Status:** v0.4
**Date:** May 2026

---

## What Relay is

Relay is a lightweight orchestration service that owns the lifecycle of CLI-based AI coding agents (Claude Code at MVP), holds long-running sessions on a server, and exposes them to multiple clients (an IDE extension on desktop, a PWA on mobile). On top of that backbone, Relay adds a structured project + persona context model so developers can switch between roles (architect, dev, test, infra) without hand-editing config files. The product is editor-agnostic, agent-agnostic, and portable across local / homelab / on-prem / cloud-native deployment shapes.

Relay solves two co-equal burning pains with one architectural backbone: **cross-device discontinuity** (close the laptop, lose the session) and **context-switching cost** across concurrent multi-session AI coding workflows.

---

## How this PRD is organized

This document is an index. Each subdoc below is independently loadable and reads as a complete artifact in isolation. Read [00-overview.md](prd/00-overview.md) first; everything else can be loaded on demand.

| File | Covers |
|---|---|
| [`prd/00-overview.md`](prd/00-overview.md) | What Relay is, headline value props, differentiation, goals, non-goals |
| [`prd/01-conceptual-model.md`](prd/01-conceptual-model.md) | Tenant / Project / Persona / Session entities and relationships |
| [`prd/02-architecture.md`](prd/02-architecture.md) | System diagram, deployment shapes, architectural backbone |
| [`prd/03-server.md`](prd/03-server.md) | Server responsibilities, API, state, persona-application guarantees, multi-client contracts, native config preservation |
| [`prd/04-ide-extension.md`](prd/04-ide-extension.md) | VS Code-family extension spec |
| [`prd/05-mobile-pwa.md`](prd/05-mobile-pwa.md) | Mobile PWA scope (Phase 2; detailed UX deferred to a separate design doc) |
| [`prd/06-distribution.md`](prd/06-distribution.md) | Packaging, configuration, persistence, process supervision |
| [`prd/07-phasing.md`](prd/07-phasing.md) | Phase 0–4 roadmap |
| [`prd/08-acceptance.md`](prd/08-acceptance.md) | Phase 1 Definition of Done — eight-scenario behavior matrix |
| [`prd/09-persona-schema.md`](prd/09-persona-schema.md) | Persona YAML schema, file locations, validation, default persona set |

## Open decisions

Every unresolved product decision affecting this PRD lives in **[`decisions/index.md`](decisions/index.md)** at the top level (not under `prd/`). That document is a first-class peer of this index. It is expected to grow as new gaps surface during PRD iteration and implementation; subdocs reference entries there by ID rather than re-litigating decisions in multiple places.

**No decisions are currently load-bearing for Phase 1 implementation.** All Phase 1–relevant D-NN and ND-NN entries are resolved with spec content propagated into the subdocs; remaining decision-log entries are explicitly deferred to later phases (`D-02` to Phase 2, `D-05` to Phase 3, `D-14` to pre-launch naming review) with `MVP behavior` documented on each.

See `decisions/index.md` for the current Index and propagation status.
