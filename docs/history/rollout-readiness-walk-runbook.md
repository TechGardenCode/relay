# 7F rollout-readiness — dev-build live runbook

Work top to bottom. Every step says **which machine** and **which shell** to run it in.
Companion to [`rollout-readiness-walk.md`](rollout-readiness-walk.md) (the verdict doc).

> **Dev build = no published `relay`.** The binary is `<repo>/packages/server/dist/cli/relay.js`,
> compiled by `pnpm typecheck` (NOT `pnpm build`, which is a no-op here). The IDE extension
> spawns a bare `relay`, so `relay` must be **symlinked onto PATH** on whatever host the
> extension/CLI runs on.

## Topology & placeholders

- **VM** = server host **and** IDE host (via Remote-SSH). `VM_IP` = the VM's LAN IP (baseline: `10.0.60.221`).
- **Laptop** = the cross-device CLI client (and runs Cursor).
- `<REPO>` = the relay repo path on that machine.
- `relay` below = the symlinked dev binary from step 0. `RELAY_TOKEN` = the VM server's bearer token.

> **Two facts that bite on a dev build:**
> 1. `relay server` **blocks its shell** → you need **two shells on the VM** (A = server, B = commands).
> 2. CLI data-plane commands (`project add/list`, `session list`, `doctor` server-probe) read the token
>    from **`RELAY_TOKEN` only** — not from `~/.relay/`. Export it in every client shell.
>    (`relay attach` likewise needs `--token`/`RELAY_TOKEN`; the IDE uses its own SecretStorage and is exempt.)

---

## 0 · Dev-build setup — run on BOTH machines

```bash
cd <REPO>
git pull
pnpm install                 # builds the node-pty native module
pnpm typecheck               # ← compiles dist/  (pnpm build is a no-op on this repo)
chmod +x packages/server/dist/cli/relay.js
sudo ln -sf "$PWD/packages/server/dist/cli/relay.js" /usr/local/bin/relay
relay --version              # ✅ expect 0.0.0   (if not: PATH/symlink is wrong)
```
- VM `pnpm install` fails on **node-pty**? → `sudo apt install -y build-essential python3`, reinstall (Phase 0 surprise §5).

---

## 1 · VM — credentials + scaffold  (VM shell B)

```bash
claude auth login                              # skip if already logged in (server host inherits this)
relay doctor                                   # ✅ [OK] claude-binary  and  [OK] credentials

relay init --url http://VM_IP:7777             # use the LAN IP, NOT 127.0.0.1
sed -i 's/^host:.*/host: 0.0.0.0/' ~/.relay/config.yaml   # bind LAN so the laptop can reach it
grep -E '^host|^port' ~/.relay/config.yaml     # ✅ host: 0.0.0.0   port: 7777
```

## 2 · VM — start the server  (VM shell A, leave running)

```bash
relay server                                   # ✅ "listening on http://0.0.0.0:7777"
```

## 3 · VM — register a project + verify  (VM shell B)

```bash
export RELAY_TOKEN=$(grep -oE 'token=[A-Z0-9]+' ~/.relay/last-pairing.txt | cut -d= -f2)
echo "$RELAY_TOKEN"                            # sanity: prints the token

mkdir -p /tmp/relay-proj
relay project add /tmp/relay-proj              # name must be letter-first kebab, else use --name <slug>
relay project list                             # ✅ shows id, slug, /private/tmp/relay-proj
cat /tmp/relay-proj/.relay/project.json        # ✅ {schemaVersion, projectId}

relay doctor                                   # ✅ [OK] server — reachable and the token is accepted
```
> Every **new** VM shell for `relay` client commands needs the `export RELAY_TOKEN=…` line again.

## 4 · Laptop — confirm it can reach the VM server  (laptop shell)

```bash
TOK=<paste-the-VM-token-from-step-3>
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOK" http://VM_IP:7777/tenants/self
# ✅ 200.  Timeout → open port 7777 on the VM firewall, or use Tailscale.
```

## 5 · Laptop — IDE  (Cursor, Remote-SSH → VM)

