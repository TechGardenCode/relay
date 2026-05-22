---
id: ND-08
status: open
title: "Skill subset enforcement mechanism"
affects: "prd/09-persona-schema.md §2, docs/arch/persona-application.md §5"
surfaced-by: "[[d-g1-persona-application-semantics]] resolution (specifically the implementation-pass arch doc docs/arch/persona-application.md §6.1 and §8, on 2026-05-15)"
---

# ND-08 — Skill subset enforcement mechanism


**Status:** open
**Affects:** `prd/09-persona-schema.md` §2, `docs/arch/persona-application.md` §5
**Surfaced by:** [[d-g1-persona-application-semantics]] resolution (specifically the implementation-pass arch doc `docs/arch/persona-application.md` §6.1 and §8, on 2026-05-15)

## Question
How does Relay enforce a persona's non-empty `skills:` list at session spawn, given that Claude Code currently exposes no CLI primitive to restrict the agent to a named subset of installed skills?

## Context
The persona-application mechanism in `docs/arch/persona-application.md` cleanly maps every other persona field to a CLI flag or transient `~/.relay/sessions/<sid>/` artifact: `systemPrompt` → `--append-system-prompt`, `model` → `--model`, `mcpServers` → filtered transient `mcp.json` + `--mcp-config --strict-mcp-config`, empty `skills:` → `--disable-slash-commands`. The non-empty `skills:` case is the only field without a clean enforcement path. Claude Code's available primitives are:

- `--disable-slash-commands` — all-or-nothing off switch.
- `--plugin-dir <path>` — additive, session-scoped; adds rather than restricts.
- `--add-dir`, `--allowedTools`, `--disallowedTools`, `--settings`, `--setting-sources` — operate on filesystem scope, built-in tools, or settings sources, not on the skill registry.

The persona schema in [[d-09-persona-yaml-schema]] commits to "populated list = exactly these skills, no others." Without a restriction primitive, that commitment is unenforced at the agent CLI boundary and reduces to a system-prompt narration ("you have access to: ..."), which an agent may or may not honor.

This entry tracks whether "advisory at MVP" is a permanent posture (acceptable for the self-host single-user threat model) or whether one of the real-enforcement options is worth picking up before Phase 1 ships.

## Options under consideration
- **Option A — Advisory at MVP.** Persona's `skills:` list is surfaced into the systemPrompt narration but the agent retains discovery of every skill under `~/.claude/skills/` and `<project>/.claude/skills/`. Zero implementation cost; the schema's strict-list semantics are documented as a soft constraint at MVP and the gap is recorded in `docs/arch/persona-application.md` §6.1. Honest about what's enforced; no false sense of restriction.
- **Option B — Transient curated skills directory + upstream `--skills-dir` flag.** Relay symlinks only the listed skill subdirectories into `~/.relay/sessions/<sid>/skills/` and points the agent at that dir via a `--skills-dir` flag that does not exist in Claude Code today and would need to be proposed upstream. Real enforcement; depends on an upstream change that may or may not land.
- **Option C — Plugin-dir composition.** Re-package each listed skill as a session-scoped plugin and load via `--plugin-dir`, paired with `--disable-slash-commands` to suppress the native registry. Works today, but requires every skill to be re-packaged as a plugin (or for a Relay-side adapter to wrap arbitrary skill dirs as plugins), and inverts the discovery model (full disable + explicit additive load) — fragile across Claude Code upgrades that may evolve the plugin/skill boundary.

## Current thinking
Option A at MVP, with the enforcement gap explicitly documented in `docs/arch/persona-application.md` §6.1. The self-host single-user threat model in `prd/00-overview.md` G-7 does not need skill restriction as a security boundary; users edit their own persona files and run their own agents. Re-evaluate if (1) persona authors surface friction (e.g., a persona that genuinely depends on a narrow skill set for behavioral consistency), or (2) a multi-tenant deployment surfaces and skills become a permission-boundary concern. Option B is the natural follow-up when an upstream flag exists.

## Resolution
*(unresolved)*
