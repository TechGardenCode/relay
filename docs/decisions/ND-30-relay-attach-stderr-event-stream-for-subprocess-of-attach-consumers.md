---
id: ND-30
status: open
title: "`relay attach` stderr event-stream protocol for subprocess-of-attach consumers"
affects: "packages/server/src/attach/tty.ts (the `onBusy` / `onClaimReleased` / `onSessionEnded` stderr emissions at lines 109–123); packages/extension/src/busyNotice.ts (future consumer; the file is NOT created by 6I because the event-stream contract is unresolved); docs/arch/client-agnosticism.md §4.3 (the subprocess-of-attach pattern that the extension implements); docs/prd/04-ide-extension.md §4 (the ND-02-compliant BUSY UX the extension is supposed to render but cannot today)."
surfaced-by: "relay-architect review during 6I IDE extension pre-code review (2026-05-22) — see the 6I PR for the full architect verdict."
---

# ND-30 — `relay attach` stderr event-stream protocol for subprocess-of-attach consumers


**Status:** open
**Affects:** `packages/server/src/attach/tty.ts` (the `onBusy` / `onClaimReleased` / `onSessionEnded` stderr emissions at lines 109–123); `packages/extension/src/busyNotice.ts` (future consumer; the file is NOT created by 6I because the event-stream contract is unresolved); `docs/arch/client-agnosticism.md` §4.3 (the subprocess-of-attach pattern that the extension implements); `docs/prd/04-ide-extension.md` §4 (the ND-02-compliant BUSY UX the extension is supposed to render but cannot today).
**Surfaced by:** relay-architect review during 6I IDE extension pre-code review (2026-05-22) — see the 6I PR for the full architect verdict.

## Question

How does a subprocess-of-attach consumer (the IDE extension at MVP; future MCP wrappers, terminal multiplexers, or PWA-side child processes) reliably observe `relay attach`'s session-lifecycle events — BUSY, claim_released, session_ended, auth_expired — when the only signal it gets today is human-prose stderr lines that fail [[nd-02-rejection-ux-for-busy-response]]'s anchoring + auto-dismiss contract and cannot be parsed without a fragile regex?

## Context

The 6I IDE extension is the first subprocess-of-attach consumer. Per [[d-g2-multi-client-input-arbitration]] the §5.1 client FSM lives in `relay attach`, not in the IDE extension — the architecture commitment in `docs/arch/client-agnosticism.md` §4.3 is that the extension shells out to `relay attach` and proxies stdin/stdout, rather than re-implementing the WS-level claim FSM.

[[nd-02-rejection-ux-for-busy-response]] requires the BUSY notice to be **anchored to the input area** (status-bar-row in the IDE terminal widget, inline above the compose field in the PWA), to auto-dismiss after 4 s or on next keystroke, and to be machine-distinct from the agent's own output. The current implementation in `packages/server/src/attach/tty.ts:115–117` emits:

```
\n[relay] another device is interacting with this session.\n
```

…on stderr from the `onBusy` callback. Under `vscode.window.createTerminal({ shellPath: 'relay', shellArgs: ['attach', sid] })` (the 6I spawn shape), that string is interleaved into the terminal pane alongside the agent's PTY stdout. Concretely it:

1. **Is not anchored to a status row.** It scrolls with PTY output and is gone from view as soon as the agent emits a few more bytes.
2. **Does not auto-dismiss.** It is a permanent line in the scrollback.
3. **Is not machine-parseable.** A consumer that wants to render an ND-02-compliant status item has to grep stderr for the exact prose, which is fragile under future copy edits and produces no signal for `claim_released` (no analogous stderr line exists) or other lifecycle transitions.

The architect verdict (6I PR, 2026-05-22) rejected two non-spec-faithful alternatives:

- **Extension opens its own read-only WS just for BUSY frames.** Violates the subprocess-of-attach framing in `docs/arch/client-agnosticism.md` §2.4 + §4.3 and re-vests the §5.1 client FSM in the extension, undoing the D-G2 partition that put it in `relay attach`.
- **Extension scrapes the current human-prose stderr line.** Fragile against future copy edits; produces no signal for any lifecycle transition beyond BUSY; locks the user-facing string into a machine contract by accident.

The spec-faithful alternative is a structured event-stream protocol on `relay attach`'s stderr, gated behind an opt-in env var so the laptop-local CLI UX (where stderr is the user's screen, not a parsed channel) does not regress.

## Elaboration prompt

What to land in this resolution:

