---
name: relay-deploy
description: Push a locally built Relay server to the dev VM (techgardencode@10.0.60.221) and run it as a persistent user service — build on the laptop, rsync the tree, rebuild native deps on the VM, (re)start via systemd --user, health-check over the LAN/Tailscale. The non-public "upgrade the server" path so the PWA has a real always-on host to point at. Trigger phrases — "deploy relay to the VM", "push the server to the VM", "upgrade the VM server", "redeploy relay".
---

# Relay relay-deploy skill

This is the **inverse of [`vm-e2e`](../vm-e2e/SKILL.md)**. `vm-e2e` runs the *server on the laptop*
and a *client on the VM*, ephemerally, with mandatory teardown. `relay-deploy` runs the **server on
the VM, persistently** — so the PWA (and any `relay attach`) has a real always-on host to point at,
upgraded from locally built source **without publishing the package publicly**.

Because the server runs on the VM, two things `vm-e2e` deliberately avoided are now load-bearing:

1. **Native modules must be rebuilt for Linux on the VM.** `node-pty` and `better-sqlite3` ship
   `.node` binaries; the laptop's are `darwin-arm64` and won't run on the VM. So the deploy ships the
   portable `dist/*.js` but runs `pnpm install` **with** install scripts on the VM (needs
   `build-essential` + `python3`). `vm-e2e` used `--ignore-scripts` precisely because its VM was a
   pure client; here we do the opposite.
2. **`claude` must be installed and authenticated on the VM** — the server spawns it for every
   session. The skill checks for it and surfaces the gap; it does **not** install or log in for you.

## Status & posture

The VM is a **throwaway / unhardened regression host until the PWA MVP lands** (per the design plan
`~/.claude/plans/we-ve-done-quite-a-keen-corbato.md` §9 and [[d-18-pwa-terminal-substrate-and-mvp-scope]]).
No TLS, no reverse proxy, no firewalling here — bind `0.0.0.0` on a trusted LAN/tailnet and rely on
Tailscale for admission (see [`docs/threat-model.md`](../../../docs/threat-model.md) §6). When the
VM graduates to a real host, fold in the Caddy + Tailscale posture from
[`docs/deployment.md`](../../../docs/deployment.md) and file the hardening as its own task.

## Topology

| Role            | Host                          | User             | Path                                  |
| --------------- | ----------------------------- | ---------------- | ------------------------------------- |
| Build           | this laptop (Darwin)          | `kianalikhani`   | repo root (auto-detected via git)     |
| Server (target) | Ubuntu VM (`10.0.60.221`)     | `techgardencode` | **code** `~/relay-server/` · **data** `~/.relay/` |

**Code vs. data, kept separate.** The deploy rsyncs the source tree into `~/relay-server/` and
**never touches `~/.relay/`** — your tokens, SQLite db, sessions, transcripts, and `scratch/` survive
every upgrade. Only the code dir is `--delete`'d.

## Two scripts

All live under [`scripts/`](scripts/). Configure the target with env vars; defaults match the table.

| Script | When | What it does |
| --- | --- | --- |
| [`bootstrap-vm.sh`](scripts/bootstrap-vm.sh) | **once**, first time | Preflight (ssh, node ≥22, pnpm, build tools, `claude`), first rsync + `pnpm install`, `relay init` on the VM (mints token, writes `~/.relay/config.yaml`), sets `host: 0.0.0.0`, installs the `systemd --user` unit + enables linger, starts the service, prints the pairing snippet + `/app` URL. |
| [`deploy.sh`](scripts/deploy.sh) | **every upgrade** | Local build of the server + its deps (`pnpm --filter '@relay/relay...' build` — skips extension/spike, fail fast on compile error) → stop service → rsync code (excl. `node_modules`/tests/`.git`) → `pnpm install` (rebuild native) → restart → health-check. Idempotent. `--dry-run` prints the plan and contacts nothing. |

Configurable env (defaults shown):

```sh
RELAY_VM_HOST=techgardencode@10.0.60.221   # ssh target
RELAY_VM_CODE_DIR=relay-server             # code dir under the VM user's $HOME
RELAY_PORT=7777                            # server bind port
RELAY_LOCAL_REPO=$(git rev-parse --show-toplevel)   # auto-detected
```

