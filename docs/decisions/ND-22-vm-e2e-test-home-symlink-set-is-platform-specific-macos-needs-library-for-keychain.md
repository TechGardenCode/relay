---
id: ND-22
status: resolved
title: "`vm-e2e` test-home symlink set is platform-specific (macOS needs `Library/` for Keychain)"
resolved-on: 2026-05-18
affects: ".claude/skills/vm-e2e/SKILL.md lines 124–138 (server-boot block), .claude/skills/vm-e2e/SKILL.md first-run TUI prerequisite section"
surfaced-by: "[[nd-19-claude-login-oauth-as-the-documented-credential-default-anthropic_api_key-as-fallback]] validation pass (2026-05-18) — the symlink line landed in commit fbb147e (ln -sfn \"$HOME/.claude\" \"$LAPTOP_HOME/.claude\") on first-principles reasoning that, on macOS, the symlink would be redundant (Keychain reaches via process credentials, not $HOME) and on Linux it would route the test home's OAuth lookup to the operator's real ~/.claude/.credentials.json. End-to-end scenario E with ANTHROPIC_API_KEY UNSET surfaced two gaps the reasoning missed."
---

# ND-22 — `vm-e2e` test-home symlink set is platform-specific (macOS needs `Library/` for Keychain)


**Status:** resolved (2026-05-18)
**Affects:** `.claude/skills/vm-e2e/SKILL.md` lines 124–138 (server-boot block), `.claude/skills/vm-e2e/SKILL.md` first-run TUI prerequisite section
**Surfaced by:** [[nd-19-claude-login-oauth-as-the-documented-credential-default-anthropic_api_key-as-fallback]] validation pass (2026-05-18) — the symlink line landed in commit `fbb147e` (`ln -sfn "$HOME/.claude" "$LAPTOP_HOME/.claude"`) on first-principles reasoning that, on macOS, the symlink would be redundant (Keychain reaches via process credentials, not `$HOME`) and on Linux it would route the test home's OAuth lookup to the operator's real `~/.claude/.credentials.json`. End-to-end scenario E with `ANTHROPIC_API_KEY` UNSET surfaced two gaps the reasoning missed.

## Question
Which set of host paths must be symlinked from the operator's real `$HOME` into the `vm-e2e` test-isolated `$LAPTOP_HOME` so that the spawned `claude` inherits credentials correctly, and how does that set vary by platform?

