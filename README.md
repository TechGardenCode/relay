# Relay

> **Portable, persistent AI coding sessions across devices.**

> 👉 **New to Relay? Start with the [Getting Started handbook](docs/guides/getting-started.md)** — an A–Z walkthrough from install through your first cross-device session.

> ⚠️ **Implementation status — Phase 1 in flight.** The `relay` binary is not yet published. Track 6 (tasks 6A–6J) of [`docs/build-plan.md`](docs/build-plan.md) is the path to a runnable MVP. To exercise the cross-device attach architecture today, see [`spike/`](spike/) — the Phase 0 proof-of-concept that runs the wire protocol end-to-end. The "Quick install" snippet below describes the eventual Phase 1 UX; the [handbook](docs/guides/getting-started.md) covers the source-install path that works today.

---

## What Relay is

Relay is a lightweight orchestration service that makes AI-assisted coding sessions portable, persistent, and structured. The server owns long-running CLI agent sessions (Claude Code at MVP) and exposes them to whatever client is convenient — IDE extension on the desktop, plain `relay attach` from an SSH terminal, mobile PWA later.

A structured **persona × project** model sits on top of the agent's own configuration: switch from `architect` to `dev` to `review` without hand-editing `CLAUDE.md`, `.mcp.json`, or skill folders.

Relay is **not** an editor, **not** an agent, and **not** a mobile coding tool — it's the glue between the editor you already use and the agent you already trust.

## Quick install

**npm (primary):**

```bash
claude auth login                       # skip if already logged in on this host
npm install -g @relay/relay
relay init                              # one-time: token + ~/.relay/ scaffold
relay server                            # foreground; supervise under systemd/launchd/pm2
```

Requires Node.js 22+. `claude login` writes OAuth state to the macOS Keychain or `~/.claude/.credentials.json` on Linux; Relay's spawned agents inherit it via process credentials and `$HOME`. For headless deployments (CI, immutable containers), `ANTHROPIC_API_KEY` is the documented fallback — see [`docs/deployment.md`](docs/deployment.md) → Headless deployments.

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
   npm install -g @relay/relay
   relay init
   ```

   `relay init` generates a bearer token (printed once on stdout, also written to `~/.relay/last-pairing.txt`), writes a default `~/.relay/config.yaml`, and scaffolds the seven default personas under `~/.relay/personas/`.

2. **Start the server** in a supervised process or a separate terminal:

   ```bash
   relay server                          # binds 0.0.0.0:7777 by default
   ```

3. **Register a project.**

   ```bash
   relay project add ~/code/my-app
   ```

   The path is registered in place — no copy, no symlink. A `.relay/project.json` marker lands at the project root and is added to that project's `.gitignore`.

4. **Start a session.** Install the Relay VS Code / Cursor extension (`.vsix` from GitHub Releases), paste the pairing snippet from `~/.relay/last-pairing.txt`, open `~/code/my-app`, and run the extension's "Start Relay session" command — pick the `dev` persona (or any from `relay persona list`). The session ID surfaces in the IDE status bar; also visible via:

   ```bash
   relay session list                    # shows id, project, persona, status
   ```

5. **Close machine A entirely.** Quit the IDE, walk away from the laptop. The session keeps running on the server.

**On machine B** (any other machine that can reach the server — same LAN, same Tailscale tailnet, or through your TLS reverse proxy):

6. **Attach from a plain SSH terminal:**
   ```bash
   npm install -g @relay/relay           # or use the IDE extension on B instead
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
- [`docs/build-plan.md`](docs/build-plan.md) — in-flight task tracker for Phase 1.
- [`spike/`](spike/) — Phase 0 proof-of-concept (what runs today).
