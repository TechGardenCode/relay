---
id: ND-28
status: open
title: "Programmatic / machine-to-machine credential flow"
affects: "docs/prd/03-server.md §6 (auth), docs/arch/rest-conventions.md §3, docs/arch/client-agnosticism.md §5"
surfaced-by: "Client-agnosticism audit, 2026-05-22 (see [`docs/arch/client-agnosticism.md`](../arch/client-agnosticism.md) §5)"
---

# ND-28 — Programmatic / machine-to-machine credential flow


**Status:** open
**Affects:** `docs/prd/03-server.md` §6 (auth), `docs/arch/rest-conventions.md` §3, `docs/arch/client-agnosticism.md` §5
**Surfaced by:** Client-agnosticism audit, 2026-05-22 (see [`docs/arch/client-agnosticism.md`](../arch/client-agnosticism.md) §5)

## Question
The only documented credential flow today is interactive OAuth via `relay init` ([[d-13-first-run-pairing-ux]] + [[nd-19-claude-login-oauth-as-the-documented-credential-default-anthropic-api-key-as-fallback]]). A headless integration scenario — a CI bot, a server-to-server proxy, an automated agent driving Relay via REST/WS — has no documented credential path. Do we add a `POST /tokens` PAT (personal access token) flow (or equivalent), and how does it interact with the OAuth credential storage already in `~/.relay/`?

## Context
The audit in [`docs/arch/client-agnosticism.md`](../arch/client-agnosticism.md) §4.2 establishes that the WS endpoint is wire-level open to any client. But the bearer-token check at upgrade time ([`ws-protocol.md`](../arch/ws-protocol.md) "out of scope" — gated on `prd/03-server.md` §6) is the first gate any client hits, and the only way to obtain a bearer today is to run `relay init` interactively. A headless tool — Herdr's socket-API consumer running on a shared server, a CI bot that wants to spawn a Relay session per pipeline, a third-party automation that drives Relay over REST — has no documented path to a credential.

This is distinct from the agent-side credential question ([D-10](D-10-agent-model-credentials-handling.md)) which is about how the spawned Claude Code process authenticates against Anthropic. This entry is about the Relay-side credential — how does a non-human client obtain the bearer token that lets it call `POST /sessions` and open the WS?

The MVP threat model (`prd/00-overview.md` G-7 — self-host single-user) tolerates a missing M2M flow; the operator is the only one creating tokens, and they can do it interactively. The need for this flow is gated on whether anyone wants to integrate programmatically before then.

## Options under consideration
- **Option A — Add `POST /tokens` PAT flow.** Operator-authenticated REST endpoint that mints a new bearer token with a configurable label and expiry; the new token is shown once and never again. Mirrors GitHub PAT / Gitea / Fastify-typical patterns. Composes cleanly with the existing `relay token list` / `revoke` surface ([[nd-10-relay-token-list-subcommand-surface-alignment]]). Cleanest path; adds one REST route + a `relay token create` CLI subcommand.
- **Option B — Recipe-only.** Document a "use `relay init`'s output as a PAT" pattern — the OAuth-issued bearer is already a token; just don't rotate it. No new code; no new auth path. The downside is rotation: the OAuth flow is interactive, so a long-lived M2M bearer can't be rotated without operator presence at the host.
- **Option C — Defer until first concrete use case.** Leave the spec silent on M2M; if/when a third-party tool asks, that's when the decision becomes load-bearing. Lowest cost; the audit doc explicitly names the gap so a future adopter has somewhere to look.
- **Option D — Service-account model.** Add a separate `service_accounts` table with their own credentials (not OAuth-issued bearers). Heaviest lift; matches enterprise expectations but probably overkill for the self-host single-user MVP threat model.

## Current thinking
No preference yet. Option A is the cleanest from a wire perspective but requires deciding token lifecycle (expiry, scopes, rotation) before Phase 1. Option C is the most honest about where we are — the gap exists, but no concrete use case is pulling on it yet. Option B is the lowest-cost compromise but couples the M2M story to OAuth's rotation cadence, which may be the wrong shape long-term. Re-evaluate when ND-26 / ND-27 resolve toward a third-party-public surface.

## Resolution
*(unresolved)*
