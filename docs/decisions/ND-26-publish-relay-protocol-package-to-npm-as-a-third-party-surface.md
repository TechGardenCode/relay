---
id: ND-26
status: open
title: "Publish `@relay/protocol` package to npm as a third-party surface"
affects: "packages/protocol/, docs/arch/ws-protocol.md §8 (versioning), docs/arch/repo-layout.md §3"
surfaced-by: "Client-agnosticism audit, 2026-05-22 (see [`docs/arch/client-agnosticism.md`](../arch/client-agnosticism.md) §5)"
---

# ND-26 — Publish `@relay/protocol` package to npm as a third-party surface


**Status:** open
**Affects:** `packages/protocol/`, `docs/arch/ws-protocol.md` §8 (versioning), `docs/arch/repo-layout.md` §3
**Surfaced by:** Client-agnosticism audit, 2026-05-22 (see [`docs/arch/client-agnosticism.md`](../arch/client-agnosticism.md) §5)

## Question
Should the Zod schemas and TypeScript types in `packages/protocol/` (REST common, WS frames, persona YAML, spawn-record) be published as a public npm package — `@relay/protocol` — so third-party clients can `npm install @relay/protocol` instead of copying schema files or hard-coding JSON shapes? If yes, what semver commitment do we make, and how does it interact with the WS protocol version field discussed in `ws-protocol.md` §8?

## Context
The protocol package was deliberately carved off as a separate workspace at repo bootstrap so that REST/WS schemas, server validation, and client TS types all flow from a single source ([`docs/arch/repo-layout.md`](../arch/repo-layout.md) §3 — "no I/O, no Node-only deps, portable to the browser-bound PWA"). At MVP it is consumed only by `@relay/relay` (server + attach) and the future `@relay/pwa`. Today it is **not published to npm** — third-party clients would have to vendor the Zod schemas, copy the TS types, or hand-write JSON shape assumptions against `docs/arch/ws-protocol.md`.

This is the lowest-friction packaging gap surfaced by the audit. The protocol surface is already designed to be portable (browser-safe, no Node-only deps); the only blocker is the publish decision and its semver implications. `ws-protocol.md` §8 currently defers versioning to a future "v2" with a one-line server change; publishing the package forces the question of whether the schemas track the server version, the wire version, or a separate package version.

## Options under consideration
- **Option A — Publish at MVP with semver-stable schemas.** `@relay/protocol@1.x` ships alongside the first MVP server release; breaking schema changes bump the package major and align with a wire-protocol major. Maximum signal to third-party consumers; commits us to a stability contract before we know whether the schemas need to evolve fast under PWA pressure.
- **Option B — Publish gated on Phase 2 / PWA stabilization.** Keep the package private through Phase 1; flip to public the moment the PWA forces the wire to be load-bearing for a non-bundled client. Delays the commitment but loses the discoverability win for any third-party tool that wants to integrate during Phase 1.
- **Option C — Keep private indefinitely; document the schemas inline in `ws-protocol.md`.** Third-party clients consume the protocol from the spec doc, not from the package. Zero ongoing maintenance cost; loses the type-safety benefit and forces consumers to re-derive Zod schemas.
- **Option D — Publish under an explicit `@relay/protocol@0.x` "unstable" line.** Ship the package now, signal that the schemas may break across 0.minor bumps until 1.0. Lower commitment than A but higher than B; matches how the spec itself is currently labeled v0.1.

## Current thinking
No preference yet. Option D ("0.x unstable") looks like the lowest-regret path — it lets the package exist and be installable today without locking in semver stability before the PWA stress-tests the schema surface. The decision becomes load-bearing when either (a) a third-party tool asks for installable types, or (b) the PWA begins consuming the schemas from a separate repo. Re-evaluate when one of those triggers fires.

## Resolution
*(unresolved)*
