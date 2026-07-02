---
name: vm-e2e
description: Run an end-to-end client/server validation of the `relay` binary across a real LAN — laptop hosts the server, a peer Ubuntu VM at techgardencode@10.0.60.221 hosts the cross-device client (`relay attach`). Builds the binary on the laptop, rsyncs to the VM, boots the server, walks the cross-device attach contract from scenario E, and tears down. Trigger phrases — "run e2e on the VM", "cross-device validation", "validate against the VM", "LAN e2e".
---

# Relay vm-e2e skill

The Phase 1 acceptance gate that ultimately matters is scenario E ("Cross-device continuation") — the laptop spawns a session, the VM attaches, the user interacts from the VM, output streams to both. The unit + integration tests in the repo cover the wire shapes but cannot prove that the real `relay attach` binary, talking to a real `relay server`, over a real LAN, against a real `claude` agent, actually works end-to-end. This skill is that proof — invoked once per non-trivial change to `attach/`, `server/`, or `session/`.

The skill is **safe by construction**: every action is scoped to a timestamp-tagged tmp directory on each side (`$RELAY_E2E_TMP`); the laptop's real `~/.relay/` and `~/.claude/` are untouched; the VM's home dir is untouched except for the test tmp dir; the cleanup step is mandatory and idempotent.

## Topology

| Role                | Host                              | User             | Path                                                     |
| ------------------- | --------------------------------- | ---------------- | -------------------------------------------------------- |
| Server              | this laptop (Darwin, 10.0.20.195) | `kianalikhani`   | repo at `/Users/kianalikhani/Development/Projects/relay` |
| Cross-device client | Ubuntu VM (10.0.60.221)           | `techgardencode` | test tmp dir under `/tmp/relay-e2e-<ts>/`                |

Why server-on-laptop, not server-on-VM: the laptop already has `claude` installed (required for real agent spawn) and the `node-pty` native binary built; the VM only needs `node` to run `relay attach` (a pure WS+TTY client). Reversing the topology requires installing `claude` and rebuilding `node-pty` on the VM — out of scope for this skill, file a follow-up if it becomes load-bearing.

## When to invoke

Trigger phrases:

- "run vm-e2e" / "run cross-device validation" / "validate against the VM"
- "scenario E on the VM" / "real-LAN attach test"
- Hand the skill a build-plan task id (`6H`, `6I`, etc.) — the skill walks the subset of A/E/F that the touched module owns.

If invoked without context, prompt the user once for _which scenarios_ to walk (default: A bullets 1–3 + 6 + E checks 1–4). Don't ask twice.

## Inputs the skill reads first

- [`docs/prd/08-acceptance.md`](../../../docs/prd/08-acceptance.md) — scenarios A and E define the verification surface.
- [`docs/arch/ws-protocol.md`](../../../docs/arch/ws-protocol.md) — §6 reattach sequence, §4.2 close codes. The skill verifies the on-wire ordering matches §6 when probing live frames.
- [`docs/history/phase-0-report.md`](../../../docs/history/phase-0-report.md) — the original cross-LAN attach proof. The skill is a structured re-run of what Phase 0 proved by hand.
- This SKILL.md (no external state — host/user/path are inlined).

## Capability preflight

Run once at start, short-circuit on any failure with a single consolidated report:

```bash
# 1. SSH reachability (BatchMode forces failure on password prompt — we need passwordless)
ssh -o ConnectTimeout=5 -o BatchMode=yes techgardencode@10.0.60.221 -- 'echo ok'

# 2. Node version on VM
ssh techgardencode@10.0.60.221 -- 'node --version'   # expect v22+

# 3. claude on laptop
command -v claude && claude --version

# 4. Bidirectional ping (LAN reachability)
ping -c 1 -W 2000 10.0.60.221
ssh techgardencode@10.0.60.221 -- 'ping -c 1 -W 2 $(hostname -I | awk "{print \$1}")'

# 5. Tree builds clean
pnpm typecheck && pnpm lint && pnpm test
```

If anything fails, stop and report which preflight bullet blocked. Do not attempt to fix the VM environment from this skill — that's a setup task, not an e2e task.

