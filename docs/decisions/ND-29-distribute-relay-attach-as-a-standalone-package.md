---
id: ND-29
status: deferred
deferred-until: "a third-party tool surfaces with constrained-distribution requirements, or the Phase 2 PWA grows a native-helper companion that wants only the attach client"
title: "Distribute `relay attach` as a standalone package"
affects: "packages/server/src/attach/, docs/arch/repo-layout.md §3, docs/prd/04-ide-extension.md §4"
surfaced-by: "Client-agnosticism audit, 2026-05-22 (see [`docs/arch/client-agnosticism.md`](../arch/client-agnosticism.md) §5)"
---

# ND-29 — Distribute `relay attach` as a standalone package


**Status:** deferred (until a third-party tool surfaces with constrained-distribution requirements, or the Phase 2 PWA grows a native-helper companion that wants only the attach client)
**Affects:** `packages/server/src/attach/`, `docs/arch/repo-layout.md` §3, `docs/prd/04-ide-extension.md` §4
**Surfaced by:** Client-agnosticism audit, 2026-05-22 (see [`docs/arch/client-agnosticism.md`](../arch/client-agnosticism.md) §5)

## Question
`relay attach` ships inside `@relay/relay` (the server package) as a thin client that the VS Code extension shells out to ([`prd/04-ide-extension.md`](../prd/04-ide-extension.md) §4). A third-party tool that wants to embed the thin client without installing the whole server has no clean path — they pull down a server binary, never start it, and run only the attach subcommand. Do we extract `relay attach` into its own npm package (`@relay/attach`), or document a "install the server, only run attach" recipe?

## Context
The repo-layout doc ([`docs/arch/repo-layout.md`](../arch/repo-layout.md) §3) commits to a single `@relay/relay` binary that bundles the server, the `relay` CLI, and the `relay attach` thin client. This was deliberate: the IDE extension shells out to `relay attach` rather than implementing the WS state machine itself, and shipping one binary keeps install instructions simple. The audit in [`docs/arch/client-agnosticism.md`](../arch/client-agnosticism.md) §4.3 confirms that "subprocess-of-attach" is a supported integration pattern.

The friction is that a third-party tool consuming the attach client via subprocess pays the full server install cost — Node-pty deps, SQLite, Fastify, the migration runner — to use a single thin client. For a Herdr-style multiplexer that spawns `relay attach` as one of many agents, this is borderline acceptable; for a constrained-distribution scenario (a container, a single-purpose CI image), it is wasteful.

This entry is distinct from ND-26 (publishing the protocol schemas) because the attach client is not just types — it is the WS state machine, the TTY bridge, the raw-mode handling, and the detach gesture ([[nd-25-relay-attach-detach-with-d-requires-two-keypresses-on-the-host-tty]]). Extracting it cleanly would require deciding whether the attach client depends on `@relay/protocol` at runtime or vendors a copy.

## Options under consideration
- **Option A — Extract `@relay/attach` as its own npm package.** The attach client becomes a workspace at `packages/attach/` consuming `@relay/protocol`; the server's `cli/` subcommand depends on the package rather than the inlined module. Cleanest separation; allows `npm install -g @relay/attach` for third-party tools. Heaviest lift — requires splitting the build, deciding the dep direction, and aligning release cadence.
- **Option B — Recipe-only.** Document a "install `@relay/relay`, invoke only `relay attach`" pattern in the README. Zero code changes; preserves the single-binary commitment from `repo-layout.md` §3. The recipe accepts the dep cost (`node-pty`, SQLite, etc.) as the price of zero packaging churn.
- **Option C — Defer; revisit when a third-party tool actually asks.** Leave the spec silent; if/when constrained-distribution friction surfaces, resolve then. The audit doc already names the gap so future adopters can find it.
- **Option D — Provide a stripped binary build.** Keep the single-package commitment but offer a build flag (or a separate dist tag) that produces a smaller `relay-attach` binary with only the thin client. Splits the difference between A and B; introduces build complexity that may not be worth it.

## Current thinking
No preference yet. Option B is the lowest-cost path and is probably right for as long as the IDE extension is the only first-party consumer that does subprocess-spawning — the extension already takes the server install, so the recipe is invisible. Option A becomes attractive if the PWA grows a "native-helper" companion that wants only the attach client, or if a third-party tool surfaces with constrained distribution requirements. Re-evaluate when one of those triggers fires.

## Resolution

Deferred. [[nd-32-install-and-onboarding-deep-dive]] (e) handed the attach-package question to 7D / ND-29 "so it lands in one place," and [[nd-34-session-and-attach-polish-deep-dive]] (h) confirms it: the attach-distribution shape is a third-party-integration concern, not a non-author-daily-use concern, so it does not gate the painless-rollout bar. The single first-party subprocess consumer — the IDE extension — already takes the full `@relay/relay` install, so the recipe cost is invisible today.

**MVP behavior.** `relay attach` stays bundled inside `@relay/relay` per [[d-08-single-binary-vs-separate-packages]]. Third-party tools that want the thin client install the server package and invoke only the `attach` subcommand (Option B, recipe-only) — accepting the `node-pty`/SQLite/Fastify dependency cost as the price of zero packaging churn.

**Default direction when picked up.** Option B (document the "install `@relay/relay`, run only `relay attach`" recipe) for as long as the IDE extension is the only first-party subprocess consumer. Option A (extract `@relay/attach` consuming `@relay/protocol`) becomes the lean if a constrained-distribution consumer (a container, a single-purpose CI image) or a PWA native-helper companion makes the full-install cost actually bite.

**Re-open trigger.** A third-party tool surfaces with constrained-distribution requirements, or the Phase 2 PWA grows a native-helper companion that wants only the attach client.

**Disposition recorded as part of [[nd-34-session-and-attach-polish-deep-dive]] (Track 7D), item (h).**
