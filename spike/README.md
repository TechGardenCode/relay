# Relay Phase 0 Spike

A weekend proof that Relay's architectural backbone works under the cross-device test.
See [`docs/prd/07-phasing.md`](../docs/prd/07-phasing.md) Phase 0 for the bar this
spike has to clear. This is **not** Phase 1 code — Phase 1 lives in
`packages/server/` and rebuilds everything here on top of Fastify, SQLite,
persona application, and the full WS message catalog.

## What it proves

1. Server spawns `claude` under `node-pty`.
2. Two clients can attach simultaneously via WebSocket — including from **two
   different physical machines** on the same LAN. (Same-host multi-attach
   doesn't pass; cross-host is the load-bearing test.)
3. Both clients see live PTY output.
4. Either client can send input (no claim arbitration in Phase 0 — bidirectional
   input only needs to be mechanically possible).
5. Disconnect + reattach delivers a small recent-bytes replay then live output
   (subset of D-G3).
6. Server restart transitions any `running` session to `killed` with
   `terminated_reason = "server_restart"`, keeping the metadata recoverable
   (D-11).

## Setup

```
pnpm install
cp spike/config.example.json spike/config.json
# edit spike/config.json — set a real bearerToken, confirm spawnCommand
```

`spike/config.json` is gitignored.

To pick a token, anything random and reasonably long works for the spike. For
example: `openssl rand -base64 32`.

### node-pty + pnpm gotcha (macOS / Linux)

`node-pty`'s `spawn-helper` ships as a prebuilt binary inside `node_modules`,
and pnpm's content-addressable hardlinking can drop the executable bit during
install. If `POST /sessions` returns `posix_spawnp failed`, run:

```
pnpm --filter @relay/spike fix-pty
```

That's a thin wrapper around
`chmod +x node_modules/.pnpm/node-pty@*/node_modules/node-pty/prebuilds/<platform>/spawn-helper`.
Run it once after each `pnpm install`. Phase 1 will fold this into the server
package's install scripts.

If `claude` isn't on PATH for the server's user, either:

- Symlink it onto PATH for that user, or
- Temporarily set `"spawnCommand": "bash"` to validate the wire first, then
  switch back.

## Running the server

From the repo root:

```
pnpm --filter @relay/spike serve
```

The server binds to the host/port in `config.json` (default `0.0.0.0:7777` so
LAN peers can reach it). On startup it loads `~/.relay-spike/state.json`,
performs the D-11 orphan sweep, and prints a one-line summary.

## Creating a session

From any machine that can reach the server (the server machine itself is
fine):

```
curl -X POST http://<SERVER_LAN_IP>:7777/sessions \
     -H 'Authorization: Bearer <TOKEN>'
# → { "sessionId": "..." }
```

Or list sessions (useful after a restart to confirm D-11):

```
curl http://<SERVER_LAN_IP>:7777/sessions \
     -H 'Authorization: Bearer <TOKEN>'
```

## Attaching

From either machine:

```
pnpm --filter @relay/spike exec tsx src/attach.ts <SERVER_LAN_IP>:7777 <TOKEN> <SESSION_ID>
```

The attach client puts your terminal into raw mode, streams binary PTY bytes
to stdout, and base64-encodes keystrokes into `{type:"send"}` JSON frames over
the WS. Terminal resizes are forwarded as `{type:"resize"}` frames. **Press
Ctrl-D to detach.** Ctrl-C passes through to the agent.

> **Why `exec tsx` instead of `run` / a script name?** `pnpm run <script>`
> wraps stdio for log capture, which breaks the raw-mode TTY the attach
> client needs (keystrokes never reach the WS, and your terminal looks frozen
> after the connect banner). `pnpm exec` inherits the parent TTY directly.
> The `serve` and `attach` script aliases in `package.json` only work for
> non-interactive use; for the cross-device walkthrough always use
> `exec tsx ...`.

## Cross-device walkthrough (the load-bearing test)

1. Pick the server machine. Confirm `claude` is installed and authenticated
   for that user; confirm port 7777 is open on its LAN interface (`lsof
-iTCP:7777` + macOS firewall settings).
2. Note the server's LAN IP (`ipconfig getifaddr en0` on macOS,
   `hostname -I | awk '{print $1}'` on Linux).
3. Start the server: `pnpm --filter @relay/spike serve`.
4. From any machine, `curl -X POST .../sessions` to spawn an agent. Note the
   returned `sessionId`.
5. **Client 1** (e.g., the server machine): attach.
6. **Client 2** — a _different physical machine_ on the same network: attach
   with the same `sessionId`. Acceptable second machines: a second laptop, a
   desktop, an RPi, a phone running Termius/Blink-over-Tailscale, SSH from a
   tablet, etc. Same host doesn't count.
7. Type from one client. Both clients should see the keystroke echoed and the
   agent's response.
8. Type from the other client. Same — both clients see it.
9. Kill Client 1's terminal. Client 2 should keep streaming. Reattach Client 1;
   the ring buffer (up to 32 KB by default) replays, then live output resumes.
10. Ctrl-C the server. Restart it. `curl .../sessions` should show the prior
    session with `status: "killed"`, `terminatedReason: "server_restart"`.

## Deliberate non-goals

These are Phase 1 work, not Phase 0:

- CLAIM / RELEASE arbitration (task 6G).
- `replay_start` / `replay_end` brackets around the on-attach replay (task 6G).
- SQLite (task 6A) — spike uses an in-memory `Map` plus a tiny JSON sidecar.
- Persona application (task 6C) — spike spawns the agent CLI with no flags.
- Transcript pagination beyond the ring buffer (task 6D).
- Per-device token issuance (task 6B) — spike uses one hardcoded shared token.
- TLS — bearer token is plaintext over WS on the LAN. Put it behind Tailscale,
  not the open internet.

When the walkthrough passes, write `docs/phase-0-report.md` and flip the 4B
row in `docs/build-plan.md` to `done`.
