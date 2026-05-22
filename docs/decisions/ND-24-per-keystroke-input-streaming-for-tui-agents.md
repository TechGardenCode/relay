---
id: ND-24
status: resolved
title: "Per-keystroke input streaming for TUI agents"
resolved-on: 2026-05-19
affects: "docs/arch/ws-protocol.md §2.2 (send frame contract), §5.1 (client FSM gains a streaming state), §5.2 (server FSM: send-without-newline no longer releases), §5.3 (new race row for \"newline mid-stream while another claim queued\"), §8 (summary table); packages/protocol/src/ws-frames.ts (SendFrame JSDoc reflects the multi-send contract; schema unchanged); packages/server/src/server/ws/handler.ts (handleSend stops auto-releasing; release fires only when payload bytes contain \\n or \\r); packages/server/src/server/ws/handler.test.ts (multi-send-per-claim happy path; newline-triggers-release; ND-01 timeout still fires under sustained typing); packages/server/src/attach/tty.ts (drop lineBuffer/consumeBuffer/submitLine; forward each stdin byte verbatim via a new client.submitByte(byte)); packages/server/src/attach/client.ts (FSM gains streaming state between claiming and idle; new submitByte API; pendingByte queueing replaces pendingLine); packages/server/src/attach/client.test.ts + packages/server/src/attach/tty.test.ts (test contract changes — line-buffered specs become per-byte specs); .claude/skills/ws-protocol-check/SKILL.md (catalog gains the newline-release rule); docs/build-plan.md (new task **6L** between 6K and 6I; 6I dependency list updates); [[nd-17-relay-attach-raw-mode-tty-variant-of-the-51-client-fsm]] (superseded in part — line-mode framing retained for line-mode agents only)."
surfaced-by: "2026-05-19 6H manual validation walk on macOS with @anthropic-ai/claude-code 2.1.x as the spawned agent. Single-device repro (laptop only, no LAN needed) using a scoped HOME so the operator's real ~/.relay is untouched: init → server boot → project add → POST /sessions → relay attach <sid> → type into the prompt. claude's TUI compose box never showed any in-progress typing — operators type blind. The headline cause is packages/server/src/attach/tty.ts:57-152's lineBuffer, which accumulates stdin bytes locally and only submits to the WS when it sees \\r or \\n. Whole-line submission on Enter does work end-to-end (verified 6H), but the typing UX is broken for every TUI agent, and claude is the production agent. This blocks scenarios E/F/H with claude as the agent and gates 6I (the IDE extension's terminal widget hits the same bug the moment it spawns relay attach)."
---

# ND-24 — Per-keystroke input streaming for TUI agents


**Status:** resolved (2026-05-19)
**Affects:** `docs/arch/ws-protocol.md` §2.2 (`send` frame contract), §5.1 (client FSM gains a `streaming` state), §5.2 (server FSM: `send`-without-newline no longer releases), §5.3 (new race row for "newline mid-stream while another claim queued"), §8 (summary table); `packages/protocol/src/ws-frames.ts` (`SendFrame` JSDoc reflects the multi-send contract; schema unchanged); `packages/server/src/server/ws/handler.ts` (`handleSend` stops auto-releasing; release fires only when payload bytes contain `\n` or `\r`); `packages/server/src/server/ws/handler.test.ts` (multi-send-per-claim happy path; newline-triggers-release; ND-01 timeout still fires under sustained typing); `packages/server/src/attach/tty.ts` (drop `lineBuffer`/`consumeBuffer`/`submitLine`; forward each stdin byte verbatim via a new `client.submitByte(byte)`); `packages/server/src/attach/client.ts` (FSM gains `streaming` state between `claiming` and `idle`; new `submitByte` API; `pendingByte` queueing replaces `pendingLine`); `packages/server/src/attach/client.test.ts` + `packages/server/src/attach/tty.test.ts` (test contract changes — line-buffered specs become per-byte specs); `.claude/skills/ws-protocol-check/SKILL.md` (catalog gains the newline-release rule); `docs/build-plan.md` (new task **6L** between 6K and 6I; 6I dependency list updates); [[nd-17-relay-attach-raw-mode-tty-variant-of-the-51-client-fsm]] (superseded in part — line-mode framing retained for line-mode agents only).

**Surfaced by:** 2026-05-19 6H manual validation walk on macOS with `@anthropic-ai/claude-code` 2.1.x as the spawned agent. Single-device repro (laptop only, no LAN needed) using a scoped `HOME` so the operator's real `~/.relay` is untouched: `init` → `server` boot → `project add` → `POST /sessions` → `relay attach <sid>` → type into the prompt. claude's TUI compose box never showed any in-progress typing — operators type blind. The headline cause is `packages/server/src/attach/tty.ts:57-152`'s `lineBuffer`, which accumulates stdin bytes locally and only submits to the WS when it sees `\r` or `\n`. Whole-line submission on Enter does work end-to-end (verified 6H), but the typing UX is broken for every TUI agent, and claude is the production agent. This blocks scenarios E/F/H with claude as the agent and gates 6I (the IDE extension's terminal widget hits the same bug the moment it spawns `relay attach`).

