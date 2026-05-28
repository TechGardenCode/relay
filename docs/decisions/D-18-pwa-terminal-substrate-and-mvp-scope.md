---
id: D-18
status: resolved
title: "Relay PWA Phase 2 — terminal-style substrate and MVP product scope"
resolved-on: 2026-05-28
affects: "docs/prd/05-mobile-pwa.md (§2 capabilities — rendering substrate resolved to terminal-style; §4 'separate Phase 2 design doc (TBD)' now points at docs/design/pwa/); docs/prd/07-phasing.md (Phase 2 PWA deliverables refined to the MVP scope — terminal client, in-app status only, no editing/diff GUI, voice via OS dictation; persona re-enable unchanged per D-17); docs/design/pwa/ (NEW — the elaborated product/UX spec this decision points at); docs/build-plan.md (9A spike row reconcile + a Phase 2 PWA track keyed to the design plan). Surfaces candidate sub-questions to be filed during the PWA tech-architecture phase: scratch create-by-path, mobile control-key claim/release semantics, session running/idle status field."
surfaced-by: "User product/design brainstorming session 2026-05-28. The PRD deliberately deferred the mobile rendering substrate (terminal vs chat) and the mobile UX to a 'separate Phase 2 design document (TBD; not yet authored)' (prd/05-mobile-pwa.md §2, §4), explicitly because locking mobile UX before the client contract (D-G2/D-G3) was resolved would be premature. That contract is now stable (D-G2, D-G3, ND-39 resolved), so the user ran the design pass and chose the substrate + MVP scope."
---

# D-18 — Relay PWA Phase 2 — terminal-style substrate and MVP product scope

**Status:** resolved (2026-05-28)
**Affects:** `docs/prd/05-mobile-pwa.md` (§2 capabilities — rendering substrate resolved to terminal-style; §4 "separate Phase 2 design doc (TBD)" now points at `docs/design/pwa/`); `docs/prd/07-phasing.md` (Phase 2 PWA deliverables refined to the MVP scope — terminal client, in-app status only, no editing/diff GUI, voice via OS dictation; persona re-enable unchanged per [[d-17-personas-descoped-from-mvp]]); `docs/design/pwa/` (NEW — the elaborated product/UX spec this decision points at); `docs/build-plan.md` (9A spike row reconcile + a Phase 2 PWA track keyed to the design plan). Surfaces candidate sub-questions for the PWA tech-architecture phase: scratch create-by-path, mobile control-key claim/release semantics, session running/idle status field.
**Surfaced by:** User product/design brainstorming session 2026-05-28. The PRD deliberately deferred the mobile rendering substrate (terminal vs chat) and the mobile UX to a "separate Phase 2 design document (TBD; not yet authored)" (`prd/05-mobile-pwa.md` §2, §4), explicitly because locking mobile UX before the client contract ([[d-g2-multi-client-input-arbitration]], [[d-g3-reattach-semantics]]) was resolved would be premature. That contract is now stable (D-G2, D-G3, [[nd-39-concurrent-multi-client-attach-tui-rendering-corruption]] resolved), so the user ran the design pass and chose the substrate + MVP scope.

## Question

What is the Relay PWA's rendering substrate (terminal-style vs. chat-style), and what is its MVP product scope — given the PRD deferred both to a "separate Phase 2 design document (TBD)"?

## Context

Phase 1 shipped (6Z, 2026-05-28). Phase 2 is "Mobile PWA MVP + persona re-enable" (`prd/07-phasing.md`). The PRD's mobile subdoc (`prd/05-mobile-pwa.md`) intentionally left the rendering substrate and the view-by-view UX unspecified, naming a future design doc as the home for those choices and citing the then-unresolved client contract (D-G2 input arbitration, D-G3 reattach) as the reason to wait.

The Track 9 spike (`packages/spike-pwa/`) already validated, against a real browser over Tailscale, that a terminal-style client (xterm.js) drives the live PTY with zero protocol changes beyond ND-36 (subprotocol-sourced bearer for browser WS) and an `/app/*` static-serve. The user's goal: host Relay on a dedicated VM, and when an idea strikes while out, drive the *same* server-side agent (plan mode, skills, agents) from a phone exactly as on the laptop — because under the hood it **is** the same process (G-1, G-3).

The user ran a product/design brainstorming pass (2026-05-28) and articulated an opinionated, terminal-centric vision: see the live terminal, drive it with keyless control affordances, prompt by voice/typing into an edit-before-send buffer, navigate projects + ad-hoc "scratch" sessions, and spawn either against a project or into a scratch sandbox that inherits user-level skills. The full elaboration (functional + non-functional requirements, IA, the live-session screen, flows) is written to `docs/design/pwa/`.

## Options under consideration

