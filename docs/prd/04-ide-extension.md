# Relay PRD — VS Code-Family Extension

**Status:** v0.4
**Scope:** The desktop client. Specifies targets, distribution, form, behavior, and explicit non-features. Server-side contracts the extension consumes live in `03-server.md`.

---

## 1. Targets

VS Code, Cursor, VSCodium, Code-OSS, and other editors that consume the VS Code Extension API. A single `.vsix` artifact works across all of them.

## 2. Distribution

- Sideload from GitHub Releases at MVP.
- Publish to OpenVSX for one-click install in Cursor and VSCodium.
- Microsoft Marketplace publication deferred until extension API stabilizes.

## 3. Form

A **workspace extension** — runs in the remote VS Code Server context when the user is connected via Remote-SSH. The extension talks to the Relay server over localhost. This means a developer connected to their homelab from a MacBook gets the extension running next to the Relay server, not on the MacBook.

## 4. Functional behavior

- **First-run configuration.** The "Relay: Connect to server" command palette entry presents a single input that accepts either a `relay://pair?url=…&token=…` deep link (emitted by `relay init`) pasted whole, or the URL and token as two separate fields (toggle in the prompt). The extension validates by issuing an authenticated probe against the server, and on success stores the URL and token in VS Code's secret storage. There is no server-side device-approval step — the first authenticated use of the token is the pairing handshake. See `03-server.md` §6 for the wire-level contract.
- **Project discovery.** Binding a workspace folder to a registered Relay project is driven by a marker file, not by path inference. **Each root folder is evaluated independently** — a multi-root workspace maps to N projects, not one, and a session is started against a specific root folder.
  - **Marker file.** A registered project carries `.relay/project.json` at its root folder, with the following schema:
    ```json
    {
      "schemaVersion": 1,
      "projectId": "01HXYZ...",
      "serverUrl": "https://relay.homelab.lan",
      "displayName": "relay (main worktree)"
    }
    ```
    `schemaVersion` (integer) and `projectId` (server-issued opaque ID) are required. `serverUrl` is optional and lets the extension disambiguate when the user has multiple Relay servers paired; when absent, the extension uses the server it was configured against at first-run. `displayName` is an optional fallback label for UI when the server is unreachable. Unknown future `schemaVersion` values are a refuse-to-bind condition with a clear "upgrade your Relay extension" notification — graceful degradation would risk silent field-semantic drift. Unknown fields at a known `schemaVersion` are ignored.
  - **Marker is authoritative.** When the workspace opens, the extension reads `.relay/project.json` and binds the containing root folder to that project ID. There is no path-similarity matching, no canonicalization fallback — the marker is the only signal that establishes the bind.
  - **Missing marker → per-root user choice.** If the file is absent for a given root folder, the extension surfaces an in-IDE quick-pick scoped to that root with two paths: register this root as a new project, or bind it to an existing project from a list of projects known to the server. The selection writes the marker file for that root only; sibling roots are unaffected. There is no CLI hand-off.
  - **Multi-root behavior.** "Start session" resolves its target project by finding the root folder that contains the active editor's URI. If no editor is active, the command surfaces a quick-pick of root folders. The status-bar item shows the project bound to the root containing the currently focused editor, swapping as the user navigates between roots. There is no workspace-level "primary project."
  - **Worktree identity.** Each git worktree is its own project with its own marker and project ID — Relay does not share project identity across worktrees of the same repo. Two concurrent sessions in two worktrees are two sessions on two distinct projects in `relay session list`. See `01-conceptual-model.md` for the conceptual commitment.
  - **Gitignored by default.** `relay project add` (and the IDE's "Register this workspace" flow, which calls the same `POST /projects` server primitive) adds `.relay/project.json` to the root folder's `.gitignore` because the marker carries server-bound identity, not source content; teammates cloning the same repo each get their own bind. Users on a shared homelab who want a single shared bind can opt to check the marker in.
  - **Remote-SSH transparency.** The marker lives on the workspace filesystem, so Remote-SSH workspaces work with no special handling — the extension reads the marker via the same workspace file API it uses for any other file. This is what makes binding stable across devices: the laptop and the homelab see the same marker because they share the same workspace filesystem.
- **Start session command.** Command palette entry `Relay: Start session in current project`. Quick-pick of available personas. On selection, the extension:
  1. Calls `POST /sessions` to create the session server-side, passing the workspace root as the session's working directory
  2. Opens a new terminal in the editor with a custom shell pointing at `relay attach <session-id>`
  3. The `relay attach` command is a tiny client that establishes a WebSocket to `/sessions/:id/stream` and proxies stdin/stdout to the local terminal

  The command does not pre-prompt for a working directory. The workspace root is the unambiguous default and aligns with where the project marker file lives, so a subdirectory picker would only add friction without resolving any ambiguity. Subdirectory selection is a deferred enhancement to revisit if a concrete need surfaces (e.g., monorepo with per-package agents).
- **Attach to session command.** Quick-pick of running sessions, opens a terminal attached to the chosen one. Reattach behavior (what the user sees on attach) is governed by the server-side reattach contract in `03-server.md` §5.2.
- **BUSY-on-input UX.** When the user presses Enter and the server rejects the `CLAIM` with `BUSY` (per the input-arbitration contract in `03-server.md` §5.1), the extension surfaces a one-shot, dismissible notice anchored next to the terminal's status row (not a global toast): "Another device is interacting with this session." The notice auto-dismisses after ~4 seconds or as soon as the user presses a key again. The user's input buffer is preserved unchanged; a single Enter retries the send. The extension does not auto-retry on the user's behalf.
- **Status bar item.** Shows the persona and project for the root folder containing the currently focused editor. When multiple sessions are running, the status bar reflects the *displayed* root folder — i.e., focus, not a separate "active session" pointer. Clicking the item opens a quick-pick of sessions to attach to (same as the attach command). There is no global "active session" concept; a workspace has one binding per root folder, and the user picks a session per terminal.

*Resolved by [D-01](../decisions/D-01-workspace-root-vs-subdirectory-for-start-session.md) on 2026-05-14, [D-G6](../decisions/D-G6-project-discovery-workspace-to-project-binding.md) on 2026-05-14. Marker file schema resolved by [ND-07](../decisions/ND-07-marker-file-schema.md) on 2026-05-15. Multi-root behavior resolved by [ND-05](../decisions/ND-05-multi-root-workspace-marker-file-precedence.md) on 2026-05-15. Worktree identity resolved by [ND-06](../decisions/ND-06-worktree-project-identity.md) on 2026-05-15. BUSY UX resolved by [ND-02](../decisions/ND-02-rejection-ux-for-busy-response.md) on 2026-05-15.*

## 5. Explicit non-features at MVP

- No sidebar panel for personas, skills, or MCP. CLI and config files handle these.
- No diff viewer inside the IDE. The editor's native git diff is enough.
- No integration with VS Code's tasks or launch configurations.

## 6. GUI affordances roadmap (Phase 1.5 rollout bar)

The MVP surface above is four command-palette entries plus a focus-following status-bar widget. The painless-rollout bar for the IDE GUI — what must exist before a non-CLI user can discover and manage sessions productively — is anchored on a single P0 affordance, with everything else either a cheap P1 polish or deferred behind a named dependency.

- **P0 — Sessions tree view (Activity Bar).** The extension contributes a `viewsContainers` + `views` entry hosting a `vscode.window.createTreeView`: sessions grouped by project, each node exposing attach / release / kill quick actions and a live `running` / `idle` / `killed` status badge (per `01-conceptual-model.md` session lifecycle). The tree refreshes by **REST poll** — the extension never opens a WebSocket, so the claim-arbitration FSM stays inside `relay attach` (the subprocess-of-attach pattern). This is the surface that lets a user "see all my sessions" and switch between them without the command palette or the CLI.
- **P1 — Picker and status-bar polish.** The persona quick-pick on "Start session" and the session quick-pick on "Attach to session" gain `matchOnDescription` / `matchOnDetail` and per-project grouping. The status bar gains a REST-poll-derived running-session indicator. These sharpen the secondary paths the tree view does not replace.
- **Marker workflow is symmetric (no change).** A project registered via `relay project add` is immediately bindable in the IDE — the CLI and the IDE's "Register this workspace" flow call the same `POST /projects` handler, which writes the `.relay/project.json` marker. The one residual friction is the true cross-device topology (the server's filesystem differs from the IDE's), where the server-written marker is not on the IDE's disk; same-host and Remote-SSH (§3) topologies have no gap.
- **Deferred behind a named dependency.** An anchored, auto-dismissing BUSY notice (the §4 "BUSY-on-input UX" contract) waits on a structured `relay attach` event stream; until then the human-prose stderr line is the documented interim. A multi-server picker (switch / add server) waits on per-server SecretStorage keying; single-server pairing with refuse-to-bind-on-URL-mismatch is the documented Phase-1 limitation. Claim-holder and agent-activity status-bar indicators wait on the same event stream as the BUSY notice.
- **Deferred by prior decision.** Mid-session persona switching is Phase 3 (personas are immutable for MVP). Monorepo subdirectory selection on "Start session" remains deferred (the workspace root is the unambiguous default per §4). A full webview-based session UI (chat transcript, side-by-side personas) is out of scope — it overlaps Phase 2 PWA work; the IDE surface stays "lightweight tree + status bar + quick-picks."

*Resolved by [ND-33](../decisions/ND-33-ide-gui-overhaul-deep-dive.md) on 2026-05-26.*
