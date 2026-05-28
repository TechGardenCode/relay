---
id: ND-39
status: open
title: "Concurrent multi-client attach to a TUI agent renders corrupted (last-writer-wins viewport conflict)"
affects: "docs/decisions/ND-23-pty-size-negotiation-and-sigwinch-forwarding-for-attach-clients.md (the last-writer-wins resize policy this surfaces against); docs/arch/ws-protocol.md §2.2 (resize frame) + §5.1 (universal output); packages/server/src/pty/supervisor.ts (single shared PTY, one size); packages/server/src/server/ws/handler.ts (resize dispatch, no clamp); docs/prd/08-acceptance.md scenario F (concurrent multi-client attach); docs/prd/04-ide-extension.md / ND-30 (BUSY notice painted into the frame)."
surfaced-by: "7F rollout-readiness walk (docs/rollout-readiness-walk.md) Finding F-3, 2026-05-27 — operator screenshots of two `relay attach` clients on one session."
---

# ND-39 — Concurrent multi-client attach to a TUI agent renders corrupted (last-writer-wins viewport conflict)

**Status:** open
**Affects:** [[nd-23-pty-size-negotiation-and-sigwinch-forwarding-for-attach-clients]] (the last-writer-wins resize policy this surfaces against); `docs/arch/ws-protocol.md` §2.2 (resize frame) + §5.1 (universal output); `packages/server/src/pty/supervisor.ts` (single shared PTY, one size); `packages/server/src/server/ws/handler.ts` (resize dispatch, no clamp); `docs/prd/08-acceptance.md` scenario F (concurrent multi-client attach); `docs/prd/04-ide-extension.md` / [[nd-30-relay-attach-stderr-event-stream-for-subprocess-of-attach-consumers]] (BUSY notice painted into the frame).
**Surfaced by:** 7F rollout-readiness walk ([`docs/rollout-readiness-walk.md`](../rollout-readiness-walk.md) Finding F-3, 2026-05-27) — operator screenshots of two `relay attach` clients on one session.

## Question

When two clients attach **concurrently** to the same session whose agent is a full-screen TUI (Claude Code), the rendering on at least one client is severely corrupted — the agent's reply is shredded across lines with horizontal-rule artifacts, the other client's input bleeds in, and BUSY notices stack into the frame. This is a direct consequence of [[nd-23-pty-size-negotiation-and-sigwinch-forwarding-for-attach-clients]]'s **last-writer-wins** resize policy combined with [[d-g2-multi-client-input-arbitration]]'s **universal output** over a **single shared PTY**: the PTY can only be one size, each client's `resize` re-sizes it to *that* client's viewport, the TUI redraws for that width, and those width-specific bytes are broadcast to *both* clients — so any client whose terminal differs from the last writer renders garbage. ND-23 weighed the multi-client case but assumed "every realistic flow attaches within a tick"; it did not weigh two clients **staying** attached at different sizes (scenario F). What is the right policy for concurrent attach to a TUI agent: accept-and-document, clamp-to-smallest while >1 client is attached, or a per-client rendering layer?

## Elaboration prompt

**Root cause (confirmed live):**

1. **One PTY, one size.** `pty/supervisor.ts` spawns a single PTY; ND-23 sizes it via a `resize` side-channel with **last-writer-wins** multi-client policy (explicitly rejecting Option B "smallest common rectangle" to match `tmux`/`ssh` convention and avoid blank margins).
2. **Universal output (D-G2).** Every attached connection receives the same PTY byte stream, including the cursor-positioning + redraw bytes the TUI emits for whatever width the *last* `resize` set. A client whose terminal is a different width re-wraps those bytes → the shredded frame in the 7F screenshots.
3. **BUSY painted into the frame (ND-30 interim).** The `[relay] another device is interacting with this session.` line is written to the attached terminal's stderr inside the live TUI frame (same class as [[nd-38-relay-attach-process-hangs-after-clean-ctrl-d-detach-in-raw-mode]] defect 2 — no frame isolation), so it stacks visibly into the agent's display.

**Why ND-23's reasoning doesn't cover this:** ND-23's "every realistic flow attaches within a tick" holds for *sequential* attach / cross-device reattach (D-G3) — the spawning client sizes the PTY, later single clients re-size on attach. It breaks under *simultaneous* attach (scenario F: "two clients attached simultaneously … both observe live agent output"), where neither client yields the size and a TUI agent repaints continuously. The functional F contract still holds (both clients receive output; claims serialize); only the *rendering* is broken — and only for full-screen TUI agents, not line-oriented ones.

**What to decide / validate:**

- **(a) Accept + document as a known limitation.** A single self-host user rarely drives two live clients on one session at once (the operator's own framing). Document "concurrent attach to a TUI agent from differently-sized terminals will render imperfectly; detach the extra client" in the handbook, and leave ND-23 last-writer-wins as-is. Lowest cost; honest.
- **(b) Clamp to smallest viewport while >1 client is attached (revisit ND-23 Option B, scoped).** Size the PTY to the min(cols,rows) across *currently attached* clients; revert to last-writer-wins when a single client remains. This is the tmux multi-attach behavior ND-23 declined — re-evaluate it now that the concurrent case is shown to matter. Cost: the supervisor must track per-connection sizes and recompute on attach/detach/resize; the larger client gets blank margins (the exact downside ND-23 named) but renders *correctly*. Does not require a per-client renderer.
- **(c) Per-client rendering / multiplexing layer.** Give each client its own terminal emulation (à la tmux panes / the Phase 2 PWA's xterm.js) so each renders the agent state at its own size. Heaviest; overlaps Phase 2 PWA surface; almost certainly out of scope for Phase 1.5.
- **(d) Advisory only.** When a 2nd client attaches to a session, surface a one-line notice ("another client is attached; TUI rendering may degrade until one detaches") — cheap, pairs with any of (a)/(b). Needs the structured event stream ([[nd-30-relay-attach-stderr-event-stream-for-subprocess-of-attach-consumers]]) to render cleanly in the IDE.
- **Constraints to preserve:** [[d-g2-multi-client-input-arbitration]] universal output (both clients must keep receiving live output); [[d-g3-reattach-semantics]] cross-device reattach across heterogeneous viewports; ND-23's single-client and sequential-reattach behavior must not regress; scenario F's "both observe live agent output" must still pass.
- **Validate against scenario F** in [`docs/prd/08-acceptance.md`](../prd/08-acceptance.md): the fix (or the documented limitation) should make F's intent honest for a TUI agent, not just for the programmatic byte-race the 2026-05-22 baseline used.

**Default lean if picked up:** (b) clamp-to-smallest-while-multi-attached + (a) document the residual — it fixes the rendering with bounded supervisor complexity and no per-client renderer, and the "blank margins on the larger client" cost ND-23 worried about is strictly better than the current shredded frame. (c) stays Phase 2. Severity is **low-frequency / high-visual-impact**: rare for a single-user product, but jarring when hit, so a documented limitation is the floor even if the code fix defers.

The 7F walk recorded this as a finding and did **not** change ND-23 inline (per the kickoff's "don't silently fix; file via decision-log" rule); resolving this entry decides whether ND-23's multi-client policy is revisited.

## Resolution

*(unresolved)*
