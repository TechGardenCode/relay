# Relay extension

The VS Code-family extension that spawns and attaches to Relay agent sessions.

Targets VS Code, Cursor, VSCodium, Code-OSS, and any editor that consumes the VS Code Extension API (engine floor `>=1.85.0`).

## What this extension does

- **First-run pairing.** "Relay: Connect to server" accepts the `relay://pair?url=…&token=…` deep link from `relay init`, or a manual URL + token. Credentials are stored in VS Code's `SecretStorage`. Per `docs/decisions/D-13-first-run-pairing-ux.md`.
- **Project discovery.** Per-root marker file (`.relay/project.json`) — read-only authoritative bind per `docs/decisions/D-G6-project-discovery-workspace-to-project-binding.md`. Missing markers surface a quick-pick (register-new ∣ bind-existing) per root, per `docs/decisions/ND-05-multi-root-workspace-marker-file-precedence.md`.
- **Session lifecycle.** "Relay: Start session" picks a persona, calls `POST /sessions`, and opens a terminal pane running `relay attach <id>`. The extension itself never opens a WebSocket — per `docs/arch/client-agnosticism.md` §4.3 it is a subprocess-of-attach consumer.
- **Status bar.** Focus-following indicator showing persona + project for the active root.

## Prerequisite: `relay` on PATH

The extension shells out to `relay attach` via `vscode.window.createTerminal({ shellPath: 'relay', shellArgs: [...] })`. The `relay` binary must resolve on `$PATH` in the shell environment VS Code launches terminals from.

**For local development** (until build-plan task 6J ships global-install distribution):

```bash
cd packages/server
pnpm build
pnpm link --global
```

That puts the local build's `relay` binary on PATH so the extension's "Start session" terminal spawn resolves it.

**For production** (npm slice implemented per [D-19](../../docs/decisions/D-19-npm-distribution-posture.md), pending first publish): `npm install -g @techgardencode/relay`.

If `relay` is not on PATH when the extension tries to spawn it, the terminal pane will display the shell's "command not found" error verbatim.

## Build

```bash
pnpm -F relay-extension typecheck    # tsc -b
pnpm -F relay-extension build        # esbuild → dist/index.cjs
pnpm -F relay-extension vsix         # produces relay-extension-0.0.0.vsix at the package root
```

Install the produced vsix into a clean VS Code window:

```bash
code --install-extension packages/extension/relay-extension-0.0.0.vsix
```

## Known limitations at MVP

- **No status-bar BUSY notice.** When another device claims the session, `relay attach` writes `[relay] another device is interacting with this session.` to stderr inside the terminal pane. The full ND-02 status-row-anchored, auto-dismissing notice surface depends on a structured event-stream protocol on `relay attach` — captured as `ND-30` in the decision log.
- **Single Relay server per IDE install.** `SecretStorage` keys are `relay.serverUrl` + `relay.token`. A marker carrying a `serverUrl` that does not match the stored one refuses to bind with a "pair with this server first" notice. The multi-server scheme is captured as `ND-31`.
- **`^D` detach behavior is inherited from `relay attach`.** Tracked as `ND-25` — the extension does not paper over the two-press symptom.

## Non-features

Per `docs/prd/04-ide-extension.md` §5:

- No sidebar panel for personas, skills, or MCP. CLI and config files handle these.
- No diff viewer. The editor's native git diff is enough.
- No integration with VS Code's `tasks.json` or `launch.json`.
