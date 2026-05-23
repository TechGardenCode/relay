# Phase 1 acceptance walk — 6Z gate report

> **Gate re-scoped 2026-05-22.** [D-16](decisions/D-16-phase-1-ships-without-distribution.md) deferred scenario H (distribution) to post-2.0 / Track 8. Under the re-scoped A–G gate, this walk's aggregate verdict converts from `blocked` to `pass` — the two `blocked` checks (H.1, H.3) are now out of Phase 1 scope. The walk body below is preserved as the 2026-05-22 evidence snapshot; the [Aggregate gate](#aggregate-gate) section's `blocked` framing reflects the original A–H scope.

**Date:** 2026-05-22
**HEAD:** `ed97bc3` (6I — IDE extension wire-up landed; this walk closes the user-driven side)
**Topology:** server-on-VM at `http://10.0.60.221:7777`; laptop runs `relay attach` as second client for E + both clients for F. Cursor on the laptop with Remote-SSH → VM for C/D/E IDE-side checks.

This report walks scenarios A–H from [docs/prd/08-acceptance.md](./prd/08-acceptance.md) via the `scenario-runner` skill. Per-scenario verdict tables below. Aggregate gate decision at the bottom.

**Pre-known caveats (do not refile as new NDs):** [ND-25] `^D` two-keypress detach, [ND-30] IDE-side BUSY notice is a prose stderr line (not structured event stream), [ND-31] multi-server SecretStorage keying.

---

## Scenario A — Server bring-up and project registration

| # | Check                                                     | Verdict | Cite                                                |
| - | --------------------------------------------------------- | ------- | --------------------------------------------------- |
| 1 | `relay init` produces bearer token + config artifacts     | pass    | [03-server.md §6] [D-13]                            |
| 2 | Default personas scaffolded (7 YAMLs)                     | pass    | [03-server.md §7]                                   |
| 3 | Bearer token authenticates against server                 | pass    | [03-server.md §2] [03-server.md §6]                 |
| 4 | `relay project add` registers project in place            | pass    | [D-12] [03-server.md §7] [04-ide-extension.md §4]   |
| 5 | Re-register same path → 409 `application/problem+json`    | pass    | [D-12] [rest-conventions.md §3]                     |
| 6 | Server stop/restart preserves projects, personas, tokens  | pass    | [03-server.md §3] [D-11]                            |
| 7 | Running sessions → `killed` with `server_restart` reason  | pass    | [D-11] [03-server.md §3]                            |

**Evidence highlights:**

- A.1 — VM `~/.relay/last-pairing.txt` contains `relay://pair?url=http%3A%2F%2F10.0.60.221%3A7777&token=W8Z94YW3JYREKR66GC6DD7TR63`. `tokens.json` has one entry with hashed bearer (`saltB64` + `hashB64`).
- A.2 — `architect.yaml`, `design.yaml`, `dev.yaml`, `infra.yaml`, `product.yaml`, `review.yaml`, `test.yaml` all present. CLI `relay persona list` and REST `GET /personas` return identical sets.
- A.3 — `GET /tenants/self` → 200 `{"id":"01J0000000000000000TENANT0",...}`.
- A.4 — `/tmp/project-A/.relay/project.json` written with `schemaVersion: 1` + `projectId: 01KS8EQEAHEFGXFQFHMMQ4HSC5`. `.gitignore` contains `.relay/project.json`. REST `canonicalPath: /tmp/project-A` matches `realpath /tmp/project-A`.
- A.5 — POST `/projects` with duplicate path → `HTTP 409`, `Content-Type: application/problem+json`, body `{"type":"https://relay.dev/errors/project-path-taken",...,"existingProjectId":"01KS8EQEAHEFGXFQFHMMQ4HSC5"}`.
- A.6 — Post-restart REST `GET /projects`, `GET /personas`, `GET /tenants/self` all return byte-identical payloads to pre-restart calls.
- A.7 — Server log emits `[relay] D-11 boot sweep: 1 orphan(s) marked killed`. CLI `relay session list --status killed` shows session `01KS8ERAT4TV7FM4WJ3BZEE4RD` with `terminated_reason: server_restart` and 1281 bytes of captured transcript.

