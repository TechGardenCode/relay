---
id: ND-03
status: resolved
title: "Ring buffer size for attach replay"
resolved-on: 2026-05-15
affects: "prd/03-server.md §5.2"
surfaced-by: "[[d-g3-reattach-semantics]] resolution"
---

# ND-03 — Ring buffer size for attach replay


**Status:** resolved (2026-05-15)
**Affects:** `prd/03-server.md` §5.2
**Surfaced by:** [[d-g3-reattach-semantics]] resolution

## Question
What size is the per-session in-memory ring buffer that holds recent PTY output for on-attach replay? The D-G3 resolution targets "~24KB / one terminal viewport" but the exact value, and whether it's a global default or per-session configurable, is unspecified.

## Resolution
**32 KB global server default, configurable via `~/.relay/config.yaml`; no per-session knob.** This is the size of the on-attach replay window only; deeper history is pulled from the transcript API per [[d-04-transcript-export-endpoint]].

1. **Sizing rationale.** A 120-column × 40-row desktop terminal viewport with typical ANSI overhead is ≈19 KB; a phone landscape terminal (80×24) is ≈8 KB. 32 KB comfortably covers a full desktop viewport plus a Claude Code prompt-state worth of preceding context (the last agent response header, tool-call output, etc.).
2. **Ring buffer mechanics.** A circular byte buffer per session; new PTY bytes append and overwrite the oldest. No line-awareness — bytes are bytes, consistent with PTY-layer capture per [[d-07-transcript-stream-capture-layer]].
3. **Configuration.** Operators set `replayBufferBytes` in `~/.relay/config.yaml` to override the 32 KB default. Changes take effect for sessions spawned after the config reloads.
4. **No per-session override.** The buffer size is uniform across all sessions on a server. Per-session tuning is not justified at MVP; long historical context is what the transcript API exists for.

**Why 32 KB and not the literal 24 KB from D-G3:** 24 KB was the order-of-magnitude target; 32 KB is a round binary value that gives margin for ANSI-heavy output (color codes, cursor positioning, progress bars) without inflating server memory per session. With ~100 concurrent sessions at MVP, total replay-buffer memory is ~3 MB — negligible.

**Propagated to:** `prd/03-server.md` §5.2 (2026-05-15).