- **(a) Wire shape.** Propose a one-line-per-event format `relay attach` emits on stderr when an opt-in env var is set. Strawman: `RELAY-EVENT <event-name> [key=value …]\n`, e.g., `RELAY-EVENT busy\n`, `RELAY-EVENT claim_released reason=delivered\n`, `RELAY-EVENT session_ended reason=agent_exit exit_code=0\n`, `RELAY-EVENT auth_expired token_id=01HXYZ...\n`. Plain-text-but-structured beats JSON-per-line because the consumer is parsing a child-process stderr stream that may also carry stack traces or warnings the extension does not want to JSON-parse. Decide whether the contract is "one event per line, leading sentinel `RELAY-EVENT `, fields are space-separated `key=value` with no shell-escaping (forbid spaces in values)" or something stricter like NDJSON.
- **(b) Opt-in mechanism.** Confirm the env var name (`RELAY_ATTACH_EVENT_STREAM=1` is the architect's suggestion) and the negative-side behavior: when the env var is unset, `relay attach` continues emitting the human-prose stderr line on `onBusy` so the laptop-CLI operator sees the rejection notice; when set, the prose line is suppressed and only the structured events fire (avoid double-noise in the pane). Validate this is the right partition vs. always-on event emission with the prose line removed entirely.
- **(c) Event catalog.** Enumerate the events that need to be in scope for 6I + near-term consumers. Minimum: `busy` (for ND-02 status item), `claim_released` (so the consumer can dismiss the BUSY notice when the other device finishes, per ND-02 rule "dismisses … or immediately when the user starts typing again or hits Enter again"), `session_ended` (so the consumer can close any session-scoped UI like a status-bar item), `auth_expired` (so the consumer can prompt for re-pair). Decide whether `claim_ack` / `hello` / `replay_*` should also surface or whether those stay purely WS-internal.
- **(d) Consumer-side scope.** The 6I extension's `busyNotice.ts` is the first consumer. Spec the consumer-side contract: each spawned terminal's child process gets a Node `ChildProcess` wrapper that scans stderr line-by-line, dispatches `RELAY-EVENT` lines to a parser, and forwards every other byte to the terminal pane unchanged (do not eat stderr). Decide whether the parser should live in `@relay/protocol` (so a future MCP wrapper or PWA child gets it for free) or inline in `packages/extension/src/`.
- **(e) Versioning.** Like the WS catalog ([`ws-protocol.md`](../arch/ws-protocol.md) §8), version this implicitly via "no version field at v1, future incompatible changes use a new env-var value such as `RELAY_ATTACH_EVENT_STREAM=2`." Or version it explicitly via a `RELAY-EVENT version 1\n` line at process start. The architect's bias was implicit-versioning to match the WS convention.
- **(f) Interaction with the bracketed-output mode.** `vscode.window.createTerminal` does not give the extension a Node-level `ChildProcess` handle — the API surface is `vscode.Terminal`, not `child_process.ChildProcess`. The extension cannot scan stderr from a `createTerminal` pane directly. The resolution must call out which of the following the extension does to get a parseable stderr:
  - Spawn `relay attach` via `child_process.spawn`, pipe stdin/stdout/stderr through the extension, and feed stdout to a `vscode.Pseudoterminal`-backed `vscode.Terminal` so the user sees the PTY output. The extension owns stderr and parses it. Significant rewrite of the 6I "Start session" command.
  - Add a `--event-stream-fd <n>` flag to `relay attach` that emits events on the named file descriptor instead of stderr; the extension passes a pipe via `vscode.Terminal.creationOptions.env` or similar. Cleaner separation; requires plumbing through `vscode.window.createTerminal`.
  - Have `relay attach` write events to a Unix socket whose path the extension passes via env. Sidesteps the terminal-API gap entirely; adds OS-specific code.
- **(g) ND-02 compliance check.** Whatever the wire shape and transport, validate the resolution against [[nd-02-rejection-ux-for-busy-response]] rules 1–5 end-to-end. The extension consumer must be able to render the notice anchored to the input area, dismiss it after 4 s or on next keystroke, suppress auto-retry, and preserve the local buffer — none of which is testable until the event stream exists.
- **(h) ND-25 interaction.** ND-25 (`^D` detach two-press) overlaps the surface area: any event-stream changes to `tty.ts` should coordinate with that fix or explicitly defer to it. Decide whether ND-30 and ND-25 should be resolved together (one PR to `attach/tty.ts` and `attach/client.ts`) or separately.
- **(i) Subprocess-of-attach as the canonical pattern.** Affirm or revisit whether subprocess-of-attach is the right shape for the IDE at all, given that the extension is bridging a TTY into a non-TTY surface (the VS Code terminal pane). The architect's verdict assumed yes; the question is worth asking explicitly so a reader of this resolution understands the trade-off was considered.

This is filed as `open` so the resolution lands as a deliberate code/doc edit rather than inline drift inside the 6I PR. ND-30 does not block 6I from shipping — the extension ships without `busyNotice.ts`, the BUSY signal remains visible only via the current human-prose stderr line in the terminal pane (suboptimal but not silent). Worth fast-following because the IDE BUSY UX gap is user-visible the moment a second device attaches to a running session.

## Resolution

*(unresolved)*