## Layout

The skill manages three filesystem regions; never touch anything outside them:

| Region                                            | Owner                                                    | Cleanup                                       |
| ------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------- |
| `/tmp/relay-e2e-<ts>-laptop-home/`                | laptop test `$HOME` (config.yaml, tokens, db, sessions)  | `rm -rf` at end                               |
| `/tmp/relay-e2e-<ts>-project/`                    | laptop test project directory (where the agent runs)     | `rm -rf` at end                               |
| `/tmp/relay-e2e-<ts>-server.log`                  | laptop server stdout/stderr                              | retained for post-mortem; cleaned on next run |
| `techgardencode@10.0.60.221:/tmp/relay-e2e-<ts>/` | VM bundle (relay tree, dist/, node_modules) + VM `$HOME` | `ssh ... rm -rf /tmp/relay-e2e-<ts>`          |

`<ts>` is an epoch seconds tag (`$(date +%s)`) so concurrent runs don't collide. Export it once into `$RELAY_E2E_TS` at the top of the walk.

## Bring-up

### 1. Build + sync

The `relay attach` thin client and its `commander` dispatcher need the whole `@relay/relay` package tree (Zod schemas, fastify deps for completeness, ws). The simplest reliable deployment is a workspace copy via rsync. node-pty's native binary doesn't need to be present on the VM (attach never spawns a PTY) but the require will fail at import time if it's missing, so we rsync the laptop's built `node_modules` and accept that the spawn-helper exec bit is mac-arch-tagged — the VM will see it as a useless file but won't try to run it.

```bash
LAPTOP_REPO=/Users/kianalikhani/Development/Projects/relay
VM_DIR=/tmp/relay-e2e-$RELAY_E2E_TS
ssh techgardencode@10.0.60.221 -- "mkdir -p $VM_DIR"

# Build the laptop's dist/ tree (idempotent — tsc -b is fast)
pnpm -C "$LAPTOP_REPO" typecheck --force >/dev/null

# Mirror only what's needed: protocol package + server package, minus tests, minus .git
rsync -az --delete \
  --exclude '.git' \
  --exclude 'spike/node_modules' \
  --exclude 'packages/*/node_modules' \
  --exclude '**/*.test.ts' \
  --exclude '**/*.test.js' \
  --exclude '**/test/' \
  "$LAPTOP_REPO/" \
  "techgardencode@10.0.60.221:$VM_DIR/"

# Install deps on the VM (node-pty will fail to build natively — that's OK,
# we don't use it client-side). Use `pnpm install --ignore-scripts` to avoid
# the node-pty postinstall.
ssh techgardencode@10.0.60.221 -- "cd $VM_DIR && pnpm install --ignore-scripts" 2>&1 | tail -10
```

Alternative on `pnpm` failure on the VM: ship a pre-built tarball via `pnpm pack`. Use only if rsync+install fails.

### 2. Laptop: server HOME + project

