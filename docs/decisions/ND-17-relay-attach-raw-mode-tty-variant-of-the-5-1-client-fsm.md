---
id: ND-17
status: resolved
resolved-on: 2026-05-27
title: "`relay attach` raw-mode TTY variant of the §5.1 client FSM"
affects: "docs/arch/ws-protocol.md §5.1 (client lock state), packages/server/src/attach/client.ts, packages/server/src/attach/tty.ts"
surfaced-by: "build-plan 6H spec-reviewer pass (2026-05-18) — the §5.1 client lock FSM and its transition table are written against the IDE compose-field UX (two-Enter flow: first Enter commits the draft → claim; second Enter on the same draft → send). The relay attach thin client is a raw-mode TTY where the user has already typed a line and pressed Enter exactly once before the FSM sees it, so two §5.1 transitions don't map cleanly: (a) Claimed → Sending (\"User hits Enter again on same draft\") is collapsed into the same wire turn as Claiming → Claimed; (b) Backoff → Idle (\"4 seconds elapse or user types any key\") only fires on full-line submission, since individual keystrokes accumulate in the TTY bridge's line buffer rather than being forwarded to the client."
---

# ND-17 — `relay attach` raw-mode TTY variant of the §5.1 client FSM


**Status:** resolved (2026-05-27)
**Affects:** `docs/arch/ws-protocol.md` §5.1 (client lock state), `packages/server/src/attach/client.ts`, `packages/server/src/attach/tty.ts`
**Surfaced by:** build-plan 6H spec-reviewer pass (2026-05-18) — the §5.1 client lock FSM and its transition table are written against the IDE compose-field UX (two-Enter flow: first Enter commits the draft → claim; second Enter on the same draft → send). The `relay attach` thin client is a raw-mode TTY where the user has already typed a line and pressed Enter exactly once before the FSM sees it, so two §5.1 transitions don't map cleanly: (a) `Claimed → Sending` ("User hits Enter again on same draft") is collapsed into the same wire turn as `Claiming → Claimed`; (b) `Backoff → Idle` ("4 seconds elapse or user types any key") only fires on full-line submission, since individual keystrokes accumulate in the TTY bridge's line buffer rather than being forwarded to the client.

## Question
Does the §5.1 client FSM also bind the `relay attach` raw-mode TTY client, or is the raw-mode variant a distinct (compatible) FSM that the spec should name explicitly? If the former, what specifically does each compose-field-shaped transition mean in a raw-mode TTY context — should the CLI implement a "first Enter commits, second Enter sends" two-Enter flow that would feel broken in a terminal, or is the collapsed-FSM the canonical CLI behavior with the spec needing a §5.1.1 addendum?

## Elaboration prompt

