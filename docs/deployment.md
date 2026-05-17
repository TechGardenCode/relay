# Relay — Deployment Guide

> ⚠️ **Implementation status — Phase 1 in flight.** The `relay` binary and Docker image referenced below are not yet published. Track 6 (tasks 6A–6J) of [`build-plan.md`](build-plan.md) is the path to a runnable MVP; distribution itself is task **6J**. For what runs today, see [`spike/`](../spike/). This guide describes the eventual Phase 1 deployment surface so operator and packaging work can converge on the same shape.

**Scope.** Operator-facing: install, configure, persist, supervise, back up. The PRD-level deployment-shape narrative — npm vs Docker vs Compose vs Helm — lives in [`prd/06-distribution.md`](prd/06-distribution.md); this guide turns that into concrete commands.

---

## Local mode (Node.js 22+)

The lowest-overhead deployment: one Node process on the host, state under `~/.relay/`, no containers.

**Prerequisites**

- Node.js 22 or newer (`node --version`).
- An Anthropic API key in your shell environment.
- A process supervisor of your choice for the long-lived server (systemd, launchd, pm2, or just `tmux`).

**Install and first run**

```bash
export ANTHROPIC_API_KEY=sk-ant-…
npm install -g @relay/relay
relay init
```

`relay init` performs one-time setup:

- generates a bearer token (printed once on stdout; also written to `~/.relay/last-pairing.txt`),
- writes a default `~/.relay/config.yaml`,
- scaffolds the seven default personas under `~/.relay/personas/`.

The token is shown **exactly once** in plain text. Copy it into the IDE extension's first-run pairing prompt (or save it somewhere you trust). Tokens are valid until revoked (`relay token revoke <id>`); there is no automatic rotation at MVP.

**Run the server**

```bash
relay server                            # default config: ~/.relay/config.yaml
```

The server binds `0.0.0.0:7777` by default. Supervise it under whatever you already use:

- **systemd** (Linux): a unit file with `Environment=ANTHROPIC_API_KEY=…`, `ExecStart=/usr/bin/relay server`, `Restart=on-failure`.
- **launchd** (macOS): a `LaunchAgent` plist with `EnvironmentVariables` and `KeepAlive`.
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
| `~/.relay/personas/`                       | Tenant-level persona overrides (`<name>.yaml`)                             |

Project working directories are **not** under `~/.relay/`. They live wherever you put them and are registered in place via `relay project add <path>`; Relay stores only the canonical path.

---

## Docker

Same Node binary, packaged inside an Alpine base image and published to GHCR. The PRD-level packaging story is in [`prd/06-distribution.md`](prd/06-distribution.md); concrete image tag is finalized in build-plan task **6J**.

**Single-container `docker run`**

```bash
docker run -d --name relay \
  --restart unless-stopped \
  -p 7777:7777 \
  -e ANTHROPIC_API_KEY \
  -v "$HOME/.relay:/root/.relay" \
  -v "$HOME/code:/projects" \
  ghcr.io/<org>/relay:latest
```

What the flags do:

- `-p 7777:7777` — exposes the API + WebSocket port on the host. Adjust the host side to taste.
- `-e ANTHROPIC_API_KEY` — passes the key from the shell environment unmodified into the container, where Relay reads it and forwards it into each spawned agent. The key is never written to YAML or the SQLite file.
- `-v $HOME/.relay:/root/.relay` — Relay's owned state directory. **This is the volume to back up.**
- `-v $HOME/code:/projects` — operator convention for where source lives. Then register projects from inside the container (or via `relay project add /projects/my-app` from a host shell that's `docker exec`'d in). The `/projects/` path is convention only; you can mount source anywhere.

After the container is up, run `relay init` once inside it to get the bearer token:

```bash
docker exec -it relay relay init
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
    environment:
      - ANTHROPIC_API_KEY
    volumes:
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
ANTHROPIC_API_KEY=sk-ant-…
TS_AUTHKEY=tskey-auth-…
```

**Bring it up**

```bash
docker compose up -d
docker compose exec relay relay init       # one-time pairing
```

The bearer token from `relay init` plus the tailnet URL `https://relay.<your-tailnet>.ts.net` are what go into the IDE extension's first-run pairing flow on each device.

---

## Configuration

Twelve-factor: declarative config in `~/.relay/config.yaml`, environment variables override at process start. Container deployments typically configure entirely via env so the image is immutable.

**Agent credentials** are environment-only. Set `ANTHROPIC_API_KEY` (and any other provider variables the wrapped CLI consumes — e.g., `ANTHROPIC_BASE_URL` if you proxy) in the process that launches `relay server`. Relay reads them at agent-spawn time and passes them unchanged to each spawned `node-pty` process. They are never written to persona YAML, project metadata, or the SQLite file. All sessions on one server share one credential set; operators needing isolation run separate Relay servers.

Other notable config keys (full surface lives in `prd/03-server.md`):

- `replayBufferBytes` — the on-attach replay size (default 32 KB, see `prd/03-server.md` §5.2).
- `port` / `host` — server bind. Defaults `0.0.0.0:7777`.

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
