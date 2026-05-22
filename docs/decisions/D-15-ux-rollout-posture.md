---
id: D-15
status: resolved
title: "UX rollout posture"
resolved-on: 2026-05-22
affects: "docs/arch/ux-rollout-posture.md (new top-down posture doc this decision authors); [[nd-32-install-and-onboarding-deep-dive]], [[nd-33-ide-gui-overhaul-deep-dive]], [[nd-34-session-and-attach-polish-deep-dive]], [[nd-35-diagnostics-and-error-ux-deep-dive]] (the four per-surface deep-dive entries this decision opens); docs/build-plan.md Track 7 (the new Phase 1.5 polish track this decision adds)."
surfaced-by: "6I IDE-extension e2e walk (2026-05-22) — full Relay session test across remote SSH + multiple clients + Cursor extension surfaced clunky end-to-end UX (manual install, command-palette-only IDE GUI, attach quirks, silent diagnostics). Scattered open NDs ([[nd-15-relay-session-show-subcommand-surface-alignment]], [[nd-17-relay-attach-raw-mode-tty-variant-of-the-5-1-client-fsm]], [[nd-25-relay-attach-detach-with-d-requires-two-keypresses-on-the-host-tty]], [[nd-30-relay-attach-stderr-event-stream-for-subprocess-of-attach-consumers]], [[nd-31-secretstorage-key-namespace-for-multi-server-ide-pairing]]) acknowledged pieces but lacked a consolidated rollout-readiness bar."
---

# D-15 — UX rollout posture

**Status:** resolved (2026-05-22)
**Affects:** `docs/arch/ux-rollout-posture.md` (new top-down posture doc this decision authors); [[nd-32-install-and-onboarding-deep-dive]], [[nd-33-ide-gui-overhaul-deep-dive]], [[nd-34-session-and-attach-polish-deep-dive]], [[nd-35-diagnostics-and-error-ux-deep-dive]] (the four per-surface deep-dive entries this decision opens); `docs/build-plan.md` Track 7 (the new Phase 1.5 polish track this decision adds).
**Surfaced by:** 6I IDE-extension e2e walk (2026-05-22) — full Relay session test across remote SSH + multiple clients + Cursor extension surfaced clunky end-to-end UX (manual install, command-palette-only IDE GUI, attach quirks, silent diagnostics). Scattered open NDs ([[nd-15-relay-session-show-subcommand-surface-alignment]], [[nd-17-relay-attach-raw-mode-tty-variant-of-the-5-1-client-fsm]], [[nd-25-relay-attach-detach-with-d-requires-two-keypresses-on-the-host-tty]], [[nd-30-relay-attach-stderr-event-stream-for-subprocess-of-attach-consumers]], [[nd-31-secretstorage-key-namespace-for-multi-server-ide-pairing]]) acknowledged pieces but lacked a consolidated rollout-readiness bar.

## Question
How do we consolidate the end-user UX gaps surfaced by the 6I e2e walk into a coherent, gated planning artifact, so that "painless wider rollout" becomes a checkable bar rather than an aspiration scattered across pending NDs?

## Context
The 6I IDE extension wire-up (ed97bc3, 2026-05-22) was the first time Relay's full client posture was exercised end-to-end — pair, discover, start, attach, switch device, release — through a real IDE on a real workstation against a server reached over SSH. The functional contract held, but the **UX surface around it was clunky in ways that would make a wider rollout painful**:

