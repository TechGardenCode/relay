# Relay — Deployment Guide

> ⚠️ **Implementation status — Phase 1 complete, npm distribution implemented pending first publish; Docker/Compose not yet published.** The npm slice of distribution is implemented per [D-19](decisions/D-19-npm-distribution-posture.md) — CI publishes `@techgardencode/relay` + `@techgardencode/protocol` on a pushed `v*` tag — but the package is not on the registry yet; that happens when the maintainer pushes the release tag. The Docker image and Compose stack referenced below remain unpublished — the rest of task **6J** (Docker/Compose/Helm, extension marketplace) stays deferred to Track 8 per [D-16](decisions/D-16-phase-1-ships-without-distribution.md). For what runs today, see the source-install path in [`guides/getting-started.md`](guides/getting-started.md). This guide describes the eventual deployment surface so operator and packaging work can converge on the same shape.

**Scope.** Operator-facing: install, configure, persist, supervise, back up. The PRD-level deployment-shape narrative — npm vs Docker vs Compose vs Helm — lives in [`prd/06-distribution.md`](prd/06-distribution.md); this guide turns that into concrete commands.

---

## Local mode (Node.js 22+)

The lowest-overhead deployment: one Node process on the host, state under `~/.relay/`, no containers.

**Prerequisites**