## Question

Should `relay attach`'s raw-mode TTY send per-keystroke `send` frames (or a streaming variant), or stay line-buffered? If per-keystroke, how does claim arbitration work — does each keystroke re-claim, does the first keystroke claim and Enter (or an idle timer) release, does the §5.1 FSM gain a `streaming` state that holds the lock while bytes flow?

## Context

[[d-g2-multi-client-input-arbitration]] (resolved 2026-05-14) chose a per-message server-side claim-lock model with line-buffered input as the "message" granularity. Its resolution rationale explicitly named the limitation:

> "Claude Code's line-buffered input maps cleanly to per-message granularity. Character-at-a-time interactive apps (vim inside the session) are not the MVP target and would not work cleanly under this lock model — accepted limitation."

The MVP target moved without D-G2 being re-litigated. The 2026-05-18 Claude Code 2.1.x release ships a TUI that draws its own compose box from the bytes it receives on stdin — exactly the character-at-a-time interactive shape D-G2 named as out-of-scope. Every operator that runs `relay attach <sid>` against a real claude session sees nothing in the compose box until Enter, because line buffering in `tty.ts` swallows every keystroke.

[[nd-17-relay-attach-raw-mode-tty-variant-of-the-51-client-fsm]] (open) acknowledged the §5.1 FSM mismatch for raw-mode TTYs and accepted the collapsed-Claimed-state variant provisionally. Its framing treated the question as wire-correctness only — "the server doesn't care which sub-FSM the client uses, only the order of frames on the wire." That framing missed the UX-mandatory case: for a TUI agent the line-buffered client is wire-correct but functionally broken, because the agent's own UI depends on seeing in-progress input. ND-24 supersedes ND-17 on this specific axis; ND-17's scope narrows to line-mode agents (`bash -i`, scripted runs) where its conclusion still holds.

The line-buffered design is also load-bearing on the server side: `packages/server/src/server/ws/handler.ts:425` calls `state.lock.releaseAsHolder(ctx.id, 'delivered')` immediately after every PTY write, meaning a single claim grants the right to send exactly one `send` frame. The server FSM (`ws-protocol.md` §5.2 row 4) bakes this in: "`send` from `conn-X` delivered to PTY → `Unclaimed`". A per-keystroke client cannot reuse this server FSM as-is — sending byte 2 of a typing burst would error with `send_without_claim` because byte 1 already released the lock.

## Options under consideration

- **Option A — Per-keystroke send, claim-held-during-typing.** First keystroke triggers claim; subsequent keystrokes send as long as we hold the claim. Release on: (a) explicit user gesture (Ctrl-X — Ctrl-C is SIGINT, not release); (b) inactivity timer (reuse the existing [[nd-01-claim-lock-timeout-duration]] 30s claim-lock timeout); (c) Enter, treating Enter as line-terminator + auto-release. Cleanest mapping to existing claim-lock semantics; the §5.1 FSM gains a `Streaming` state explicit in `ws-protocol.md`. Sub-question (resolved here): which release trigger ships? See **Current thinking**.

- **Option B — Stream-mode `send` frame.** Add a `stream: true` field to `send` that lets the client send partial input chunks; server applies them to the PTY without expecting a release. Avoids new FSM states but mutates an existing frame's contract. The client and server still need to agree on when a "logical input" ends so the claim can release — which puts the line-detection logic right back on the table.

- **Option C — Two attach modes: `--line-buffered` vs `--stream`.** Client-side flag. Default to stream for raw-mode TTY (claude / TUI), opt out for scripted / non-TUI runs. Worse UX (operators must know which mode to pick) but no protocol churn for the simple case. The flag also doesn't compose: a single session may be attached by a TUI client and a scripted client at the same time, and the server now has to handle both shapes.

- **Option D — Detect TUI by alt-screen escape.** When the PTY emits `ESC [ ? 1049 h` (enter alt screen), switch the client to per-keystroke mode automatically. Magical and brittle — the client silently switches behavior based on server output, which is hard to test and hard for an operator to reason about when it misfires.

## Current thinking

**Recommend Option A with server-side Enter-byte detection as the release trigger.** Per the user's 2026-05-19 clarification, the release trigger is **(c) Enter** — but implemented as server-side newline detection rather than as a client-managed release frame, because that keeps the client logic dumb (forward every stdin byte verbatim) and preserves the existing `claim → send* → claim_released` wire shape.