- Installation was manual end-to-end (sideload `.vsix`, globally link the `relay` binary so the extension's `vscode.window.createTerminal` spawn can find it, pre-run `claude login`, hand-paste pairing URLs).
- The IDE extension exposes everything through the command palette; even the status-bar widget is a single click target with no richer GUI surface for session discovery, persona selection, or BUSY notice.
- Session management requires CLI knowledge (`relay session list`, `relay attach <id>`) for anything beyond the four contributed commands.
- Attach has rough edges ([[nd-25-relay-attach-detach-with-d-requires-two-keypresses-on-the-host-tty]] `^D` two-press, blank pane on reattach to quiet sessions, BUSY notice shows as unstructured stderr prose per [[nd-30-relay-attach-stderr-event-stream-for-subprocess-of-attach-consumers]]).
- Failures are silent or generic (bad credentials, persona-load errors, project-marker mismatches surface as either nothing or unhelpful errors).

Several scattered NDs already acknowledge specific pieces — [[nd-15-relay-session-show-subcommand-surface-alignment]], [[nd-17-relay-attach-raw-mode-tty-variant-of-the-5-1-client-fsm]], [[nd-25-relay-attach-detach-with-d-requires-two-keypresses-on-the-host-tty]], [[nd-30-relay-attach-stderr-event-stream-for-subprocess-of-attach-consumers]], [[nd-31-secretstorage-key-namespace-for-multi-server-ide-pairing]], [[nd-19-claude-login-oauth-as-the-documented-credential-default-anthropic-api-key-as-fallback]]. But they are pieces, not a posture — there is no single artifact that says "before wider rollout, this set of UX gaps must be closed or deliberately deferred."

This decision creates that artifact and gates rollout on it.

## Options under consideration
- **Option A — Arch doc + parent D-NN + four ND children + new Track 7.** (Chosen.) Author `docs/arch/ux-rollout-posture.md` as a top-down inventory across four surfaces; file this parent D-NN + four ND children (one per surface); open `Track 7 — UX rollout polish (Phase 1.5, blocks rollout)` in `docs/build-plan.md` with one row per ND deep-dive plus a final readiness-walk row. Each ND deep-dive is its own future brainstorm → spec → plan cycle.
- **Option B — Standalone planning doc outside the arch/decision tree.** Single `docs/ux-sweep.md` capturing posture + inventory + sequencing, decomposed into arch/decision/build-plan artifacts later when each surface starts. Lower up-front structure cost; fragments the existing pattern (arch doc + decision-log + build-plan are how Relay tracks every other load-bearing concern).
- **Option C — Interleave into existing Phase 1 rows.** No new artifacts; the identified gaps become inline notes on 6J, 6I-followups, etc. Lowest ceremony; loses the "rollout-readiness gate" framing and re-scatters what the sweep is meant to consolidate.

## Current thinking
Option A. The cost of one extra track is small; the cost of an implicit (therefore skippable) rollout gate is large.

## Resolution
**Adopt Option A — arch doc + parent D-15 + four ND children + Track 7 with the rollout-readiness walk as its terminal row.** The sweep is identify-only; per-surface fixes happen as independent deep-dives.

1. **`docs/arch/ux-rollout-posture.md` is the inventory.** Top-down survey across four surfaces (install + onboarding, IDE GUI overhaul, session + attach polish, diagnostics + error UX). Each surface lists already-filed NDs + newly-identified gaps and points to the ND child that owns the deep-dive. The doc ends with an explicit rollout-readiness statement (§7) so a future reader can quote the gate verbatim.
2. **D-15 (this entry) is the strategy, not a content decision.** D-15 resolves *how* we consolidate the UX gaps (sweep structure, gate placement); it does **not** prescribe fixes. Each surface's content decision is owned by its ND child.
3. **One ND child per surface, all opened `open`:** [[nd-32-install-and-onboarding-deep-dive]], [[nd-33-ide-gui-overhaul-deep-dive]], [[nd-34-session-and-attach-polish-deep-dive]], [[nd-35-diagnostics-and-error-ux-deep-dive]]. Each ND's question is "What is the minimum painless-rollout bar for <surface>?" Each ND deep-dive triages its own scope — not every inventory bullet must ship; deliberate deferrals are valid resolutions provided the deferral rationale is written down in the ND's Resolution.
4. **Existing NDs are referenced, not re-parented.** ND-15, ND-17, ND-19, ND-25, ND-30, ND-31, ND-02, ND-03, ND-05, ND-07, ND-11 stay where they are; the arch doc surfaces them under the appropriate surface for context. Their existing build-plan rows (e.g. inside 6H, 6I) are not disturbed.
5. **New `Track 7 — UX rollout polish (Phase 1.5, blocks rollout)`** is added to `docs/build-plan.md`, positioned after Track 6 (current Phase 1 implementation) and before any rollout/launch marker. Rows: 7A (this bootstrap), 7B (ND-32), 7C (ND-33), 7D (ND-34), 7E (ND-35), 7F (rollout-readiness re-walk of scenarios A–H with sweep changes landed).
6. **7B–7E are independent and can run in parallel** (different surfaces, no shared module state); 7F sequences after all four ND children resolve. The Phase 1 [`6Z`](../build-plan.md) gate ships independently of Track 7 — `6Z` is Phase 1's *acceptance* gate (scenarios pass on a clean install); Track 7 is the *rollout* gate that sits above it (acceptance plus painless onboarding for non-author users).
7. **Rollout-readiness gate.** Wider rollout (beyond the operator/dogfood loop) requires ND-32 / ND-33 / ND-34 / ND-35 to each be resolved or deliberately deferred with documented rationale. The arch doc §7 states this in one sentence so [`scenario-runner`](../../.claude/skills/scenario-runner/SKILL.md) or a future readiness audit can quote it.

**Surfaces new sub-questions:** [[nd-32-install-and-onboarding-deep-dive]], [[nd-33-ide-gui-overhaul-deep-dive]], [[nd-34-session-and-attach-polish-deep-dive]], [[nd-35-diagnostics-and-error-ux-deep-dive]].

**Why this and not Option B (standalone planning doc):** Relay tracks every load-bearing concern through the existing arch / decision-log / build-plan triad. A standalone `docs/ux-sweep.md` would create a fourth tracking surface for one concern, fragment the audit story (the [`decision-log`](../../.claude/skills/decision-log/SKILL.md) skill can't see it; [`prd-link`](../../.claude/skills/prd-link/SKILL.md) citations can't reference it), and force a follow-up restructuring pass when surface deep-dives begin. The triad already does what's needed; reuse it.

**Why this and not Option C (interleave into Phase 1 rows):** Interleaving loses the gate. The whole point of this sweep is to make "painless wider rollout" a checkable bar — without a dedicated Track 7 with 7F as its readiness walk, the gate is implicit (and therefore skippable). Interleaving also re-scatters the inventory across the same rows the existing NDs (ND-15/17/25/30/31) already escaped from when filed as standalone entries.

**Propagated to:** `docs/arch/ux-rollout-posture.md` (whole doc) (2026-05-22), `docs/build-plan.md` Track 7 (2026-05-22).