```bash
LAPTOP_HOME=/tmp/relay-e2e-$RELAY_E2E_TS-laptop-home
LAPTOP_PROJECT=/tmp/relay-e2e-$RELAY_E2E_TS-project
SERVER_LOG=/tmp/relay-e2e-$RELAY_E2E_TS-server.log
mkdir -p "$LAPTOP_HOME" "$LAPTOP_PROJECT"

# Mint a token. Capture the plaintext from `relay init`'s pairing snippet.
HOME=$LAPTOP_HOME node "$LAPTOP_REPO/packages/server/dist/cli/relay.js" init \
  --url "http://10.0.20.195:7777" > "$LAPTOP_HOME/init.out" 2>&1
TOKEN=$(grep -oE '[0-9A-HJ-KMNP-TV-Z]{26}' "$LAPTOP_HOME/init.out" | tail -1)

# Bind to 0.0.0.0 so the VM can connect (default is 127.0.0.1).
sed -i.bak 's/^host: 127.0.0.1$/host: 0.0.0.0/' "$LAPTOP_HOME/.relay/config.yaml"

# Boot the server in the background; capture pid for shutdown.
# Pick ONE credential path before launching the server (per ND-19):
#
#   OAuth (default) — three symlinks reach the operator's real Claude Code state
#   (per ND-22, surfaced 2026-05-18 when the single-`.claude` form left the spawned
#   claude stuck in the first-run TUI):
#     - `.claude/`     — Claude Code state dir (projects, sessions, backups, settings).
#     - `.claude.json` — top-level config file the claude binary requires; without
#                        it the agent re-enters the first-run TUI under the test home
#                        and never reaches the prompt.
#     - `Library/`     — macOS only. `claude login` writes OAuth state to the user's
#                        login Keychain (`~/Library/Keychains/login.keychain-db`); the
#                        Security framework's default-keychain lookup needs $HOME/Library
#                        to be reachable even though Keychain access itself is bound
#                        to process credentials. On Linux this symlink is omitted —
#                        OAuth state lives at `.claude/.credentials.json` instead.
ln -sfn "$HOME/.claude" "$LAPTOP_HOME/.claude"
[ -f "$HOME/.claude.json" ] && ln -sfn "$HOME/.claude.json" "$LAPTOP_HOME/.claude.json"
[ "$(uname)" = "Darwin" ] && [ -d "$HOME/Library" ] && ln -sfn "$HOME/Library" "$LAPTOP_HOME/Library"
HOME=$LAPTOP_HOME \
  node "$LAPTOP_REPO/packages/server/dist/cli/relay.js" server \
  > "$SERVER_LOG" 2>&1 &
#
#   Headless fallback — set ANTHROPIC_API_KEY in the parent shell and use:
#     HOME=$LAPTOP_HOME ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
#       node "$LAPTOP_REPO/packages/server/dist/cli/relay.js" server \
#       > "$SERVER_LOG" 2>&1 &
#   Don't combine both — Claude Code prefers the env var and silently bills
#   against the API key rather than any Claude.ai subscription.
SERVER_PID=$!
sleep 2  # let it bind

# Sanity: reach the server from the laptop AND from the VM
curl -sf -H "Authorization: Bearer $TOKEN" http://127.0.0.1:7777/tenants/self
ssh techgardencode@10.0.60.221 -- \
  "curl -sf -H 'Authorization: Bearer $TOKEN' http://10.0.20.195:7777/tenants/self"
```

If neither `claude login` state at `$HOME/.claude/` (Keychain on macOS, the file on Linux) nor `ANTHROPIC_API_KEY` is reachable from the server's env, the WS handshake still succeeds but the spawned agent exits immediately. For non-spawn checks (auth, hello frame, replay bracket on a synthetic session) that's fine. For full scenario E, ensure the laptop's shell has either run `claude login` (the ND-19 default — the three symlinks above wire it through; on macOS, `Library/` must be one of them per ND-22) or has `ANTHROPIC_API_KEY` exported, and surface the gap if neither is present.

The spawned `claude` will also show a one-time workspace-trust prompt for the unfamiliar `/tmp/relay-e2e-…-project` path. Scenario E drivers that exercise check 4 (VM input → agent reply) must send a `\r` early in the attach session to dismiss it before the test prompt; check 1 / 2 / 3 (REST visibility, hello frame, replay bracket) do not require dismissal.

### 3. Register a project on the server, spawn a session

The project marker file lands on the laptop's filesystem under `$LAPTOP_PROJECT` (per D-12). The VM does not need to see the project working directory — it only attaches to a session by id.

```bash
HOME=$LAPTOP_HOME RELAY_TOKEN=$TOKEN \
  node "$LAPTOP_REPO/packages/server/dist/cli/relay.js" project add "$LAPTOP_PROJECT" --name e2e
PROJECT_ID=$(HOME=$LAPTOP_HOME node "$LAPTOP_REPO/packages/server/dist/cli/relay.js" project list | awk '{print $1; exit}')

# Spawn a session over REST (POST /sessions, persona=dev).
SESSION_JSON=$(curl -sf -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"projectId\":\"$PROJECT_ID\",\"personaName\":\"dev\"}" \
  http://127.0.0.1:7777/sessions)
SESSION_ID=$(echo "$SESSION_JSON" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
```

### 4. VM: attach