## Usage

```sh
# First time on a fresh VM (or after wiping ~/relay-server):
.claude/skills/relay-deploy/scripts/bootstrap-vm.sh

# Every subsequent upgrade after you've built/changed the server locally:
.claude/skills/relay-deploy/scripts/deploy.sh

# See exactly what a deploy would do, touching nothing:
.claude/skills/relay-deploy/scripts/deploy.sh --dry-run
```

## Preflight (bootstrap runs this; deploy assumes it passed)

```sh
ssh -o ConnectTimeout=5 -o BatchMode=yes "$RELAY_VM_HOST" -- 'echo ok'   # passwordless ssh
ssh "$RELAY_VM_HOST" -- 'node --version'                                  # v22+
ssh "$RELAY_VM_HOST" -- 'command -v pnpm || corepack --version'           # pnpm (or corepack to enable it)
ssh "$RELAY_VM_HOST" -- 'command -v cc && command -v make && command -v python3'  # build-essential + python
ssh "$RELAY_VM_HOST" -- 'command -v claude && claude --version'           # agent CLI present
```

`build-essential`/`python3` missing → the native rebuild fails. The skill **warns and stops**; it
does not `sudo apt install` for you (`sudo apt-get install -y build-essential python3`). `claude`
missing or not logged in → the server boots but every spawned session exits immediately; surface it,
don't paper over it (credentials are the operator's per [`ND-19`](../../../docs/decisions/ND-19-claude-login-oauth-as-the-documented-credential-default-anthropic-api-key-as-fallback.md);
on Linux `claude login` writes `~/.claude/.credentials.json`).

## The service

A `systemd --user` unit ([`scripts/relay-server.service`](scripts/relay-server.service), templated
with the real node path + code dir at bootstrap) running `node …/dist/cli/relay.js server` as the VM
user, so it inherits `$HOME` → `~/.relay/config.yaml` + `~/.claude/.credentials.json`.
`loginctl enable-linger` lets it run without an active SSH session and survive reboots.

```sh
systemctl --user status  relay-server      # is it up?
journalctl --user -u relay-server -f        # tail logs
systemctl --user restart relay-server       # manual bounce
```

**Fallback if `systemd --user` / linger is unavailable** (e.g. `enable-linger` needs root and you
don't have it): run `nohup node ~/relay-server/packages/server/dist/cli/relay.js server >
~/relay-server.log 2>&1 &` inside a `tmux` session. Documented in `bootstrap-vm.sh`; the systemd path
is preferred (restart-on-crash + reboot survival).

## Health check (what `deploy.sh` asserts after restart)

```sh
ssh "$RELAY_VM_HOST" -- 'systemctl --user is-active relay-server'         # active
ssh "$RELAY_VM_HOST" -- "ss -ltn | grep -q ':$RELAY_PORT' && echo LISTENING"
```

Reaching it from the phone: `http://10.0.60.221:$RELAY_PORT/app` (or the VM's Tailscale IP). `/app/*`
is served unauthenticated (the PWA bootstraps its own bearer pairing); the WS + REST data plane stay
bearer-gated. Until the PWA is built into `packages/*/dist/browser`, `/app` may 404 — a 404 from a
listening port still proves the server is up.

## Safety / conventions

- **Never `--delete` outside `~/relay-server/`.** `~/.relay/` (tokens, db, sessions, scratch) is
  sacred — it is never an rsync target and never wiped. The deploy is code-only.
- **Build locally first.** `deploy.sh` runs `pnpm build` before touching the VM, so a compile error
  never reaches the host. `--dry-run` contacts nothing.
- **One credential path** (per ND-19): `claude login` on the VM (default) **or** `ANTHROPIC_API_KEY`
  in the unit — never both (the env var silently wins and bills pay-per-token).
- **Doubles as a regression surface.** After a deploy you can point `relay attach` (or `vm-e2e`-style
  checks) at the live VM server — a real-LAN smoke test of whatever you just shipped.
- **Don't flip to publishing.** The whole point is upgrading from local source without `npm publish`.
  When public distribution is wanted, that's build-plan `6J` / Track 8, not this skill.
