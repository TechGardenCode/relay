# Relay PWA — design spec (Phase 2)

**Status:** product + UX design resolved (2026-05-28); tech/architecture deferred.
**Resolves:** [`D-18` — terminal-style substrate + MVP product scope](../../decisions/D-18-pwa-terminal-substrate-and-mvp-scope.md).
**Supersedes the punt in:** [`prd/05-mobile-pwa.md`](../../prd/05-mobile-pwa.md) §2/§4 ("separate Phase 2 design document, TBD").

---

## What this is

The Relay PWA is a **terminal-style** mobile/web client that attaches to the *real* `claude`
process running server-side on the host. Nothing about the agent is reimplemented — plan mode,
skills, agents, and diff approval all work because it is the same process you'd drive at the
laptop (G-1, G-3). The PWA is the user's opinionated take on a client surface; the **server stays
client-agnostic** and the PWA consumes the same REST/WS contract the IDE extension uses
([`arch/client-agnosticism.md`](../../arch/client-agnosticism.md)).

The motivating use case: host Relay on a dedicated VM, hook into a few pre-created projects, and —
when an idea strikes while out — pull up the PWA on a phone and drive the same server-side agent as
if at the laptop.

## Documents

- [`requirements.md`](requirements.md) — functional (FR) + non-functional (NFR) requirements.
- [`interaction-model.md`](interaction-model.md) — information architecture, the live-session
  screen, and the spawn / scratch flows.
- [`server-touchpoints.md`](server-touchpoints.md) — the minimal *additive* server surface the PWA
  needs, each flagged as a candidate ND for the tech-architecture phase.

## MVP scope at a glance

**In:** pair/auth · sessions home grouped Projects + Scratch (running/idle status) · live terminal
attach (replay + reattach) · keyless control rail · compose-and-send (type or OS dictation, explicit
send) · raw per-keystroke toggle · spawn against a project · scratch spawn under `~/.relay/scratch/`
· create-project-from-client · BUSY handling · read-only file tree + light text viewer (conditional)
· fire-and-forget.

**Out (deferred, not designed away):** custom voice transcription (use OS dictation) · OS push /
service-worker notifications (in-app status only) · file editing + diff-approval GUI (approve in the
TUI; remote VS Code for editing) · "waiting-for-input" status heuristic · personas (per
[`D-17`](../../decisions/D-17-personas-descoped-from-mvp.md)).

## Deferred to the tech-architecture phase

Framework (graduate [`packages/spike-pwa/`](../../../packages/spike-pwa/) vs. rebuild
`packages/pwa/`), voice transcription engine (if OS dictation proves insufficient),
terminal-on-mobile rendering specifics, and PWA infrastructure (manifest / service worker /
installability). See the design plan at
`~/.claude/plans/we-ve-done-quite-a-keen-corbato.md` §8 for the re-engagement prompt.
