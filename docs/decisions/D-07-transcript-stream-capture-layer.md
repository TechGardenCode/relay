---
id: D-07
status: resolved
title: "Transcript stream capture layer"
resolved-on: 2026-05-14
affects: "prd/03-server.md"
surfaced-by: "Original PRD §15 Q7"
---

# D-07 — Transcript stream capture layer


**Status:** resolved (2026-05-14)
**Affects:** `prd/03-server.md`
**Surfaced by:** Original PRD §15 Q7

## Question
Where does the agent CLI's `stdout` get captured for the transcript stream — at the PTY layer, or by parsing Claude Code's `--output-format json`?

## Current thinking
PTY layer. Raw stream is the source of truth. JSON parsing reserved for Phase 3 structured features.

## Resolution
**Capture at the PTY layer.** The raw PTY byte stream is the source of truth for the transcript. JSON-format parsing of `--output-format json` is reserved for Phase 3 structured features (e.g., per-message annotations, tool-call analysis).

**Why:** The PTY stream is what the human sees — capturing there means the transcript matches the user's lived experience exactly, including ANSI rendering, prompts, and interactive sequences. It's also agent-CLI-agnostic: any future agent we wrap (Codex, Gemini CLI, etc.) emits to a PTY whether or not it has a structured output format. Parsing JSON would couple us to one CLI's protocol shape.

**Propagated to:** `prd/03-server.md` §10 (2026-05-14).
