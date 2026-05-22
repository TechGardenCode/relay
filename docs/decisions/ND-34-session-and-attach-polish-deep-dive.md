---
id: ND-34
status: open
title: "Session + attach polish deep-dive — painless-rollout bar"
affects: "docs/prd/03-server.md §5 (attach + reattach semantics) and §7 (session subcommands); docs/arch/ws-protocol.md (any frame additions for session naming or persona switch); packages/server/src/attach/ (the `^D` detach gesture, the replay slice on reattach); packages/server/src/cli/ (`relay session` subcommand surface)."
surfaced-by: "[[d-15-ux-rollout-posture]] resolution (2026-05-22). One of four per-surface deep-dives opened to gate Phase 1.5 rollout."
---

# ND-34 — Session + attach polish deep-dive — painless-rollout bar

**Status:** open
**Affects:** `docs/prd/03-server.md` §5 (attach + reattach semantics) and §7 (session subcommands); `docs/arch/ws-protocol.md` (any frame additions for session naming or persona switch); `packages/server/src/attach/` (the `^D` detach gesture, the replay slice on reattach); `packages/server/src/cli/` (`relay session` subcommand surface).
**Surfaced by:** [[d-15-ux-rollout-posture]] resolution (2026-05-22). One of four per-surface deep-dives opened to gate Phase 1.5 rollout.

## Question
What is the minimum painless-rollout bar for **session and attach polish** — the moment-to-moment ergonomics of identifying, naming, attaching to, detaching from, and switching contexts within a Relay session? Today there are several known sharp edges (`^D` twice, blank-pane reattach on quiet sessions, UUID-only session identity, no persona switch without restart). Which of these must be smoothed before a non-author user can use Relay every day?

## Elaboration prompt
The inventory in [`docs/arch/ux-rollout-posture.md`](../arch/ux-rollout-posture.md) §5 lists what's painful today. The resolution must decide which items are P0, P1, or deferred-with-rationale.

**What to consider:**

- **(a) `^D` two-press detach per [[nd-25-relay-attach-detach-with-d-requires-two-keypresses-on-the-host-tty]].** Today detaching from `relay attach` requires `^D` twice on the host TTY. Standard terminal behavior is one `^D`. ND-25 is filed `open`; the root cause (raw-mode setup, canonical-mode drain, or control-sequence filtering inside `packages/server/src/attach/tty.ts`) is unclear. Decide whether ND-34 resolves by resolving ND-25 inline (single-press contract + code fix), by accepting two-press and documenting the gesture in user-facing docs, or by introducing a different detach key (e.g. the conventional `^B d` tmux-style chord). Note interaction with [[nd-30-relay-attach-stderr-event-stream-for-subprocess-of-attach-consumers]] — both touch `attach/tty.ts`.

- **(b) Replay catch-up for quiet sessions per [[nd-03-ring-buffer-size-for-attach-replay]] / [[d-g3-reattach-semantics]].** Today reattach sends a uniform 32 KB replay; a quiet session (no recent agent output) shows a blank pane until the agent emits new bytes. Decide whether the replay-on-reattach surface gains: (i) a "last-N-messages" mode (per-message rather than per-byte), (ii) a per-session-sized replay (longer for verbose sessions, shorter for quiet ones), (iii) a "show me the last response" shortcut backed by the transcript REST route ([[nd-04-transcript-pagination-api-shape]]), or (iv) no change with documentation calling out the limitation.

- **(c) `relay session show` surface alignment per [[nd-15-relay-session-show-subcommand-surface-alignment]].** ND-15 is filed `open`; PRD §7 enumerates only `list` and `kill` but the build-plan 6H ships `show`. Decide whether ND-34 resolves ND-15 inline (commit to the field set, output format, error behavior) or leaves it as an independent ND that 7D can pull in.

- **(d) `relay attach` raw-mode FSM variants per [[nd-17-relay-attach-raw-mode-tty-variant-of-the-5-1-client-fsm]].** ND-17 is filed `open`; pending per-keystroke streaming resolution (which has now landed as [[nd-24-per-keystroke-input-streaming-for-tui-agents]]). Decide whether ND-17 is now resolvable (claim the FSM is strict wire-correctness, or allow UX variants like collapsed Claimed state, timer-only Backoff) and whether ND-34 picks it up.

- **(e) Session naming / labeling beyond UUID.** Today sessions are identified by ULID (`01HXYZ...`). Decide whether sessions gain an optional human-readable label (`relay session start --name "auth-rewrite"`), how the label appears in `relay session list`, IDE tree view, and the status bar, and whether the label is unique per project. Storage implication: a column on `sessions` in [`docs/arch/sqlite-schema.md`](../arch/sqlite-schema.md) — file a migration if so.

- **(f) Persona switch without restart per [[d-g1-persona-application-semantics]].** D-G1 makes persona immutable for MVP; switching requires kill + restart. Decide whether ND-34 introduces a "switch persona" gesture (CLI + IDE) that does the kill + spawn-new-with-resume dance, surfacing the loss explicitly. Or honor D-G1's Phase 3 deferral and explicitly document "persona switch requires a fresh session" in the user-facing docs.

- **(g) `idle` status semantics per `docs/prd/01-conceptual-model.md`.** The spec defines `idle` as "reserved for a future agent-driven indicator" with no MVP transition. Decide whether ND-34 fills in idle (e.g. agent process alive but no output for N seconds → idle, resumes on output) or honors the punt and removes `idle` from the status enum entirely until a real use case exists.

- **(h) Attach distribution shape (overlap with ND-32).** Whether `relay attach` ships as its own package (`@relay/attach`) is also relevant here — it affects how third-party tools attach to sessions, which is a session-management consideration. Coordinate with [[nd-32-install-and-onboarding-deep-dive]] (a) so the decision lands in one place; the other ND references it.

- **(i) Detach-with-keep-session-running clarity.** Today `^D` (×2) detaches but the session keeps running. Decide whether the CLI prints an explicit "session 01HXYZ still running; attach again with `relay attach 01HXYZ`" line on detach, so the user is not left wondering whether they killed it.

- **(j) Multi-client claim handoff polish.** A user on device A holds the claim; device B tries to send; today the user on B sees the unstructured BUSY stderr line. The whole-claim-arbitration UX overlaps [[nd-33-ide-gui-overhaul-deep-dive]] (BUSY anchoring) and [[nd-30-relay-attach-stderr-event-stream-for-subprocess-of-attach-consumers]] (event stream). Decide whether the *CLI-side* of the handoff (when you are typing in `relay attach` and you get BUSY'd) needs polish too — clearer line, dismissal cadence, terminal-bell suppression — independent of the IDE story.

**Validation against the gate.** The resolution must end with a line of the shape "the painless-rollout bar for session + attach polish is: <one-paragraph statement>" so [[d-15-ux-rollout-posture]] §7 can quote it.

This is filed as `open` so the resolution lands as a deliberate deep-dive (Track 7D in `docs/build-plan.md`) rather than inline drift.

## Resolution

*(unresolved)*