Concretely:

1. **Wire contract.** `claim → claim_ack → send* → claim_released { reason: delivered }` where `send*` is one-or-more `send` frames. Each `send` carries a single byte (or a small burst of bytes for paste) base64-encoded in the existing `data` field. No schema change — the `SendFrame` schema is unchanged; only its semantic contract widens.

2. **Server FSM (§5.2) edit.** Row 4 changes its trigger: "`send` from `conn-X` containing a newline byte (`\n` or `\r`) → `Unclaimed`, broadcast `claim_released { delivered }`." A new row inserts above row 5: "`send` from `conn-X` without a newline byte → `ClaimedBy(X)` (no change)." All other rows (`busy`, `timeout`, `release`, `disconnect`, `session_ended`) are unchanged.

3. **Client FSM (§5.1) edit.** A new `Streaming` state sits between `Claiming` and `Idle`. Transitions: `claim_ack` → `Streaming` (replaces the current "claim_ack → Sending" CLI-only collapse from ND-17). In `Streaming`, each stdin byte emits a `send` frame; the state does not transition. `claim_released { reason: delivered }` → `Idle` (and if `pendingByte` is queued from a continuation burst, kick a new `claim` immediately, mirroring the existing "user typed another line mid-send" path). `claim_released { reason: timeout | disconnect }` while `Streaming` → `Idle` without auto-resend (per [[nd-02-rejection-ux-for-busy-response]]).

4. **TTY bridge (`attach/tty.ts`) edit.** Drop the `lineBuffer`, `consumeBuffer`, and `submitLine` machinery. Forward each non-`^D` stdin byte verbatim via a new `client.submitByte(byte)` method. `^D` still triggers `client.close()` (clean detach). `^C` is just another byte in the stream — no special-casing.

5. **Why server-side newline detection and not a client-managed release frame.** Server-side detection (a) keeps the client dumb, (b) requires no new wire frame, (c) makes the line-completion semantics part of the wire contract (visible in `ws-protocol.md` §5.2's transition table) instead of hiding inside the client FSM, (d) handles pasted multi-line input correctly without coordinating between client and server. The cost is that the server has to scan each `send`'s decoded bytes for `\n` or `\r`, which is ~free for the byte volumes involved.

**Why not the other options:**

- **Option B** mutates `send`'s contract for no benefit over server-side newline detection — the `stream: true` field would just be redundant signal because the server can already infer line-completion from the byte content.
- **Option C** forces operators to know which mode their agent needs and doesn't compose across multi-client attach.
- **Option D** is magical — silent client-behavior switching based on server output is hard to test and hard for an operator to reason about when it misfires.

**Known concerns the implementation task (6L) must answer:**

- **Multi-line paste.** A clipboard paste containing embedded `\n` releases the claim mid-paste under server-side newline detection. Preferred answer: accept that paste releases the claim at the first `\n` and the remaining bytes claim again automatically (matches `tmux` and `screen` paste behavior). The FSM's "`pendingByte` → kick a new claim" path handles continuation. Alternative answer (worse, more client complexity): the client buffers paste until terminator and submits one `send` containing the full multi-line payload — observably equivalent because the server still releases on the first `\n`. Recommend the first.
- **[[nd-01-claim-lock-timeout-duration]] 30s timeout under sustained typing.** ND-01 forbids re-arming the timeout on activity. A user typing continuously for 30s without an Enter would have the claim released mid-typing. Recommend keeping ND-01's rule unchanged — a 30s sustained typing burst without an Enter is pathological for claude (compose buffers don't get that long) and the existing busy/backoff path handles the retry. Flag this for human sign-off — if it surfaces a real UX problem in 6L's manual validation, ND-01 itself has to be re-opened, not patched around in ND-24.
- **`^C` semantics under streaming.** `tty.ts` currently passes `^C` through as a single-byte "line" via `submitLine`. Under streaming, `^C` is just another byte forwarded immediately; no special-casing needed. The byte still reaches the PTY as SIGINT for the agent to interpret.
- **Test isolation under multi-send-per-claim.** The `handler.test.ts` `send_without_claim` race specs assume one-send-per-claim; they may need new fixtures that explicitly drive multi-send-per-claim flows.

## Re-evaluate if

- (a) Claude Code switches back to line-mode I/O (would moot ND-24 — line buffering becomes correct again).
- (b) A non-line-mode agent emerges that needs sub-line claim arbitration between two concurrent typists (would force a re-think of the "newline = release" trigger).
- (c) The multi-line paste path surfaces a UX issue the FSM can't paper over (would force option re-evaluation, possibly toward Option B's explicit stream flag).
- (d) The ND-01 30s timeout interaction surfaces as a real UX defect under sustained typing.

## Resolution