## Context
The vm-e2e skill isolates the test in a timestamped tmp directory (`/tmp/relay-e2e-<ts>-laptop-home`) to keep the operator's real `~/.relay/` state untouched. The relay server reads its own state via `os.homedir()` (no `RELAY_HOME` override exists today; see `packages/server/src/config/paths.ts` line 10), so `$LAPTOP_HOME` shadows `$HOME` for relay's purposes. But the **spawned `claude` agent** inherits that same `$HOME` (per D-10's full-env pass-through in `session/registry.ts` lines 47-59), and its credential and config lookups also flow through it.

End-to-end testing on macOS (Darwin 25.4.0, Claude Code 2.1.144, server commit `fbb147e`) on 2026-05-18 surfaced two distinct failures with the single-`.claude` symlink:

1. **`.claude.json` is a separate top-level file claude requires.** The spawned `claude` printed `Claude configuration file not found at: <LAPTOP_HOME>/.claude.json` three times in succession and dropped into the first-run TUI (theme selector). The operator's real `~/.claude.json` is a ~60KB Claude Code config file that lives at `$HOME` root, NOT inside `~/.claude/`; the existing single symlink doesn't reach it. Without it, the spawned agent treats the test home as a fresh install and never advances to the actual prompt.
2. **macOS Keychain lookup needs `$HOME/Library/Keychains/` to be reachable.** With both `.claude/` and `.claude.json` symlinked, the spawned claude got past the first-run TUI and showed `Welcome back Kian!` in the header (proving it could resolve the operator account via `.claude.json` cache). But the chat area still showed "Not logged in · Run /login" and the agent refused to answer prompts. The cause: the macOS Security framework's default-keychain lookup (`SecKeychainFindGenericPassword` for service `Claude Code-credentials`) resolves the user's `login.keychain-db` via `$HOME/Library/Keychains/`. Although Keychain access *itself* is gated on process credentials (UID), the framework still walks `$HOME/Library/` to locate the keychain file. With `HOME=$LAPTOP_HOME` and no `Library/` symlink, that path doesn't exist and the lookup fails silently — so the spawned claude sees Keychain as empty and reports "Not logged in" even though the UID-bound credential is present.

A third (non-blocking) symptom: the spawned claude warns `installMethod is native, but claude command not found at <LAPTOP_HOME>/.local/bin/claude` because it self-checks the install path under `$HOME/.local/bin/`. This is a warning only; the agent still functions.

Adding all three symlinks — `.claude/`, `.claude.json`, and (macOS-only) `Library/` — produced a passing scenario E: spawned claude authenticated, dismissed trust on `\r`, received the test prompt, and replied with the expected token (`PONG3`).

The Linux side of the validation is implied but not re-tested in this session: on Linux there is no Keychain, OAuth state lives at `~/.claude/.credentials.json` (already reached through the existing `.claude/` symlink), and `Library/` is meaningless. The platform conditional in the fix matches that asymmetry.

## Resolution
**The `vm-e2e` server-boot block links three host paths into the test home, with the `Library/` link gated on `uname = Darwin`:**

```bash
ln -sfn "$HOME/.claude" "$LAPTOP_HOME/.claude"
[ -f "$HOME/.claude.json" ] && ln -sfn "$HOME/.claude.json" "$LAPTOP_HOME/.claude.json"
[ "$(uname)" = "Darwin" ] && [ -d "$HOME/Library" ] && ln -sfn "$HOME/Library" "$LAPTOP_HOME/Library"
```

The `[ -f ... ]` and `[ -d ... ]` guards keep the line harmless when the operator hasn't used `claude` yet (no `.claude.json` to link) or is running on a host without `~/Library/` (the macOS guard already excludes Linux). The fix lands in `.claude/skills/vm-e2e/SKILL.md` lines 124–138 with the inline comment block now naming each symlink and citing this ND.

The fix is a **test-harness change only**. The relay implementation is correct as-is — the spawned `claude` inherits `$HOME` via the universal env pass-through and reads whatever the operator put there. The bug was in vm-e2e's reasoning about what "what the operator put there" includes: not just `.claude/` and `.credentials.json`, but the broader set of state Claude Code touches at `$HOME` root and (on macOS) under `Library/`.

**Why not extend Relay to support a `RELAY_HOME` env var to avoid touching `$HOME` at all:** Considered and deferred. Adding a separate data-dir override would let vm-e2e isolate relay state without disturbing claude's `$HOME` lookups, which is cleaner. But it's a real code change (paths.ts, init.ts, the server boot path, and the per-module CLAUDE.md updates), and the symlink fix is a 3-line addition to a single skill. The trade matches Relay's "smallest change that lands the behavior" rule. If a future iteration of the vm-e2e walk surfaces another `$HOME` dependency that symlinks can't easily cover, the `RELAY_HOME` work becomes the cleaner answer; until then, the symlink set is the documented contract.

**Re-evaluate if:** (a) Claude Code grows additional `$HOME`-rooted state files that aren't covered by the three documented symlinks; (b) Anthropic changes the macOS credential backend (e.g., moves off Keychain to a file under `~/.claude/`), which would eliminate the `Library/` requirement; (c) a `RELAY_HOME` env var lands in Relay's config layer, in which case vm-e2e should switch to it and drop the symlink approach entirely; (d) the vm-e2e walk needs to run on Windows, which neither this fix nor the current SKILL.md addresses.

**Propagated to:** `.claude/skills/vm-e2e/SKILL.md` lines 124–138 (server-boot block — three-symlink fix + comment block citing ND-22), `.claude/skills/vm-e2e/SKILL.md` failure-mode prose at line ~151 (updated to name the three-symlink set and the workspace-trust dismissal step).