- **Option A — Terminal-style substrate (xterm.js) + compose-first interaction model.** (Chosen.) The PWA renders the real PTY of the server-side agent; plan mode, interactive prompts, and diff approval all happen in the TUI exactly as on the laptop. The mobile screen is terminal-on-top, a keyless control rail in the middle, and an edit-before-send compose buffer at the bottom, with a raw per-keystroke toggle. Reuses the spike's validated xterm.js + WS path.
- **Option B — Chat-style substrate.** Render the agent as a chat transcript; compose and send messages. A familiar mobile pattern, but it must translate the raw PTY stream into discrete chat turns — lossy for a TUI agent (plan mode, interactive single-key prompts, in-TUI diff approval) and a reimplementation that fights the "it's the same process" value prop.
- **Option C — Defer the substrate; keep the spike as-is.** Don't resolve now. Rejected: the user has a clear vision, the client contract is now stable, and leaving it open blocks both the design spec and the tech phase.

## Current thinking

Option A. The terminal-style substrate is the faithful choice — it preserves native parity (the whole point of server-owned sessions) and builds on a path the spike already proved. The product scope is held deliberately lean for MVP; richer surfaces (push, file editing, custom voice) are deferred, not designed away.

## Resolution

**Adopt Option A — the Relay PWA is a terminal-style client with a compose-first + control-rail mobile interaction model and a deliberately lean MVP scope.** The detailed product/UX spec is authoritative at `docs/design/pwa/`. The contract:

1. **Substrate: terminal-style (xterm.js).** The PWA renders the live PTY of the *real* server-side agent. Plan mode, skills, agents, and diff approval happen in the TUI as on the laptop — no reimplementation. This resolves the `prd/05-mobile-pwa.md` §2/§4 substrate punt.
2. **Interaction model: compose-first + control rail.** Terminal viewport (top) · keyless control rail (`Esc · ^C · Tab · ↑↓ · Enter · ⌥mode`) · compose buffer (bottom) with **explicit send only** and a **raw per-keystroke toggle** (ND-24). Detailed in `docs/design/pwa/interaction-model.md`.
3. **MVP scope (in).** Pair/auth (D-13, ND-36); a sessions home grouped into **Projects** and **Scratch** with running/idle status; live attach with ring-buffer replay (ND-03, ND-40) and reattach (D-G3); the control rail; compose-and-send (type or OS dictation); the raw toggle; spawn against a project; **scratch spawn** under `~/.relay/scratch/<id>/`; **create-project-from-client**; BUSY handling (ND-02); a **read-only** file tree + light text viewer (conditional/separable); fire-and-forget (sessions persist when the PWA closes).
4. **MVP descopes.** Custom voice transcription (the compose buffer + OS keyboard dictation gives voice→edit→send for free; a transcription engine is deferred); OS push / service-worker notifications (in-app running/idle status only); file editing and a dedicated diff-approval GUI (approve in the TUI; remote VS Code covers editing); a "waiting-for-input" status heuristic (unreliable over a PTY). Personas remain deferred per [[d-17-personas-descoped-from-mvp]].
5. **Client-agnosticism preserved.** The server gains only minimal *additive* touch points — scratch create-by-path, control-key claim/release semantics, a session running/idle status field — each to be **filed as an ND and resolved into concrete protocol/REST changes during the PWA tech-architecture phase**. The REST/WS contract stays canonical (the IDE extension and `relay attach` consume the same surface and must not regress) per `docs/arch/client-agnosticism.md`.
6. **Authoritative artifact + new doc category.** The elaborated product/UX spec lives under a new `docs/design/` category (product/UX/interaction design — distinct from `docs/arch/` system architecture, `docs/prd/` what-and-why, `docs/guides/` user handbook). `prd/05-mobile-pwa.md` records the substrate + scope and points at it.
7. **Tech deferred.** Framework choice (graduate `spike-pwa` vs. rebuild `packages/pwa/`), voice transcription engine, terminal-on-mobile rendering specifics, and PWA infrastructure (manifest, service worker, installability) are deferred to the tech-architecture phase, per the user's product → design → tech ordering.

**Why this and not Option B (chat-style):** the value proposition is that the PWA drives the *same* process as the laptop. A chat reskin must translate the PTY stream into chat turns, losing plan mode, interactive single-key prompts, and in-TUI diff approval — a lossy reimplementation that breaks native parity. Terminal-style is faithful and reuses the spike's validated xterm.js + WS path.

**Why this and not Option C (defer):** the user articulated a clear, opinionated vision, and the precondition the PRD named for writing the mobile design doc — a stable client contract — is now met (D-G2, D-G3, ND-39 resolved). Resolving the substrate now unblocks the design spec and the tech phase rather than carrying an open punt into Phase 2.

**Propagated to:** `docs/prd/05-mobile-pwa.md` §2 (substrate resolved → terminal-style) + §4 (design-doc reference now points at `docs/design/pwa/`) (2026-05-28); `docs/prd/07-phasing.md` Phase 2 PWA deliverables refined to MVP scope (2026-05-28); `docs/design/pwa/` authored (README + requirements + interaction-model + server-touchpoints) (2026-05-28); `docs/build-plan.md` 9A row reconciled + P2-PWA-design/P2-PWA-tech/Deploy rows added (2026-05-28); `docs/decisions/index.md` Resolved + counts 46→47 (2026-05-28).