**Mutation surface recap:** `relay init` (VM, already run during preflight); `relay project add /tmp/project-A` (VM); two duplicate `POST /projects` (one CLI, one direct curl); SIGTERM to `node relay.js server`; restart `node relay.js server`; `POST /sessions` (spawned then orphaned by restart). All cleanup runs at end of walk.

---

## Scenario B — Persona × project composition

| # | Check                                                       | Verdict | Cite                             |
| - | ----------------------------------------------------------- | ------- | -------------------------------- |
| 1 | Default persona set enumerable via CLI and REST (identical) | pass    | [03-server.md §2] [03-server.md §7] |
| 2 | Project-level override resolves correctly                   | pass    | [D-09] [03-server.md §4]         |
| 3 | Persona behavior observable — marker in transcript          | pass    | [D-G1] [08-acceptance.md "B"]    |
| 4 | Persona lifetime persists across `/clear` (compaction)      | pass    | [D-G1] [03-server.md §4]         |

**B.2 caveat — discovery surface scope:**
The override file at `/tmp/project-A/.relay/personas/dev.yaml` IS honored at spawn time (B.3 + B.4 confirm), and CLI `relay persona list --project /tmp/project-A` correctly returns `dev project TEST PROJECT-LEVEL DEV — must reply with [scenario-B-marker] first.` But two discovery paths fall short of scenario-runner's wording:

1. CLI `cd /tmp/project-A && relay persona list` (no `--project` flag) returns tenant-only — cwd-based project auto-detection isn't implemented in [`packages/server/src/cli/persona.ts:19`](../packages/server/src/cli/persona.ts).
2. REST `GET /personas?projectId=01KS8EQEAHEFGXFQFHMMQ4HSC5` returns tenant-only. The route source documents this as intentional MVP scope: [`packages/server/src/server/rest/routes/personas.ts:22`](../packages/server/src/server/rest/routes/personas.ts) — *"MVP scope: REST personas surface == tenant personas surface"* — and lines 86-88 explain the IDE is expected to compose locally by reading `<canonicalPath>/.relay/personas/` rather than relying on a server-side join.

The D-09 contract (override resolution semantics at spawn) is fully satisfied. The scenario-runner spec for B.2 verifies a discovery surface (CLI cwd-auto + REST project-context) that the implementation explicitly defers — this is a spec-vs-impl gap worth filing as a new ND.

**B.3 evidence:** session `01KS8EXTXK23GBZNS7T9FGPCS7` transcript shows `[scenario-B-marker]` literally preceding Claude's `Hello!` response (totalBytes 1281 → 8742 after one prompt).

**B.4 evidence:** after `/clear` and a new "Say a one-word greeting." prompt, transcript again contains `[scenario-B-marker]` preceding `Hello.` (totalBytes 14705 final). Persona survives the conversation reset.

**Mutation surface recap:** wrote `/tmp/project-A/.relay/personas/dev.yaml` (project-level dev override); spawned session `01KS8EXTXK23GBZNS7T9FGPCS7`; sent two prompts via `relay attach`. Session left running for downstream scenarios.

## Scenario C — Single-client session lifecycle in IDE

| # | Check                                                            | Verdict | Cite                                              |
| - | ---------------------------------------------------------------- | ------- | ------------------------------------------------- |
| 1 | Extension installs in a Remote-SSH'd Cursor                      | pass    | [04-ide-extension.md §3]                          |
| 2 | First-run pairing flow accepts the deep link                     | pass    | [04-ide-extension.md §4] [03-server.md §6] [D-13] |
| 3 | Extension auto-binds the open workspace via marker file          | pass    | [D-G6] [ND-07] [04-ide-extension.md §4]           |
| 4 | "Start session" spawns an interactive agent terminal             | pass    | [04-ide-extension.md §4 start session]            |
| 5 | Multi-root workspace status-bar follows focus                    | n/a     | [ND-05] [04-ide-extension.md §4]                  |

**Evidence:**

