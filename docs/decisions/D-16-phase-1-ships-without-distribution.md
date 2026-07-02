---
id: D-16
status: resolved
title: "Phase 1 ships without distribution (6J deferred to post-2.0)"
resolved-on: 2026-05-22
affects: "docs/build-plan.md Sequencing table (6J row Status; 6Z row Status + body re-scope); new `Track 8 — Post-2.0 deferrals` section that takes ownership of 6J; docs/prd/07-phasing.md Phase 1 deliverables list + `Phase 1 ships when` line; docs/prd/08-acceptance.md scenario H annotation + `Explicit Phase 1 deferrals` list; docs/history/phase-1-acceptance-walk.md superseded-by banner; docs/arch/ux-rollout-posture.md §2 + §7 (stale `A–H` framing); .claude/skills/scenario-runner/SKILL.md required reads (stale `A–H` framing)."
surfaced-by: "User decision 2026-05-22 — operator not ready to commit to distribution surface; prefer to flip Phase 1 acceptance via the dev/source-install path that scenarios A–G already exercise and let packaging land in a post-2.0 milestone. Triggered by build-plan-kickoff for 6J: the kickoff surfaced the work, the user declined it."
---

# D-16 — Phase 1 ships without distribution (6J deferred to post-2.0)

**Status:** resolved (2026-05-22)
**Affects:** `docs/build-plan.md` Sequencing table (6J row Status; 6Z row Status + body re-scope); new `Track 8 — Post-2.0 deferrals` section that takes ownership of 6J; `docs/prd/07-phasing.md` Phase 1 deliverables list + `Phase 1 ships when` line; `docs/prd/08-acceptance.md` scenario H annotation + `Explicit Phase 1 deferrals` list; `docs/history/phase-1-acceptance-walk.md` superseded-by banner; `docs/arch/ux-rollout-posture.md` §2 + §7 (stale `A–H` framing); `.claude/skills/scenario-runner/SKILL.md` required reads (stale `A–H` framing).
**Surfaced by:** User decision 2026-05-22 — operator not ready to commit to distribution surface; prefer to flip Phase 1 acceptance via the dev/source-install path that scenarios A–G already exercise and let packaging land in a post-2.0 milestone. Triggered by build-plan-kickoff for 6J: the kickoff surfaced the work, the user declined it.

## Question

Should Phase 1's acceptance gate ([`6Z`](../build-plan.md)) require the distribution surface (`npm install -g`, Docker image, Docker Compose with Caddy + Tailscale sidecar, GitHub Releases `.vsix` attachment) to ship, or can Phase 1 close with the dev/source-install path that scenarios A–G already exercise, with distribution deferred to a post-2.0 milestone?

## Context

At time of resolution, 6J (Distribution) is the only Phase 1 implementation row still `pending`. Every other Track 6 row is `done`. The Phase 1 acceptance walk on 2026-05-22 ([`docs/history/phase-1-acceptance-walk.md`](../history/phase-1-acceptance-walk.md)) reported `36 pass, 1 n/a, 2 blocked, 0 fail` — the two `blocked` checks are H.1 (`npm install -g @relay/relay` 404s — no npm publish) and H.3 (no `Dockerfile` in tree). Both unblock when 6J ships.

The operator is not ready to commit to distribution. Reasons that motivate the deferral:

1. **Track 7 (UX rollout polish) is still in flight.** The 6I IDE-extension walk surfaced a coherent set of UX gaps (install + onboarding, IDE GUI overhaul, session + attach polish, diagnostics + error UX) that [[d-15-ux-rollout-posture]] consolidates into a gated planning artifact. Wider rollout — the user audience that distribution would unlock — is already gated on those four ND deep-dives ([[nd-32-install-and-onboarding-deep-dive]], [[nd-33-ide-gui-overhaul-deep-dive]], [[nd-34-session-and-attach-polish-deep-dive]], [[nd-35-diagnostics-and-error-ux-deep-dive]]). Shipping distribution before those resolve would expose the friction-laden onboarding to non-author users.
2. **The distribution surface has unresolved sub-questions.** [`docs/phase-0-report.md`](../history/phase-0-report.md) §1 (macOS spawn-helper chmod under pnpm) and §5 (Linux `build-essential` requirement, since `node-pty` has no Linux prebuild) are 6J-owned. Docker Compose with Caddy + Tailscale sidecar is an operator-UX decision sketch that hasn't been chosen yet. Shipping any of these prematurely locks in a contract that may be wrong.
3. **The dogfood loop works on dev/source install.** The 2026-05-22 walk demonstrated full functional correctness across two physical machines using `node packages/server/dist/cli/relay.js` invoked via a `/usr/local/bin/relay` symlink on the VM. Scenarios A–G all pass on this path. The `.vsix` builds (`relay-extension-0.0.0.vsix`, ~90 KB) and installs via Cursor's "Install from VSIX…" menu without needing a GitHub Release.

Without re-scoping 6Z, Phase 1 stays formally `blocked` indefinitely on a deliberate scoping decision rather than unfinished work — which misrepresents the actual state of the project.

## Options under consideration

- **Option A — Re-scope 6Z to A–G, move 6J to a new Track 8 (post-2.0).** (Chosen.) Phase 1 ships green on the dev/source-install path. 6J's full body moves to a new `Track 8 — Post-2.0 deferrals` section at the bottom of `docs/build-plan.md`; 6J's Sequencing-table row stays in place but flips Status to `deferred → Track 8` so the dependency chain (6H → 6I → 6J → 6Z) stays visible. Scenario H is annotated as deferred in `prd/08-acceptance.md`. Track 7 is unchanged — wider rollout still implicitly requires distribution, but that's a transitive dependency Track 7 already inherits.
- **Option B — Keep 6Z requiring A–H, leave it blocked.** Phase 1 stays formally `blocked` on H until post-2.0 6J ships. Honest "we paused before the finish line" framing. Cost: 6Z never flips green; Track 7 starts under an open Phase 1 gate; readers can't distinguish "blocked on deliberate scoping" from "blocked on unfinished work."
- **Option C — Re-scope 6Z and delete scenario H entirely.** No Track 8; no post-2.0 owner for distribution; the row just vanishes. Lowest ceremony but loses institutional memory — the macOS spawn-helper / Linux build-essential / Compose / Caddy / Tailscale design work would have to be re-derived when distribution eventually starts.

## Current thinking

Option A. Re-scoping the gate to match the actual decision (dev/source install is the Phase 1 bar; packaging is post-2.0) lets `6Z` flip green and Track 7 begin under a clear posture, while Track 8 preserves the distribution work for the future milestone that will pick it up.

## Resolution

**Adopt Option A — Re-scope 6Z to A–G, move 6J to a new `Track 8 — Post-2.0 deferrals` section.** Phase 1 acceptance no longer requires scenario H. Track 7 (UX rollout polish) is unchanged; wider rollout still waits for both Track 7's ND deep-dives *and* the eventual post-2.0 6J as a transitive dependency.

