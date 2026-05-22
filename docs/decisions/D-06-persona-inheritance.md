---
id: D-06
status: resolved
title: "Persona inheritance"
resolved-on: 2026-05-14
affects: "prd/01-conceptual-model.md"
surfaced-by: "Original PRD §15 Q6"
---

# D-06 — Persona inheritance


**Status:** resolved (2026-05-14)
**Affects:** `prd/01-conceptual-model.md`
**Surfaced by:** Original PRD §15 Q6

## Question
Should personas support inheritance (one persona extends another)?

## Current thinking
No at MVP. Personas are flat YAML. Composition handled by enabling skill subsets.

## Resolution
**No inheritance at MVP.** Personas are flat YAML definitions. Composition is handled by enabling skill subsets — if a user wants "architect + dev capabilities," they create a persona whose skill list is the union of what they want, not by extending one persona from another.

**Why:** Inheritance adds resolution-order complexity (override semantics, deep-vs-shallow merge, diamond cases) that's not justified at the MVP scale. Users have at most a handful of personas; duplication of a few YAML lines is cheaper than the cognitive overhead of an inheritance model.

**Re-evaluate if:** persona counts grow into double digits per user and duplication becomes a maintenance burden.

**Propagated to:** `prd/01-conceptual-model.md` Persona entity (2026-05-14).
