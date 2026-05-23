# Getting started with Relay

> **Audience.** A developer setting up Relay for the first time, or someone returning after a break who wants a refresher. Read top-to-bottom on first install; jump to a chapter by name afterward.
>
> **What you'll have at the end.** A running Relay server on your primary machine, the VS Code / Cursor extension paired to it, a running agent session you can drive from the editor terminal, and a working `relay attach` from a second device on the same LAN.

## Status (read this first)

Relay is in **Phase 1** and ships from source today. The `relay` binary and the IDE extension `.vsix` are not yet published — `npm install -g @relay/relay` and a Marketplace install do not work yet. Distribution is deferred to post-2.0 per [[d-16-phase-1-ships-without-distribution]].

This guide describes the path that works **today**: clone the repo, `pnpm install`, `pnpm build`, link the binary, install the extension from the locally-built `.vsix`. When distribution lands, Chapters 1 and 2 will be rewritten — track [ND-32](../decisions/ND-32-install-and-onboarding-deep-dive.md) for the design.

Several known sharp edges in the current UX are documented in [Chapter 7 — Troubleshooting](#chapter-7--troubleshooting) with citations to the ND-NN that tracks each fix.

---

## Table of contents

1. [Install](#chapter-1--install)
2. [First connect](#chapter-2--first-connect)
3. [Author your first persona](#chapter-3--author-your-first-persona)
4. [Start a session in VS Code](#chapter-4--start-a-session-in-vs-code)
5. [Attach from another device](#chapter-5--attach-from-another-device)
6. [Manage tokens, projects, and sessions](#chapter-6--manage-tokens-projects-and-sessions)
7. [Troubleshooting](#chapter-7--troubleshooting)
8. [Where to go next](#chapter-8--where-to-go-next)

---

## Chapter 1 — Install

### Prerequisites

| What | Why | Check |
| -- | -- | -- |
| **Node.js 22+** | Relay uses native Node 22 features (`fetch`, ULID generation, the new test runner is not used but `vitest` needs ≥22). | `node --version` |
| **pnpm 10+** | Monorepo manager. Workspace links between `@relay/relay`, `@relay/protocol`, `@relay/extension` rely on pnpm. | `pnpm --version` |
| **Git** | Source install only path today. | `git --version` |
| **Claude Code logged in** (`claude auth login`) | Relay's spawned agents inherit Claude Code OAuth state from your shell; without it the agent boots but cannot reach the model. On macOS the OAuth state lives in the Keychain; on Linux it lives in `~/.claude/.credentials.json`. | `claude -p "say hi"` should return a model reply |
| **A C toolchain** (for `node-pty` + `better-sqlite3` native builds) | Two native deps compile on install. On macOS, Xcode Command Line Tools (`xcode-select --install`). On Ubuntu/Debian, `sudo apt install build-essential python3`. | `cc --version` |

### Clone and build

```bash
git clone <your-relay-fork> ~/code/relay
cd ~/code/relay
pnpm install                              # installs all workspace deps; compiles node-pty + better-sqlite3
pnpm build                                # tsc -b across all packages
```

If `pnpm install` fails with a native-build error, see [Chapter 7 → "node-pty install fails"](#node-pty-install-fails).

### Link the `relay` binary into your PATH

`@relay/relay` is `private: true` (not on npm), so you link it manually:

```bash
pnpm -F @relay/relay link --global        # symlinks `relay` → packages/server/dist/cli/relay.js
relay --help                              # sanity check
```

If `pnpm link` is unfamiliar, the alternative is to add an alias to your shell rc:

```bash
alias relay='node ~/code/relay/packages/server/dist/cli/relay.js'
```

Either way, `relay` should now run from any directory.

### Build the extension `.vsix`

```bash
pnpm -F relay-extension vsix              # packages relay-extension-0.0.0.vsix in packages/extension/
```

You'll install the `.vsix` into VS Code in [Chapter 2](#chapter-2--first-connect).

---

## Chapter 2 — First connect

### Initialize Relay state

```bash
relay init
```

This is a one-time bootstrap. It:

1. Creates `~/.relay/` with `config.yaml` (default `host=127.0.0.1`, `port=7777`, `claimLockTimeoutSeconds=30`).
2. Generates a bearer token (Crockford-Base32, 26 characters, ≥128 bits of entropy, hashed at rest per [D-13](../decisions/D-13-first-run-pairing-ux.md) and [ND-09](../decisions/ND-09-bearer-token-hashing-algorithm.md)).
3. Prints a pairing snippet on stdout — a `relay://pair?url=…&token=…` deep link plus the raw URL + token — and writes the same snippet to `~/.relay/last-pairing.txt`.
4. Scaffolds the seven default personas into `~/.relay/personas/` (`architect`, `dev`, `design`, `infra`, `product`, `review`, `test`).

**Keep `~/.relay/last-pairing.txt` handy** — you'll paste from it in a moment. If you lose it, generate a fresh token with `relay token create --device <name>`.

### Start the server

In a long-lived terminal (or under `launchd` / `systemd` / `pm2` for a real install):

```bash
relay server
```

The server binds `127.0.0.1:7777` by default. To accept connections from other devices on your LAN, edit `~/.relay/config.yaml` and set `host: 0.0.0.0`, then restart `relay server`. See [`docs/deployment.md`](../deployment.md) for production hardening (Caddy + TLS, Tailscale-only binding, the network-shape decision tree from the threat model).

Leave this terminal running.

### Install the extension into VS Code

In a separate terminal:

```bash
code --install-extension ~/code/relay/packages/extension/relay-extension-0.0.0.vsix
```

The same command works for Cursor (`cursor --install-extension …`) and VSCodium (`codium --install-extension …`).

Reload your editor.

### Pair the extension with the server

1. Open the command palette (⌘⇧P / Ctrl⇧P).
2. Run **"Relay: Connect to server"**.
3. Either:
   - Paste the full `relay://pair?url=…&token=…` deep link from `~/.relay/last-pairing.txt` into the quick-pick, **or**
   - Type the server URL (`http://127.0.0.1:7777`) and paste the token when prompted.

The token is stored in VS Code's SecretStorage, not in plaintext on disk. The status bar should now show a Relay indicator (project name will be empty until you register a workspace in Chapter 4).

> **Note — single server per install today.** The current extension keys SecretStorage by a fixed `relay.serverUrl` + `relay.token` pair; pairing a second server overwrites the first. Multi-server support is tracked by [ND-31](../decisions/ND-31-secretstorage-key-namespace-for-multi-server-ide-pairing.md) and lands with Track 7 ND-33.

---

## Chapter 3 — Author your first persona

A **persona** is a YAML file that tells Relay how to compose the agent's system prompt and (optionally) which model, skills, and MCP servers to apply when a session starts. Personas are the answer to "switch from architect to dev to review without hand-editing `CLAUDE.md` / `.mcp.json` / skill folders."

### The defaults you already have

`relay init` scaffolded seven defaults at `~/.relay/personas/`. List them:

```bash
relay persona list
```

Each YAML carries a `schemaVersion`, a kebab-case `name` that must match the filename stem, a one-line `description`, and a multi-paragraph `systemPrompt`. The full schema lives in [`docs/prd/09-persona-schema.md`](../prd/09-persona-schema.md).

Open one to see the shape — e.g. `~/.relay/personas/dev.yaml`. The defaults intentionally omit `skills`, `mcpServers`, and `model` so they degrade to "all your agent's native capabilities plus a behavior overlay."

### Create your own

```bash
relay persona create my-debugger
```

This opens `$EDITOR` on a fresh `~/.relay/personas/my-debugger.yaml` pre-filled with the required fields. Edit the `systemPrompt` to taste, save, and Relay will pick it up on the next `relay persona list`.

If you ship a typo (wrong `name`, mismatched filename, unknown top-level key, etc.) the loader will refuse it and surface the reason via the `persona-yaml-check` skill. Run a manual lint with:

```bash
# From the repo root with the skill available in your Claude Code session:
# Invoke the persona-yaml-check skill on the file path.
```

Or just call the schema doc directly: [`docs/prd/09-persona-schema.md`](../prd/09-persona-schema.md) §1–§4.

### Tenant vs project personas

By default personas live in `~/.relay/personas/` and apply to every session ("tenant scope"). You can override a persona for a single project by placing a same-named file under `<project>/.relay/personas/`. Project-scope persona **fully replaces** the tenant version — there is no field-level merge. See [D-09 §3](../prd/09-persona-schema.md) for the composition rule.

---

## Chapter 4 — Start a session in VS Code

### Register your project

1. Open the project in VS Code: `code ~/code/my-app`.
2. Command palette → **"Relay: Register this workspace as a project"**.

This calls the server's `POST /projects`, which canonicalizes the path, derives a kebab slug from the basename, writes a `.relay/project.json` marker at the project root (per [ND-07](../decisions/ND-07-marker-file-schema.md)), and idempotently appends `.relay/project.json` to your project's `.gitignore`.

The marker is how the extension knows which Relay project a workspace belongs to — it's the same mechanism `relay project add` uses from the CLI.

### Start a session

1. Command palette → **"Relay: Start session in current project"**.
2. Pick a persona from the quick-pick (defaults from Chapter 3, or your own).

The extension:

1. Calls `POST /sessions` with the project ID and persona name; the server spawns `claude` with the persona's composed system prompt, the filtered MCP config, the persona's model selection, etc. (per [`docs/arch/persona-application.md`](../arch/persona-application.md) §4.1).
2. Opens a new VS Code terminal panel running `relay attach <sid>`. This is the **subprocess-of-attach** pattern: the extension never opens a WebSocket; the bundled `relay attach` owns the client-side state machine. See [`docs/arch/client-agnosticism.md`](../arch/client-agnosticism.md) §4.3.
3. The status bar now shows the project + persona for the focused root.

You're now in a normal terminal pane talking to the agent. Type, hit enter, watch it respond. The session persists on the server independent of the terminal pane — close the pane and the agent keeps running.

### What the status bar tells you

The status-bar indicator follows focus across workspace roots. The current scope is intentionally minimal; richer status (BUSY anchoring, multi-session indicator, queue depth) lands with Track 7 ND-33 — see [ND-33](../decisions/ND-33-ide-gui-overhaul-deep-dive.md).

### Detach without killing the session

In the terminal pane:

- Press `Ctrl-D` **twice in quick succession** to detach (the two-press requirement is a current sharp edge — see [Chapter 7](#d-disconnect-requires-two-presses)).
- The session keeps running on the server. You can re-attach later from any device.

To kill a session (not just detach), use:

```bash
relay session kill <session-id>
```

---

## Chapter 5 — Attach from another device

This walks the cross-device half of [acceptance scenario E](../prd/08-acceptance.md). The session you started in Chapter 4 keeps running on machine A; you'll connect to it from machine B over the LAN.

### Prerequisites on machine B

- Network reachability to machine A on port 7777 (same LAN, same Tailscale tailnet, or via a TLS reverse proxy — see [`docs/threat-model.md`](../threat-model.md) for the network-shape decision tree).
- `relay` binary installed (same source-install steps from [Chapter 1](#chapter-1--install)).
- The bearer token from `~/.relay/last-pairing.txt` on machine A. **Treat it like a password.** If you don't want to copy it, generate a per-device token: on machine A, `relay token create --device laptop-b`, then use that one.

### Attach

On machine B:

```bash
export RELAY_SERVER_URL=http://machine-a.lan:7777     # or http://100.x.y.z:7777 for Tailscale
export RELAY_TOKEN=…                                  # the token from machine A
relay session list                                    # confirm the session is reachable
relay attach <session-id>
```

You'll see a short replay of the last terminal viewport (so you're not staring at a blank screen), then live PTY output streams in real time. Type to send input — every keystroke is forwarded per [ND-24](../decisions/ND-24-per-keystroke-input-streaming-for-tui-agents.md) so TUI agents like Claude Code feel native.

### Multi-client semantics

Multiple clients can be attached to the same session at once. All attached clients receive every PTY byte the agent produces (per [D-G3](../decisions/D-G3-reattach-semantics.md) — "universal output"). Input arbitration uses a claim-lock state machine: when a client starts typing, it acquires the claim; other clients see a BUSY notice until the typing pauses or the claim auto-releases (30s default, configurable via `claimLockTimeoutSeconds` per [ND-01](../decisions/ND-01-claim-lock-timeout-duration.md)).

This is the headline feature: start a session on your laptop, walk away, attach from your desktop, continue the conversation, walk over to a third machine, attach in a `tmux` pane — same session, no state loss.

### Through your IDE on machine B

If you have VS Code on machine B too, install the `.vsix` there (Chapter 1 build step on machine B), then **"Relay: Connect to server"** pointed at machine A's URL with the same token. Command palette → **"Relay: Attach to session"** to pick from the list of running sessions. You get the IDE terminal panel instead of a plain SSH terminal.

---

## Chapter 6 — Manage tokens, projects, and sessions

Reference for the CLI surface you'll touch day-to-day. All commands run against the Relay server you're connected to (`$RELAY_SERVER_URL`).

### Tokens

```bash
relay token create --device <name>        # generate a new bearer token; prints plaintext ONCE
relay token list                          # shows id, deviceLabel, createdAt, revokedAt | "active"
relay token revoke <id>                   # marks a token revoked; in-flight WS connections close on next message boundary
```

The plaintext token is shown exactly once on `create`. The on-disk record at `~/.relay/tokens.json` carries only the hash + salt (per [ND-09](../decisions/ND-09-bearer-token-hashing-algorithm.md)). Revocation is immediate — no rotation flow exists yet; that's deferred to Phase 3 per [D-05](../decisions/D-05-per-device-token-rotation.md).

### Projects

```bash
relay project add <path>                  # register; writes .relay/project.json marker + appends to .gitignore
relay project list                        # id, slug, path
relay project remove <id>                 # unregister; the marker file stays in place
```

Projects are registered in place — no copy, no symlink. The marker file at `<path>/.relay/project.json` carries the project ID; it's how the extension links a VS Code workspace to a Relay project. If you move the project directory, re-register it (the canonicalized path is the unique key).

### Sessions

```bash
relay session list                        # default: --status=running (per D-11)
relay session list --status=all           # include terminated sessions
relay session show <session-id>           # full detail: persona, project, status, started/terminated timestamps
relay session kill <session-id>           # SIGTERM the underlying claude process; status becomes 'terminated'
```

`relay session show`'s output shape is currently still being finalized — see [ND-15](../decisions/ND-15-relay-session-show-subcommand-surface-alignment.md), part of Track 7 ND-34.

### Server

```bash
relay server [--config <path>]            # start the long-lived REST+WS process
```

Default config: `~/.relay/config.yaml`. Override with `--config`. For production, run under a supervisor — see [`docs/deployment.md`](../deployment.md).

---

## Chapter 7 — Troubleshooting

The known rough edges in the current UX, with citations to the ND-NN that tracks each fix. When Track 7 lands, the corresponding callouts here will be removed.

### `node-pty` install fails

The `node-pty` native build is the most common install snag. Two flavours:

- **macOS — "spawn-helper" permission denied at runtime, not install time.** The pnpm-installed `node-pty` postinstall hook doesn't always set the executable bit on `spawn-helper`. Symptom: `relay session start` says `EACCES: permission denied`. Fix today is the spike's helper script: `pnpm --filter @relay/spike fix-pty` (chmods the binary). This is Phase 0 surprise §1 and is owned by Track 8 (6J) for permanent fix.
- **Linux — "missing python3 / no g++"** during `pnpm install`. Symptom: `node-gyp` failure. Fix: `sudo apt install build-essential python3` (Debian/Ubuntu) or your distro's equivalent, then re-run `pnpm install`. Phase 0 surprise §5; also owned by 6J for the prebuild path.

### `claude auth login` is unset

Relay spawns the `claude` binary and inherits your shell's `$HOME` / credentials. If the agent boots but every prompt returns an auth error:

- **Verify outside Relay first.** `claude -p "say hi"` from a fresh shell should succeed. If it doesn't, the issue is upstream of Relay.
- **macOS.** `claude auth login` writes to the Keychain. If you're running `relay server` under `launchd`, the launch agent needs Keychain access — easiest fix is to run `relay server` from your interactive shell while debugging.
- **Linux.** Credentials live at `~/.claude/.credentials.json`. Permissions must allow the user running `relay server` to read it.
- **Docker / headless.** Use `ANTHROPIC_API_KEY` as the fallback; the docs default is `claude auth login` per [ND-19](../decisions/ND-19-claude-login-oauth-as-the-documented-credential-default-anthropic-api-key-as-fallback.md).

### Detach with `Ctrl-D` requires two presses

Pressing `Ctrl-D` once in an attached session sometimes sends an EOF to the agent instead of closing the attach. Two presses in quick succession reliably detaches. Tracked by [ND-25](../decisions/ND-25-relay-attach-detach-with-d-requires-two-keypresses-on-the-host-tty.md); the fix lands with Track 7 ND-34.

### No BUSY notification in the IDE pane

When a second client is typing into your session, the only signal in the IDE terminal pane is a plain stderr line from `relay attach` — `[relay] another device is interacting with this session.`. There's no status-bar toast or auto-dismissing banner yet. Tracked by [ND-30](../decisions/ND-30-relay-attach-stderr-event-stream-for-subprocess-of-attach-consumers.md); the fix is gated on a structured event-stream protocol on `relay attach` that the extension can consume. Lands with Track 7 ND-33.

### "Already paired with a different server" when adding a second server

The extension keys SecretStorage on a single `relay.serverUrl` + `relay.token` pair. Pairing a second server overwrites the first. Workaround: use one VS Code profile per Relay server (Profiles isolate extension state including SecretStorage). Permanent fix lands with Track 7 ND-33 (per-server-URL-hashed keys, [ND-31](../decisions/ND-31-secretstorage-key-namespace-for-multi-server-ide-pairing.md)).

### Persona didn't load — what went wrong?

If `relay session list` shows the session but the agent's behavior doesn't reflect the persona's `systemPrompt`, check the spawn audit at `~/.relay/sessions/<sid>/spawn-record.json` ([ND-12](../decisions/ND-12-spawn-json-schema-location.md)) — it records the exact argv used and which persona file resolved. A near-future `relay doctor` will surface this automatically; until then, hand-check the audit. Tracked by Track 7 ND-35.

### Server says "connection refused" from another device

`relay server` binds `127.0.0.1` by default (loopback only). To accept LAN connections, edit `~/.relay/config.yaml`:

```yaml
host: 0.0.0.0
```

Restart `relay server`. For anything off your LAN, do **not** open the port to the public internet without TLS + a real reverse proxy — see [`docs/threat-model.md`](../threat-model.md) for the network-shape decision tree. Tailscale is the recommended "across networks but not public" option.

### Lost the pairing snippet

`relay init` writes the snippet to `~/.relay/last-pairing.txt`. If you've lost it (rotated machines, etc.), generate a fresh token:

```bash
relay token create --device <name>
```

…then construct the pairing URL by hand: `relay://pair?url=<your-server-url>&token=<plaintext-token>`. The plaintext is only shown once on `create`.

### Session shows `status: terminated` after server restart

This is intentional. Sessions don't survive `relay server` restart — the boot orphan sweep marks every previously-running session as `terminated_reason: "server_restart"` (per [D-11](../decisions/D-11-server-restart-and-session-orphaning.md)). Long-running sessions need a supervised `relay server` (launchd / systemd / pm2) that survives reboots.

---

## Chapter 8 — Where to go next

You've done the A–Z. Pointers for going deeper:

### To use Relay more deeply

- **Customize personas per project.** Place `<project>/.relay/personas/<name>.yaml` to override a tenant persona for one project. See [Chapter 3](#chapter-3--author-your-first-persona).
- **Read the persona schema.** [`docs/prd/09-persona-schema.md`](../prd/09-persona-schema.md) is the full contract — schemaVersion, name, description, systemPrompt, skills, mcpServers, model, with composition rules.
- **Read the threat model + deployment guide.** If you're going past localhost, [`docs/threat-model.md`](../threat-model.md) and [`docs/deployment.md`](../deployment.md) cover the network-shape decision tree, Caddy + Tailscale, and operator hardening.

### To contribute to Relay

- **Spec entry point.** [`docs/prd.md`](../prd.md) is the contract; subdocs `prd/00-overview.md` through `prd/09-persona-schema.md` are authoritative for what Relay does and does not do.
- **Architecture.** [`docs/arch/`](../arch/) hosts the load-bearing docs — WebSocket protocol, SQLite schema, REST conventions, persona application, repo layout, client-agnosticism.
- **Decision log.** [`docs/decisions/`](../decisions/) — every `D-NN` / `ND-NN` cited in this handbook resolves there. [`docs/decisions/index.md`](../decisions/index.md) is the entry point.
- **In-flight work.** [`docs/build-plan.md`](../build-plan.md) tracks every task; Track 7 (UX polish) and Track 10 (this handbook) are the active arcs.

### What's coming next

- **Track 7 — UX polish** (in flight): installable distribution, `relay doctor`, IDE GUI overhaul, session/attach polish, diagnostics. Each ND resolution will update the relevant chapter here.
- **Track 8 — Distribution** (post-Track-7): `npm install -g @relay/relay`, Marketplace + Open VSX publish, Docker image, Compose template. Will replace Chapter 1's source-install path.
- **Phase 2 — Mobile PWA** (post-Phase-1): a real installable PWA for monitoring and prompting Relay sessions from a phone over Tailscale. The [`packages/spike-pwa/`](../../packages/spike-pwa/) Angular spike validated the WS surface; the production PWA lands at `packages/pwa/`. See [`docs/prd/05-mobile-pwa.md`](../prd/05-mobile-pwa.md) and the [Track 9 spike notes](../build-plan.md#track-9--pwa-monitoring-spike-exploratory-deliberately-disposable).
- **Phase 3+** — multi-CLI support (Codex, Gemini), IntelliJ extension, persona switching on a running session, Helm charts, structured observability, token rotation. See [`docs/prd/07-phasing.md`](../prd/07-phasing.md) for the full roadmap.

If something in this handbook is wrong, outdated, or unclear, the fix lives in `docs/guides/getting-started.md` — open a PR.