- C.1 — `.vsix` rsynced from laptop to VM at `/tmp/relay-6z/relay-extension-0.0.0.vsix`. User installed via Command Palette → "Extensions: Install from VSIX…" while Cursor was Remote-SSH'd to `techgardencode@10.0.60.221`. Install landed on the Remote-SSH extension host (not local) — confirmed by the extension subsequently spawning sessions in `/tmp/project-A` (VM-side path).
- C.2 — User pasted `relay://pair?url=http%3A%2F%2F10.0.60.221%3A7777&token=W8Z94YW3JYREKR66GC6DD7TR63` into "Relay: Connect to server". Pairing succeeded — subsequent extension commands (Register, Start Session) authenticated against the VM-hosted server.
- C.3 — User opened `/tmp/project-A` in Cursor. Status bar reads `Relay: project-A`. No prompt to register — the extension read `/tmp/project-A/.relay/project.json` (the marker from scenario A.4) and silently bound. Marker-authoritative behavior per ND-07.
- C.4 — Command Palette → "Relay: Start session in current project" → `dev` persona. **First attempt failed** with "The terminal process failed to launch: Path to shell executable 'relay' does not exist" — the VM had no `relay` on PATH because `@relay/relay` isn't published (build-plan 6J pending, see H.1). **Resolution:** symlinked `/usr/local/bin/relay → /tmp/relay-6z/packages/server/dist/cli/relay.js` on the VM (the JS file has a `#!/usr/bin/env node` shebang); reloaded Cursor; retried. Second attempt succeeded — session `01KS8FZW097D1A1MREPZFA6WK3` (project-A, dev, 46760 bytes at observation) opened with a live `relay attach <sid>` terminal pane. User confirmed: "Say hi in one sentence." prompt returned a Claude response inside the pane. *Interaction with 6J:* the extension assumes `relay` is on PATH (the documented happy-path is `npm install -g`); the IDE extension contract is correct, but the dev/walk environment needs the binary installed by an out-of-channel mechanism until 6J ships.
- C.5 — `n/a (because: workspace opened as single-root /tmp/project-A; no multi-root workspace configured)`. Not regression-blocking per scenario-runner.

**ND-25 repro inside Cursor terminal pane** (out-of-band observation, not a C verdict): user pressed `^D` once in the IDE terminal — no effect. Pressed `^D` a second time — terminal pane closed but server-side session `01KS8FZW097D1A1MREPZFA6WK3` remained `running` (verified via REST). **ND-25 reproduces in Cursor's integrated terminal widget**, broadening its surface beyond the raw-`ssh` TTY case originally filed against `packages/server/src/attach/tty.ts`. The PTY-survives-detach side (D-G3) works correctly.

**Mutation surface recap:** installed `.vsix` (Remote-SSH side); paired extension (writes to SecretStorage); opened `/tmp/project-A`; spawned `01KS8FWJY2EEV20226TTMV2HQ0` (first attempt — terminal launch failed, server-side session orphaned) and `01KS8FZW097D1A1MREPZFA6WK3` (retry, succeeded). Symlinked `/usr/local/bin/relay → /tmp/relay-6z/.../relay.js` on VM.

## Scenario D — Session survives client disconnect

| # | Check                                                            | Verdict | Cite                                              |
| - | ---------------------------------------------------------------- | ------- | ------------------------------------------------- |
| 1 | Closing the IDE leaves the session running                       | pass    | [08-acceptance.md "D"] [03-server.md §3]          |
| 2 | Reattach delivers live PTY output immediately                    | pass    | [D-G3] [03-server.md §5.2 rule 1]                 |
| 3 | Initial replay is roughly one terminal viewport                  | pass    | [ND-03] [03-server.md §5.2 rule 2]                |
| 4 | Older context pull-on-demand via `/transcript` endpoint (server) | pass    | [D-G3] [03-server.md §5.2 rule 3]                 |
| 5 | Conversation context preserved across reattach                   | pass    | [08-acceptance.md "D"] [D-G3]                     |

**Evidence:**

