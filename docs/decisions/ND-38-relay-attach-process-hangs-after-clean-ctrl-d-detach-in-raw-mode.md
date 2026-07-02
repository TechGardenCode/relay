---
id: ND-38
status: resolved
resolved-on: 2026-05-28
title: "`relay attach` process hangs after a clean ^D detach in raw mode"
affects: "packages/server/src/attach/tty.ts (runTty cleanup / stdin lifecycle); packages/server/src/cli/attach.ts (runAttach exit path + its 'Exits 0 on clean ^D detach' header contract); packages/server/src/cli/relay.ts (attach action — sets process.exitCode but never process.exit on a clean detach); packages/server/src/attach/tty.test.ts (the 15 specs that pass without exercising the real process.stdin lifecycle)."
surfaced-by: "7F rollout-readiness walk (docs/history/rollout-readiness-walk.md) Finding F-1, 2026-05-27 — a live PTY detach test against an isolated-$HOME server."
---

# ND-38 — `relay attach` process hangs after a clean ^D detach in raw mode

**Status:** resolved (2026-05-28)
**Affects:** `packages/server/src/attach/tty.ts` (runTty cleanup / stdin lifecycle); `packages/server/src/cli/attach.ts` (runAttach exit path + its "Exits 0 on clean ^D detach" header contract); `packages/server/src/cli/relay.ts` (attach action — sets `process.exitCode` but never `process.exit` on a clean detach); `packages/server/src/attach/tty.test.ts` (the 15 specs that pass without exercising the real `process.stdin` lifecycle).
**Surfaced by:** 7F rollout-readiness walk ([`docs/history/rollout-readiness-walk.md`](../history/rollout-readiness-walk.md) Finding F-1, 2026-05-27) — a live PTY detach test against an isolated-`$HOME` server.

## Question

`relay attach` does not cleanly tear down the terminal when the WS closes. Two related defects, both rooted in `runTty`'s `cleanup()` doing only `enableRaw(false)`:

1. **Process does not exit on a clean `^D` detach (raw mode).** The session detaches correctly — the WS closes 1000, the [[nd-34-session-and-attach-polish-deep-dive]] "still running / reattach with…" confirmation prints, the server-side session stays `running` — but the `relay attach` **process itself does not exit**, so the operator's shell prompt never returns and they must `^C` out. Contradicts `cli/attach.ts`'s own header contract ("Exits 0 on clean ^D detach").
2. **Terminal screen is not restored on close (any close path).** When the attached agent is a full-screen TUI (Claude Code uses the alternate-screen buffer + cursor positioning, passed through to the real terminal), `relay attach` on close does **not** restore the screen — it never exits the alt-screen / resets the display. The agent's frozen TUI frame is left on screen and the `[relay] …` stderr line is painted **into the middle of it**, producing a corrupted ("bugged out") display. Observed on **both** a `^D` local detach *and* a `session_ended` close (confirmed live, [Observed live](#observed-live-2026-05-27) below).

