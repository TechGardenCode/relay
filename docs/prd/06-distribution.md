# Relay PRD — Distribution & Deployment

**Status:** v0.4
**Scope:** How Relay is packaged, configured, persisted, and supervised across deployment shapes. Architecture-level deployment-shape narrative lives in `02-architecture.md`.

---

## Packaging shape

Relay ships as a **single binary with subcommands**, not as separate `relay-server` and `relay-cli` packages. One `relay` executable carries every subcommand: `relay server` runs the long-lived API/WebSocket process, `relay project`, `relay persona`, `relay session`, `relay token`, and `relay attach` are the management and client subcommands (see `03-server.md` §7 for the subcommand catalog). One install path, one version to track, one set of release artifacts across every distribution channel below.

This shape is deliberate. Splitting the server and CLI into separate packages would double the distribution surface (two npm modules, two Docker tags, two Helm charts, two version-pinning matrices) for no functional benefit, since operators always need both anyway. The single binary also keeps container images simple — one binary copy, one entrypoint.

*Resolved by [D-08](../open-questions.md#d-08-single-binary-vs-separate-packages) on 2026-05-14.*

## Distribution channels

- **npm:** `npm install -g @relay/relay` (or `npx`). Primary distribution. Single binary, requires Node.js 22+.
- **Docker:** image published to GHCR. Runs the same Node binary inside an Alpine base.
- **Docker Compose:** documented example with Caddy reverse proxy and Tailscale sidecar for users wanting tunnel-fronted deployment.
- **Helm chart:** Phase 3 deliverable.

## Configuration

- `~/.relay/config.yaml` for declarative configuration.
- Environment variables override file config for container deployments.
- All configuration twelve-factor.
- **Agent model credentials** are supplied via Relay's own process environment (`ANTHROPIC_API_KEY` and any other provider-specific variables the wrapped agent CLI natively consumes) and passed unchanged into each spawned agent. Credentials are never persisted to YAML, the SQLite state file, or any Relay-owned config. Deployment guides should document setting these on the unit/container running `relay server`. See `03-server.md` §3.

*Model credentials resolved by [D-10](../open-questions.md#d-10-agent-model-credentials-handling) on 2026-05-15.*

## Persistence

- SQLite database file under `~/.relay/state.db`.
- Project working directories are registered **in place** — Relay stores the canonical path of whatever the operator passed to `relay project add` and does not move or copy the directory. The `/projects/` (container) and `~/projects/` (local mode) paths are operator *conventions* for where source is commonly mounted or checked out, not Relay-owned roots. Operators are free to register projects from any path; the convention exists to make the deployment guide concrete.
- The `~/.relay/` and `~/.claude/` directories together represent all Relay-owned state worth backing up. Project working directories are backed up by whatever git or filesystem tooling the operator already uses.

*Project storage and `relay project add` semantics resolved by [D-12](../open-questions.md#d-12-project-record-storage-and-relay-project-add-semantics) on 2026-05-15.*

## Process supervision

Built-in: server runs as a single Node process. Restart on failure handled by:
- Local mode: user's choice (systemd, launchd, pm2 — all documented)
- Docker: container restart policy
- Helm: Kubernetes Deployment