**Option A with server-side newline-byte detection as the release trigger.** The wire shape `claim → claim_ack → send* → claim_released { reason: delivered }` is preserved; the semantic widens from "exactly one `send` per claim" to "one-or-more `send` frames per claim, the server releases the moment a `send`'s decoded payload contains `\n` (0x0a) or `\r` (0x0d)." `SendFrameSchema` is unchanged.

Implementation tightenings (load-bearing for 6L):

1. **Client API is batched, not strict per-byte.** The attach client exposes `submitInput(bytes: Buffer)`; the TTY bridge forwards each stdin `data` event as one `send`. Avoids amplifying a 1 KB paste into 1000 frames. Per-byte typing still produces per-byte sends because raw-mode stdin chunks are typically one byte.
2. **Client FSM** gains a `Streaming` state between `Claiming` and `Idle`. `claim_ack` → `Streaming`; in `Streaming`, each `submitInput` emits a `send` and the state stays. `claim_released { delivered }` → `Idle` (and kicks a fresh `claim` if `pendingInput` accumulated during the prior burst). `claim_released { timeout | disconnect | voluntary | session_ended }` → `Idle`, drop `pendingInput`.
3. **`pendingInput` is a concatenating `Buffer`** (not a single byte). Accumulates bytes received while in `Claiming` or `Backoff`. Flushes on entry to `Streaming`; drops on terminal release reasons.
4. **Backoff queues bytes; the 4 s timer alone dismisses.** Today's line-mode client dismisses backoff on each line submit; under streaming that would re-attempt on every keystroke. While in `Backoff`, append to `pendingInput`; on timer fire, transition to `Claiming` if `pendingInput` is non-empty, else `Idle`.
5. **`^D` mid-chunk** forwards the prefix bytes via one `submitInput` call (if non-empty) then calls `client.close()`. `^C` (0x03) has no special-case under streaming — it forwards as a regular byte and the PTY interprets it as SIGINT.
6. **Empty `send` (`data: ''`)** decodes to a zero-byte buffer, performs a no-op PTY write, scans for newline (none), keeps the claim held. Documented in §5.2 row narrative so future readers don't think empty `send`s are forbidden.
7. **Newline scan is byte-level** (`bytes.includes(0x0a) || bytes.includes(0x0d)`). CRLF releases on the `\r`; the subsequent `\n` arrives as the start of the next typing burst and re-claims via `pendingInput`. Matches `tmux` paste behavior.
8. **`send`'s schema stays unbounded.** Transport-layer WS frame caps apply; no application-layer DoS surface is added beyond what 6G already accepts.

Why not the other options: **B** mutates `send`'s contract for no benefit over server-side newline detection (the server already infers line-completion from byte content). **C** forces operators to know which mode their agent needs and doesn't compose across multi-client attach. **D** is magical — silent client-behavior switching based on server output is hard to test and hard for an operator to reason about when it misfires.

**Known pathological cases (do not patch around in 6L; re-open the relevant decision if they bite):**

- A user typing continuously for 30 s without an Enter has the claim released mid-typing under [[nd-01-claim-lock-timeout-duration]]. Keep ND-01's no-re-arming rule; pathological for claude (compose buffers don't get that long). If `vm-e2e` shows real UX pain, re-open ND-01 — don't paper over in 6L.
- Multi-line paste releases at the first `\n`; the remainder re-claims automatically via `pendingInput`. If a user reports awkward visual stutter, evaluate Option B's `stream: true` field as a follow-up — don't work around in 6L.

**Surfaces new sub-questions:** [[nd-25-relay-attach-detach-with-d-requires-two-keypresses-on-the-host-tty]] (surfaced 2026-05-19 by a laptop-local e2e walk against the ND-24 streaming path — `^D` mid-burst is documented as a single-press clean detach but consistently required two presses to return the operator to their host shell).

**Propagated to:** `docs/arch/ws-protocol.md` §2.2 + §5.1 + §5.2 + §5.3 + §8 (2026-05-19), `packages/protocol/src/ws-frames.ts` `SendFrameSchema` JSDoc (2026-05-19), `packages/server/src/server/ws/handler.ts` `handleSend` (2026-05-19), `packages/server/src/server/ws/handler.test.ts` (2026-05-19), `packages/server/src/attach/tty.ts` (2026-05-19), `packages/server/src/attach/tty.test.ts` (2026-05-19), `packages/server/src/attach/client.ts` (2026-05-19), `packages/server/src/attach/client.test.ts` (2026-05-19), `.claude/skills/ws-protocol-check/SKILL.md` catalog + newline-release rule (2026-05-19), `docs/build-plan.md` row 6L (2026-05-19), [[nd-17-relay-attach-raw-mode-tty-variant-of-the-51-client-fsm]] narrowed-by pointer (already landed with the 2026-05-18 6K commit).
