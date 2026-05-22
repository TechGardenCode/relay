---
id: ND-01
status: resolved
title: "Claim-lock timeout duration"
resolved-on: 2026-05-15
affects: "prd/03-server.md §5.1"
surfaced-by: "[[d-g2-multi-client-input-arbitration]] resolution"
---

# ND-01 — Claim-lock timeout duration


**Status:** resolved (2026-05-15)
**Affects:** `prd/03-server.md` §5.1
**Surfaced by:** [[d-g2-multi-client-input-arbitration]] resolution

## Question
How long does a held claim survive without a follow-up `SEND` before the server auto-releases? The claim model in D-G2 needs a timeout to prevent deadlock when a client claims but disconnects before sending (e.g., laptop closed mid-keystroke).

## Resolution
**Single fixed timeout of 30 seconds from server-side `CLAIM` acknowledgment.** If no `SEND` or `RELEASE` arrives on the claiming connection within that window, the server auto-releases the lock and a subsequent `CLAIM` from any client can succeed.

1. **Trigger.** The timer starts when the server acknowledges `CLAIM`. It does not re-arm on activity — a single 30-second window per claim.
2. **Reset.** A `SEND` on the same connection consumes the claim and clears the timer (claim auto-releases on PTY delivery per D-G2). No keepalive ping is recognized; line-buffered semantics mean `SEND` is the only legitimate activity during a claim.
3. **Disconnect.** A WebSocket close from the claiming client releases the claim immediately, ahead of the 30-second budget.
4. **Configurable.** The value is the server default, settable in `~/.relay/config.yaml` for operators who need a different posture; the wire contract does not negotiate per-claim.

**Why 30 seconds and not a tiered model:** A tab-blur or brief network blip resolves in well under a second; 30 seconds tolerates a normal "I started typing, glanced away to check Slack, finished typing" pause without losing the claim. A closed laptop will typically also tear down the WebSocket within seconds, hitting the disconnect path before the timeout matters. A tiered model ("short while empty, longer while sending") doesn't earn its complexity under line-buffered input where a `SEND` is atomic and short-lived.

**Propagated to:** `prd/03-server.md` §5.1 (2026-05-15).
