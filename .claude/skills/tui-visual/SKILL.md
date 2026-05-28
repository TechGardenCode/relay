---
name: tui-visual
description: See how terminal size and resize affect `relay attach` rendering — drive the real attach pipeline at chosen cols×rows and read back a cell-accurate ASCII grid of what each client would render. The local, hermetic complement to vm-e2e. Use when touching attach/tty.ts, pty/supervisor.ts, server/ws/ resize/output, or any raw-mode / SIGWINCH / alt-screen path; or to reproduce a visual bug (Ctrl+D overlay, multi-client layout shift, input artifacting). Trigger phrases — "what does this render", "visual test", "tui grid", "capture the terminal", "does the frame tear", "reproduce ND-38 / ND-39".
---

# Relay tui-visual skill

Byte-level tests assert the bytes the PTY/WS emits; they cannot see a *rendered*
defect. A `[relay]` message painted over a frozen agent frame (ND-38) or a frame
torn because it was drawn for the wrong width (ND-39) are invisible to a byte
diff but obvious on screen. This skill gives you eyes: it drives the **real**
attach pipeline — a real `AttachClient` + `runTty` against a real `buildServer`
whose registry spawns a deterministic full-screen TUI fixture through the real
`node-pty` supervisor — at terminal sizes you choose, and renders each client's
output to a cell-accurate ASCII grid via `@xterm/headless` (the same VT engine
vendored as `@xterm/xterm` for the PWA). The grid is what a real terminal shows,
so reading it stands in for the manual eyeballing that found these bugs.

It is local and hermetic: in-memory SQLite, `127.0.0.1:0`, ephemeral `$HOME`s,
every PTY killed in `afterEach`. No LAN, no `claude`, no real `~/.relay`. This is
the fast inner loop; `vm-e2e` is the real-LAN outer proof.

## When to invoke

- You changed `packages/server/src/attach/tty.ts`, `pty/supervisor.ts`,
  `server/ws/handler.ts`, or anything touching raw mode, SIGWINCH/`resize`,
  alt-screen, or multi-client output fan-out.
- You want to reproduce / inspect a rendering bug: the Ctrl+D detach overlay,
  two different-sized clients shifting the layout, or input from one client
  artifacting on another.
- You're verifying a fix for [ND-38](../../../docs/decisions/ND-38-relay-attach-process-hangs-after-clean-ctrl-d-detach-in-raw-mode.md)
  or [ND-39](../../../docs/decisions/ND-39-concurrent-multi-client-attach-tui-rendering-corruption.md):
  the guard tests trip (turn red) when the bug is gone — that's your signal.

## The loop

1. **Capture.** From the repo root:

   ```
   pnpm tui:capture
   ```

   This runs the two visual suites
   (`packages/server/src/attach/tty-visual.test.ts` and
   `packages/server/src/server/ws/multiclient-resize-visual.test.ts`). Each
   scenario writes a framed ASCII grid to `packages/server/.tui-artifacts/`
   (gitignored). To run one suite, pass its path to `vitest run`.

2. **Read.** Open the artifacts — they are plain text, so just `Read` them:

   - `nd38-overlay.txt` — the `[relay] detached…` line painted on top of the
     frozen agent frame (the overlay defect).
   - `nd38-after-detach.txt` — client stdout after `^D`; a clean detach should
     have restored the primary screen (`altScreen=false`), but it's still
     `true` today.
   - `nd38-realbinary-after-detach.txt` — header reports `hasExited=…`; `false`
     means the real attach process hung.
   - `nd39-wide-clean.txt` — the last-writer client rendering the shared PTY
     correctly (the control).
   - `nd39-narrow-shredded.txt` — the mismatched client: torn border, wrong size
     label, the other client's input bled in.

   The banner on each file reports `cols×rows` and `altScreen`. A torn frame
   shows the box border wrapping onto extra rows; a wrong-size frame shows a
   `[ AxB ]` label that doesn't match the file's own size.

3. **Iterate.** Edit the implementation, re-run `pnpm tui:capture`, re-Read the
   grid, converge. When a fix lands, the corresponding `it.fails(...)` guard
   (or the characterization assertion) starts failing — remove the `.fails`
   marker / invert the assertion and it becomes a permanent passing regression
   test.

## Writing a new visual scenario

Use the harness in `packages/server/src/testkit/tui-harness.ts`:

```ts
const server = await bootHarnessServer();
const client = await spawnHarnessClient(server, { cols: 100, rows: 30 });
client.resize(100, 30);
const cap = await waitForCapture(client, (c) => c.altActive && c.grid.includes('100x30'));
writeArtifact('my-scenario.txt', cap, 'what this shows');
// ...assert on cap.grid / cap.altActive...
await server.cleanup(); // in afterEach
```

- `spawnHarnessClient` is in-process (fast; renders + observes overlay/shred).
  `spawnRealAttachClient` spawns the built `dist/cli/relay.js attach` in a real
  PTY — the only way to observe a process-exit/hang defect; it skips when
  `dist/` is unbuilt.
- The fixture (`testkit/fixtures/fullscreen-tui.mjs`) draws a bordered frame
  labelled with its own `COLSxROWS` and echoes typed input on row 3, so size
  mismatch and input bleed are both visible in the grid.
- Every test gates on `spawnHelperReady()` and `describe.skip`s with a
  diagnostic on a host whose `node-pty` macOS spawn-helper lost its exec bit
  (`pnpm --filter @relay/spike fix-pty`).

## If the ASCII grid isn't enough

The grid captures layout, overlap, wrapping, and alt-screen state — everything
the three known bugs need. If a future bug needs true color/pixel fidelity
(e.g. a 256-color rendering issue the grid flattens), escalate to real PNG
screenshots via `charmbracelet/vhs`: add a `--png` path to the capture that
shells out to `vhs` (probe with `which vhs`, skip when absent — never on the CI
critical path) and `Read` the PNG as an image. Not built yet; this is the
documented next step, not a TODO in the code.
