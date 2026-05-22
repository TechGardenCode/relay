---
id: ND-19
status: resolved
title: "`claude login` OAuth as the documented credential default; `ANTHROPIC_API_KEY` as fallback"
resolved-on: 2026-05-18
affects: "README.md, docs/deployment.md, docs/threat-model.md, docs/prd/03-server.md §3, docs/prd/06-distribution.md Configuration, docs/arch/persona-application.md §2.c + §4.1, .claude/skills/vm-e2e/SKILL.md, .claude/skills/scenario-runner/SKILL.md Scenarios B + H, docs/build-plan.md 6B cheatsheet"
surfaced-by: "[[d-10-agent-model-credentials-handling]] resolution — D-10 picked \"server-level env-var pass-through\" as the implementation mechanism but did not commit to which credential surface the docs lead with. Subsequent operator UX audit (2026-05-18) showed every entry-point doc led with export ANTHROPIC_API_KEY=… even though most operators on laptop / VM / Docker-on-laptop already authenticate via claude login and never type an API key."
---

# ND-19 — `claude login` OAuth as the documented credential default; `ANTHROPIC_API_KEY` as fallback


**Status:** resolved (2026-05-18)
**Affects:** `README.md`, `docs/deployment.md`, `docs/threat-model.md`, `docs/prd/03-server.md` §3, `docs/prd/06-distribution.md` Configuration, `docs/arch/persona-application.md` §2.c + §4.1, `.claude/skills/vm-e2e/SKILL.md`, `.claude/skills/scenario-runner/SKILL.md` Scenarios B + H, `docs/build-plan.md` 6B cheatsheet
**Surfaced by:** [[d-10-agent-model-credentials-handling]] resolution — D-10 picked "server-level env-var pass-through" as the implementation mechanism but did not commit to which credential surface the docs lead with. Subsequent operator UX audit (2026-05-18) showed every entry-point doc led with `export ANTHROPIC_API_KEY=…` even though most operators on laptop / VM / Docker-on-laptop already authenticate via `claude login` and never type an API key.

## Question
For operators reading Relay's quick-start, install, and deployment docs, which Claude Code credential mechanism does the documentation lead with — `claude login` device-flow OAuth, or `ANTHROPIC_API_KEY` set in Relay's process environment?

## Context
D-10 settled the implementation: Relay reads its own `process.env` and passes the relevant variables unmodified into each spawned agent's environment (`packages/server/src/session/registry.ts` lines 47-59). The `node-pty` spawn inherits the full parent env by default, including `$HOME`, which means whatever OAuth state `claude login` has written for the operator is naturally visible to the spawned agent without any Relay code change.

The OAuth storage backend is **platform-specific**:

- On **macOS**, `claude login` writes a Generic Password to the user's login Keychain under the service name `Claude Code-credentials`. The credential is reached via process credentials, not env vars; a child process of the same user inherits Keychain access. `~/.claude/.credentials.json` does not exist on macOS.
- On **Linux**, `claude login` writes `~/.claude/.credentials.json`. The credential is reached via `$HOME` inheritance — the child process reads the file directly.

