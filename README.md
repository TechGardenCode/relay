# Relay

> **Portable, persistent AI coding sessions across devices.**

> 👉 **New to Relay? Start with the [Getting Started handbook](docs/guides/getting-started.md)** — an A–Z walkthrough from install through your first cross-device session.

> ⚠️ **Implementation status — Phase 1 complete, npm distribution implemented pending first publish.** Acceptance scenarios A, C–G pass ([`docs/history/phase-1-acceptance-walk.md`](docs/history/phase-1-acceptance-walk.md)). The npm slice of distribution is implemented per [D-19](docs/decisions/D-19-npm-distribution-posture.md) — CI publishes `@techgardencode/relay` + `@techgardencode/protocol` to public npm on a pushed `v*` tag — but the first published release lands only once the maintainer pushes that tag; the package is not on the registry yet. Docker/Compose/Helm and the extension marketplace listing remain deferred to Track 8 per [D-16](docs/decisions/D-16-phase-1-ships-without-distribution.md). The "Quick install" snippet below describes the eventual UX; the [handbook](docs/guides/getting-started.md) covers the source-install path that works today.

---

## What Relay is

Relay is a lightweight orchestration service that makes AI-assisted coding sessions portable, persistent, and structured. The server owns long-running CLI agent sessions (Claude Code at MVP) and exposes them to whatever client is convenient — IDE extension on the desktop, plain `relay attach` from an SSH terminal, mobile PWA later.

A structured **persona × project** model sits on top of the agent's own configuration: switch from `architect` to `dev` to `review` without hand-editing `CLAUDE.md`, `.mcp.json`, or skill folders. (Personas are deferred to Phase 2 per [D-17](docs/decisions/D-17-personas-descoped-from-mvp.md) — at MVP sessions spawn a bare agent.)

Relay is **not** an editor, **not** an agent, and **not** a mobile coding tool — it's the glue between the editor you already use and the agent you already trust.

## Quick install

**npm (primary):**

```bash
claude auth login                       # skip if already logged in on this host
npm install -g @techgardencode/relay
relay init                              # one-time: token + ~/.relay/ scaffold
relay server                            # foreground; supervise under systemd/launchd/pm2
```

Requires Node.js 22+. Install is zero-build-tools on macOS and Linux glibc (x64/arm64) — `node-pty` and `better-sqlite3` both ship prebuilt native addons for those targets ([ND-45](docs/decisions/ND-45-node-pty-linux-prebuild-resolution.md)). Alpine/musl and other architectures compile the native addons from source at install time (needs a C++ toolchain — `build-essential`/`python3` on Linux); Windows is experimental (CI build-only, not release-gated). `claude login` writes OAuth state to the macOS Keychain or `~/.claude/.credentials.json` on Linux; Relay's spawned agents inherit it via process credentials and `$HOME`. For headless deployments (CI, immutable containers), `ANTHROPIC_API_KEY` is the documented fallback — see [`docs/deployment.md`](docs/deployment.md) → Headless deployments.

**Upgrade and verify:**

```bash
npm i -g @techgardencode/relay@latest && relay doctor
```

**Docker (one-liner):**

```bash
docker run -d --name relay \
  -p 7777:7777 \
  -v relay_claude:/root/.claude \
  -v ~/.relay:/root/.relay \
  -v ~/code:/projects \
  ghcr.io/<org>/relay:latest
docker exec -it relay claude auth login # one-time, persists in the named volume
```

The named volume holds the container's Claude Code OAuth state and persists across restarts. For headless deployments, see [`docs/deployment.md`](docs/deployment.md) → Headless deployments.

See [`docs/deployment.md`](docs/deployment.md) for the Docker Compose stack with Caddy + Tailscale, configuration details, and backup posture.

## First-session walkthrough — cross-device attach

This walks acceptance scenario E ([`docs/prd/08-acceptance.md`](docs/prd/08-acceptance.md)): start a session on one machine, close that client, attach to the same live session from a different machine.

**On machine A** (the one starting the session):

1. **Install and initialize.**

   ```bash
   claude auth login                     # skip if already logged in on this host
   npm install -g @techgardencode/relay
   relay init
   ```

   `relay init` generates a bearer token (printed once on stdout, also written to `~/.relay/last-pairing.txt`) and writes a default `~/.relay/config.yaml`.

2. **Start the server** in a supervised process or a separate terminal:

   ```bash
   relay server                          # binds 127.0.0.1:7777 by default — see ~/.relay/config.yaml host: to expose on LAN
   ```

3. **Register a project.**

   ```bash
   relay project add ~/code/my-app
   ```

   The path is registered in place — no copy, no symlink. A `.relay/project.json` marker lands at the project root and is added to that project's `.gitignore`.

4. **Start a session.** Install the Relay VS Code / Cursor extension (`.vsix` from GitHub Releases), paste the pairing snippet from `~/.relay/last-pairing.txt`, open `~/code/my-app`, and run the extension's "Start Relay session" command. The session ID surfaces in the IDE status bar; also visible via:

   ```bash
   relay session list                    # shows id, status, project
   ```

5. **Close machine A entirely.** Quit the IDE, walk away from the laptop. The session keeps running on the server.

**On machine B** (any other machine that can reach the server — same LAN, same Tailscale tailnet, or through your TLS reverse proxy):

6. **Attach from a plain SSH terminal:**
   ```bash
   npm install -g @techgardencode/relay  # or use the IDE extension on B instead
   export RELAY_SERVER_URL=http://machine-a:7777
   export RELAY_TOKEN=…                  # the token from step 1
   relay attach <session-id>
   ```
   The terminal begins receiving live PTY output immediately, with a short replay of the last terminal viewport so you're not staring at a blank screen. Deeper history is pulled on demand by the IDE; the bare `relay attach` is intentionally minimal. Continue the conversation; type, hit enter, watch the agent respond.

That's scenario E. The same `relay attach` works from a `tmux` pane, a Cursor terminal, or another `relay attach` on a third machine — the multi-client capability is the headline feature.

## Phase status

**Phase 1 / MVP — desktop only.** This release ships the single-binary server, the CLI, and a VS Code-family extension over npm + Docker.

- **Phase 2** adds the mobile PWA (monitoring, prompting, approving — not editing).
- **Phase 3+** brings multi-CLI support (Codex, Gemini), IntelliJ, persona switching on a running session, Helm charts, structured observability, and token rotation.

See [`docs/prd/07-phasing.md`](docs/prd/07-phasing.md) for the full roadmap and [`docs/prd/08-acceptance.md`](docs/prd/08-acceptance.md) for the eight Phase 1 acceptance scenarios.

## Where to go next

- [`docs/guides/getting-started.md`](docs/guides/getting-started.md) — **the user handbook.** A–Z install → first session → cross-device attach → manage tokens/projects/sessions → troubleshooting.
- [`docs/prd.md`](docs/prd.md) — the spec. Start here for what Relay does and why.
- [`docs/deployment.md`](docs/deployment.md) — operator guide: local mode, Docker, Compose with Caddy + Tailscale, configuration, backups.
- [`docs/threat-model.md`](docs/threat-model.md) — security posture and the network-shape decision tree (localhost / Tailscale / Caddy + TLS / don't).
- [`docs/build-plan.md`](docs/build-plan.md) — the task tracker (Phase 1 complete; Phase 2 PWA in flight).
- [`docs/history/`](docs/history/) — sealed gate reports and kickoffs (Phase 0 report, acceptance walks).