1. Cursor → **Remote-SSH** into `techgardencode@VM_IP` (extension runs in VM context → sees `/tmp/relay-proj` + the VM `relay` symlink).
2. Build + package the extension on the **VM** (shell B) — two steps, the bundle first:
   ```bash
   pnpm -F relay-extension build      # esbuild → dist/index.cjs (vsix needs this; typecheck alone doesn't make it)
   pnpm -F relay-extension vsix       # → packages/extension/relay-extension-0.0.0.vsix
   ```
3. In Cursor: Palette → **"Extensions: Install from VSIX…"** → pick that `.vsix`. → ✅ appears in the Remote installed list.
4. Palette → **"Relay: Connect to server"** → paste the `relay://pair?...` from the VM's `~/.relay/last-pairing.txt`. → ✅ connected.
5. Open `/tmp/relay-proj` in Cursor. → ✅ **(C-bind)** binds with no register/bind prompt; status bar shows the project.
6. Palette → **"Relay: Start session in current project"** → pick a persona. → ✅ **(C-start)** a pane opens running `relay attach <sid>`; agent responds.
   - ❌ "Path to shell executable 'relay' does not exist" → the VM symlink (step 0) isn't on the Remote PATH.

## 6 · ★ Sessions tree view (T-1, ND-33)

**Setup:** have **≥2 running sessions across ≥2 projects** so grouping is visible. From VM shell B:
```bash
# register a 2nd project + confirm you have ≥2 running sessions:
mkdir -p /tmp/relay-proj2 && relay project add /tmp/relay-proj2
relay session list            # if <2 running, start more via the IDE (step 5.6) in each project
```
In Cursor, click the **Relay icon in the Activity Bar** to open the sessions view, then check each:

| # | Do this | ✅ Pass |
| - | ------- | ------- |
| T-1a | Look at the tree layout | Sessions are **grouped under their project** (project node → session children), not a flat list |
| T-1b | Look at each session node | Each shows its persona/id **and a status badge/icon** — `running` vs `killed` (and `idle` if surfaced) per [D-11] |
| T-1c | Hover/right-click a session node | **Attach / Release / Kill** actions are present (inline icons or context menu) |
| T-1d | Click **Attach** on a node | Opens a terminal pane running `relay attach <sid>` for that session |
| T-1e | Click **Kill** on a node | Session transitions to `killed`; the badge updates and the node reflects it |
| T-1f | **Auto-refresh:** in VM shell B run `relay session list`, then kill one with `relay session kill <sid>` (or start a new one) | The tree updates **on its own within a few seconds** (REST poll, [ND-37]) — **no manual refresh** |

Cite: [ND-33] [ND-37] [D-11]. *(If clicking the icon shows nothing/empty: confirm the session is paired to this server and `relay session list` is non-empty on the VM.)*

## 7 · ★ Status bar + pickers (T-2, 7C-polish)

| # | Do this | ✅ Pass |
| - | ------- | ------- |
| T-2a | Look at the status-bar item with a session running | Shows the **focused root's** project/persona (e.g. `$(broadcast) Relay: <project/persona>`), plus a running-session indicator ([ND-37]) |
| T-2b | Open a **multi-root** workspace with both registered roots; switch focus between editors in each root | Status bar **swaps to the focused root's** bound project (not a global "active session") [ND-05]. *No multi-root handy → `n/a`, not a fail.* |
| T-2c | Palette → **"Relay: Attach to session"** | Quick-pick lists sessions **grouped by project** (separators), and **typing filters** by project/persona (`matchOnDescription`/`matchOnDetail`) |
| T-2d | Palette → **"Relay: Start session…"** → persona step | Persona quick-pick is **grouped (tenant vs project) and filterable** |

Cite: [ND-33] [ND-05] [ND-37].

## 8 · Disconnect / reattach (scenario D)