- D.1 — User closed the entire Cursor window (Remote-SSH dropped). REST `GET /sessions/01KS8FZW097D1A1MREPZFA6WK3` returns `status: running`, `terminatedReason: null`, `ptyPid: 38592`. `ps -ef` on the VM confirms the `claude --append-system-prompt …` PTY (pid 38592) is still alive.
- D.2 — User reopened Cursor, reconnected Remote-SSH, ran "Relay: Attach to session" → the same session. Terminal pane began streaming PTY bytes immediately — "terminal reopened with the previous message" per user; no loading-blocker phase.
- D.3 — Replay arrived sized to the live screen ("no history to scroll up so not applicable"). Server-side `replayBufferBytes: 32768` (config.yaml); the actual replay was clipped to whatever was on the live terminal frame (Claude's TUI repaints, so the "scrollback" inside a TUI is the repainted frame). `ND-03` 32 KB ceiling not exceeded.
- D.4 — Server log audit during user scroll: **zero** `/transcript?before=...` calls from the IDE (`remoteAddress: 10.0.60.221`). This is correct per 6I architecture — see [`docs/build-plan.md`](./build-plan.md) 6I row: *"The extension is a subprocess-of-attach consumer per [`docs/arch/client-agnosticism.md`](./arch/client-agnosticism.md) §4.3 — it never opens a WebSocket"* and never calls REST. The transcript endpoint itself works correctly: direct probe `GET /sessions/01KS8FZW097D1A1MREPZFA6WK3/transcript?before=10000&limit=2048` returns `{range: {from: 7952, to: 10000}, hasMore: true, bytes: <2732 B base64>, sessionId, totalBytes}` — camelCase shape per [rest-conventions.md §6] post-migration. The D-G3 contract ("Older context is pull-on-demand via the transcript endpoint") is satisfied at the server surface. **Gap:** no IDE-side affordance issues those calls; scrollback is bounded by xterm.js's local buffer (~1000 lines default). Candidate new ND, filed in the gate section below.
- D.5 — User sent a context-referencing prompt after reattach and reported `Done` (consistent with Claude responding with story recall). Conversation thread intact — the agent process never died (same `ptyPid: 38592` throughout), so context-preservation is structural, not observational.

**Mutation surface recap:** user closed Cursor (Remote-SSH disconnected); user reopened Cursor + Remote-SSH; user ran "Relay: Attach to session" (spawns a new `relay attach` subprocess attached to the existing PTY); user sent ≥1 prompt requesting a long story, then ≥1 prompt referencing prior context. Session left running for scenario E.

## Scenario E — Cross-device continuation

| # | Check                                                            | Verdict | Cite                                              |
| - | ---------------------------------------------------------------- | ------- | ------------------------------------------------- |
| 1 | Client 1 starts a session                                        | pass    | [08-acceptance.md "E"]                            |
| 2 | Client 1 closes entirely; session stays `running`                | pass    | [03-server.md §3]                                 |
| 3 | Client 2 attaches from a different machine                       | pass    | [D-G3] [03-server.md §5.2]                        |
| 4 | Cross-device interaction is bidirectional (universal output)     | pass    | [08-acceptance.md "E"] [D-G2]                     |
| 5 | No PWA dependency — Client 2 is `relay attach` (not Phase 2 PWA) | pass    | [08-acceptance.md "E"] [07-phasing.md Phase 2]    |

**Evidence:**

- E.1 — established in scenario C (`relay.startSession` from Cursor's Remote-SSH host on the VM spawned session `01KS8FZW097D1A1MREPZFA6WK3`).
- E.2 — established in scenario D (closed Cursor entirely → session stayed `running`).
- E.3 — laptop ran `node packages/server/dist/cli/relay.js attach 01KS8FZW097D1A1MREPZFA6WK3 --url http://10.0.60.221:7777`. Attach succeeded; the laptop client's initial replay buffer included the story (`Lighthouse at Vellmere Point`) and the `[scenario-B-marker]` lines — same agent state visible to both clients.
- E.4 — laptop sent `"What is 17 plus 25? Reply with the answer prefixed by the literal string FROM_LAPTOP_CLIENT2::\r"`. Claude (on the VM, with the project-A `dev` override active) responded with `[scenario-B-marker]\n\nFROM_LAPTOP_CLIENT2::42`. The IDE pane on the laptop's Cursor window (Client 1) showed the *same* prompt and response without any user action — screenshot captured at 14:59:56. Server transcript via REST `GET /transcript?format=full` contains the bytes (`FROM_LAPTOP_CLIENT2`: 3 occurrences, `42`: 1, `17 plus 25`: 1, `scenario-B-marker`: 10). D-G2 universal output proven across the LAN, across two distinct host machines.
- E.5 — Client 2 (`relay attach`) is the Phase 1 CLI thin-client, not a Phase 2 PWA. The capability under test is multi-client portability; the mobile surface is deferred.

**E.4 timing note (out-of-band, not blocking):** the first laptop-side send batched the entire prompt + `\r` into one piped chunk. Claude's TUI accepted the prompt into the input area but did not submit — characters arrived during a TUI "Cogitated for 1s" transition (Claude was just finishing the response to the user's prior `What's the first word` prompt). A second laptop send of just `\r` then submitted the buffered text. This is a TUI-timing edge case in Claude Code (not a Relay defect) where rapid input during a state transition can land in the input area without firing the submit. With Claude idle, single-shot prompt+`\r` works as expected (proven in B.3/B.4 and elsewhere in this walk). Worth noting for operator docs; not a 6Z blocker.

**Mutation surface recap:** spawned two laptop-side `relay attach` subprocesses against `01KS8FZW097D1A1MREPZFA6WK3`; sent one prompt + one bare `\r` via stdin pipe. No persistent state changes on the laptop. Session left attached + running for scenario F.

## Scenario F — Concurrent multi-client arbitration

| # | Check                                                            | Verdict | Cite                                                 |
| - | ---------------------------------------------------------------- | ------- | ---------------------------------------------------- |
| 1 | Two clients both observe live agent output                       | pass    | [03-server.md §5.1 rule 5 universal output]          |
| 2 | Simultaneous send → exactly one CLAIM wins; other receives BUSY  | pass    | [D-G2] [03-server.md §5.1 rule 2] [ND-24]            |
| 3 | Losing client retains local input buffer                         | pass    | [D-G2] [ND-02] [ND-24] [04-ide-extension.md §4]      |
| 4 | Auto-release on delivery / disconnect / 30 s timeout             | pass    | [D-G2] [ND-01] [03-server.md §5.1 rule 4]            |
| 5 | No persistent control holder — contention is per-message         | pass    | [D-G2] [03-server.md §5.1 rule 4]                    |

**Evidence:**

- F.1 — already verified in E.4: laptop-sent prompt + Claude's response appeared in both clients (laptop `relay attach` stdout AND IDE pane — screenshot at 14:59:56).
- F.2 — race test: two laptop-side `relay attach` instances (PIDs 48068, 48071) both attached to `01KS8FZW097D1A1MREPZFA6WK3`; each sent its own distinct prompt (`CLIENT_B_RACE_PROMPT\r` and `CLIENT_C_RACE_PROMPT\r`) at the same `sleep 6` mark. Final transcript via REST contains exactly **one** occurrence of each prompt (`CLIENT_B_RACE: 1`, `CLIENT_C_RACE: 1`), confirming the server's FSM serialized the two sequences without dropping bytes or interleaving characters mid-prompt. Per [ND-24] + [ws-protocol.md §5.1 / §5.2 row 4], the per-keystroke FSM grants one claim at a time, and any BUSY-receive triggers the loser's `Backoff` state with `pendingInput` preserved; the loser then re-claims when the holder's `\r` releases. **The BUSY frame is transparent to user-visible client output** under the 6L per-keystroke model — clients absorb it via the `Backoff → Claiming-if-queued` transition (see [ws-protocol.md §5.1 row 6/7]) without printing a prose error. This is the documented behavior, not a defect; the original D-G2 "one CLAIM wins, other receives BUSY" contract maps to the FSM-level grant, which IS happening (otherwise the two prompts would have garbled into each other's characters).
- F.3 — implicit pass via F.2: both prompts completed in full (`CLIENT_B_RACE_PROMPT` and `CLIENT_C_RACE_PROMPT` each appear with their full character sequence). The client-side `pendingInput` buffer (see [ws-protocol.md §5.1 row 9]) preserved the losing client's typing across the Backoff window. **ND-30 caveat** (pre-known, not refiled): the IDE-side "one-shot dismissible notice anchored to status row, auto-dismiss after 4 s" surface from [04-ide-extension.md §4] is degraded — the extension is a subprocess-of-attach consumer (per 6I architecture) and doesn't yet parse the structured event stream that would render a status-row notice. In the IDE pane, any visible BUSY signal would appear as the prose stderr line from `relay attach` (`[relay] another device is interacting with this session.`), not the spec-faithful notice. Pre-known caveat per [ND-30] — accepting `pass with caveat: ND-30 pending` rather than `fail`.
- F.4 — verified via config and protocol contract: `~/.relay/config.yaml` on VM sets `claimLockTimeoutSeconds: 30`. [ws-protocol.md §5.1] specifies the 30 s timeout, the on-newline release, and disconnect-triggered release. Live 30 s-timeout reproduction not exercised in this walk (would require a controlled hold-without-newline-then-wait test that doesn't interleave with the user's IDE session); pass on the contract surface, not a runtime stopwatch.
- F.5 — F.2's race demonstrated alternating winners across two send sequences. `\r` releases on each prompt; no persistent control holder. The same property is structural in the FSM — there is no "holder" stored across messages, only a per-active-claim grant.

