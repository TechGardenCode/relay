# Relay PRD — Phasing

**Status:** v0.4
**Scope:** The phased roadmap from architectural validation through enterprise. Phase 1 acceptance criteria live in `08-acceptance.md`.

---

## Phase 0 — Spike: architectural validation (1 weekend)

A standalone proof that the architectural backbone works under the conditions Phase 1 will require. Phase 0 must validate **cross-device** attach, not just same-machine restart, because the cross-device capability is what Phase 1's Definition of Done exercises.

Phase 0 passes when:

- Server spawns `claude` under `node-pty`
- Two clients can attach to the same PTY via WebSocket — including from **two different machines** on the same network, not just two terminals on one box
- Both clients see live output simultaneously
- Either client can send input (the input-arbitration model that ships in Phase 1 is tracked as D-G2 in `../decisions/index.md`; Phase 0 only needs to demonstrate that bi-directional input is mechanically possible, not the final collaboration semantics)
- Disconnect and reattach works without losing state, with a documented decision on what the reattaching client sees (tracked as D-G3 in `../decisions/index.md`)
- Server restart preserves session metadata but kills the agent process (acceptable)

If this works in a weekend, the architecture is sound and Phase 1 begins.

## Phase 1 — MVP: Server + VS Code Extension (4–6 weekends)

Deliverables:

- Relay server with REST + WebSocket API, SQLite state, node-pty session management
- `relay` CLI for tenant/project/session/token management
- VS Code-family extension (.vsix sideloaded from a workspace build; GitHub Releases attachment deferred to post-2.0 per [D-16](../decisions/D-16-phase-1-ships-without-distribution.md)): connect-to-server config, start-session command, attach-to-session command, status bar
- Single CLI integration: Claude Code (bare-agent spawn — no persona overlay per [D-17](../decisions/D-17-personas-descoped-from-mvp.md))
- ~~Default persona set shipped as YAML defaults~~ — **deferred to Phase 2** per [D-17](../decisions/D-17-personas-descoped-from-mvp.md). The seven default YAMLs (`product`, `design`, `dev`, `test`, `infra`, `architect`, `review`) stay dormant in the package but `relay init` seeds none.
- ~~npm and Docker distribution~~ — **deferred to post-2.0 / Track 8** per [D-16](../decisions/D-16-phase-1-ships-without-distribution.md). Phase 1 ships on the dev/source-install path that scenarios A, C–G already exercise; `npm install -g`, the Docker image, and Docker Compose with Caddy + Tailscale sidecar move to Track 8.
- Documentation: README, deployment guide ~~persona authoring guide~~ (persona authoring deferred to Phase 2 per [D-17](../decisions/D-17-personas-descoped-from-mvp.md))

Phase 1 ships when the acceptance scenarios **A, C–G** in `08-acceptance.md` all pass. Scenario B (personas) is deferred to Phase 2 per [D-17](../decisions/D-17-personas-descoped-from-mvp.md); scenario H (distribution paths) is deferred to post-2.0 per [D-16](../decisions/D-16-phase-1-ships-without-distribution.md).

*Phase 1 distribution scope re-scoped by [D-16](../decisions/D-16-phase-1-ships-without-distribution.md) on 2026-05-22. Personas descoped from Phase 1 by [D-17](../decisions/D-17-personas-descoped-from-mvp.md) on 2026-05-28.*

## Phase 2 — Mobile PWA MVP + persona re-enable (3–4 weekends)

Deliverables (PWA scope resolved by [D-18](../decisions/D-18-pwa-terminal-substrate-and-mvp-scope.md); full design at [`../design/pwa/`](../design/pwa/README.md)):

- **Terminal-style PWA** served by the Relay server — renders the live PTY of the real server-side agent (xterm.js), not a chat reskin
- Sessions home grouped into **Projects + Scratch** (running/idle status); live session view; compose-and-send with a keyless control rail and a raw-input toggle; spawn against a project or into a scratch sandbox under `~/.relay/scratch/`; create-project-from-client
- **Read-only** file tree + light text viewer (conditional/separable) — file editing and a dedicated diff-approval GUI are out of MVP (approve in the TUI; remote VS Code covers editing)
- QR-code / `relay://pair` device pairing
- In-app session status for MVP; OS push notifications (PWA Push / webhook fallback) deferred post-MVP
- Voice input via the device's OS keyboard dictation into the edit-before-send compose buffer; a custom in-app transcription engine is deferred to the PWA tech phase
- **Persona re-enable** (descoped from Phase 1 per [D-17](../decisions/D-17-personas-descoped-from-mvp.md)): re-wire the dormant `persona/` module onto the spawn path, re-mount the `/personas` routes, restore the `relay persona list/create` CLI and `relay init` default-persona seeding, restore the IDE persona picker, and ship the default persona set + persona authoring guide. The Phase 2 design lives in `09-persona-schema.md`, `03-server.md` §4, and `arch/persona-application.md`; the superseded-for-MVP decisions are D-06, D-09, D-G1, and ND-08.

## Phase 3 — Multi-CLI, persona switching, IntelliJ, Helm (open-ended)

- Codex, Gemini CLI, additional agent CLIs
- Persona switching on a running session via Claude Code's `--resume` mechanism with new context overlay
- JetBrains plugin (Kotlin/Java, separate codebase, shared protocol)
- Helm chart
- Keycloak OIDC replacing bearer-token auth

## Phase 4 — Enterprise (only with a customer)

- Multi-tenant surface exposed
- RBAC, SSO (SAML), audit logging
- Per-persona model and MCP allowlists
- Managed deployment and paid support
