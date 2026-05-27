# Relay PRD — Server

**Status:** v0.4
**Scope:** Server responsibilities, API surface, state, auth, CLI, persona application semantics, multi-client behavioral contracts, and native configuration preservation. Read `01-conceptual-model.md` and `02-architecture.md` first.

---

## 1. Responsibilities

- Manage tenants, projects, personas, sessions, and global/project context as persistent entities.
- Spawn and supervise agent CLI processes under PTY.
- Multiplex PTY I/O between the agent process and all attached clients.
- Persist session metadata and conversation references (the conversation itself lives in the agent's native session storage; Relay records the `agent_session_id` for resume).
- Authenticate clients via bearer token.
- Expose a REST API for management operations and a WebSocket endpoint for live session streams.

## 2. API surface (representative)

### REST

- `POST /tenants` `GET /tenants` `GET /tenants/:id` — multi-tenant primitives. **Internal at MVP**: the routes exist on the wire to keep the data model seam intact for Phase 4 multi-tenant, but no Phase 1 client UX exposes them. The bootstrap tenant is auto-created by `relay init`; operators do not need to call `POST /tenants` to bring the server up. `GET /tenants/self` is the convention for an authenticated client to discover its own tenant context.
- `POST /projects` `GET /projects` `GET /projects/:id` `DELETE /projects/:id`
- `POST /personas` `GET /personas` `PATCH /personas/:id` `DELETE /personas/:id`
- `POST /sessions` (creates session, spawns agent) `GET /sessions` `DELETE /sessions/:id` (kills agent)
- `GET /sessions/:id/transcript` — Phase 1 endpoint with two mutually-exclusive query shapes:
  - **Full export.** `?format=full` returns the entire session transcript. Use cases: backups, offline review, future audit tooling.
  - **Paginated read.** `?before=<byte_offset>&limit=<n>` returns raw PTY bytes in the half-open range `[max(0, before - limit), before)`. `before` is an **exclusive** upper-bound byte offset; the client passes the lowest `from` it has already received as the next call's `before` to walk backward. `limit` is a byte count, server-clamped to 1 MB. Initial scroll-back from the reattach contract (§5.2) calls with `before=<totalBytes>`.
  - **Response framing (both modes).**
    ```json
    {
      "sessionId": "<ULID>",
      "range": { "from": 0, "to": 32768 },
      "totalBytes": 1048576,
      "bytes": "<base64-encoded raw PTY bytes>",
      "hasMore": true
    }
    ```
    `range.from` is inclusive, `range.to` is exclusive, both relative to the session's first captured byte (offset 0). `hasMore` is `true` when `range.from > 0`. Full export returns `range = { from: 0, to: totalBytes }`.
  - **Offsets, not cursors.** PTY bytes are append-only and never rewritten, so offsets are stable for the session's lifetime. Bytes — not logical messages — are the addressable unit, consistent with the PTY-layer capture in §10.
  - **Single contract, two renderings.** The IDE terminal widget decodes `bytes` and feeds them into its PTY renderer; the (future) PWA chat renderer decodes the same `bytes` and applies its own framing. The server does not branch by client surface.

### WebSocket

- `GET /sessions/:id/stream` — bidirectional. Client receives PTY output; client sends PTY input. Multiple concurrent connections per session permitted; behavioral contract for concurrent input is in §5.

*Resolved by [D-04](../decisions/D-04-transcript-export-endpoint.md) on 2026-05-14. Pagination shape resolved by [ND-04](../decisions/ND-04-transcript-pagination-api-shape.md) on 2026-05-15. Field-naming aligned to camelCase per [ND-14](../decisions/ND-14-transcript-response-field-naming-camelcase.md) on 2026-05-17.*

## 3. State

- SQLite database for entities and session metadata. Project rows carry `id` (ULID), `tenant_id`, `slug` (unique per tenant, kebab-case), `display_name`, `canonical_path`, `agent_cli`, `created_at`, `updated_at`. Persona overrides, skills, and MCP entries live as files on disk; the DB row tracks identity and ownership only.
- Filesystem for project working directories and agent native config (`~/.claude/`, `<project>/CLAUDE.md`). Project working directories are **registered in place** — `relay project add <path>` does not copy or symlink the directory, and the user-supplied path (resolved through `realpath`) is what's stored on the project row. The `/projects/` and `~/projects/` paths referenced in `06-distribution.md` are operator conventions for where source is commonly mounted or checked out, not Relay-owned directories.
- On server boot, any session row with `status = running` is unconditionally transitioned to `killed` with `terminated_reason = "server_restart"`; no auto-relaunch occurs. Metadata persists for read-only access (transcript, `agent_session_id`).
- `~/.relay/config.yaml` for server configuration; `~/.relay/personas/<name>.yaml` for tenant-level persona definitions; `<project>/.relay/personas/<name>.yaml` for project-level overrides. The full persona file schema, validation rules, and tenant-vs-project composition are specified in `09-persona-schema.md`.
- **Model credentials.** Relay's spawn inherits the operator's full `process.env` (including `$HOME`) and process credentials, so the agent reaches whichever credential surface Claude Code has been configured against. The documented default is **`claude login` OAuth on the host that launches `relay server`** — credentials live in the macOS Keychain (`Claude Code-credentials` generic password) or at `~/.claude/.credentials.json` on Linux. The documented fallback is `ANTHROPIC_API_KEY` set in Relay's process environment; this is the canonical path for headless deployments without an interactive shell. When both are present Claude Code's resolver prefers the env var, which silently bills against the API key instead of any active Claude.ai subscription — operators who want subscription billing must unset `ANTHROPIC_API_KEY`. Credentials are never written to persona YAML, project metadata, or SQLite; all sessions on a given Relay server share the same credential set. Operators who need credential isolation run separate Relay servers.
- **Project-level skills source.** Relay does not maintain its own skill registry. Skill names referenced from persona YAML resolve against `~/.claude/skills/` (tenant) and `<project>/.claude/skills/` (project), which are Claude Code's native paths — see §8.

*Persona schema resolved by [D-09](../decisions/D-09-persona-yaml-schema.md) on 2026-05-15. Model credentials resolved by [D-10](../decisions/D-10-agent-model-credentials-handling.md) on 2026-05-15; OAuth credential default per [ND-19](../decisions/ND-19-claude-login-oauth-as-the-documented-credential-default-anthropic-api-key-as-fallback.md) on 2026-05-18. Server-restart session handling resolved by [D-11](../decisions/D-11-server-restart-and-session-orphaning.md) on 2026-05-15. Project record storage resolved by [D-12](../decisions/D-12-project-record-storage-and-relay-project-add-semantics.md) on 2026-05-15.*

## 4. Persona application semantics (G1)

When a session is spawned with persona X, Relay must uphold three guarantees:

1. **Lifetime.** The persona remains in effect for the session's full lifetime, including across any agent-internal state transitions (compaction, summarization, mid-session resumption). A persona applied at spawn must still be applied after every agent-internal transition that Relay does not itself initiate.
2. **Isolation.** Persona application for one session must not affect any other session — including concurrent sessions in the same project. Mutating shared on-disk project state (e.g., the project's `CLAUDE.md`) in a way that a different session would observe violates this guarantee.
3. **Invisibility.** The mechanism by which Relay applies the persona must not be visible to the developer in the project working directory. Persona definitions are the source of truth; the on-disk project should look the same with or without an active Relay session.

The PRD specifies the *guarantees*, not the mechanism. The implementation may use whatever agent-CLI primitive best satisfies all three (e.g., command-line flags, environment variables, transient on-disk state Relay owns under `~/.relay/`). The mechanism choice belongs to the implementation phase.

*Resolved by [D-G1](../decisions/D-G1-persona-application-semantics.md) on 2026-05-14.*

## 5. Multi-client behavioral contracts

The server supports concurrent attach by N clients per session (G-3). Two contracts govern multi-client behavior; both are required for the multi-device value prop to be coherent.

### 5.1 Input arbitration

When multiple clients are attached to a session, the server arbitrates input through a **per-message claim lock**. The contract assumes a single user operating across all attached devices, not adversarial or coordinating collaborators.

1. **Claim before send.** Each client input message is wrapped on the WebSocket as `CLAIM → SEND → RELEASE`. The server holds at most one active claim per session.
2. **First-arrival wins.** If a `CLAIM` arrives while another is held, the server rejects it with `BUSY`. Ordering is by server arrival time, not client wall-clock.
3. **Losing client preserves the draft.** A client that receives `BUSY` retains the user's local input buffer so nothing typed is lost, and surfaces a brief "another device is interacting with this session" notice. The notice is one-shot (auto-dismisses after ~4 seconds or on next keystroke), is anchored to the input area rather than as a global overlay, and the client does not auto-retry — the user retries by pressing Enter again. Both client surfaces follow this contract; only the visual primitive differs (status-bar-adjacent message in the IDE, inline indicator above the compose field in the PWA). See `04-ide-extension.md` §4 and `05-mobile-pwa.md` for client-specific framing.
4. **Auto-release.** A claim releases when the message is delivered to the PTY, when the claiming WebSocket closes, or after a 30-second inactivity timeout from `CLAIM` acknowledgment without a `SEND`. The timeout is a single fixed window — no re-arming on activity — and is configurable via `claimLockTimeoutSeconds` in `~/.relay/config.yaml` for operators with a different posture.
5. **Output is universal.** Every attached client receives the full PTY output stream regardless of claim state. There is no read-only attach mode; claim-on-send is the only contention point.

The lock model maps cleanly to Claude Code's line-buffered input, where each Enter-terminated message is the natural unit. Character-at-a-time interactive programs running inside the session (e.g., `vim` invoked from the agent shell) are not the MVP target and would not work cleanly under this contract — accepted limitation.

*Resolved by [D-G2](../decisions/D-G2-multi-client-input-arbitration.md) on 2026-05-14. Timeout duration resolved by [ND-01](../decisions/ND-01-claim-lock-timeout-duration.md) on 2026-05-15; BUSY UX resolved by [ND-02](../decisions/ND-02-rejection-ux-for-busy-response.md) on 2026-05-15.*

### 5.2 Reattach semantics

When a client attaches to a session — whether on initial join or after a disconnect — the server prioritizes the live stream over historical replay. The same wire-level contract applies to every client surface; renderers differ but the server does not branch.

1. **Live stream is immediate.** On attach, the server begins streaming current PTY output to the client without delay. There is no preceding "load history first" phase that blocks live bytes from arriving.
2. **Small initial replay for context.** Alongside the live stream, the server sends a short replay of recent PTY output sized to fit a typical terminal viewport plus a Claude Code prompt-state worth of preceding context. The server default is 32 KB raw bytes (configurable via `replayBufferBytes` in `~/.relay/config.yaml`); the buffer is uniform across sessions, no per-session knob. This prevents a blank-terminal experience when the client attaches to a quiet session without risking ANSI flash on slow networks.
3. **Deeper history is pull-on-demand.** Older context is fetched by the client through the paginated transcript API in §2 (`GET /sessions/:id/transcript?before=…&limit=…`). The reattach path never pushes full session history; clients render older bytes when the user scrolls back.
4. **Single contract, two renderings.** Server-side behavior does not branch by client surface. The IDE terminal widget renders the bytes inline using its native scrollback; the (future) mobile PWA renders chat-style, pulling older bytes from the same transcript endpoint. There is no per-client server logic for this path.
5. **Server-side state required.** Each running session keeps a small in-memory ring buffer (32 KB default, see rule 2) for the on-attach replay; the persisted transcript store (§10 for capture, §2 for the API) backs deeper history.

The reattach contract is what makes the cross-device value prop work: closing a laptop and opening a phone produces current state immediately, with enough recent output to feel oriented and the option to pull more.

*Resolved by [D-G3](../decisions/D-G3-reattach-semantics.md) on 2026-05-14. Ring buffer size resolved by [ND-03](../decisions/ND-03-ring-buffer-size-for-attach-replay.md) on 2026-05-15.*

## 6. Auth

- **Bearer token per device.** Tokens are 26-character Crockford-Base32 strings with ≥128 bits of entropy. Server-side generated; stored as a salted SHA-256 hash in `~/.relay/tokens.json` (16-byte per-token random salt; see [`docs/threat-model.md`](../threat-model.md) §4 for the rationale); the plaintext is shown to the operator exactly once at issue time.
- **First-run pairing.** `relay init` prints a single copy-paste snippet on stdout (and writes it to `~/.relay/last-pairing.txt`) containing a `relay://pair?url=…&token=…` deep link plus the URL and token in plain text. The IDE extension's first-run "Connect to server" command-palette entry accepts either form. The first authenticated use of a token is itself the pairing handshake — there is no server-side "approve this device" step (self-host single-user posture; see [[d-13-first-run-pairing-ux]] for rationale).
- **Long-lived and reusable.** Tokens are valid indefinitely until revoked. `relay token revoke <id>` ends the token immediately; in-flight WebSockets using it close on next message boundary. Long-term rotation is deferred to Phase 3 ([[d-05-per-device-token-rotation]]).
- **Mobile pairing.** The Phase 2 mobile PWA uses the same `relay://pair?…` URL embedded in a QR code. Phase 1 ships only the desktop flow.

*Pairing UX resolved by [D-13](../decisions/D-13-first-run-pairing-ux.md) on 2026-05-15. Token hashing algorithm resolved by [ND-09](../decisions/ND-09-bearer-token-hashing-algorithm.md) on 2026-05-17.*

## 7. CLI

The server binary also exposes a CLI for local management:

- `relay init` — first-run setup. Generates an initial bearer token, writes default `~/.relay/config.yaml`, scaffolds the seven default personas under `~/.relay/personas/`, and emits the device-pairing snippet on stdout (server URL + token, formatted for direct copy into the IDE extension's first-run prompt). After the snippet it prints a **numbered next-steps narrative bridge** — (1) `claude auth login` (with the `ANTHROPIC_API_KEY` headless fallback named per §3), (2) start `relay server`, (3) pair the IDE via "Relay: Connect to server", (4) register a project, (5) start a session — closing with a link to the getting-started handbook. The bridge is ephemeral console guidance: it is **not** written to `~/.relay/last-pairing.txt`, which holds only the pairing snippet the operator re-reads for the token. The bridge carries the credential-setup *reminder*; credential *validation* (fail-fast, `relay doctor`) is out of scope here. *Resolved by [ND-32](../decisions/ND-32-install-and-onboarding-deep-dive.md) on 2026-05-26.*
- `relay project add <path> [--name <slug>]` — registers `<path>` in place as a project. Canonicalizes the path with `realpath`, defaults the display name to the path's basename (override with `--name`), writes `<path>/.relay/project.json` with the marker schema from `04-ide-extension.md` §4, and appends `.relay/project.json` to the project's `.gitignore`. Re-registering the same canonical path or slug is `409 Conflict`.
- `relay project list` — lists registered projects (id, slug, display name, canonical path).
- `relay project remove <id>` — removes the project row and any session rows scoped to it. Does **not** delete the working directory or the on-disk marker file; the operator removes those if desired.
- `relay persona list` — lists effective personas for the current tenant (and project, if invoked inside a registered project's working directory).
- `relay persona create <name>` — opens a new persona YAML in `$EDITOR`, pre-filled with the schema from `09-persona-schema.md`.
- `relay session list [--all] [--status running|killed]` — defaults to `--status running`. `--all` shows everything regardless of status.
- `relay session show <id>` — renders one session's full record as plain text, one `key: value` per line: `id`, `status`, `personaName`, `projectId`, `terminatedReason`, `totalBytes`, `agentSessionId`, `ptyPid`, `createdAt`, `updatedAt` (timestamps ISO-8601). Reads SQLite directly (read-only; the server process need not be running). A non-existent id writes `No session with id <id>.` to stderr and exits 1. *Resolved by [ND-15](../decisions/ND-15-relay-session-show-subcommand-surface-alignment.md) on 2026-05-27.*
- `relay session kill <id>` — terminates the agent process for a running session and transitions the row to `killed` with `terminated_reason = "operator_kill"`.
- `relay token create --device <name>` — generates a new bearer token, prints it once on stdout, and persists the device label.
- `relay token revoke <id>` — revokes a token immediately; in-flight WebSockets using it are closed on next message boundary.
- `relay attach <session-id>` — thin client. Opens a WebSocket to `/sessions/:id/stream`, proxies stdin/stdout to the local terminal, exits cleanly on a **single** `^D` press (closes WebSocket; session keeps running). On detach the client prints `detached from session <id>; the session is still running. Reattach with: relay attach <id>` so the operator is not left unsure whether the session was killed. Exit code 0 on clean detach; non-zero on session-not-found / auth-failure / network-loss. Used by the IDE extension's terminal integration. *Single-press detach resolved by [ND-25](../decisions/ND-25-relay-attach-detach-with-d-requires-two-keypresses-on-the-host-tty.md) on 2026-05-27; both the detach gesture and the still-running confirmation are part of [ND-34](../decisions/ND-34-session-and-attach-polish-deep-dive.md).*
- `relay server [--config <path>]` — runs the long-lived API + WebSocket process. Default config path is `~/.relay/config.yaml`.

## 8. Native configuration preservation

A core design principle, not just a feature:

> Relay reads and writes the same configuration paths that the agent CLIs use natively. The harness adds metadata in `~/.relay/` but never replaces, shadows, or duplicates native configuration. If Relay is uninstalled, the developer's Claude Code (and other CLI) configuration is untouched and fully functional.

What this means concretely:

| Concern                              | Path                                                              | Owner                                                                                   |
| ------------------------------------ | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Claude Code sessions and transcripts | `~/.claude/projects/`                                             | Claude Code (Relay reads for session listing)                                           |
| Skills                               | `~/.claude/skills/` and `<project>/.claude/skills/`               | Claude Code                                                                             |
| MCP server config                    | `~/.claude.json`, `<project>/.mcp.json`                           | Claude Code (Relay can edit through UI later)                                           |
| Project instructions                 | `<project>/CLAUDE.md`                                             | Project — Relay does not mutate this file as part of persona application (see §4)       |
| Tenant/project/session metadata      | `~/.relay/`                                                       | Relay                                                                                   |
| Persona definitions                  | `~/.relay/personas/*.yaml` and `<project>/.relay/personas/*.yaml` | Relay                                                                                   |
| Server config                        | `~/.relay/config.yaml`                                            | Relay                                                                                   |
| Auth tokens                          | `~/.relay/tokens.json`                                            | Relay                                                                                   |

## 9. MCP set lifecycle

The set of MCP servers a session uses is **fixed at session spawn time**. The persona's MCP server list is read once when `POST /sessions` runs, and the spawned agent process retains that set for its entire lifetime.

Changes to a persona's MCP server list while a session is running are a no-op for that session. The running agent continues with the MCP set in effect when it was spawned. To pick up a changed set, the operator stops the session and starts a new one — which surfaces in the IDE and CLI as an explicit "restart required to apply MCP changes" indicator on any session whose persona has been edited since spawn.

This is a deliberate boundary, not a limitation. Mutating MCP wiring on a live agent process risks half-configured tool calls and out-of-band failures that are hard to diagnose. A clean stop/restart cycle matches how the underlying agent CLIs treat tool configuration and keeps the session's tool surface predictable.

*Resolved by [D-03](../decisions/D-03-mcp-set-changes-mid-session.md) on 2026-05-14.*

## 10. Transcript capture layer

Relay captures the transcript at the **PTY layer**: the raw byte stream emitted by the agent CLI through the pseudoterminal is the source of truth for what gets persisted, replayed on attach (§5.2), and served by the transcript API (§2). This is the same byte stream the human sees in the terminal, so the persisted transcript matches the user's lived experience exactly — including ANSI sequences, prompts, and any interactive rendering.

Relay does **not** parse the agent's structured output channels (e.g., Claude Code's `--output-format json`) for transcript capture. Those structured channels are reserved for Phase 3 features that need per-message semantics (annotations, tool-call analysis, structured search). Coupling the transcript pipeline to one CLI's protocol shape would foreclose support for other agent CLIs (Codex, Gemini CLI, future agents) that emit to a PTY but may not expose an equivalent structured stream.

*Resolved by [D-07](../decisions/D-07-transcript-stream-capture-layer.md) on 2026-05-14.*
