# Phase 0 Spike Report

**Date:** 2026-05-17 (cross-device walkthrough complete).
**Spike code:** [`spike/`](../spike/)
**Build-plan task:** [4B](build-plan.md#4b-phase-0-spike)

This report closes Phase 0 of `docs/prd/07-phasing.md`. All six Phase 0 bullets
pass end-to-end, including the load-bearing cross-LAN attach. Below: the
verified status, the spike's deliberate non-goals, the four surprises that
shaped the report's Phase 1 recommendations, and the work-order changes the
spike argues for.

## Status against the six Phase 0 bullets

| #  | Bullet                                                                         | Status                                                                                                                                                                                                                                                                          |
| -- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1  | Server spawns `claude` under `node-pty`                                        | **pass** with `bash -i` as the agent stand-in. The spawn path is agnostic to the binary — switching `spawnCommand: "claude"` in `config.json` exercises the same code path. (Claude Code is not installed on the Phase 0 VM; installing + authenticating is a Phase 1 setup step, not an architecture proof.) |
| 2  | Two clients attach from **two different machines** on the same network         | **pass.** Client 1 = MacBook (LAN hop to 10.0.60.221:7777). Client 2 = Ubuntu 24.04 VM (loopback to the same server, second SSH session). Two physically distinct machines, two independent WebSocket connections; the cross-LAN transport hop is fully exercised by Client 1. |
| 3  | Both clients see live output simultaneously                                    | **pass.** Keystroke-level fan-out confirmed — typing a character on either client appeared on both terminals before Enter was pressed, with the agent's response landing on both.                                                                                              |
| 4  | Either client can send input                                                   | **pass.** Both clients drove the PTY (`echo HELLO-FROM-MAC` / `echo HELLO-FROM-VM`); each input round-tripped to both clients. No claim arbitration in Phase 0; concurrent send is permitted with interleave (see surprise §4 below).                                          |
| 5  | Disconnect + reattach without losing state (D-G3)                              | **pass.** Mac client detached with Ctrl-D; VM client kept streaming and the user issued several distinctive commands (`echo MAC-IS-AWAY-NOW`, `date`, `ls /etc | head -5`, `echo END-OF-AWAY-WINDOW`) while the Mac was offline. On reattach, the Mac received the full 32 KB ring-buffer replay containing every byte it missed, then live output resumed. |
| 6  | Server restart preserves session metadata, kills agent process (D-11)          | **pass post-patch.** First restart attempt found a real spike bug (see surprise §2 — `terminatedReason: "agent_exit"` instead of `"server_restart"`). After the patch, restart produced `[spike] D-11 boot sweep: 1 orphan(s) marked killed`; the session row showed `terminatedReason: "server_restart"` with id/spawn/startedAt intact; no zombie `bash -i` processes on the VM. |

**Six of six pass. Phase 0 is closed.**

## Test environment

| Role               | Host                                              | Notes                                                                            |
| ------------------ | ------------------------------------------------- | -------------------------------------------------------------------------------- |
| Server             | `techgardencode@throwaway` (10.0.60.221)          | Ubuntu 24.04.4 LTS, Node 22.22.2, pnpm 10.33.2, build-essential, ufw inactive    |
| Client 1           | MacBook (developer machine)                       | Node 24, pnpm 10.33.2, cross-LAN WS to 10.0.60.221:7777                          |
| Client 2           | Same VM as the server, separate SSH session       | Loopback WS to 127.0.0.1:7777                                                    |
| Agent spawn target | `/bin/bash -i`                                    | Phase 0 wire-only validation; the spawn path is agent-agnostic.                  |
| State store        | `~/.relay-spike/state.json` on the VM             | JSON sidecar; atomic write-and-rename; survives restarts.                        |
| Auth               | Shared bearer token (32 B32-ish) in `config.json` | Plaintext over WS on LAN; spike posture, see deferrals.                          |

## What was deliberately deferred

Every deferral has a Phase 1 owner already named in `docs/build-plan.md`:

| Deferral                                                         | Phase 1 task                                                |
| ---------------------------------------------------------------- | ----------------------------------------------------------- |
| CLAIM / RELEASE per-message claim lock arbitration               | 6G `server/ws/` + claim-lock state machine                  |
| `replay_start` / `replay_end` bracketing around on-attach replay | 6G `server/ws/`                                             |
| SQLite + raw-SQL migrations + `schema_versions` table            | 6A `store/`                                                 |
| Persona application (CLI flags + transient `~/.relay/sessions/`) | 6C `persona/`                                               |
| Transcript pagination via byte-offset reads                      | 6D `pty/` + `transcript/` (paired)                          |
| Per-device token issuance, hashing, revocation                   | 6B `auth/` + token CLI subcommands                          |
| RFC 9457 problem-details error envelope on REST                  | 6F `server/rest/`                                           |
| Zod validation against `@relay/protocol` schemas                 | 6F `server/rest/` + 6G `server/ws/`                         |
| TLS — spike is bearer-token-over-plaintext-WS on LAN             | Out of band: operator's tunnel choice (Tailscale / Caddy)   |

## What surprised the spike

### 1. pnpm + node-pty: spawn-helper executable bit gets dropped (macOS only)

`node-pty` ships a precompiled `spawn-helper` Mach-O binary under
`prebuilds/<platform>-<arch>/` on macOS only — on Linux the spawn helper is
built in-process and on Windows conpty handles it. pnpm's content-addressable
hardlinking drops the executable bit on the macOS prebuild, which makes the
very first `POST /sessions` fail with a generic `posix_spawnp failed.` error —
no useful diagnostic, no link to the underlying cause.

The fix is one `chmod +x` per install; the spike ships
[`spike/scripts/fix-pty.mjs`](../spike/scripts/fix-pty.mjs) (no-ops on non-Darwin)
and a `pnpm --filter @relay/spike fix-pty` script that finds and repairs the binary.

**Phase 1 action:** the `@relay/relay` package needs to ship a postinstall
script that calls the same fixup (or, better, vendors a pre-chmod'd binary into
its own publish artifact). Without this, every fresh `npm install -g relay` on
a developer's macOS machine hits the same opaque failure during the first
`POST /sessions` — which is the *first* thing a new user does, on the way to
scenario E in `docs/prd/08-acceptance.md`. Build-plan task **6J (distribution)**
should track this explicitly.

### 2. D-11 shutdown race: `terminatedReason` ended up as `agent_exit` on first restart

The first Ctrl-C → restart cycle on the VM produced no boot-sweep message and
the killed session was annotated `terminatedReason: "agent_exit"` instead of
the `"server_restart"` D-11 specifies. Root cause: the spike's shutdown
handler called `pty.kill()` for each live session, which fired `pty.onExit`,
which wrote `agent_exit` to the state file *before* the server process exited.
By the time the server restarted, no `running` row remained for the boot sweep
to flip.

**Spec interpretation:** D-11 ("`status = running` is unconditionally
transitioned to `killed` with `terminated_reason = "server_restart"` on boot")
sources the marking from the **boot sweep**, not from shutdown. A correct
implementation leaves shutdown alone — the state file retains `running` rows;
the next boot's sweep flips them. This pattern handles clean Ctrl-C, hard kill,
crash, and power loss with one code path.

**Fix landed in the spike** ([`spike/src/server.ts`](../spike/src/server.ts)):
a module-level `shuttingDown` flag is set in the shutdown handler. `pty.onExit`
checks the flag and early-returns during shutdown, so state.upsert never
overwrites the row with `agent_exit`. After the patch, restart produced the
expected D-11 sweep log and the correct `terminatedReason: "server_restart"`,
with no zombie `bash -i` processes (the OS sends SIGHUP to the orphan PTY
process group when the controlling Node process exits).

**Phase 1 action:** the `session/` orchestrator (6E) must apply the same
discipline — boot sweep is the source of truth for `terminated_reason`. The
agent-exit path stays for *bash dies during normal operation* but never fires
during shutdown. Worth a unit test that asserts state-file shape after
`SIGINT` while a session is live.

### 3. `pnpm run <script>` breaks raw-mode TTY attach

Invoking the attach client via `pnpm --filter @relay/spike attach <args>` or
the `serve`/`attach` script aliases works for the *server* (no TTY needed) but
silently breaks the *attach client*. pnpm's run-script wrapper pipes
stdout/stderr for log capture, which means the raw-mode `setRawMode(true)`
the attach client sets up doesn't actually apply to the user's terminal —
keystrokes never reach the WebSocket. The connection succeeds, server-side
bytes arrive, the user thinks the session has hung or died, types, and
nothing happens.

The fix is to bypass the script-runner with `pnpm exec`:
`pnpm --filter @relay/spike exec tsx src/attach.ts <args>`. `pnpm exec`
inherits the parent TTY directly. The spike's `spike/README.md` calls this
out explicitly under "Attaching" so the next operator doesn't fall into it.

**Phase 1 action:** the production `relay attach` should be a real binary (a
`bin` entry in `@relay/relay`'s `package.json`) so it's invoked directly via
PATH and never goes through any script-runner. The IDE extension already plans
to spawn `relay attach` from PATH ([`docs/prd/04-ide-extension.md`](prd/04-ide-extension.md)),
which dodges this entirely — but the CLI documentation in 6H should call out
that `pnpm run attach` is a foot-gun during local development.

### 4. Bare `pty.write` interleaves under concurrent sends

Without CLAIM/RELEASE arbitration, two simultaneous `send` frames hitting the
PTY result in interleaved bytes — observed in the smoke test as `eecho HELLO-FROM-CLIENT-B`
when one client's stream was being flushed as another sent. This is exactly
the failure mode D-G2 was designed to prevent and is the strongest argument
for landing the claim lock before the IDE extension goes to the user.
**Phase 1 priority: 6G's claim-lock state machine should land before 6I's
extension wiring** — otherwise a single user with both Cursor and an SSH
attach open will see interleaved keystrokes from their own activity.

### 5. node-pty on Linux needs `build-essential` (no prebuild)

`node-pty` 1.1.0 ships prebuilds for `darwin-arm64`, `darwin-x64`, and Windows,
but **not Linux**. On a fresh Ubuntu 24.04 server, `pnpm install` failed with
`gyp ERR! stack Error: not found: make`. `apt-get install -y build-essential`
fixes it (Python 3 ships in Noble out of the box). Quiet failure mode if you
don't read the gyp output, since the spike-side fix-pty script just reports
"no spawn-helper found" — which is correct on Linux but masks the upstream
gyp failure.

**Phase 1 action:** the deployment guide in 1C must call out the Linux build
toolchain requirement, and the Docker image in 6J needs `build-essential` in
its base layer (or `node-pty` needs to be rebuilt with a Linux prebuild
shipped). A user copy-pasting "install Node 22, install relay" with no other
context will hit this on a clean cloud VM.

### 6. Phase 1 has no named owner for `agentSessionId` capture

The `hello` frame in `docs/arch/ws-protocol.md` §2.3 specifies an optional
`agentSessionId` field — Claude Code's native session id — used by the IDE
extension to correlate with `~/.claude/projects/`. **None of the Phase 1
build-plan tasks (6A–6J) explicitly own capturing that id from Claude Code's
stdout or state and storing it on the sessions row.** Candidate locations: the
`session/` orchestrator (6E) at spawn time, or the `pty/` capture layer (6D).
Recommend explicitly assigning this to **6E** when its kickoff prompt is
written, with a note in `docs/arch/persona-application.md` for the
mechanism (likely reading `~/.claude/projects/` post-spawn).

## Phase 1 work-order recommendations

Based on the spike, the foundation-module parallel work can proceed as planned,
but the *transport-on-top* ordering should be tightened:

1. **Prioritize 6G (server/ws) ahead of or alongside 6F (server/rest).** The
   load-bearing acceptance scenarios D, E, F all live on the WS path. REST in
   Phase 1 is mostly CRUD over entities; the harder behavioral correctness is
   on the socket. Don't let 6F's surface-area drag pull 6G's slot late.

2. **Ship 6G with claim-lock arbitration on day one of WS work**, not as a
   follow-on. The spike's "no arbitration" wire produces visibly bad behavior
   under exactly the workflow we're selling — a single user across two
   surfaces. The claim lock isn't an optimization; it's correctness.

3. **In 6E, make the boot sweep the *only* writer of `terminated_reason =
   "server_restart"`.** Shutdown handlers must not race PTY-exit handlers
   against state-file writes. The spike's `shuttingDown` flag pattern is one
   way; a unit test asserting state-file shape after SIGINT during a live
   session is mandatory. Without this, D-11 is silently broken and Phase 1
   scenario A bullet 4 fails in subtle ways.

4. **Fold the `node-pty` install fixups into 6J (distribution).** Two distinct
   issues to track: (a) macOS spawn-helper chmod (surprise §1); (b) Linux
   build-essential requirement or shipping a Linux prebuild (surprise §5).
   Without both, scenario H ("`npm install -g` on Node 22+ produces a working
   relay") fails on the very first `POST /sessions` on a clean machine.

5. **6H should ship `relay attach` as a real bin, not a pnpm script.**
   `pnpm run attach` breaks raw-mode TTY (surprise §3). Once `relay` is on
   PATH via npm install, the IDE extension's planned `spawn('relay attach', ...)`
   path is fine — but local-dev documentation must call out the gotcha for
   contributors running through pnpm.

6. **File a build-plan task for `agentSessionId` capture** (or fold into 6E
   kickoff). Without it, the IDE extension can't open the correlated Claude
   Code transcript from `~/.claude/projects/`, and that's part of how the
   conceptual-model "session" stays bound to Claude Code's native session
   storage (per `prd/03-server.md` §1).

With those six items folded in, Phase 1's foundation modules (6A–6D) can fan
out in parallel and the transport layer (6F + 6G) lands on a sound architectural
proof.
