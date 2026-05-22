---
id: D-G2
status: resolved
title: "Multi-client input arbitration"
resolved-on: 2026-05-14
affects: "prd/03-server.md §5.1, prd/08-acceptance.md scenario F, prd/02-architecture.md"
surfaced-by: "Deep-dive analysis G2 (the v0.3 PRD said \"either client can send input\" without defining what happens when N clients are attached and two attempt concurrent input)"
---

# D-G2 — Multi-client input arbitration


**Status:** resolved (2026-05-14)
**Affects:** `prd/03-server.md` §5.1, `prd/08-acceptance.md` scenario F, `prd/02-architecture.md`
**Surfaced by:** Deep-dive analysis G2 (the v0.3 PRD said "either client can send input" without defining what happens when N clients are attached and two attempt concurrent input)

## Question
When N clients are attached to a single session, what is the input collaboration model — who can type, what happens when two clients attempt input concurrently, and how does control transfer between clients?

## Context
This contract underpins the multi-device value prop. Without a defined model:
- The user experience is undefined when a developer has both their IDE and phone open on the same session
- Implementation cannot proceed on the WebSocket input-handling path
- Acceptance scenario F (`08-acceptance.md`) cannot be specified or verified
- The mobile PWA design doc (Phase 2) cannot specify whether mobile is read-only-by-default or co-equal

It is also load-bearing for the user mental model: "what happens when both my devices are open" should have a single coherent answer the user can predict.

## Options under consideration
- **Option A — Last-writer-wins.** All clients can type; bytes interleave at the kernel. Simplest to implement but corrupts the agent CLI's prompt parser when two clients type concurrently; acceptable only if interleaving is rare in practice (e.g., chat-style line-buffered input only). Soft variant: line-buffered input with per-client queueing so each Enter-terminated line is atomic.
- **Option B — Primary-with-handoff.** All clients subscribe to output; only the holder of an explicit "control" token can send input. Transfer is a request/grant via WebSocket control message. Mirrors tmate, sshx, and VS Code Live Share. Predictable; non-controlling clients are visibly read-only until they request control.
- **Option C — Observer-mode-by-default with explicit upgrade.** Variant of B where additional clients attach as observers and never auto-promote. Promotion is always an explicit user action. Friendlier for "I just want to peek at what the agent is doing."

## Current thinking
No final lean yet. Option B/C variants align with established multi-attach prior art and avoid the corruption failure mode of A. The exact transfer UX (request/grant flow, timeout, visible indicator) needs design.

## Resolution
The PRD assumes a single user operating across all attached clients (one human, multiple devices). Under that assumption, the input model is a **per-message server-side claim lock** rather than a persistent control-token handoff. The contract:

1. **Claim before send.** Each client input message is wrapped as `CLAIM → SEND → RELEASE` over WebSocket. The server holds at most one active claim per session.
2. **First-arrival wins.** If a `CLAIM` arrives while another is held, the server rejects it with `BUSY`. Ordering is by server arrival time, not client wall-clock.
3. **Losing client preserves the draft.** The rejected client surfaces a brief "another device is interacting with this session" notice and retains the user's local input buffer so nothing is lost.
4. **Auto-release.** Claims release when the message is delivered to the PTY, or after a timeout if the claim is abandoned (e.g., the claiming client disconnects mid-message). Exact timeout → ND-01.
5. **Output is universal.** All clients receive the full output stream regardless of claim state. There is no read-only mode; claim-on-send is the only contention point.

**Why this and not primary-with-handoff (Option B/C):** The persistent-holder model assumes adversarial or coordinating collaborators. With a single user across their own devices, the simpler per-message lock is sufficient: byte interleaving is prevented, the user can't out-race themselves in a way that matters, and there's no holder-transfer UX to design. Claude Code's line-buffered input maps cleanly to per-message granularity. Character-at-a-time interactive apps (vim inside the session) are not the MVP target and would not work cleanly under this lock model — accepted limitation.

**Surfaces new sub-questions:** [[nd-01-claim-lock-timeout-duration]], [[nd-02-rejection-ux-for-busy-response]].

**Propagated to:** `prd/03-server.md` §5.1 (2026-05-14), `prd/08-acceptance.md` scenario F (2026-05-14), `prd/02-architecture.md` Architectural backbone (2026-05-14).