The wire-level invariants are unchanged either way — the server still sees `claim → claim_ack → send → claim_released { delivered }` in that order, and the §5.2 server-side FSM ([D-G2](#d-g2-multi-client-input-arbitration)) doesn't care which client surface produced the frames. What's underspecified is the **client-side** transitions:

- **Transition C-A (`Claimed → Sending`).** §5.1 says the trigger is "User hits Enter again on same draft." For the IDE compose-field this is the canonical UX (one Enter = commit; second Enter on the same line = send). For `relay attach`, the user has typed `ls -la\n` once; a UX that demands a second Enter would feel like a stuck terminal. The 6H implementation collapses `Claiming → Sending` immediately on `claim_ack` arrival, bypassing the `Claimed` rest state entirely. Whether that's a spec-compliant simplification or a strict §5.1 violation is unclear.

- **Transition C-B (`Backoff → Idle`).** §5.1 says the trigger is "4 seconds elapse or user types any key." In a raw-mode TTY the user already typed the line that got `busy`-rejected, so "user types any key" is redundant; in practice individual keystrokes during backoff accumulate in the TTY bridge's `lineBuffer` and never reach the client until a newline. The 6H implementation lets the 4-second timer be the only `Backoff → Idle` driver in the CLI path. Same question: spec-compliant simplification or strict §5.1 violation.

What to validate before resolving: (a) whether the §5.1 FSM is a wire-correctness contract (the server doesn't care which sub-FSM the client uses, only the order of frames on the wire) or a UX-mandatory client contract (every client surface must show the user the same affordances); (b) whether the IDE extension's two-Enter compose UX is actually what ships in 6I (it's plausible the extension also uses a single-Enter flow once the compose field is mounted in the terminal widget), in which case the spec is wrong and the CLI is right; (c) whether the §5.1 transition labels should be reworded to be client-agnostic (e.g., "User commits the line" instead of "User hits Enter again on same draft") with a §5.1.1 footnote noting the IDE compose-field interprets "commit" as the second-Enter affordance; (d) whether the `release` transition ("User cancels (e.g., clears the draft)") needs a CLI-flavored counterpart (Ctrl-C in the middle of a draft would be the natural mapping, but in a raw-mode TTY Ctrl-C is a SIGINT byte that the user expects to pass through to the remote agent — so the CLI may correctly have no in-state `release` path).

Proposed direction: treat §5.1 as a **wire-correctness** contract that names one canonical client UX (the IDE compose-field) without forbidding compatible variants, and add a §5.1.1 footnote to `ws-protocol.md` that documents the `relay attach` raw-mode variant: `Claimed` is a degenerate state (zero-tick), `Backoff` dismisses on the timer only, no in-state `release`. The 6H implementation already matches that variant; the doc edit just makes it explicit.

**Superseded in part by [[nd-24-per-keystroke-input-streaming-for-tui-agents]] (2026-05-19).** ND-17's framing assumed line-buffered input was wire-correctness only — that the §5.1 FSM mismatch was a CLI ergonomics question, not a UX-mandatory one. The 6H validation walk with the real `claude` TUI as the agent surfaced that line buffering breaks claude's own compose-box rendering (operators type blind because zero bytes reach the agent until Enter). ND-24 re-litigates the underlying line-buffered assumption — chosen option: per-keystroke `send` with claim-held-during-typing and server-side Enter-byte detection as the release trigger. ND-17's scope narrows: the "collapsed §5.1 FSM for raw-mode TTYs" framing still applies to line-mode agents (`bash -i`, scripted non-TUI runs) but not to TUI agents under ND-24. ND-17 itself stays `open`; its final resolution should land alongside ND-24's so the §5.1.1 footnote (if it lands at all) covers both regimes coherently.

This is filed as `open` so the resolution lands as a deliberate `ws-protocol.md` §5.1 / §5.1.1 edit rather than an inline implementation drift. Build-plan 6H ships against the collapsed-FSM variant provisionally; the propagation closes the doc gap.

## Resolution

**§5.1 is a wire-correctness contract that names one canonical client UX (the IDE compose-field) without forbidding compatible client surfaces — validation point (a). The `relay attach` raw-mode TTY is a sanctioned variant, and the doc already documents it: ND-24's propagation rewrote §5.1 around the per-keystroke `Idle → Claiming → Streaming → Idle` path, so the standalone §5.1.1 footnote ND-17 originally proposed is unnecessary.** ND-24 did more than clear the blocker — it dissolved the mismatch. Under per-keystroke streaming there is no "draft" the raw-mode client commits and then sends, so the two transitions that didn't map (C-A `Claimed → Sending` "hit Enter again", C-B `Backoff → Idle` "type any key") simply do not exist on the CLI surface: the first keystroke claims, subsequent keystrokes stream under the held claim, and a server-detected newline releases. The "two-Enter" affordance is now understood as the IDE compose-field's *interpretation* of the same wire, not a contract every client must reproduce.

### Contract

1. **Wire-correctness, not UX-mandatory.** §5.1 binds the order of frames on the wire (`claim → claim_ack → send* → claim_released`), which the §5.2 server FSM ([[d-g2-multi-client-input-arbitration]]) enforces regardless of client surface. It does not mandate that every client present the IDE compose-field's two-Enter affordance.
2. **Two named client surfaces, one wire.** §5.1 explicitly names both: the IDE compose-field UX (`Idle → Claiming → Claimed → Sending → Idle`) and the `relay attach` raw-mode UX (`Idle → Claiming → Streaming → Idle`, per [[nd-24-per-keystroke-input-streaming-for-tui-agents]]). `Streaming` is the per-keystroke realization of `Claimed + Sending`.
3. **No §5.1.1 addendum.** The variant is documented inline in §5.1's preamble and transition table (landed with ND-24), so the separate footnote ND-17 proposed is redundant and is not added.
4. **Line-mode agents still collapse cleanly.** For non-TUI line-mode agents (`bash -i`, scripted runs), `pendingInput` only ever holds a complete line, so the same FSM resolves a single deliberate send — the §5.1 note already records this. `client.ts` already cites "Per ND-17 (narrowed)".

**Why this and not a strict §5.1-violation reading:** treating the collapsed CLI behavior as a violation would force `relay attach` to implement a two-Enter "commit then send" flow that feels like a stuck terminal in a raw-mode TTY (elaboration's own framing). The wire-correctness reading is what the server actually enforces and what ND-24 already shipped against; the only residual was a doc gap, which ND-24's §5.1 rewrite closed. The standalone §5.1.1 footnote is rejected as redundant with that rewrite.

**Resolved as part of [[nd-34-session-and-attach-polish-deep-dive]] (Track 7D), item (d).**

**Propagated to:** `docs/arch/ws-protocol.md` §5.1 (the ND-24 rewrite already carries the variant; ND-17's open/narrowed footnote updated to resolved) (2026-05-27); `packages/server/src/attach/client.ts` already cites "Per ND-17 (narrowed)" (no code change needed).
