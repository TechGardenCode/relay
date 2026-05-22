---
id: ND-27
status: open
title: "Stability commitment for the WS endpoint as a third-party surface"
affects: "docs/arch/ws-protocol.md §8 (versioning), docs/prd/03-server.md §2, docs/arch/client-agnosticism.md §5"
surfaced-by: "Client-agnosticism audit, 2026-05-22 (see [`docs/arch/client-agnosticism.md`](../arch/client-agnosticism.md) §5)"
---

# ND-27 — Stability commitment for the WS endpoint as a third-party surface


**Status:** open
**Affects:** `docs/arch/ws-protocol.md` §8 (versioning), `docs/prd/03-server.md` §2, `docs/arch/client-agnosticism.md` §5
**Surfaced by:** Client-agnosticism audit, 2026-05-22 (see [`docs/arch/client-agnosticism.md`](../arch/client-agnosticism.md) §5)

## Question
Today `docs/arch/ws-protocol.md` is authoritative but explicitly labeled `v0.1` and §8 defers versioning to a future migration ("absence of `v` ≡ v1 — a one-line server change"). Do we commit `GET /sessions/:id/stream` as a public, breaking-change-controlled surface for third-party clients, and if so, when — at MVP launch, at Phase 2 (PWA) launch, or never (internal-only with no third-party guarantee)?

## Context
The audit in [`docs/arch/client-agnosticism.md`](../arch/client-agnosticism.md) §4.2 establishes that a wire-level client can consume the WS endpoint today: the frames are documented, the framing model is client-neutral, and the implementation matches the spec. What's missing is a *commitment* — a third-party tool building against `ws-protocol.md` has no contract that the next minor server release won't rename a frame, change a field, or drop a code path. Without a stability commitment, the audit's "bring your own client" claim is technically true but practically fragile.

This entry is the architectural counterpart to ND-26 (publishing `@relay/protocol`). Publishing the package surfaces the schemas; this entry asks whether the wire those schemas describe is itself a stable contract. The two could resolve independently — publish the package without freezing the wire, or freeze the wire without publishing the package — but they share the same trigger (third-party adoption becomes load-bearing) and should be resolved as a pair when that trigger fires.

## Options under consideration
- **Option A — Freeze at MVP with a documented SLA.** Commit ws-protocol.md v1 as breaking-change-controlled the moment the server reaches MVP. Maximum signal to third-party consumers; commits us before we know whether PWA pressure will force a wire revision.
- **Option B — Freeze at Phase 2 launch.** Stay in v0.x through Phase 1 (when only first-party clients ship), commit to stability when the PWA's external-cadence release begins or when the first third-party tool asks. Mirrors ND-26 Option B.
- **Option C — Explicitly internal-only.** State in `ws-protocol.md` §8 that the wire is implementation-detail and may change between any two versions. Effectively closes the "bring your own client" story — third-party clients can build against it, but only at their own risk. Maximum freedom to evolve; signals to potential third-party adopters that they should wait or use process-level integration (per `client-agnosticism.md` §4.1).
- **Option D — Tier the surface.** Some frames (`hello`, binary output, `claim`/`claim_ack`/`send`/`release`) are committed at MVP; others (resize, error codes, future capability negotiation) remain unstable. Lets us freeze the load-bearing core without locking the whole surface.

## Current thinking
No preference yet, but Option C effectively closes the "bring your own client" story that motivated the audit, so the trade-off should be made deliberately rather than by default. Option B is the natural mirror of ND-26 Option D — both deferrals trigger on the same Phase 2 / third-party-tool-asks event. Option D is the most nuanced but requires drawing the tier line, which is itself a decision worth surfacing as a child ND if pursued.

## Resolution
*(unresolved)*