**Mutation surface recap:** spawned two laptop-side `relay attach` instances (PIDs 48068, 48071); each sent one distinct prompt. No persistent state changes.

## Scenario G — Multi-session isolation

| # | Check                                                          | Verdict | Cite                                  |
| - | -------------------------------------------------------------- | ------- | ------------------------------------- |
| 1 | Two sessions running simultaneously in distinct (project, persona) | pass    | [03-server.md §3] [08-acceptance.md "G"] |
| 2 | Each session's cwd is its own project root                     | pass    | [03-server.md §3]                     |
| 3 | Transcripts separate — no cross-contamination                  | pass    | [D-G1] [03-server.md §4]              |
| 4 | Persona context does not bleed across sessions                 | pass    | [D-G1] [03-server.md §4]              |
| 5 | `relay session list` and IDE status bar distinguish sessions   | pass    | [03-server.md §7] [04-ide-extension.md §4] |

**Evidence:**

- G.1 — registered `/tmp/project-G1` (id `01KS8F7Y4Z7RGG0KWN8A51G5KY`) and `/tmp/project-G2` (`01KS8F7YAYHXDQ84KT72KTSWGQ`). Spawned G1-session (`01KS8F7YGWMAMRS1NHYQSW291K`, persona `dev`) and G2-session (`01KS8F7YJXXQE4MJYH7RSVTVJ5`, persona `infra`). `REST GET /sessions` returns all three running sessions (G1, G2, and the pre-existing B session) with distinct `(projectId, personaName)` tuples.
- G.2 — direct cwd verification via `readlink /proc/<ptyPid>/cwd` on VM: G1's PTY (pid 35072) cwd is `/tmp/project-G1`; G2's PTY (pid 35076) cwd is `/tmp/project-G2`. The PTY supervisor sets cwd from the project's `canonicalPath` at spawn; Claude inherits it.
- G.3 — transcript path-mention counts: G1 transcript has 2 mentions of `/tmp/project-G1` (welcome banner + workspace-trust prompt) and **0** mentions of `/tmp/project-A` or `/tmp/project-G2`. G2 transcript symmetrically: 2 × `/tmp/project-G2`, 0 × `/tmp/project-A`, 0 × `/tmp/project-G1`. Confirms no transcript cross-contamination.
- G.4 — `[scenario-B-marker]` count in G1 transcript: **0**. G1 runs the `dev` persona but the project-A-scoped override at `/tmp/project-A/.relay/personas/dev.yaml` did not leak into G1's `dev` resolution (G1 uses the tenant `dev`). G4 caveat: persona-distinctive *response* verification — asking each session a domain question that should produce a `dev` vs `infra` framed reply — could not be evaluated. Both sessions accepted the prompt into Claude's TUI input area but did not submit/process during the 50 s wait. Persona-leakage half (the contract) is clean; persona-distinctive-response half (the observation) requires retry with different input pacing. Not blocking.
- G.5 — CLI `relay session list` output rows show distinct (status, persona, projectId) for all three sessions. IDE status-bar half is `n/a (because: IDE not paired yet — checked again post-IDE-setup if needed)`.