```bash
# 1) close Cursor ENTIRELY (the whole window — NOT a ^D in the pane, which hits ND-38).
# 2) on VM shell B:
relay session list            # ✅ (D-1) the session is still 'running'
```
3. Reopen Cursor → Remote-SSH → attach the session via the **tree view** (T-1d) or palette "Attach to session".
   - ✅ **(D-2a)** live PTY bytes stream **immediately** — no "loading history" phase blocking live output.
   - ✅ **(D-2b)** the **last frame is visible** (Claude's TUI repaints), not a blank pane.
4. Send a prompt referencing something from before the disconnect → ✅ **(D-2c)** the agent's reply shows retained context (same PTY, never died).

Cite: [D-G3] [ND-03] [03-server.md §5.2].

## 9 · ★ Cross-device CLI attach (scenario E — the headline)

The genuinely cross-machine leg: a session running on the **VM**, attached from your **laptop** over the LAN.

**Setup** (laptop shell):
```bash
TOK=<VM-token>                                  # from the VM's ~/.relay/last-pairing.txt
# get a REAL session ULID (NOT a short number) from the VM:
#   on VM shell B:  relay session list   → copy the 26-char id from column 1
SID=01XXXXXXXXXXXXXXXXXXXXXXXXX
```

| # | Do this | ✅ Pass |
| - | ------- | ------- |
| E-1a | `relay attach $SID --url http://VM_IP:7777 --token $TOK` | Attach succeeds (no `4404 session not found` → that means a bad/short id or the session ended) |
| E-1b | Watch the initial output | A short **replay** of recent context appears, then **live bytes stream** [D-G3] |
| E-2a | Type a marker prompt, e.g. `reply prefixed with FROM_LAPTOP::` and Enter | The agent's reply arrives on the **laptop** terminal |
| E-2b | Look at the **IDE pane** (Client 1) at the same time | The same prompt + reply appear there too — **universal output** [D-G2] |
| E-2c | (optional) on VM: `relay session show $SID` or transcript | The bytes (`FROM_LAPTOP::` …) are in the captured transcript |

> ⚠️ **Known:** to exit this laptop `relay attach`, `^D` will detach but **hang** — press `^C` to get your prompt back ([ND-38](decisions/ND-38-relay-attach-process-hangs-after-clean-ctrl-d-detach-in-raw-mode.md), already confirmed). Expected, not a new failure.

Cite: [D-G3] [D-G2] [03-server.md §5.2].

---

## Already confirmed — findings filed (no need to re-test)

- **`^D` teardown** (host-TTY `^D`-requires-`^C` + screen corruption on close) → **[ND-38](decisions/ND-38-relay-attach-process-hangs-after-clean-ctrl-d-detach-in-raw-mode.md)** (open; recommended rollout-blocker).
- **Concurrent multi-client TUI rendering corruption** (scenario F, two clients, one TUI session) → **[ND-39](decisions/ND-39-concurrent-multi-client-attach-tui-rendering-corruption.md)** (open; functional arbitration + BUSY interim hold). The BUSY interim line (`[relay] another device is interacting with this session.`) is the documented [ND-30] behavior — pass-with-caveat, not a fail.
- **Local-server scenarios** (A bring-up incl. 409/422 + D-11 restart sweep, G isolation, `session show`, `relay doctor` both token states, `relay init` bridge) → fresh-passed on a local isolated server (2026-05-27).

## Report back — the four remaining items (everything else confirmed)

```
§6 T-1 tree view:
   a grouped by project?      PASS/FAIL
   b status badges?           PASS/FAIL
   c attach/release/kill?     PASS/FAIL
   d attach opens pane?       PASS/FAIL
   e kill updates badge?      PASS/FAIL
   f auto-refresh on poll?    PASS/FAIL
§7 T-2 status bar + pickers:
   a status bar shows project?     PASS/FAIL
   b follows focus (multi-root)?   PASS/FAIL/n-a
   c attach quick-pick grouped+filter?  PASS/FAIL
   d persona quick-pick grouped+filter? PASS/FAIL
§8 D scenario:
   D-1 survives IDE close?    PASS/FAIL
   D-2 reattach live+last-frame+context?  PASS/FAIL
§9 E scenario:
   E-1 cross-device attach + replay/live? PASS/FAIL
   E-2 bidirectional / universal output?  PASS/FAIL
```

Paste this filled in and I'll fold each into `docs/rollout-readiness-walk.md` (converting the C/D/E + tree/status rows to fresh live). These four are the only legs without fresh live evidence; the `^D`/multi-client findings (ND-38/39) and the local-server scenarios are already confirmed and filed.
