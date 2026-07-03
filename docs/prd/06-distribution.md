# Relay PRD — Distribution & Deployment

**Status:** v0.4
**Scope:** How Relay is packaged, configured, persisted, and supervised across deployment shapes. Architecture-level deployment-shape narrative lives in `02-architecture.md`.

---

## Packaging shape

Relay ships as a **single binary with subcommands**, not as separate `relay-server` and `relay-cli` packages. One `relay` executable carries every subcommand: `relay server` runs the long-lived API/WebSocket process, `relay project`, `relay persona`, `relay session`, `relay token`, and `relay attach` are the management and client subcommands (see `03-server.md` §7 for the subcommand catalog). One install path, one version to track, one set of release artifacts across every distribution channel below.

This shape is deliberate. Splitting the server and CLI into separate packages would double the distribution surface (two npm modules, two Docker tags, two Helm charts, two version-pinning matrices) for no functional benefit, since operators always need both anyway. The single binary also keeps container images simple — one binary copy, one entrypoint.

*Resolved by [D-08](../decisions/D-08-single-binary-vs-separate-packages.md) on 2026-05-14.*

## Distribution channels

- **npm:** `npm install -g @techgardencode/relay` (or `npx`). Primary distribution. Single binary, requires Node.js 22+. Published under the `@techgardencode` public npm user scope, in lockstep with the companion `@techgardencode/protocol` wire-schema package, both released by CI on a pushed `v*` tag with npm provenance. Native dependencies (`node-pty`, `better-sqlite3`) install with no C++ toolchain on macOS and Linux glibc (x64/arm64), which ship prebuilt addons; other targets (Alpine/musl, other architectures) compile from source at install time. Windows is CI build-only and experimental, not part of the release gate.
- **Docker:** image published to GHCR. Runs the same Node binary inside an Alpine base.
- **Docker Compose:** documented example with Caddy reverse proxy and Tailscale sidecar for users wanting tunnel-fronted deployment.
- **Helm chart:** Phase 3 deliverable.

*npm channel shape resolved by [D-19](../decisions/D-19-npm-distribution-posture.md) on 2026-07-02; native-dependency prebuild strategy resolved by [ND-45](../decisions/ND-45-node-pty-linux-prebuild-resolution.md) on 2026-07-02.*

## Install & onboarding bar

The painless-rollout bar for getting a non-author from "nothing installed" to a paired, running session: the install sequence must be **self-narrating**, never requiring a reader to open the source tree or message the author. The destination is a published channel — `npm install -g @techgardencode/relay` for the binary, and the IDE extension installable from **both** the VS Code Marketplace and Open VSX (so Cursor / VSCodium / Windsurf operators are first-class) — but the extension-marketplace listing is still Track 8 work, not a Phase 1.5 precondition (Phase 1 ships from source per [[d-16-phase-1-ships-without-distribution]]).

What ships now, on the source-install path, is the one source-install-independent lever: `relay init` prints a numbered next-steps narrative bridge after the pairing snippet (see `03-server.md` §7) so the operator always knows the sequence — `claude auth login`, `relay server`, IDE pairing, project registration, session start. Extension-side `relay`-binary discovery (PATH probe + install guidance), version surfacing, an optional `relay init --start`, and a cross-device on-ramp note sharpen the path but do not block it; first-run telemetry stays out of scope for the self-host single-user posture.

**Track 8 gating prerequisites — npm slice closed, marketplace/Docker still open.** A clean `npm install -g @techgardencode/relay` used to not reach a first `POST /sessions` unaided on every host: the macOS `node-pty` spawn-helper needed its executable bit set (Phase 0 surprise §1) and Linux hosts needed `build-essential` / `python3` for the native builds (Phase 0 surprise §5). Both are now closed by the npm-slice implementation per [D-19](../decisions/D-19-npm-distribution-posture.md) — a postinstall script repairs the spawn-helper bit, and [ND-45](../decisions/ND-45-node-pty-linux-prebuild-resolution.md)'s Linux-prebuilt `node-pty` means glibc x64/arm64 hosts need no toolchain at all. What remains Track 8 (`6J`) work: the first actual npm publish (operator-gated), the IDE extension's VS Code Marketplace + Open VSX listing, and the Docker/Compose/Helm channels. See [`docs/phase-0-report.md`](../history/phase-0-report.md).

*Resolved by [ND-32](../decisions/ND-32-install-and-onboarding-deep-dive.md) on 2026-05-26.*

## Configuration

- `~/.relay/config.yaml` for declarative configuration.
- Environment variables override file config for container deployments.
- All configuration twelve-factor.
- **Agent model credentials** are inherited from Relay's process environment and process credentials, then passed unchanged into each spawned agent. The documented default is OAuth — operators run `claude login` once on the host that launches `relay server`, and spawned agents read the resulting state (macOS Keychain or `~/.claude/.credentials.json` on Linux) transparently. `ANTHROPIC_API_KEY` is the documented fallback for headless deployments (CI runners, immutable containers, environments without an interactive shell). Neither is ever written to YAML, the SQLite state file, or any Relay-owned config. Deployment guides should document `claude login` on the host as the primary path and the env-var fallback for headless cases. See `03-server.md` §3.

*Model credentials resolved by [D-10](../decisions/D-10-agent-model-credentials-handling.md) on 2026-05-15. OAuth credential default per [ND-19](../decisions/ND-19-claude-login-oauth-as-the-documented-credential-default-anthropic-api-key-as-fallback.md) on 2026-05-18.*

## Persistence

- SQLite database file under `~/.relay/state.db`.
- Project working directories are registered **in place** — Relay stores the canonical path of whatever the operator passed to `relay project add` and does not move or copy the directory. The `/projects/` (container) and `~/projects/` (local mode) paths are operator *conventions* for where source is commonly mounted or checked out, not Relay-owned roots. Operators are free to register projects from any path; the convention exists to make the deployment guide concrete.
- The `~/.relay/` and `~/.claude/` directories together represent all Relay-owned state worth backing up. Project working directories are backed up by whatever git or filesystem tooling the operator already uses.

*Project storage and `relay project add` semantics resolved by [D-12](../decisions/D-12-project-record-storage-and-relay-project-add-semantics.md) on 2026-05-15.*

## Process supervision

Built-in: server runs as a single Node process. Restart on failure handled by:
- Local mode: user's choice (systemd, launchd, pm2 — all documented)
- Docker: container restart policy
- Helm: Kubernetes Deployment