The decided ND-34 / [[nd-25-relay-attach-detach-with-d-requires-two-keypresses-on-the-host-tty]] *behaviors* are intact and the messaging is correct in every path (single-press detach + "still running" on detach; "session ended" — **not** "still running" — on a `session_ended` 1000 close, which positively confirms ND-34's close-code-overload guard). The gap is purely the **terminal/process teardown**: stdin release + process exit (defect 1) and screen restore (defect 2). What is the correct fix, and where should teardown (stdin release, process exit, screen reset) live?

## Elaboration prompt

**Root cause (traced from code during the 7F walk):**

1. `attach/tty.ts` `runTty()` resolves its `done` promise in `onClose`, and `cleanup()` reverts raw mode (`enableRaw(false)`) — but it **never** pauses, unrefs, or destroys `stdin`, and the `stdin.on('data')` / `stdin.on('end')` listeners stay attached.
2. `cli/attach.ts` `runAttach()` does `const code = await done; return code === 1000 ? 0 : 1`, and `cli/relay.ts`'s attach action does `if (code !== 0) process.exitCode = code` — so on a **clean detach (code 0) nothing calls `process.exit`**.
3. In **raw mode**, `^D` arrives as a `0x04` *data byte* (the `CTRL_D` branch → `client.close()`), **not** an EOF — so `stdin` never emits `end` and never closes. A flowing, ref'd TTY `stdin` handle keeps the Node event loop alive indefinitely → the process hangs.
4. The [[nd-25-relay-attach-detach-with-d-requires-two-keypresses-on-the-host-tty]] (b) **canonical-mode** path is unaffected: there `^D` is a real EOF → `stdin` `end` fires and the stream closes, so the process can exit naturally. This asymmetry is why the defect is invisible in the canonical regime.
5. The 15 `attach/tty.test.ts` specs pass because they drive a **mocked** `AttachClient` and assert `done` resolves + the confirmation is written; they never wire real `process.stdin` or assert process termination, so they cannot catch the hang.

**What to decide / validate:**

- **Where the release lives.** Options: (a) in `cli/attach.ts` after `await done` — `process.stdin.pause(); process.stdin.unref?.()` (lets a clean event-loop drain exit the process, preserving `process.exitCode` semantics); (b) explicit `process.exit(code)` after flushing stdout/stderr (simplest, but bypasses natural drain and any pending writes); (c) in `runTty`'s `cleanup()` — pause/remove the stdin listeners as part of teardown so every caller benefits. Weigh against the test-seam design (`installExitHook`) already in `runTty`.
- **Screen restore (defect 2).** `cleanup()` reverts raw mode but does **not** restore the display when the agent left the terminal in the alternate-screen buffer. Decide whether teardown should emit a terminal reset on close — minimally exit the alt-screen + move the cursor to a clean line (e.g. write `\x1b[?1049l` / `\x1b[?47l` + `\x1b[0m`, or a `tput rmcup`-equivalent) **before** printing the `[relay] …` line — so the confirmation lands on the restored main screen instead of being painted into the frozen TUI frame. Consider that the agent, not relay, entered the alt-screen (via PTY passthrough), so relay must conservatively reset rather than assume a known prior state; and that a non-TUI agent must not be harmed by the reset. Note this is coupled to defect 1: if the process exited cleanly, some terminals restore the main screen on child exit, but relying on that is fragile — emit the reset explicitly.
- **Don't regress the canonical path.** Whatever ships must keep the ND-25(b) single-press canonical-mode detach exiting cleanly, and must not double-close or throw when `client.close()` is idempotently invoked from both the `data` and `end` handlers.
- **Test the real lifecycle.** Add a co-located spec (or a thin integration test) that exercises a real/`pty`-backed `stdin` and asserts the process/stream is released after a clean `^D`, closing the coverage gap that let this through. The 7F walk's repro (Python `pty.fork`, write one `0x04`, observe the process still alive >12 s after the confirmation prints) is a usable reference.
- **Scope.** This is a defect against the resolved [[nd-34-session-and-attach-polish-deep-dive]] (items a/i) and [[nd-25-relay-attach-detach-with-d-requires-two-keypresses-on-the-host-tty]] implementation, not a reopening of their *decisions*; the detach contract ([[d-g3-reattach-semantics]]: session keeps running) is correct and unchanged. Keep [[nd-24-per-keystroke-input-streaming-for-tui-agents]]'s per-keystroke forwarding intact.

The 7F walk recorded this as a finding and **deliberately did not patch it inline** (per the kickoff's "don't silently fix; reopen the relevant ND / file via decision-log" rule); the fix is deferred to a dedicated follow-up task that resolves this entry.

## Observed live (2026-05-27)

Reproduced by the operator in a Remote-SSH'd Cursor terminal pane attached to a real session in `/tmp/relay-proj` (Claude Code v2.1.153 TUI as the agent), two screenshots, two distinct flows:

**Flow A — single `^D` (detach).** The Claude TUI frame stays fully drawn on screen; the relay detach line is rendered *inside* the frame, between Claude's input box and its bottom status row:
```
> Try "how does <filepath> work?"
[relay] detached from session 01KSP2GMGCR38Z8S21N963BY5Z; the session is still running. Reattach with: relay attach 01KSP2GMGCR38Z8S21N963BY5Z
? for shortcuts · ← for agents                                   ◉ xhigh · /effort
```
→ Detach + "still running" message correct (ND-25/34); **but the terminal was not restored** — the agent's TUI frame is frozen on screen with the relay line painted into it (defect 2). Consistent with the process also not exiting (defect 1).

**Flow B — `^C` then `^C` (forwarded to the agent, not a relay detach).** First `^C` reaches the agent (Claude shows "Press Ctrl-C again to exit"); the second quits Claude → agent exits → session ends:
```
> Try "fix lint errors"
Press Ctrl-C again to exit                                       ◉ xhigh · /effort
[relay] session ended (agent_exit).
[relay] disconnected (1000: session ended).
```
→ `^C`-to-agent is by design (tty.ts forwards `0x03` as a regular byte). Relay correctly printed **`session ended` / `disconnected (1000: session ended)`** — **not** the "still running" line — positively confirming ND-34's close-code-1000 overload guard. **But the same screen corruption occurs**: the TUI frame is left on screen with the relay lines jammed in (defect 2 fires on the `session_ended` close path too, not just on `^D`).

**Flow C — host TTY confirmation of defect 1 (Step 8).** Separately, the operator confirmed on a real host TTY (not the IDE pane) that a single `^D` detaches but **the process does not exit — `^C` is required to close it** ("Step 8 breaks as well. ^D requires ^C to close"). This corroborates the `pty.fork` harness result for defect 1 outside the harness.

**Takeaway:** the messaging logic is correct on every path; defect 2 (no screen restore) reproduces on *any* close, and defect 1 (no process exit) on the `^D` raw-mode path — both now confirmed live by the operator, not just in a harness. The fix must restore the terminal (exit alt-screen / reset) on **every** close, and release stdin / exit the process on a clean detach. A *minor adjacent UX note* (not a bug): a user may expect `^C` in `relay attach` to detach; instead it goes to the agent and a double-`^C` ends the session — worth a one-line callout in the handbook/`session show` docs, separate from this defect.

## Resolution

Both defects are fixed in `runTty`'s `cleanup()` — **decision-menu option (c)**: teardown (screen restore + stdin release) lives in the bridge so every caller benefits, with no `process.exit` so a natural event-loop drain preserves `process.exitCode` semantics and flushes pending writes.

1. **Screen restore on every close (defect 2).** `cleanup()` writes `\x1b[?1049l\x1b[0m\x1b[?25h` to **stdout** — leave the alternate screen, reset SGR, restore the cursor — **before** `onClose` writes the `[relay] …` line to stderr. So the confirmation lands on the restored primary screen, not painted into the agent's frozen alt-screen frame. It fires on **every** close path (`^D`, `session_ended`, `error`), per the live findings. `\x1b[?1049l` is a no-op when no alt screen was entered, so a non-TUI / line-oriented agent's primary-screen output is unharmed.
2. **stdin release → process exit on a clean `^D` (defect 1).** `cleanup()` detaches the `data`/`end` listeners, then `stdin.pause()` and `stdin.unref?.()`. In raw mode `^D` is a `0x04` data byte (not EOF), so stdin never closes itself; a flowing, ref'd TTY handle kept the event loop alive and hung the process. Releasing it lets the loop drain and the process exits on its own — no `process.exit`, so `process.exitCode` (set by `cli/attach.ts` → `cli/relay.ts`) is honored and the screen-restore bytes + `[relay]` line still flush.
3. **Idempotency + canonical path preserved.** `cleanup()` keeps its `cleanedUp` latch (runs once across the `onClose` and `process('exit')` paths). The named `data`/`end` handlers both call the idempotent `client.close()`, so the ND-25(b) single-press canonical-mode `'end'` detach still exits cleanly and is not regressed.
4. **Messaging unchanged.** The ND-34 `localDetach` latch and the "still running / reattach" (on `^D`) vs "session ended" (on a `session_ended` 1000 close) wording are untouched — this resolves the teardown, not the messaging.

**Why option (c) and not (a) or (b).** Option (a) (release stdin in `cli/attach.ts` after `await done`) leaves `runTty`'s in-process callers (the visual harness, future embedders) still hanging, since the release would live outside the bridge. Option (b) (explicit `process.exit(code)`) is the most fragile: it bypasses the natural drain, so the just-written screen-reset bytes and the `[relay]` line can be truncated before they flush — and validation would have to separately prove both that the process exited *and* that the restore bytes reached the terminal. Option (c) puts teardown where the terminal state was acquired (the bridge that engaged raw mode), benefits every caller, and the natural drain makes the flush-vs-exit coupling a non-issue.

**Validation.** Every fix shipped red→green with pasted evidence; the real-binary hang test was inverted to assert prompt exit (≤2s, 10/10) against a freshness-guarded fresh `dist/`, and the in-process overlay guard was de-`.fails`'d as a permanent regression test. See the filled Validation ledger appended to [`docs/history/rollout-readiness-walk.md`](../history/rollout-readiness-walk.md).

**Surfaces new sub-questions:** [[nd-40-relay-attach-drops-replayed-bytes-in-connect-subscribe-gap]] (the replay-drop race, found while making the tui-visual harness faithful to the shipped binary — filed + resolved alongside this).

**Propagated to:** _(pending — see [protocol](protocol.md))_