An operator never has to know which mechanism is in play on their host; both are transparent. But the platform difference matters for Docker, because the macOS Keychain is isolated from a Linux container's namespace. A `-v $HOME/.claude:/root/.claude` bind-mount carries the operator's Claude Code state directory but **not** the credentials when the host is macOS — empirically verified 2026-05-18 (the container's `claude -p` returned no model reply on a clean mount).

This makes OAuth the operationally simpler path for the dominant deployment shape (laptop / VM / Docker-on-laptop): the operator runs `claude login` once on the host that will launch `relay server`, and credentials Just Work for the native (non-Docker) case. The env-var route remains correct and necessary for genuinely-headless cases (CI runners, ephemeral containers with no human at the terminal, multi-tenant Phase 3+ shapes where the operator wants a service credential rather than an interactive subscription).

A non-obvious wrinkle drives the precedence call. **Claude Code's credential resolver prefers `ANTHROPIC_API_KEY` over OAuth state in `~/.claude/` (Linux) or Keychain (macOS)** when both are present. An operator who has a Claude.ai subscription active under `claude login` but also exports `ANTHROPIC_API_KEY` (perhaps copied from old docs) will silently bill against the pay-per-token API key rather than against the subscription they meant to use. Docs must call this out so an operator who mixes the two understands which one is paying.

## Resolution
**`claude login` is the documented default for the Relay quick-start and operator guides; `ANTHROPIC_API_KEY` is documented as a fallback for headless deployments.** The contract:

1. **README, deployment guide, and threat model lead with `claude login` on the host.** Quick-start prose says "run `claude login` once on the host that will launch `relay server`; spawned agents inherit the resulting OAuth state (Keychain on macOS, `~/.claude/.credentials.json` on Linux) via process credentials and `$HOME` env inheritance." No `export ANTHROPIC_API_KEY` line in the primary install path.
2. **`ANTHROPIC_API_KEY` is preserved as a documented fallback.** A clearly-labelled "Headless deployments" subsection in `docs/deployment.md` and a one-sentence pointer in `README.md` cover the env-var path for CI runners, immutable containers, and operators who deliberately want subscription-independent billing. The fallback section names the precedence footgun explicitly.
3. **The implementation does not change.** D-10's "server-level env-var pass-through" remains the wire-level mechanism. OAuth Just Works because the implementation already inherits the full `process.env` (and therefore `$HOME`) and process credentials into every spawn. No conditional logic, no new code paths, no new config keys.
4. **Threat-model surface is OAuth-aware.** The "model credentials" asset gains a description that covers both surfaces and both platforms. The "credentials never persisted by Relay" mitigation extends to the OAuth state (Keychain entry on macOS, `~/.claude/.credentials.json` on Linux): Relay never reads, copies, or writes either; the channel by which the spawned agent sees them is process credential / `$HOME` inheritance.
5. **Docker uses a named volume for `/root/.claude` and authenticates inside the container.** The Docker section documents `-v relay_claude:/root/.claude` plus a one-time `docker exec -it relay claude login`. The OAuth credentials file lands at `/root/.claude/.credentials.json` inside the named volume (the container is Linux regardless of host) and persists across restarts. This is **platform-uniform** — works identically on macOS and Linux Docker hosts, unlike a `$HOME/.claude` bind-mount which is broken on macOS (Keychain isolation). The env-var route stays as the headless variant for immutable-image CI deployments.

**Why OAuth as the default:** Most laptop, VM, and Docker-on-laptop operators already have `claude login` state from their day-job use of Claude Code. Leading with the env var asks them to find or mint an API key they don't otherwise need, and silently changes their billing posture. OAuth is the path of least friction *and* the path that preserves the operator's existing subscription billing. The implementation already supports it for free; the only thing standing between operators and OAuth is the docs.

**Why env-var stays documented:** Genuinely-headless deployments (CI runners, container images without an interactive `claude login` step, multi-tenant Phase 3+) cannot run a device-flow login. Dropping the env-var section would force those operators to invent the path themselves. It also remains the only sensible answer for "I want my Relay server to bill differently from my interactive Claude.ai work" — a legitimate posture the env var supports directly.

**The precedence footgun is called out at every site that mentions both surfaces.** Claude Code resolves `ANTHROPIC_API_KEY` ahead of OAuth state. An operator who runs `claude login` *and* exports the env var will bill against the API key without warning. The fallback sections name this in one sentence; the threat-model gets a deferral bullet noting that Relay does not arbitrate the precedence (it is upstream Claude Code behavior).

**Re-evaluate if:** (a) Claude Code changes its credential-resolution precedence; (b) Phase 3 multi-tenant deployment requires per-tenant credential isolation that OAuth cannot supply; (c) Claude Code consolidates macOS storage to a file (or Linux to a non-file backend) in a way that changes the platform discussion; (d) the named-volume Docker path surfaces a portability issue (e.g., credential format diverging across Claude Code versions) that the documented path cannot paper over.

**The precedence footgun is called out at every site that mentions both surfaces.** Claude Code resolves `ANTHROPIC_API_KEY` ahead of OAuth state. An operator who runs `claude login` *and* exports the env var will bill against the API key without warning. The fallback sections name this in one sentence; the threat-model gets a deferral bullet noting that Relay does not arbitrate the precedence (it is upstream Claude Code behavior).

**Re-evaluate if:** (a) Claude Code changes its credential-resolution precedence; (b) Phase 3 multi-tenant deployment requires per-tenant credential isolation that OAuth cannot supply; (c) Claude Code consolidates macOS storage to a file (or Linux to a non-file backend) in a way that changes the platform discussion; (d) the named-volume Docker path surfaces a portability issue (e.g., credential format diverging across Claude Code versions) that the documented path cannot paper over.

**Validation status (2026-05-18 follow-up session):** All three deferred surfaces from the original landing were verified. (1) Docker named-volume + `docker exec -it relay claude auth login` round-trip — passed on macOS Docker host (Docker 29.4.1) with a stand-in `node:22-alpine` + `@anthropic-ai/claude-code` image; credentials persisted at `/root/.claude/.credentials.json` inside the named volume across `docker stop`/`docker start`, and `claude -p` returned a model reply with no `ANTHROPIC_API_KEY` in the container env. Linux Docker host still outstanding. (2) VM headless device-flow — passed on Ubuntu 24.04 (`techgardencode@10.0.60.221`, Node v22.22.2) installing `@anthropic-ai/claude-code` into a user-local npm prefix (`~/.local/npm/bin`) rather than the system path, since sudo was not available; the device-flow URL printed correctly and `claude -p` round-tripped with `ANTHROPIC_API_KEY` unset. (3) `vm-e2e` symlink boot pattern — initially **failed** on macOS (spawned `claude` stuck in first-run TUI under the test-isolated `$HOME`); fix surfaced as [[nd-22-vm-e2e-test-home-symlink-set-is-platform-specific-macos-needs-library-for-keychain]].

**Doc surface lessons from validation:** Two follow-on corrections fell out of the verification pass and need to land alongside the ND-22 SKILL.md fix:

- **Subcommand name.** Both Docker doc lines and SKILL.md guidance reference `claude login`; the actual Claude Code 2.1.x subcommand is `claude auth login`. Bare `claude login` is parsed as `claude <prompt="login">` and prints "Not logged in · Please run /login" — the TUI's slash-command instruction, not the CLI entry point. The deployment guide and any future operator-facing copy must say `claude auth login`.
- **VM npm install path.** `npm install -g @anthropic-ai/claude-code` requires write access to `/usr/lib/node_modules` on Ubuntu — i.e. sudo. Operators on a managed Linux host that hands them a non-root account need either `sudo` or the user-local npm prefix workaround. The deployment guide's headless prereqs should note that the install step typically wants sudo and offer the user-local fallback for environments where it isn't available.

These two corrections are scoped to the deployment guide and SKILL.md text; no decision-log status change is needed for ND-19 itself, just a refresh of the propagated sites.

**Propagated to:** `prd/03-server.md` §3 (2026-05-18), `prd/06-distribution.md` Configuration (2026-05-18), `docs/arch/persona-application.md` §2.c + §4.1 (2026-05-18), `docs/threat-model.md` §1 + §3 + §4 + §5 (2026-05-18), `docs/deployment.md` (2026-05-18; revised same day with `claude auth login` subcommand fix + VM npm install note), `README.md` (2026-05-18), `.claude/skills/vm-e2e/SKILL.md` (2026-05-18; revised same day with the triple-symlink fix per ND-22), `.claude/skills/scenario-runner/SKILL.md` (2026-05-18), `docs/build-plan.md` 6B cheatsheet (2026-05-18).