```bash
ssh techgardencode@10.0.60.221 -- "cd $VM_DIR && \
  HOME=$VM_DIR RELAY_TOKEN=$TOKEN \
  node $VM_DIR/packages/server/dist/cli/relay.js attach $SESSION_ID --url http://10.0.20.195:7777"
```

For interactive shell-level testing, prefix with `ssh -tt` to allocate a PTY on the VM end so raw-mode TTY works correctly. For headless / scripted testing, send a small input via stdin and assert on the byte stream the server captures.

## Scenario walks

The skill walks a subset of the 8 scenarios per invocation, picked from the user prompt or the touched-module heuristic. Each walk emits one verdict per check with the same `pass | fail | blocked | n/a` vocabulary the `scenario-runner` skill uses.

### A — server bring-up + project registration (LAN flavor)

The scenario-runner skill already covers this on a single host. The LAN-flavored re-run adds three cross-host bullets:

1. **VM can reach the server's REST API.** `ssh ... curl /tenants/self` returns 200 with the laptop's tenant row.
2. **VM token persists across SSH sessions.** Two separate `ssh ... curl` invocations with the same `RELAY_TOKEN` both authenticate.
3. **Server binds 0.0.0.0; default 127.0.0.1 explicitly tested.** Toggle the config back to 127.0.0.1 between runs and confirm the VM `curl` fails with connection refused.

### E — cross-device continuation (the real test)

1. **Session spawned on laptop is visible from VM via REST.** `ssh ... curl /sessions` shows the session.
2. **`relay attach` from VM connects, receives `hello` frame.** Drive the attach in non-interactive mode with a 3-second timeout; assert the WS upgrade succeeds and the first text frame parses as a `hello` per ws-protocol.md §2.3 (`sessionId`, `replayBufferBytes`, `claimLockTimeoutSeconds`, `serverTime` all present).
3. **Replay bracket arrives even for an empty buffer.** Inspect the captured frames: `replay_start { bytes: N }` must precede `replay_end`, with exactly `N` bytes of binary frames between.
4. **VM input reaches the agent.** Send a short prompt from the VM (e.g., "say hello"); the agent's response arrives back on the VM's stdout AND on a second concurrent attach from the laptop (proves D-G3 universal output across the LAN).
5. **`^D` from VM closes cleanly with code 1000.** The session row stays `status: running` (per scenario D, reattach semantics).

### F — concurrent multi-client attach (cross-LAN flavor)

Requires two attached clients. Run one `relay attach` on the laptop and one on the VM, both against the same session:

1. **Both see the same agent output.** Bytes appear on both stdouts.
2. **CLAIM races: exactly one wins, the other gets `busy`.** Inject a synthetic claim race by sending two `claim` frames near-simultaneously via the captured WS streams.
3. **30-second auto-release.** Hold one claim open without sending; observe the `claim_released { reason: "timeout" }` broadcast at ~30s.

## Probing live WS frames

For the §6 ordering checks the skill needs to see actual frames, not just byte streams. Use the relay attach binary with stderr verbose mode (TODO: add `--trace` flag — for now, instrument by running a tiny captures script). For this iteration, the skill records the captured frames by piping `relay attach` through `tee` and asserting on the output substrings.

```bash
ssh techgardencode@10.0.60.221 -- "cd $VM_DIR && \
  HOME=$VM_DIR RELAY_TOKEN=$TOKEN \
  timeout 5 node $VM_DIR/packages/server/dist/cli/relay.js attach $SESSION_ID --url http://10.0.20.195:7777 \
  < /dev/null > /tmp/attach-out.bin 2> /tmp/attach-err.log
" || true   # timeout exits 124; that's expected
ssh techgardencode@10.0.60.221 -- "cat /tmp/attach-err.log" | head -40
```

## Claude binary first-run TUI prerequisite

The `claude` CLI is a TUI app. On the very first spawn under a fresh `$HOME` it walks the user through:

1. **Theme selector** — `❯ 2. Dark mode ✔ / 3. Light mode / …`. Dismiss with `\r` (a real carriage return — bash `\n` in a literal string is escaped, use `$'\r'` or a heredoc).
2. **Login method selector** — `1. Claude account with subscription / 2. Anthropic Console / 3. 3rd-party`. Dismiss with `\r`.
3. **OAuth browser launch** — emits a `https://claude.com/cai/oauth/authorize?…` URL. Cached login state (under `~/.claude/.credentials.json` on the operator's real home) lets this complete without browser interaction, but the test home is fresh so the URL surfaces. The user pastes the OAuth code back; the TUI advances.
4. **"Login successful. Press Enter to continue…"** — dismiss with `\r`.

After all four, the agent is at an interactive prompt and arbitrary text input lands as a message. Before all four, text input is ignored because the TUI is in menu-mode.

For scripted scenario walks: either (a) drive `\r` through the §5.2 claim/send/release FSM until the transcript shows the `>` prompt cursor, then send the real prompt; or (b) prepopulate the test home with `~/.claude/.credentials.json` copied from the operator's real home and accept the privacy implication. The vm-e2e walk used (a).

This is **not a Relay bug** — Claude Code's first-run UX is upstream and changes between versions. If the scripted dismissal stops working, re-record the screens by attaching a real terminal and walking through manually.

## Cleanup discipline

Mandatory. Run unconditionally — even if the walk failed midway. Idempotent.

```bash
# Kill the server. Use TERM, then KILL if it doesn't drain in 3s.
kill -TERM $SERVER_PID 2>/dev/null
sleep 1
kill -KILL $SERVER_PID 2>/dev/null || true

# Local tmp tree
rm -rf "$LAPTOP_HOME" "$LAPTOP_PROJECT"
# (keep $SERVER_LOG for post-mortem; next run overwrites it)

# VM tmp tree
ssh techgardencode@10.0.60.221 -- "rm -rf /tmp/relay-e2e-$RELAY_E2E_TS /tmp/attach-out.bin /tmp/attach-err.log"
```

## Output format

For each scenario, one block per check:

```
<scenario>.<n>. <check title>
   Where: laptop | VM | cross-host
   Action: <one-line CMD>
   Expected: <one-line outcome>
   Observed: <one-line actual>
   Cite: [<scenario>] [<D-NN | ND-NN | spec-ref>]
   Verdict: pass | fail | blocked | n/a (because: <reason>)
```

End with a summary table identical in shape to `scenario-runner`'s, plus a **Mutation surface recap** listing every laptop path and VM path the walk touched, so the user can audit cleanup.

## Conventions worth restating

- **Server on laptop, client on VM.** Don't flip the topology — `claude` and `node-pty` are on the laptop.
- **Always tag with `$RELAY_E2E_TS`.** Lets concurrent runs coexist; lets the cleanup be unambiguous.
- **Read-only against the user's real homes.** No write to `~/.relay`, `~/.claude`, or `techgardencode`'s home outside `$VM_DIR`.
- **Cleanup runs unconditionally.** Even if the skill bails midway — a stale server process or stuck SSH connection is worse than a noisy cleanup log.
- **Phase 0 already proved cross-LAN works.** If a check fails, the regression is the change since Phase 0, not the LAN. Don't go chasing network issues unless ping/curl fail.
- **Model credentials are the user's, not the skill's.** Whether that's `claude auth login` state at `$HOME/.claude/` (the ND-19 default — macOS Keychain or the `.credentials.json` file on Linux) or `ANTHROPIC_API_KEY` (the fallback), read from the parent shell's env / home; never copy either to disk; if neither is present, fall back to non-spawn checks and surface the gap. The OAuth path symlinks `.claude/`, `.claude.json`, and (on macOS) `Library/` from the operator's real `$HOME` into `$LAPTOP_HOME` so the spawned claude finds credentials and config via the isolated test home without copying anything — see ND-22 in `../../../docs/decisions/index.md` for why all three are needed.
- **Test the contract, not the implementation.** A check that hardcodes "expects exactly N bytes of replay" is wrong — replay size is configurable per ND-03. Cite the spec, observe the wire.

If the walk surfaces a contract ambiguity worth a new sub-question, file it via the `decision-log` skill before fixing it inline. The whole point of running this skill is to catch real-world drift; suppressing it would defeat the purpose.
