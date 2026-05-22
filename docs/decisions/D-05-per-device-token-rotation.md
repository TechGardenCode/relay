---
id: D-05
status: deferred
title: "Per-device token rotation"
deferred-until: "Phase 3 hardening"
affects: "prd/03-server.md §6"
surfaced-by: "Original PRD §15 Q5"
---

# D-05 — Per-device token rotation


**Status:** deferred (until Phase 3 hardening)
**Affects:** `prd/03-server.md` §6
**Surfaced by:** Original PRD §15 Q5

## Question
What is the per-device token rotation policy?

## Current thinking
Indefinite at MVP, revocable via CLI. Rotation in Phase 3.

## Resolution
**Deferred** — rotation is a Phase 3 hardening concern.

**MVP behavior:** Per-device tokens are issued at pairing time and are valid indefinitely. They can be revoked via CLI (`relay token revoke <device>`). No automatic rotation, no expiry.

**Why deferred:** Token rotation requires designing a refresh flow, handling rotation-in-flight failures, and propagating to all attached clients. None of this is load-bearing for Phase 1's "it works on my homelab" target. The MVP behavior is acceptable for a self-hosted, single-user system; rotation matters when multi-tenant or shared-infrastructure deployment becomes a goal.

**Re-open trigger:** Phase 3 hardening, OR any earlier multi-tenant deployment surfaces.