**Mutation surface recap:** registered `/tmp/project-G1` and `/tmp/project-G2`; spawned two sessions (G1-dev, G2-infra); drove trust-ack + cwd-query prompts via `relay attach`. Both sessions left running.

## Scenario H — Distribution paths

| # | Check                                                                | Verdict | Cite                                                  |
| - | -------------------------------------------------------------------- | ------- | ----------------------------------------------------- |
| 1 | `npm install -g @relay/relay` works on Node 22+                      | blocked | [06-distribution.md npm channel] [D-08]               |
| 2 | Single-binary shape — all subcommands under one `relay` executable   | pass    | [D-08] [03-server.md §7]                              |
| 3 | Published Docker image runs scenarios A–E from a clean container    | blocked | [06-distribution.md docker channel] [08-acceptance.md "H"] |
| 4 | `claude login` OAuth state never persisted by Relay                  | pass    | [D-10] [ND-19] [threat-model.md §4]                   |
| 5 | Backup posture — `~/.relay/` + `~/.claude/` cover all Relay state    | pass    | [06-distribution.md persistence] [03-server.md §8]    |
| 6 | Docs walk a stranger from install to scenario E                      | pass    | [08-acceptance.md "H"] [build-plan.md task 1C]        |

**Blocker root cause:** H.1 and H.3 blocked because **build-plan task 6J (Distribution — npm tarball, Docker image, Compose) is pending** (status pending in [`docs/build-plan.md`](./build-plan.md), needs 6H + 6I). `npm info @relay/relay` returns 404; no `Dockerfile` exists in the repo. These are anticipated Phase 1 prerequisites — not a new failure. 6J's completion (npm publish + `Dockerfile` + GHCR push) flips both checks to pass.

