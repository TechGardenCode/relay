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
- `relay` CLI for tenant/project/persona/session/token management
- VS Code-family extension (.vsix via GitHub Releases): connect-to-server config, start-session command, attach-to-session command, status bar
- Single CLI integration: Claude Code
- Default persona set shipped as YAML defaults (`product`, `design`, `dev`, `test`, `infra`, `architect`, `review`)
- npm and Docker distribution
- Documentation: README, deployment guide, persona authoring guide

Phase 1 ships when the eight acceptance scenarios in `08-acceptance.md` all pass.

## Phase 2 — Mobile PWA MVP (3–4 weekends)

Deliverables:

- PWA scaffold served by the Relay server
- Sessions list, session view, compose, file viewer, diff approval (per the separate Phase 2 mobile design doc referenced in `05-mobile-pwa.md`)
- QR-code device pairing
- Push notifications via PWA Push (where supported) and webhook fallback

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