1. **6J Status flips to `deferred → Track 8`** in `docs/build-plan.md`'s Sequencing table. The row stays at its current line so the dependency chain (`6H → 6I → 6J → 6Z`) stays readable, but the Status column shows `deferred (post-2.0)` with a link to Track 8. The Track 6 ASCII diagram's `6I → 6J → 6Z` edge is annotated to reflect the deferral.
2. **New `Track 8 — Post-2.0 deferrals` section** is added at the bottom of `docs/build-plan.md`, after Track 7. It owns 6J's full body (Goal / Output / Done when / Reads, plus the ND-19 Docker named-volume OAuth validation log). The section's introduction names the gating condition for Track 8 work: "blocked on operator decision to ship 2.0 / wider rollout; Track 7 ND-32..35 resolutions inform Track 8 scope."
3. **6Z is re-scoped to scenarios A–G** in `docs/build-plan.md`. The row's Goal becomes "Phase 1 ships when scenarios A–G pass; 1A/1B/1C are done; distribution (6J / scenario H) is deferred to Track 8 per [[d-16-phase-1-ships-without-distribution]]." The Done when line updates symmetrically. With this re-scope, the 2026-05-22 walk's verdict effectively flips from `blocked` to `pass-eligible` (the only remaining `blocked` checks were H.1 and H.3, both now out of scope); the user re-runs the gate or accepts the existing walk as evidence.
4. **`docs/prd/07-phasing.md` Phase 1 section updates twice** — (a) the deliverables list removes "npm and Docker distribution" (or annotates it as deferred to post-2.0); (b) the "Phase 1 ships when the eight acceptance scenarios in `08-acceptance.md` all pass" sentence drops to "the seven acceptance scenarios A–G in `08-acceptance.md`" with an inline back-reference to D-16. Phase 2/3/4 sections are unchanged.
5. **`docs/prd/08-acceptance.md` annotates scenario H** with a deferred-to-post-2.0 banner pointing at D-16 and Track 8. Scenario H is also added to the "Explicit Phase 1 deferrals" list with a one-line note.
6. **`docs/history/phase-1-acceptance-walk.md` gains a one-line superseded-by banner** at the top noting that D-16 re-scoped the gate to A–G; the walk body itself (a snapshot of 2026-05-22 evidence) is not rewritten. Under the new gate, the walk's verdict converts to `pass` — the two `blocked` checks were H.1 and H.3, both now out of Phase 1 scope.
7. **Track 7 is unchanged.** It still gates wider rollout. Wider rollout still implicitly requires distribution to land (since a non-author can't install without it) — that's a transitive dependency Track 7 has always carried. No Track 7 row needs editing.
8. **Phase 0 surprises §1 (macOS spawn-helper chmod) and §5 (Linux `build-essential`) ride with 6J into Track 8.** They were originally assigned to 6J in [`docs/phase-0-report.md`](../history/phase-0-report.md); they remain 6J's responsibility under the new track.

**Why this and not Option B (leave 6Z blocked):** Leaving 6Z blocked confuses the artifact's audience. A–G are clean; the only `blocked` checks are H.1 and H.3, both gated on a deliberate scoping decision rather than unfinished work. The build-plan's job is to tell the truth about state — re-scoping 6Z to match the decision is honest; leaving 6Z blocked is technically accurate but reads as "implementation incomplete," which misrepresents what's actually happening.

**Why this and not Option C (delete H entirely):** Distribution will ship eventually — the design work (`Dockerfile` shape, Compose with Caddy + Tailscale, npm publish workflow, GitHub Releases `.vsix` attachment) already lives in PRD §06-distribution.md and Phase 0 surprises §1 / §5. Deleting the row loses institutional memory and forces re-derivation when 2.0 starts. Track 8 preserves the work, the gated condition for picking it up, and the back-references future-us will need.

**Propagated to:** `docs/build-plan.md` Sequencing table (6J Status, 6Z Status), Track 6 6J/6Z body sections, Track 6 intro `Phase 1 ships when` line, Track 7 distinction-from-6Z note, new Track 8 section, sequencing diagram (2026-05-22); `docs/prd/07-phasing.md` Phase 1 deliverables list + `Phase 1 ships when` line (2026-05-22); `docs/prd/08-acceptance.md` scenario H banner + `Explicit Phase 1 deferrals` list (2026-05-22); `docs/history/phase-1-acceptance-walk.md` superseded-by banner (2026-05-22); `docs/arch/ux-rollout-posture.md` §2 + §7 stale `A–H` framing (2026-05-22); `.claude/skills/scenario-runner/SKILL.md` required reads stale `A–H` framing (2026-05-22).