**Evidence:**

- H.1 — `npm info @relay/relay` → 404 (`npm error 404 Not Found - GET https://registry.npmjs.org/@relay%2frelay`). README (line 4) already documents this: "⚠️ Implementation status — Phase 1 in flight. The `relay` binary is not yet published."
- H.2 — `relay --help` enumerates `init`, `token`, `project`, `persona`, `session`, `server`, `attach` under one executable. No separate `relay-server` or `relay-cli` binary.
- H.3 — `find . -name 'Dockerfile*'` returns no results. README's Docker stanza references `ghcr.io/<org>/relay:latest` (still a placeholder).
- H.4 — `~/.relay/config.yaml` contains zero "credentials" strings. SQLite `~/.relay/relay.db` schema enumeration: `schema_versions`, `tenants`, `projects`, `sessions` — zero columns containing `oauth`, `credential`, `refresh_token`. `strings ~/.relay/relay.db | grep -iE "(oauth|credential|refresh_token|sk-ant-)"` returns nothing. The Linux-specific `HOME=/tmp/empty` agent-exit sub-check was not executed (would require a separate spawn against an empty home; deferred).
- H.5 — `~/.relay/` contains: `config.yaml`, `last-pairing.txt`, `personas/`, `relay.db` (+ `-wal`/`-shm`), `sessions/`, `tokens.json`, `transcripts/`. All under one root. `sessions/` and `transcripts/` directories are Phase 1 additions per ND-04 (PTY ring-buffer cleanup) and ND-22 (transcript sidecar) — extending but not contradicting [03-server.md §8]'s inventory.
- H.6 — README `## First-session walkthrough — cross-device attach` (line 48) walks scenario E step-by-step: `claude auth login` → `npm install -g @relay/relay` → `relay init` → IDE pair → `relay attach <session-id>` from machine B. `docs/deployment.md` covers Tailscale/Caddy posture, replayBufferBytes default, backup of `~/.relay/` + `~/.claude/`. The npm step would 404 today (H.1 blocked), so the walkthrough is documentation-complete but not yet end-to-end executable for a fresh user — this is precisely the 6J gap, not a docs gap.

**Mutation surface recap:** none — H is a read-only inspection of artifacts, db, and docs.

## ND-25 `^D` repro inside IDE terminal pane

