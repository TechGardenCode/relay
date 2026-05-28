---
id: ND-40
status: resolved
resolved-on: 2026-05-28
title: "`relay attach` drops replayed screen bytes in the connect()→subscribe() gap"
affects: "packages/server/src/attach/client.ts (AttachClient — inbound binary delivery before a subscriber exists); packages/server/src/testkit/tui-harness.ts (spawnHarnessClient must mirror production connect→subscribe ordering, not subscribe-first); docs/arch/ws-protocol.md §3 (bracketed replay — the client must tolerate the 101 + replay frames arriving coalesced in a single read)."
surfaced-by: "7G attach-teardown task (docs/kickoffs/7G.md), 2026-05-28 — the real-binary tui-visual harness flapped altScreen false on ~2/10 loopback runs; root-caused to a connect()→subscribe() delivery gap in AttachClient."
---

# ND-40 — `relay attach` drops replayed screen bytes in the connect()→subscribe() gap

**Status:** resolved (2026-05-28)
**Affects:** `packages/server/src/attach/client.ts` (AttachClient — inbound binary delivery before a subscriber exists); `packages/server/src/testkit/tui-harness.ts` (`spawnHarnessClient` must mirror production connect→subscribe ordering); `docs/arch/ws-protocol.md` §3 (bracketed replay — the client must tolerate the 101 + replay frames arriving coalesced).
**Surfaced by:** 7G attach-teardown task ([`docs/kickoffs/7G.md`](../kickoffs/7G.md)), 2026-05-28 — the real-binary tui-visual harness flapped `altScreen=false` on ~2/10 loopback runs; root-caused to a delivery gap between `connect()` and `subscribe()`.

## Question

`cli/attach.ts` runs `await client.connect()` and *then* `runTty()` → `client.subscribe({ onBytes })`. In `AttachClient`, the `socket.on('message')` handler is registered inside `connect()` but reads `this.callbacks.onBytes` **at message-time**. `connect()`'s promise resolves on the `'open'` event; resolving a promise only *schedules* the awaiting continuation as a microtask — it does not run it synchronously. So when the underlying `ws` socket flushes the 101 handshake and the server's first application frames (`hello` → `replay_start` → the **binary screen snapshot**, which carries the agent's `\x1b[?1049h` alt-screen enter → `replay_end`) coalesced in a single socket read, `ws` emits `'open'` and then **synchronously** emits `'message'` for the buffered frames — all before the `await connect()` continuation runs `subscribe()`. At that instant `onBytes` is still `undefined`, so `this.callbacks.onBytes?.(buf)` no-ops and the replayed screen is **silently dropped**. The operator attaches to a blank/again-redrawn screen instead of the agent's current frame; with a full-screen TUI the alt-screen enter is lost and the client renders on the primary buffer. The server's `setImmediate` deferral (`server/ws/handler.ts` ~§3) narrows but does not close the window — TCP coalescing on a real LAN reopens it. Confirmed empirically: real-binary `altScreen` flipped `false` on 2/10 loopback runs.

Where should the fix live, and how do we guarantee no replayed byte is ever dropped regardless of `connect`/`subscribe` ordering?

## Resolution

`AttachClient` buffers inbound **binary** frames that arrive while no `onBytes` subscriber exists, and flushes them — in arrival order, exactly once — on the `undefined → defined` transition of `onBytes`.

1. **Buffer when no subscriber.** In the `socket.on('message')` binary branch, if `this.callbacks.onBytes === undefined`, append the frame to an internal inbound-binary buffer instead of dropping it. Once `onBytes` is defined, deliver directly — never buffer again.
2. **Flush on the undefined→defined transition.** `subscribe()` (and only the first time it sets `onBytes`) flushes the buffer to the newly-registered `onBytes`, preserving arrival order. The flush fires **exactly once**: a second `subscribe({ onBytes })` does not re-flush (the buffer is already drained and `onBytes` was already defined).
3. **No double-delivery.** A frame that arrives *after* a subscriber exists is delivered directly and is never also placed in the buffer; a frame buffered *before* the subscriber is delivered only via the flush.
4. **`onBytes` set at construction is unaffected.** When the constructor callbacks already include `onBytes`, the binary branch always delivers directly — no buffering, no flush, no behavior change for that path.
5. **Text frames are never buffered.** `hello` / `replay_start` / `replay_end` process normally even in the gap (they set `this.hello` and fire their own callbacks); only `onBytes`-bound binary frames buffer.
6. **Bounded buffer.** The buffer is capped at the session's `replayBufferBytes` (read from the inbound `hello`, which always precedes the binary snapshot in the protocol; a conservative default applies only if a binary frame somehow precedes `hello`). When the cap is exceeded the **oldest** buffered bytes are dropped, mirroring the server's ring-buffer semantics — so a caller that never subscribes cannot grow the buffer without bound.

**Why this and not reordering `cli/attach.ts` to subscribe-before-connect.** Subscribing first (the in-process harness's old trick) does make the in-process path deterministic, but as the *production* fix it is wrong: `runTty()` engages raw mode and attaches stdin listeners as a side effect of being called, so calling it before `connect()` means a connect failure (`ECONNREFUSED` → `runAttach` returns `2`) would leave the host terminal in raw mode with no cleanup path — `runTty` exposes only `done`, not a `cleanup` handle the caller can invoke on a failed connect. The buffer is the root-cause fix because it makes **both** orderings safe forever and keeps the connect-error path (raw mode engaged only after a successful connect) intact. Subscribe-before-connect may still be added later as defense-in-depth, but it is not the primary remedy.

**Propagated to:** _(pending — see [protocol](protocol.md))_
