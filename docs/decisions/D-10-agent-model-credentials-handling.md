---
id: D-10
status: resolved
title: "Agent model credentials handling"
resolved-on: 2026-05-15
affects: "prd/03-server.md §3, prd/06-distribution.md"
surfaced-by: "Doc audit (2026-05-15)"
---

# D-10 — Agent model credentials handling


**Status:** resolved (2026-05-15)
**Affects:** `prd/03-server.md` §3, `prd/06-distribution.md`
**Surfaced by:** Doc audit (2026-05-15)

## Question
How does Relay obtain and propagate model credentials (Anthropic API key or other provider creds) to the spawned agent process?

## Context
Claude Code requires Anthropic credentials (or other provider credentials) to run. The PRD is silent on how those credentials reach the agent process from the operator. This blocks the deployment guide and shapes whether credentials need to be modelled at the persona, project, or server level.

## Resolution
**Server-level environment variables, passed unmodified to spawned agent processes.** Operators set credentials in Relay's own environment (e.g., `ANTHROPIC_API_KEY=...` in the systemd unit, container env, or shell that launches `relay server`); Relay propagates the relevant variables into each `node-pty` spawn without inspection or rewriting. No per-persona or per-project credential overrides at MVP. The contract:

1. **Server env is the source.** Relay reads `ANTHROPIC_API_KEY` (and any other provider-specific variables the wrapped agent CLI natively consumes) from its own process environment at agent-spawn time.
2. **Pass-through, not interpretation.** Relay forwards the variables into the spawned agent's environment unchanged. It does not parse, validate, mask, or persist them.
3. **No YAML, no DB.** Credentials are never written to persona YAML, project metadata, or the SQLite state file. There is no `apiKey:` field in the persona schema ([[d-09-persona-yaml-schema]]).
4. **One credential set per server.** All sessions on a given Relay server share the same credentials. Operators who need credential isolation run separate Relay servers.

**Why server env and not per-persona credentials:** Per-persona credentials would store secrets in YAML or the DB, contradict the native-configuration-preservation principle (Claude Code's own credential model is env-driven), and add a credential-precedence resolver no Phase 1 user has asked for. The env-var pass-through inherits whatever credential model the wrapped agent CLI already supports, which is the most agent-agnostic option.

**Re-evaluate if:** multi-tenant deployment surfaces (Phase 3+) and per-tenant credentials become a hard requirement.

**Surfaces new sub-questions:** [[nd-19-claude-login-oauth-as-the-documented-credential-default-anthropic_api_key-as-fallback]] (surfaced 2026-05-18 by operator UX audit of quick-start docs).

**Propagated to:** `prd/03-server.md` §3 (2026-05-15), `prd/06-distribution.md` Configuration (2026-05-15).