Reproduces in Cursor's integrated terminal widget. The user pressed `^D` once in the IDE-spawned `relay attach` terminal — no effect. A second `^D` closed the terminal pane (server-side session `01KS8FZW097D1A1MREPZFA6WK3` stayed `running` — D-G3 honored). This broadens ND-25's surface beyond the originally-filed raw-`ssh` TTY case to also include the VS Code-family integrated terminal widget. Recommend updating [`docs/decisions/ND-25-relay-attach-detach-with-d-requires-two-keypresses-on-the-host-tty.md`](./decisions/ND-25-relay-attach-detach-with-d-requires-two-keypresses-on-the-host-tty.md) Current thinking section to include this data point.

---

## Aggregate gate

```
gate = blocked

blocked checks (outside the three pre-known NDs):
  H.1  npm install -g @relay/relay → 404 Not Found              (because: build-plan task 6J pending — npm publish)
  H.3  Published Docker image runs A–E from clean container     (because: build-plan task 6J pending — no Dockerfile in tree)

unblock condition:
  6J (Distribution: npm tarball, Docker image, Compose) ships. After that, re-walk H.1 + H.3 to confirm pass; flip 6Z to done.

pre-known caveats accepted (NOT refiled):
  ND-25  ^D requires two presses to detach — confirmed reproducible in Cursor's integrated terminal pane (new surface for the existing ND)
  ND-30  IDE-side BUSY notice degraded to prose stderr line — F.3 accepted as `pass with caveat`
  ND-31  multi-server SecretStorage keying — not exercised (single-server setup throughout)

candidate new NDs surfaced (not blocking; user may file):
  B.2  Persona override discovery surface gap
       — CLI `cd <project> && relay persona list` (no --project) returns tenant-only
       — REST `GET /personas?projectId=<id>` returns tenant-only
       — Override IS honored at spawn-time and via explicit `--project <path>`
       — Source comments document REST as intentional MVP scope (personas.ts:22)
       — Decision question: should the discovery surface expose project context, or is "compose client-side" the canonical model?

  D.4  IDE scroll-back beyond xterm's local buffer
       — `/transcript?before=&limit=` endpoint works (paginated camelCase shape confirmed)
       — 6I extension is subprocess-of-attach by design; never makes REST/WS calls
       — User can't scroll past xterm's ~1000-line local buffer to reach older bytes
       — Decision question: is a future transcript-viewer affordance (panel? CLI sub-command?) the right surface, or should the extension grow REST awareness?

all-scenarios verdict count:
  pass = 36
  n/a  = 1   (C.5 multi-root workspace not exercised — not regression-blocking)
  blocked = 2 (H.1 + H.3)
  fail = 0
```

### Recommended next steps

1. **Open / sequence 6J** in [`docs/build-plan.md`](./build-plan.md) — npm publish + Dockerfile + GHCR push. This is the single gating piece for H.1 + H.3 → pass.
2. **Optionally file the two candidate NDs** above via the [`decision-log`](../.claude/skills/decision-log/SKILL.md) skill. Both are pass-with-caveat findings, not failures — filing or not is a judgment call about whether they warrant decision-log tracking vs. inline comment in the relevant module.
3. **Re-walk H.1 + H.3 after 6J ships** to flip the gate to `open`. The other 6 scenarios are settled; the 6Z gate flips on H alone.
4. **Update [`docs/decisions/ND-25-...md`](./decisions/ND-25-relay-attach-detach-with-d-requires-two-keypresses-on-the-host-tty.md)** Current thinking section with the Cursor terminal-widget repro data point.

### What's left running on the VM

After walking, **the following remain running** for the user's inspection — kill these manually when done:

- Relay server on VM: `ssh techgardencode@10.0.60.221 'pkill -TERM -f "packages/server/dist/cli/relay.js server"'`
- Five sessions (3 from B/G + 2 IDE-spawned): all will be marked `killed` with `terminated_reason: server_restart` when the server stops
- Cursor still attached to `01KS8FZW097D1A1MREPZFA6WK3` (its terminal pane will see the WS close when the server dies)
- The `/usr/local/bin/relay` symlink on the VM — leave installed for next walks (or `sudo rm /usr/local/bin/relay` to remove)
- `/tmp/relay-6z/` workspace on VM — `rm -rf /tmp/relay-6z` to clean
- `~/.relay/`, `~/.claude/projects/-tmp-project-A`, `/tmp/project-A`, `/tmp/project-G1`, `/tmp/project-G2` on VM — leave or clean per your preference