- Node.js 22 or newer (`node --version`).
- A Claude Code login (`claude login`) completed on the host that will launch `relay server`. The resulting OAuth state lives in the macOS Keychain or at `~/.claude/.credentials.json` on Linux and is inherited transparently by every spawned agent. For headless deployments without an interactive shell, `ANTHROPIC_API_KEY` is the documented alternative — see [Headless deployments](#headless-deployments) below.
- A process supervisor of your choice for the long-lived server (systemd, launchd, pm2, or just `tmux`).

**Install and first run**

```bash
claude auth login                       # skip if already logged in on this host
npm install -g @techgardencode/relay
relay init
```

On managed Linux hosts where the operator account doesn't have root, `npm install -g` fails on `/usr/lib/node_modules` (EACCES). Either run the install with `sudo` or set a user-local prefix once before installing — `mkdir -p ~/.local/npm && npm config set prefix ~/.local/npm && export PATH="$HOME/.local/npm/bin:$PATH"` (persist the PATH addition in `~/.bashrc`). The same caveat applies to `@anthropic-ai/claude-code` if it isn't already installed on the host.

**Platform install notes** (per [D-19](decisions/D-19-npm-distribution-posture.md) / [ND-45](decisions/ND-45-node-pty-linux-prebuild-resolution.md)):

- **Linux glibc (x64/arm64)** — zero-toolchain install. `node-pty` and `better-sqlite3` both ship prebuilt native addons for these targets, so `npm install -g` needs no compiler.
- **Alpine/musl, or other architectures** — no prebuild is published for these targets, so `npm install` compiles the native addons from source. Install `build-essential` (or your distro's C/C++ toolchain equivalent) and `python3` first, or the install will fail with a node-gyp error.
- **Windows** — experimental / best-effort. CI builds it (non-blocking) but it isn't part of the release gate; expect rough edges.
- **Upgrade and verify** (any supported platform): `npm i -g @techgardencode/relay@latest && relay doctor` — reinstalls the latest published version and runs the full diagnostic set, including the `native-deps` load probe.

`relay init` performs one-time setup:

- generates a bearer token (printed once on stdout; also written to `~/.relay/last-pairing.txt`),
- writes a default `~/.relay/config.yaml`,
- (Phase 2, per [D-17](decisions/D-17-personas-descoped-from-mvp.md)) scaffolds the seven default personas under `~/.relay/personas/` — at MVP no personas are seeded.

The token is shown **exactly once** in plain text. Copy it into the IDE extension's first-run pairing prompt (or save it somewhere you trust). Tokens are valid until revoked (`relay token revoke <id>`); there is no automatic rotation at MVP.

**Run the server**

```bash
relay server                            # default config: ~/.relay/config.yaml
```

The server binds `127.0.0.1:7777` by default (loopback-only — set `host: 0.0.0.0` in `~/.relay/config.yaml` when fronting via a reverse proxy or binding inside a container). Supervise it under whatever you already use:

- **systemd** (Linux): a unit file with `User=<operator>` so the unit inherits the operator's UID and `$HOME` (which carries `~/.claude/.credentials.json` from `claude login`), plus `ExecStart=/usr/bin/relay server`, `Restart=on-failure`. For unattended headless deployments where no operator account has run `claude login`, drop `User=` and set `Environment=ANTHROPIC_API_KEY=…` instead — see [Headless deployments](#headless-deployments).
- **launchd** (macOS): a `LaunchAgent` plist with `KeepAlive`. The agent runs as your user, so the macOS Keychain entry from `claude login` is reachable transparently. (The `EnvironmentVariables` block is only needed for the headless fallback.)
- **pm2**: `pm2 start relay -- server --config ~/.relay/config.yaml`.

**State layout**

Everything Relay owns lives under `~/.relay/`:

| Path                                       | Contents                                                                   |
| ------------------------------------------ | -------------------------------------------------------------------------- |
| `~/.relay/config.yaml`                     | Declarative config (twelve-factor; env vars override)                      |
| `~/.relay/state.db`                        | SQLite — tenants, projects, sessions (schema in `arch/sqlite-schema.md`)   |
| `~/.relay/transcripts/<session-id>.bin`    | Append-only PTY capture per session (offsets are byte counts from `0`)     |
| `~/.relay/tokens.json`                     | Bearer tokens, hashed at rest                                              |
| `~/.relay/last-pairing.txt`                | Most-recent `relay init` / `relay token create` pairing snippet            |
| `~/.relay/personas/`                       | Tenant-level persona overrides (`<name>.yaml`) — Phase 2, per D-17; absent at MVP |

Project working directories are **not** under `~/.relay/`. They live wherever you put them and are registered in place via `relay project add <path>`; Relay stores only the canonical path.

---

## Docker

Same Node binary, packaged inside an Alpine base image and published to GHCR. The PRD-level packaging story is in [`prd/06-distribution.md`](prd/06-distribution.md); concrete image tag is finalized in build-plan task **6J**.

**Single-container `docker run`**

```bash
docker run -d --name relay \
  --restart unless-stopped \
  -p 7777:7777 \
  -v relay_claude:/root/.claude \
  -v "$HOME/.relay:/root/.relay" \
  -v "$HOME/code:/projects" \
  ghcr.io/<org>/relay:latest
```

What the flags do:

- `-p 7777:7777` — exposes the API + WebSocket port on the host. Adjust the host side to taste.
- `-v relay_claude:/root/.claude` — a Docker **named volume** that holds the container's Claude Code OAuth state. After the container is up, run `docker exec -it relay claude auth login` once; the device-flow URL prints to your terminal and the resulting credentials persist inside the named volume across restarts. This is platform-uniform (works the same on macOS and Linux Docker hosts), unlike a `$HOME/.claude` bind-mount which is broken on macOS because the operator's credentials live in the host Keychain rather than a file. Validated on macOS Docker host 2026-05-18 (Docker 29.4.1); Linux Docker host validation outstanding.
- `-v $HOME/.relay:/root/.relay` — Relay's owned state directory. **This is the volume to back up.**
- `-v $HOME/code:/projects` — operator convention for where source lives. Then register projects from inside the container (or via `relay project add /projects/my-app` from a host shell that's `docker exec`'d in). The `/projects/` path is convention only; you can mount source anywhere.

For headless deployments (CI, immutable images, no interactive `claude login` step), swap the `-v relay_claude:/root/.claude` flag for `-e ANTHROPIC_API_KEY` instead — see [Headless deployments](#headless-deployments). Note that if both are present, Claude Code prefers the env var and silently bills against your API key rather than any Claude.ai subscription bound to the OAuth state.

After the container is up, run two one-time setup commands:

```bash
docker exec -it relay claude auth login    # log in to Claude (skip if using ANTHROPIC_API_KEY)
docker exec -it relay relay init           # mint the bearer token
```

---

## Docker Compose with Caddy + Tailscale sidecar

The recommended cross-device posture for homelab use. Tailscale provides identity-based admission and transport encryption across your devices; Caddy fronts Relay on a tailnet hostname so clients connect via `https://relay.<tailnet>.ts.net` rather than juggling raw ports. See [`threat-model.md`](threat-model.md) §6 for **when** this shape is appropriate (vs. localhost-only or public Caddy+TLS).

**`docker-compose.yml`**

```yaml
services:
  relay:
    image: ghcr.io/<org>/relay:latest
    container_name: relay
    restart: unless-stopped
    volumes:
      - relay_claude:/root/.claude
      - ${HOME}/.relay:/root/.relay
      - ${HOME}/code:/projects
    expose:
      - "7777"
    networks:
      - relay-net

  tailscale:
    image: tailscale/tailscale:latest
    container_name: relay-tailscale
    restart: unless-stopped
    hostname: relay                       # becomes relay.<tailnet>.ts.net
    environment:
      - TS_AUTHKEY=${TS_AUTHKEY:?set TS_AUTHKEY in .env}
      - TS_STATE_DIR=/var/lib/tailscale
      - TS_EXTRA_ARGS=--ssh
    volumes:
      - tailscale_state:/var/lib/tailscale
      - /dev/net/tun:/dev/net/tun
    cap_add:
      - NET_ADMIN
      - SYS_MODULE
    networks:
      - relay-net

  caddy:
    image: caddy:2
    container_name: relay-caddy
    restart: unless-stopped
    network_mode: "service:tailscale"     # share the tailscale container's net ns
    depends_on:
      - tailscale
      - relay
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config

volumes:
  relay_claude:
  tailscale_state:
  caddy_data:
  caddy_config:

networks:
  relay-net:
```

**`Caddyfile`** (sibling to `docker-compose.yml`):

```caddy
relay.<your-tailnet>.ts.net {
    reverse_proxy relay:7777
}
```

Replace `<your-tailnet>` with your Tailscale tailnet name (e.g., `tail1234`). Caddy will obtain a Let's Encrypt cert automatically because Tailscale issues a real DNS name on the public ACME-resolvable `ts.net` zone.

**`.env`** (sibling, **gitignored**):

```bash
# ANTHROPIC_API_KEY is no longer required by default — `claude auth login`
# inside the container (via `docker compose exec relay claude auth login`)
# populates the relay_claude named volume. Uncomment the line below only
# for headless deployments. See "Headless deployments" below.
# ANTHROPIC_API_KEY=sk-ant-…
TS_AUTHKEY=tskey-auth-…
```

**Bring it up**

```bash
docker compose up -d
docker compose exec relay claude auth login   # one-time Claude auth (skip if headless)
docker compose exec relay relay init       # one-time pairing
```

The bearer token from `relay init` plus the tailnet URL `https://relay.<your-tailnet>.ts.net` are what go into the IDE extension's first-run pairing flow on each device.

---

## Configuration

Twelve-factor: declarative config in `~/.relay/config.yaml`, environment variables override at process start. Container deployments typically configure entirely via env so the image is immutable.

**Agent credentials** are inherited from the operator. The documented default is `claude auth login` on the host (or `docker exec -it relay claude auth login` inside the container for Docker deployments). Relay's spawn inherits the operator's `$HOME` and process credentials, so the spawned agent reads the OAuth state — macOS Keychain or `~/.claude/.credentials.json` on Linux — transparently. `ANTHROPIC_API_KEY` is the documented fallback for headless deployments (see below). Neither is ever written to persona YAML, project metadata, or the SQLite file. All sessions on one server share one credential set; operators needing isolation run separate Relay servers.

Other notable config keys (full surface lives in `prd/03-server.md`):

- `replayBufferBytes` — the on-attach replay size (default 32 KB, see `prd/03-server.md` §5.2).
- `port` / `host` — server bind. Defaults `127.0.0.1:7777` (loopback-only). Container and reverse-proxy operators set `host: 0.0.0.0` in `~/.relay/config.yaml` so the server binds all interfaces inside its namespace.

### Headless deployments

For environments without an interactive shell — CI runners, immutable container images, unattended systemd units running as a service account that hasn't `claude login`-ed — use `ANTHROPIC_API_KEY` instead of OAuth.

- **Local mode (systemd unit):** drop `User=<operator>` and add `Environment=ANTHROPIC_API_KEY=sk-ant-…` to the unit file.
- **Docker run:** replace `-v relay_claude:/root/.claude` with `-e ANTHROPIC_API_KEY` on the `docker run` line.
- **Docker Compose:** drop the `relay_claude` named volume from `services.relay.volumes`; add `environment: [ANTHROPIC_API_KEY]` back to the service; uncomment `ANTHROPIC_API_KEY=…` in `.env`.

The API key is read at agent-spawn time from Relay's process environment and passed unchanged to each spawned `node-pty` process (per [D-10](decisions/D-10-agent-model-credentials-handling.md)). It is never written to YAML, project metadata, or the SQLite file.

**Precedence footgun.** If both `ANTHROPIC_API_KEY` and `claude login` OAuth state are reachable, Claude Code prefers the env var (upstream resolver behavior). An operator who runs `claude login` and *also* exports the env var will silently bill against the pay-per-token API key instead of any active Claude.ai subscription bound to the OAuth state. Pick one path per deployment. (Per [ND-19](decisions/ND-19-claude-login-oauth-as-the-documented-credential-default-anthropic-api-key-as-fallback.md).)

*Agent credentials default surface resolved by [ND-19](decisions/ND-19-claude-login-oauth-as-the-documented-credential-default-anthropic-api-key-as-fallback.md) on 2026-05-18.*

---

## Backup posture

Two directories cover all Relay-owned state worth backing up:

- **`~/.relay/`** — config, SQLite DB, transcripts, hashed tokens, persona overrides.
- **`~/.claude/`** — the wrapped agent's native state (Claude Code's project conversations, settings, MCP config). Relay does not own this directory but session behavior depends on it.

Project working directories are registered **in place**; Relay does not copy or shadow them. Back them up with whatever git or filesystem tooling you already use — Relay is not in that loop. Specifically, do not back up project directories through `~/.relay/`; the SQLite row only stores the canonical path, not the source.

A nightly `tar -czf` (or `restic`, `borg`, snapshot of the parent volume) of `~/.relay/` and `~/.claude/` is sufficient to restore Relay's session metadata and the agent's conversation history. Restoring is symmetric: stop the server, replace the directories, start the server. Any sessions that were `running` at backup time will appear as `killed` with `terminated_reason = "server_restart"` after the restart (this is the same behavior as any other unclean shutdown; see `prd/08-acceptance.md` scenario A bullet 4).

---

## Trust model

Bearer-token auth over a network you trust is the entire Phase 1 security posture. TLS, identity-based admission, and public-internet hardening are the operator's responsibility — Relay does not terminate TLS itself and does not implement rate limiting at MVP.

[`threat-model.md`](threat-model.md) is the authoritative orientation doc; the short version of §6 is a decision tree for network shape:

- **Localhost only** (everything on one machine) — bearer auth, no tunnel needed.
- **Trusted private network** (homelab, tailnet) — Tailscale or equivalent; the Compose stack above is built for this case.
- **Reachable from the public internet** — Caddy + Let's Encrypt in front of Relay; pair with strict revocation discipline since token rotation is deferred to Phase 3.
- **Otherwise — walk back.** Public exposure with no tunnel and no TLS puts the bearer token in the clear on every request; whoever captures one request can spend the Anthropic credit behind the server.

Read [`threat-model.md`](threat-model.md) before standing up anything more exposed than localhost.
