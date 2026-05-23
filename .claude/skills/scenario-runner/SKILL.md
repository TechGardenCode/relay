---
name: scenario-runner
description: Walk Relay's Phase 1 acceptance scenarios A–H from docs/prd/08-acceptance.md as a citation-bearing checklist — one scenario per invocation, each check emits pass/fail/blocked with a D-NN/ND-NN or subdoc-section citation, never mutates persisted records (the user runs writes, the skill verifies). Trigger when the user says "run scenario X", "verify scenario X", "check Phase 1 acceptance", or hands a bare letter A–H. Useful from Phase 0 onward; gracefully reports blocked when the relay binary or REST/WS surface isn't implemented yet.
---

# Relay scenario-runner skill

The eight scenarios in [`docs/prd/08-acceptance.md`](../../../docs/prd/08-acceptance.md) collectively define Phase 1's Definition of Done. This skill encodes the verification walk for each one as a concrete, citation-bearing checklist, so a verifier (Claude or human) doesn't re-derive "what does pass mean here" from prose every time.

The skill is **read-only against the running system**. It may spawn sessions, attach to them, kill them — those are transient state. It never runs `relay project add`, `relay persona create`, `relay token create`, etc. itself. Where a scenario inherently requires a mutating action, the skill walks the user through the action (`USER:` step) and then verifies the result (`VERIFY:` step). This boundary makes the skill safe to invoke against a live homelab without worrying about side effects.

## When to invoke

Trigger phrases:

- "run scenario X" / "verify scenario X" / "check scenario X" — where X is `A`, `B`, `C`, `D`, `E`, `F`, `G`, or `H`
- "check Phase 1 acceptance" — surfaces an interactive scenario picker (does **not** run all eight non-stop; that's a deferred CI-mode deliverable)
- A bare letter `A`–`H` in a context where a scenario is implied

When triggered without a letter, prompt the user to pick one rather than guessing.

## Inputs the skill reads first

Read these before walking any scenario; the scenario walks cite specific sections of each:

- [`docs/prd/08-acceptance.md`](../../../docs/prd/08-acceptance.md) — source of truth for the scenarios.
- [`docs/prd/07-phasing.md`](../../../docs/prd/07-phasing.md) — Phase 0 vs Phase 1 gating context. Phase 0 (one-weekend spike) exercises a subset of D and E; the A–G bar is the Phase 1 ship gate (scenario H / distribution is deferred to post-2.0 / Track 8 per [[d-16-phase-1-ships-without-distribution]] — the skill still walks H on request for Track 8 verification).
- [`docs/prd/03-server.md`](../../../docs/prd/03-server.md) — REST/WS contracts the per-check verdicts test (especially §2 API surface, §3 state, §4 persona application, §5.1 input arbitration, §5.2 reattach, §6 auth, §7 CLI).
- [`docs/prd/04-ide-extension.md`](../../../docs/prd/04-ide-extension.md) — IDE extension contract for scenarios C and the BUSY UX in F.
- [`docs/prd/06-distribution.md`](../../../docs/prd/06-distribution.md) — packaging and distribution for scenario H.
- [`docs/prd/09-persona-schema.md`](../../../docs/prd/09-persona-schema.md) — persona YAML schema for scenario B.
- [`docs/arch/rest-conventions.md`](../../../docs/arch/rest-conventions.md) — error envelope, status-code matrix, and the pending snake_case → camelCase migration in the `03-server.md` §2 transcript example. Scenarios D and E that touch transcript-shape checks must tolerate the snake_case form until the propagation lands.
- [`../../../docs/decisions/index.md`](../../../docs/decisions/index.md) — anchor for `D-NN` / `ND-NN` citations in the per-check lines.

## Phase-gate map

| Scenario | What it gates                                   | Load-bearing decisions            |
| -------- | ----------------------------------------------- | --------------------------------- |
| A        | Phase 1 ship                                    | [D-11], [D-12]                    |
| B        | Phase 1 ship                                    | [D-09], [D-10], [D-G1]            |
| C        | Phase 1 ship                                    | [D-G6], [ND-05], [ND-06], [ND-07] |
| D        | **Phase 0 → Phase 1** (subset) and Phase 1 ship | [D-G3], [ND-03]                   |
| E        | **Phase 0 → Phase 1** (subset) and Phase 1 ship | [D-G3], [ND-03]                   |
| F        | Phase 1 ship                                    | [D-G2], [ND-01], [ND-02]          |
| G        | Phase 1 ship                                    | [D-G1] (isolation guarantee)      |
| H        | Phase 1 ship                                    | [D-08]                            |

Scenarios D and E are the only ones the Phase 0 spike exercises in any form. The Phase 0 bullets in `07-phasing.md` are coarser than the Phase 1 contracts in those scenarios — Phase 0 only requires that bi-directional input is mechanically possible (no full claim arbitration) and that reattach works (no specific replay-buffer size). When the skill is run during Phase 0, treat the Phase 1-only check details as `blocked (because: not in Phase 0 scope)` rather than `fail`.

## Verdict vocabulary

Each check emits exactly one verdict:

- `pass` — the observed state matches the contract.
- `fail` — the observed state contradicts the contract. Always include a `because:` reason naming the contradiction.
- `blocked` — the check could not be evaluated. Always include a `because:` reason: `relay binary not on PATH`, `endpoint returns 501`, `not in Phase 0 scope`, `precondition not satisfied (project not registered)`, etc.
- `n/a` — the check is out of scope for the current phase or environment (e.g., scenario H's clean-install verification on a host that already has Relay installed).

Never emit a verdict without a `because:` reason for non-`pass`. The reason is what makes the report actionable.

## Three-layer check model

The skill walks three layers in order. A failure at one layer short-circuits the layers below.

### Layer 1 — Capability preflight (skill-wide, runs once per invocation)

Detects whether the verifier has the capability to even evaluate the scenarios. Run before any scenario walk.

| Check                              | How                                                                                                                                                            | If blocked                                       |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `relay` binary on PATH             | `CMD: command -v relay`                                                                                                                                        | Short-circuit every scenario to `blocked`.       |
| Server reachable at configured URL | `CMD: curl -sf -o /dev/null -w "%{http_code}" $RELAY_URL/healthz` (or whatever health route exists; if no `/healthz`, `GET /tenants/self` with token suffices) | Short-circuit; surface "start the server first." |
| Bearer token loadable              | Look for `RELAY_TOKEN` env var or pairing snippet in `~/.relay/last-pairing.txt`                                                                               | Short-circuit; point at `relay init` output.     |

If preflight passes, proceed. If anything blocks, emit one consolidated `blocked` verdict naming all missing capabilities and stop. Don't pretend to walk a scenario you can't observe.

### Layer 2 — Scenario preconditions (per scenario, before its checks)

Some scenarios need state that prior scenarios establish (a registered project for B/C/G, a running session for D/F, a second client device for E/F). Each scenario lists its preconditions explicitly. A failed precondition prompts the user to satisfy it (`USER:` step in the scenario walk) rather than auto-failing the scenario — preconditions are setup, not contract conformance.

### Layer 3 — Per-check verdicts

The per-check walk inside each scenario. Each check produces one verdict line.

## Read-only discipline

The skill verifies; the user mutates. Every check is one of:

| Prefix    | Meaning                                                                                                                                                                                                                 |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CMD:`    | A shell command the **skill** runs to read state. Must not mutate persisted records (allowed: read, list, status, attach, kill of a session the skill spawned).                                                         |
| `REST:`   | An HTTP request the skill issues. `GET` only, with one exception: `POST /sessions` (spawn) and `DELETE /sessions/:id` (kill) are allowed because session lifecycle is transient and the skill cleans up its own spawns. |
| `WS:`     | A WebSocket frame to observe (or send, for sessions the skill itself spawned).                                                                                                                                          |
| `FILE:`   | A filesystem path to inspect (read-only).                                                                                                                                                                               |
| `SPAWN:`  | The skill spawns a fresh session via `POST /sessions` for the duration of the scenario walk. The skill kills it before exiting.                                                                                         |
| `USER:`   | A mutating action the **user** runs (`relay project add`, `relay persona create`, `relay token create`, IDE click). The skill displays the exact command and waits for the user to confirm completion.                  |
| `VERIFY:` | An observation that follows a `USER:` step or a previous check, asserting that the contract was upheld.                                                                                                                 |

If a scenario can't be walked without the skill mutating persisted records, that's a bug in the skill design — flag it, don't relax the boundary.

## Output format

For each check:

```
<n>. <short check title>
   <action prefix>: <action>
   Expected: <expected outcome>
   Cite: [<D-NN>] [<subdoc.md §X>]
   Verdict: <pass | fail | blocked | n/a> (because: <reason if not pass>)
```

At the end of each scenario, emit a markdown summary table:

```
| # | Check                       | Verdict | Cite                |
| - | --------------------------- | ------- | ------------------- |
| 1 | Bearer token issued         | pass    | [03-server.md §6]   |
| 2 | Project marker file present | fail    | [04-ide-extension.md §4] |
| ...
```

Then a one-line **Mutation surface recap**: list every `USER:` action the walk asked for, so the user can clean up if needed. Empty if the scenario was pure read.

---

## Scenarios

### A — Server bring-up and project registration

- **Source:** [`08-acceptance.md` "A — Server bring-up and project registration"](../../../docs/prd/08-acceptance.md); contract in [`03-server.md` §2, §3, §7](../../../docs/prd/03-server.md).
- **Decisions:** [D-11], [D-12], [D-13].
- **Mutation surface:** `USER:` runs `relay init` (writes `~/.relay/config.yaml`, `~/.relay/tokens.json`, default personas) and `relay project add <path>` (writes `<path>/.relay/project.json`, appends to `<path>/.gitignore`). Skill itself writes nothing.
- **Related:** B, C, G all assume A's preconditions (a registered project) hold.
- **Preconditions:** none — A is the bootstrap scenario. If state already exists from a prior run, walk the verification steps against the existing state and skip the `USER:` setup steps.
- **Phase gate:** Phase 1 ship.

**Checks:**

1. `relay init` produces a usable bearer token and config.
   - `USER:` if not already initialized, run `relay init` on a fresh `~/.relay/` (move it aside first).
   - `VERIFY:` `FILE: ~/.relay/config.yaml` exists. `FILE: ~/.relay/tokens.json` exists with at least one entry. `FILE: ~/.relay/last-pairing.txt` contains a `relay://pair?url=…&token=…` deep link.
   - `Cite: [03-server.md §6] [D-13]`

2. Default personas scaffolded.
   - `CMD: ls ~/.relay/personas/`
   - `Expected:` seven YAML files present: `product`, `design`, `dev`, `test`, `infra`, `architect`, `review`.
   - `Cite: [03-server.md §7] [07-phasing.md Phase 1 deliverables]`

3. Bearer token authenticates against the server.
   - `REST: GET /tenants/self` with `Authorization: Bearer <token>`.
   - `Expected:` `200 OK` with a tenant object.
   - `Cite: [03-server.md §2] [03-server.md §6]`

4. `relay project add` registers a project in place.
   - `USER:` run `relay project add <path>` against a directory the user picks.
   - `VERIFY:` `FILE: <path>/.relay/project.json` exists with `schemaVersion`, `projectId`, optional `serverUrl`, optional `displayName`.
   - `VERIFY:` `<path>/.gitignore` contains a line `.relay/project.json`.
   - `VERIFY:` `CMD: relay project list` shows the new project with the canonicalized path.
   - `VERIFY:` `REST: GET /projects` returns the project; the row's `canonicalPath` matches `realpath <path>`.
   - `Cite: [D-12] [03-server.md §7] [04-ide-extension.md §4]`

5. Re-registering the same path is a `409 Conflict`.
   - `USER:` re-run `relay project add <path>` for the same `<path>`.
   - `VERIFY:` exits non-zero; the server response is `409` with a `application/problem+json` body whose `type` slug names a path-collision.
   - `Cite: [D-12] [rest-conventions.md §3]`

6. Server stop/restart preserves project list, personas, and tokens.
   - `USER:` stop the `relay server` process (Ctrl-C or `kill`); restart it.
   - `VERIFY:` `CMD: relay project list` and `REST: GET /personas` and `REST: GET /tenants/self` all return the same data they returned before the restart.
   - `Cite: [03-server.md §3] [D-11]`

7. Sessions running at restart appear as `killed` with the right `terminated_reason`.
   - `SPAWN:` `POST /sessions` to start one before the restart.
   - `USER:` perform the restart from check 6 (or re-run a fresh restart for this check).
   - `VERIFY:` `CMD: relay session list --status killed` shows the spawned session with `terminated_reason: server_restart` (snake_case enum value per [rest-conventions.md §6]). `agent_session_id` and transcript metadata are present. No auto-relaunch occurred.
   - `Cite: [D-11] [03-server.md §3]`

---

### B — Persona × project composition is real

- **Source:** [`08-acceptance.md` "B — Persona × project composition is real"](../../../docs/prd/08-acceptance.md); contract in [`03-server.md` §4](../../../docs/prd/03-server.md), schema in [`09-persona-schema.md`](../../../docs/prd/09-persona-schema.md).
- **Decisions:** [D-09], [D-10], [D-G1].
- **Mutation surface:** `USER:` writes a project-level persona override at `<project>/.relay/personas/<name>.yaml`. Skill spawns and kills a session.
- **Related:** A (project registered), G (isolation guarantee).
- **Preconditions:** A passed. At least one project registered. Either `claude login` has been run on the host that launches `relay server` (the ND-19 default — Keychain on macOS, `~/.claude/.credentials.json` on Linux) or `ANTHROPIC_API_KEY` is set in that shell's environment. Without one of these, the spawned agent exits immediately and downstream marker assertions are `blocked` rather than `fail`.
- **Phase gate:** Phase 1 ship.

**Checks:**

1. Default persona set is enumerable via CLI and REST.
   - `CMD: relay persona list`
   - `REST: GET /personas`
   - `Expected:` both list the seven defaults, identical sets.
   - `Cite: [03-server.md §2] [03-server.md §7]`

2. Project-level override resolves correctly.
   - `USER:` author `<project>/.relay/personas/dev.yaml` with a deliberately distinct `systemPrompt` (e.g. begins "You are a TEST PROJECT-LEVEL DEV persona; always start your first response with the literal string `[scenario-B-marker]`.").
   - `VERIFY:` `CMD: cd <project> && relay persona list` shows the project override winning over the tenant default for `dev`.
   - `VERIFY:` `REST: GET /personas` (with project context) returns the project override, not the tenant default.
   - `Cite: [D-09] [03-server.md §4]`

3. Persona behavior is observable, not just file-read. **The PRD is unusually prescriptive here — make this its own check, not a sub-bullet.**
   - `SPAWN:` `POST /sessions` with `personaName: dev` against the project from check 2.
   - `WS:` attach to `/sessions/:id/stream` and read the agent's first response.
   - `VERIFY:` the response begins with `[scenario-B-marker]` (or whatever distinctive token was put in the override). If the marker is missing, the persona was not actually applied — `fail (because: persona file present but agent behavior matches default, not override)`.
   - **Alternate evidence:** `REST: GET /sessions/:id/transcript?format=full` and grep for the marker in the captured PTY bytes.
   - `Cite: [D-G1] [08-acceptance.md "B"]`

4. Persona lifetime persists across agent-internal transitions.
   - `USER:` interact with the session long enough to trigger compaction (or invoke `/clear` followed by a new prompt that should still reflect the persona).
   - `VERIFY:` post-transition responses still reflect the persona's mode of work (or still emit the marker if the override forces it).
   - `Cite: [D-G1] [03-server.md §4 lifetime guarantee]`

---

### C — Single-client session lifecycle

- **Source:** [`08-acceptance.md` "C — Single-client session lifecycle"](../../../docs/prd/08-acceptance.md); contract in [`04-ide-extension.md` §3, §4](../../../docs/prd/04-ide-extension.md).
- **Decisions:** [D-G6], [ND-05], [ND-06], [ND-07], [D-13].
- **Mutation surface:** `USER:` installs the `.vsix`, runs the "Connect to server" command, opens a workspace, runs the "Start session" command. Skill verifies, does not click.
- **Related:** A (project registered), B (persona resolves).
- **Preconditions:** A and B passed. Cursor / VS Code installed; Remote-SSH connection to a host running `relay server`. The `.vsix` extension built and available (or installed via OpenVSX).
- **Phase gate:** Phase 1 ship.

**Checks:**

1. Extension installs in a Remote-SSH'd Cursor.
   - `USER:` connect Cursor to the remote host via Remote-SSH; install the `.vsix` from GitHub Releases.
   - `VERIFY:` extension shows in the Remote-SSH side's installed extensions list (workspace extension, not local).
   - `Cite: [04-ide-extension.md §3]`

2. First-run pairing flow accepts the deep link.
   - `USER:` invoke "Relay: Connect to server" command palette entry; paste the `relay://pair?url=…&token=…` from `~/.relay/last-pairing.txt`.
   - `VERIFY:` extension reports successful connection; the URL and token land in VS Code's secret storage.
   - `Cite: [04-ide-extension.md §4] [03-server.md §6] [D-13]`

3. Extension auto-binds the open workspace to a registered project.
   - `USER:` open the project root from scenario A in Cursor.
   - `VERIFY:` extension reads `<project>/.relay/project.json` and binds without prompting (marker is authoritative). Status bar shows the project name.
   - `Cite: [D-G6] [ND-07] [04-ide-extension.md §4 marker file]`

4. "Start session" spawns an interactive agent terminal.
   - `USER:` invoke "Relay: Start session in current project"; pick a persona from the quick-pick.
   - `VERIFY:` a new editor terminal opens running `relay attach <session-id>`; the agent prompt is interactive (typing produces a response).
   - `VERIFY:` `REST: GET /sessions` shows the new session with `status: running`.
   - `Cite: [04-ide-extension.md §4 start session]`

5. Multi-root workspace status-bar follows focus.
   - `USER:` (only if a multi-root workspace is available) open a workspace with two registered roots; switch focus between editors in each root.
   - `VERIFY:` status-bar item swaps to reflect the focused root's bound project.
   - `Cite: [ND-05] [04-ide-extension.md §4 multi-root]`
   - If no multi-root workspace handy: `n/a (because: no multi-root workspace available; not regression-blocking)`.

---

### D — Session survives client disconnect

- **Source:** [`08-acceptance.md` "D — Session survives client disconnect"](../../../docs/prd/08-acceptance.md); contract in [`03-server.md` §5.2](../../../docs/prd/03-server.md).
- **Decisions:** [D-G3], [ND-03].
- **Mutation surface:** none from the skill. `USER:` closes and reopens the IDE.
- **Related:** C (a session exists to disconnect from), E (cross-device variant of the same contract).
- **Preconditions:** C passed (a running session in an open IDE). Phase 0: the `claude` PTY process spawns and a `relay attach` thin client can connect.
- **Phase gate:** **Phase 0 → Phase 1** (subset: reattach mechanically works) and Phase 1 ship (full replay-buffer contract).

**Checks:**

1. Closing the IDE leaves the session running.
   - `USER:` close the IDE entirely (kill the window, not just the terminal).
   - `VERIFY:` `CMD: relay session list` shows the session still as `status: running`.
   - `Cite: [08-acceptance.md "D"] [03-server.md §3]`

2. Reattach delivers live PTY output immediately.
   - `USER:` reopen the IDE; invoke "Relay: Attach to session" and pick the running session.
   - `VERIFY:` PTY bytes begin streaming on the WebSocket immediately; there is no preceding "loading history" phase that blocks live bytes.
   - `Cite: [D-G3] [03-server.md §5.2 rule 1]`

3. Initial replay is roughly one terminal viewport.
   - `VERIFY:` the bytes that arrive ahead of the live cursor amount to ~32 KB by default ([ND-03]). Configurable via `replayBufferBytes` in `~/.relay/config.yaml`. Phase 0: any non-zero replay is acceptable (`blocked (because: not in Phase 0 scope)` for the size assertion).
   - `Cite: [ND-03] [03-server.md §5.2 rule 2]`

4. Older context is pull-on-demand via the transcript endpoint.
   - `USER:` scroll back in the IDE terminal beyond the replay.
   - `REST:` observe the IDE issuing `GET /sessions/:id/transcript?before=<offset>&limit=<n>` requests.
   - `VERIFY:` responses match the §2 framing: `range.from` inclusive, `range.to` exclusive, `bytes` base64, `has_more` boolean. **Tolerate `snake_case` field names** (`session_id`, `total_bytes`, `has_more`) per the pending camelCase migration in [rest-conventions.md §6]; emit `pass` on the snake_case form with a note.
   - `Cite: [D-G3] [03-server.md §5.2 rule 3] [03-server.md §2 paginated read] [rest-conventions.md §6 known inconsistency]`

5. Conversation context is preserved across the reattach.
   - `USER:` send a prompt referencing something said before the disconnect.
   - `VERIFY:` agent's response demonstrates retained context (this is observational; the PTY transcript is the same one — the agent process never died).
   - `Cite: [08-acceptance.md "D"] [D-G3]`

---

### E — Cross-device continuation (headline pain A)

- **Source:** [`08-acceptance.md` "E — Cross-device continuation (headline pain A)"](../../../docs/prd/08-acceptance.md); contract in [`03-server.md` §5.2](../../../docs/prd/03-server.md).
- **Decisions:** [D-G3], [ND-03].
- **Mutation surface:** none from the skill. `USER:` closes Client 1 and attaches from Client 2 (a different machine, a different editor instance, or a plain `relay attach` from an SSH terminal).
- **Related:** D (same reattach contract, single-machine case), C (session origin).
- **Preconditions:** D passed. **A second machine on the same network as the Relay server, OR a different editor instance, OR an SSH session into the host.** Phase 0: the second machine must really be a _different_ machine — same-host multi-attach proves much less than cross-host; this is the load-bearing test.
- **Phase gate:** **Phase 0 → Phase 1** (the cross-device half is what the spike validates) and Phase 1 ship.

**Checks:**

1. Client 1 starts a session.
   - `USER:` start a session from Client 1 (e.g., Cursor on the laptop via Remote-SSH).
   - `VERIFY:` session is `status: running`.
   - `Cite: [08-acceptance.md "E"]`

2. Client 1 closes entirely.
   - `USER:` close Client 1.
   - `VERIFY:` `CMD: relay session list` (run from anywhere with valid token) shows the session still `running`.
   - `Cite: [03-server.md §3]`

3. Client 2 attaches from a different machine.
   - `USER:` from a second machine, run `relay attach <session-id>` (or open the IDE and attach there).
   - `VERIFY:` attach succeeds; PTY bytes stream immediately. Same reattach contract as D.3 — initial replay sized to roughly one viewport, deeper history pull-on-demand.
   - `Cite: [D-G3] [03-server.md §5.2]`

4. Cross-device interaction is bidirectional.
   - `USER:` send a prompt from Client 2; observe the agent response.
   - `VERIFY:` the response arrives on Client 2's terminal; `REST: GET /sessions/:id/transcript` shows the input and response in the captured bytes.
   - `Cite: [08-acceptance.md "E"]`

5. No PWA dependency.
   - `VERIFY:` Client 2 in the walk above is not a PWA. The multi-client _capability_ is what's tested; the mobile client is the Phase 2 surface.
   - `Cite: [08-acceptance.md "E"] [07-phasing.md Phase 2]`

---

### F — Concurrent multi-client attach

- **Source:** [`08-acceptance.md` "F — Concurrent multi-client attach"](../../../docs/prd/08-acceptance.md); contract in [`03-server.md` §5.1](../../../docs/prd/03-server.md).
- **Decisions:** [D-G2], [ND-01], [ND-02].
- **Mutation surface:** none from the skill (uses an existing session or one the skill spawns + kills).
- **Related:** D, E (multi-attach baseline). G (a separate session demonstrates per-session isolation of the claim lock).
- **Preconditions:** D passed. Two clients (any combination of IDE, `relay attach`, or future PWA) attached simultaneously.
- **Phase gate:** Phase 1 ship. Phase 0 only requires that bi-directional input is mechanically possible — full claim arbitration is `blocked (because: not in Phase 0 scope)` for checks 2–5.

**Checks:**

1. Two clients both observe live agent output.
   - `USER:` attach from Client 1 (e.g., IDE) and Client 2 (e.g., `relay attach` in a terminal) to the same session.
   - `USER:` send any prompt from Client 1.
   - `VERIFY:` both Client 1 and Client 2 see the agent's response stream.
   - `Cite: [03-server.md §5.1 rule 5 universal output]`

2. Simultaneous send: exactly one CLAIM wins, the other receives BUSY.
   - `USER:` race a `SEND` from each client (type into both, hit Enter as close to simultaneously as you can).
   - `WS:` observe one client's WebSocket frame sequence include `CLAIM` → `SEND` → server `ACK`; the other's `CLAIM` returns a `BUSY` frame.
   - `Cite: [D-G2] [03-server.md §5.1 rule 2]`

3. Losing client retains its local input buffer.
   - `VERIFY:` on the BUSY-rejected client, the user's typed text is still present in the input area; nothing was lost.
   - `VERIFY:` (IDE only) a one-shot dismissible notice appears anchored to the terminal's status row, auto-dismisses after ~4 seconds. No global toast.
   - `Cite: [D-G2] [ND-02] [04-ide-extension.md §4 BUSY-on-input UX]`

4. Auto-release on delivery / disconnect / 30-s timeout.
   - `USER:` after a BUSY, wait until the holder's message delivers; observe that the previously-rejected client can now `CLAIM` and `SEND`.
   - `USER:` separately, hold a CLAIM open without sending; observe auto-release after 30 seconds (or the configured `claimLockTimeoutSeconds`).
   - `Cite: [D-G2] [ND-01] [03-server.md §5.1 rule 4]`

5. No persistent control holder.
   - `USER:` send three messages in sequence, deliberately racing each from alternating clients.
   - `VERIFY:` either client can be the winner on any given message; there is no "control holder" that persists across messages.
   - `Cite: [D-G2] [03-server.md §5.1 rule 4 contention is per-message]`

---

### G — Multiple concurrent sessions across personas/projects (headline pain B)

- **Source:** [`08-acceptance.md` "G — Multiple concurrent sessions across personas/projects (headline pain B)"](../../../docs/prd/08-acceptance.md); contract in [`03-server.md` §3, §4](../../../docs/prd/03-server.md).
- **Decisions:** [D-G1] (isolation guarantee).
- **Mutation surface:** skill spawns two sessions and kills both.
- **Related:** A (two registered projects), B (two personas), C (one IDE-driven session).
- **Preconditions:** A and B passed. Two registered projects (or one project + two personas).
- **Phase gate:** Phase 1 ship.

**Checks:**

1. Two sessions run simultaneously in different (project, persona) pairs.
   - `SPAWN:` `POST /sessions` for `(projectA, personaX)` and `(projectB, personaY)`.
   - `VERIFY:` `CMD: relay session list` shows both as `running`; `REST: GET /sessions` returns both with distinct `projectId` and `personaName` fields.
   - `Cite: [03-server.md §3] [08-acceptance.md "G"]`

2. Each session's working directory is its own project root.
   - `USER:` ask each session "what is your current working directory?" (or send `CMD: pwd` if the agent will execute it).
   - `VERIFY:` Session 1 reports `projectA`'s canonical path; Session 2 reports `projectB`'s.
   - `Cite: [03-server.md §3 registered in place] [03-server.md §4 isolation]`

3. Transcripts are separate (no cross-contamination).
   - `REST: GET /sessions/<sessionA-id>/transcript?format=full` and `GET /sessions/<sessionB-id>/transcript?format=full`.
   - `VERIFY:` neither transcript contains content originated in the other session.
   - `Cite: [D-G1] [03-server.md §4 isolation guarantee]`

4. Persona context does not bleed.
   - `USER:` ask each session a question whose answer would differ by persona (e.g., scenario B's distinctive marker for the override; a domain question for `dev` vs `infra`).
   - `VERIFY:` answers reflect the assigned persona; neither leaks the other's marker or framing.
   - `Cite: [D-G1] [03-server.md §4]`

5. `relay session list` and the IDE status bar distinguish the sessions.
   - `CMD: relay session list`
   - `VERIFY:` rows show distinct `(project, persona)` pairs.
   - `VERIFY:` (IDE) status bar reflects the project for the focused root, not a global "active session." Switching focus between editors in different roots swaps the displayed project.
   - `Cite: [03-server.md §7] [04-ide-extension.md §4 status bar item]`

---

### H — Distribution paths actually work

- **Source:** [`08-acceptance.md` "H — Distribution paths actually work"](../../../docs/prd/08-acceptance.md); contract in [`06-distribution.md`](../../../docs/prd/06-distribution.md).
- **Decisions:** [D-08].
- **Mutation surface:** `USER:` runs `npm install -g @relay/relay` and/or pulls and runs the published Docker image on a fresh host. The skill cannot meaningfully verify the _clean-install experience itself_ on a host that already has Relay installed — only the artifacts.
- **Related:** A–E (the scenarios H's clean install must enable).
- **Preconditions:** none for the artifact-only checks. For the full clean-install verification, a fresh Node 22+ host or a fresh Docker container is required.
- **Phase gate:** Phase 1 ship.

**Outlier note:** This scenario verifies the _distribution surface_, not a running server's behavior. Most checks here have a `pass | n/a` shape — the `n/a` verdict applies when the host already has Relay installed and a clean-install can't be observed.

**Checks:**

1. `npm install -g @relay/relay` produces a working binary on a fresh Node 22+ host.
   - `USER:` on a fresh host (or fresh `nvm use 22 && npm uninstall -g @relay/relay && npm install -g @relay/relay`), run the install.
   - `VERIFY:` `CMD: command -v relay` resolves; `CMD: relay --version` prints a version.
   - `Cite: [06-distribution.md npm channel] [D-08 single-binary shape]`
   - `n/a` if no fresh host available.

2. Single-binary shape — one executable, every subcommand.
   - `CMD: relay --help`
   - `VERIFY:` output enumerates `server`, `init`, `project`, `persona`, `session`, `token`, `attach` subcommands. No separate `relay-server` or `relay-cli` binary on PATH.
   - `Cite: [D-08] [03-server.md §7]`

3. Published Docker image runs scenarios A–E from a clean container.
   - `USER:` `docker pull ghcr.io/relay/relay:<tag>` and run with `~/.relay/` and a project dir mounted.
   - `VERIFY:` walk scenarios A and E inside the container. (D is implied by E.)
   - `Cite: [06-distribution.md docker channel] [08-acceptance.md "H"]`
   - `n/a` if Docker unavailable.

4. `claude login` OAuth state flows from operator's host to spawned agent without Relay touching it.
   - `USER:` ensure `claude login` has been run on the host that launches `relay server` (macOS: confirm a `Claude Code-credentials` entry in `security dump-keychain`; Linux: confirm `FILE: ~/.claude/.credentials.json` exists). Start `relay server` from that shell with `ANTHROPIC_API_KEY` unset.
   - `VERIFY:` `FILE: ~/.relay/config.yaml` does not contain the string "credentials". `FILE: ~/.relay/state.db` does not contain OAuth token bytes (sqlite dump | strings).
   - `VERIFY:` a spawned session can talk to the model.
   - `VERIFY:` spawning with `HOME=/tmp/empty` and `ANTHROPIC_API_KEY` unset makes the agent exit immediately (proves the OAuth channel is process credential / `$HOME` inheritance, not anything Relay reads). On macOS the Keychain stays reachable for processes running as the same user regardless of `$HOME`; this sub-check is Linux-specific.
   - `Cite: [D-10] [ND-19] [03-server.md §3 model credentials] [threat-model.md §4 credentials-never-persisted]`

5. Backup posture — `~/.relay/` and `~/.claude/` together cover all Relay-owned state.
   - `FILE:` enumerate everything under `~/.relay/`: `config.yaml`, `tokens.json`, `state.db`, `personas/`, `last-pairing.txt`. Cross-check against the table in [03-server.md §8].
   - `VERIFY:` no Relay-owned state lives outside `~/.relay/` and `~/.claude/`. Project working directories are operator-managed.
   - `Cite: [06-distribution.md persistence] [03-server.md §8 native config preservation]`

6. Documentation walks bring-up to scenario E.
   - `FILE:` read `README.md` and `docs/deployment.md` (build-plan task 1C; may not exist yet).
   - `VERIFY:` a stranger could follow them from "I have Node 22 and an Anthropic key" to "scenario E works." If 1C hasn't shipped: `blocked (because: README + deployment guide not yet authored — build-plan task 1C pending)`.
   - `Cite: [08-acceptance.md "H"] [build-plan.md task 1C]`

---

## Conventions worth restating

- **Read-only boundary.** The skill verifies; the user mutates. Every mutating action is a `USER:` step the human runs, immediately followed by a `VERIFY:` step the skill checks. Spawning + killing a session is the one transient exception, and the skill cleans up its own spawns before exiting.
- **Citation discipline.** Every check carries a `Cite:` line referencing the contract it tests — either a `D-NN`/`ND-NN` from [`docs/decisions/`](../../../docs/decisions/index.md), a numbered subdoc section, or both. A check without a citation is a check the future reader can't trace.
- **Tolerate the pending camelCase migration.** [`rest-conventions.md` §6](../../../docs/arch/rest-conventions.md) supersedes the snake_case transcript example in [`03-server.md` §2](../../../docs/prd/03-server.md) but the propagation hasn't landed in the PRD snippet yet. Scenario D check 4 and any other transcript-shape check should `pass` on either form during the migration window, with a note.
- **Phase 0 graceful degradation.** When walking D or E during Phase 0, the spike-only checks pass and the Phase-1-only sub-checks (replay buffer size precisely 32 KB; full claim arbitration; transcript pagination shape) emit `blocked (because: not in Phase 0 scope)` rather than `fail`.
- **Claude CLI first-run TUI.** Any scenario that spawns a session under a fresh `$HOME` will land at Claude Code's first-run TUI (theme selector → login method → OAuth → "Press Enter to continue…"). Arbitrary text input is **ignored** until the four menus are dismissed with `\r`. Symptom: `claim → claim_ack → send → claim_released { delivered }` round-trips succeed but `totalBytes` does not grow and no agent response arrives. The walk surfaces a `blocked (because: claude TUI in first-run mode — dismiss with \r ×4 before sending text)` on any check that asserts agent semantic response. Either drive `\r` through the FSM first or prepopulate `~/.claude/.credentials.json` from the operator's real home. The vm-e2e skill documents the screen sequence verbatim.
- **Stop on capability preflight failure.** Don't pretend to walk a scenario whose binary or server isn't reachable. One consolidated `blocked` verdict with a clear `because:` reason is more useful than eight cargo-cult `blocked` verdicts.
- **CI-mode is out of scope.** This skill is the interactive primitive a future end-to-end CI runner could be built on. The "check Phase 1 acceptance" trigger surfaces a scenario picker, not a non-stop walk of all eight.
- **Decision-log integration.** If the walk surfaces a contract ambiguity worth a new sub-question (e.g., a behavior the PRD doesn't pin down), file it in `../../../docs/decisions/index.md` via the `decision-log` skill — don't paper over it inline.
