---
name: ws-protocol-check
description: Audit a WebSocket handler file or diff against the docs/arch/ws-protocol.md message catalog — flags missing frame-type handlers, code-only frames not in the catalog, hardcoded auto-release timeouts (ND-01 violation), and binary-output writes gated by claim state (D-G2 universal-output violation). Per-violation report with citations back to the ws-protocol.md section that defines the contract. Trigger on phrases like "WS handler", "WebSocket frame", "CLAIM/SEND/RELEASE/BUSY", "audit this ws code", "check WS catalog drift", or being passed a path under packages/server/src/server/ws/.
---

# Relay ws-protocol-check skill

The WebSocket wire format in [`docs/arch/ws-protocol.md`](../../../docs/arch/ws-protocol.md) is the contract the `packages/server/src/server/ws/` implementation must satisfy. Drift between the two is a class of bug that a human reviewer rarely catches reliably — a renamed discriminator, a new error code added on one side and not the other, a hardcoded `30_000` ms that silently disables the operator's `claimLockTimeoutSeconds` knob. This skill mechanizes the audit: given a handler file or a diff, it scans for four specific classes of drift and reports each violation with a citation back to the exact section of [`ws-protocol.md`](../../../docs/arch/ws-protocol.md) the code disagrees with.

The skill is **read-only**: it scans source text and quotes spec text; it never edits the target file, the spec, or any other source. Field-by-field JSON shape validation is the job of the Zod schemas in [`@relay/protocol`](../../../packages/protocol/) (build-plan task 4C, runtime); end-to-end conformance is the job of scenario F in [`scenario-runner`](../scenario-runner/SKILL.md). This skill checks names, presence, and two structural smells — nothing more.

## When to invoke

Trigger phrases:

- "audit this WS handler" / "check WS catalog drift" / "run ws-protocol-check"
- "WS handler" / "WebSocket frame" mentioned in the context of a code change
- "CLAIM / SEND / RELEASE / BUSY" referenced as code rather than as spec prose
- A file path under `packages/server/src/server/ws/` is handed to the skill
- A diff hunk that touches any file under `packages/server/src/server/ws/` is pasted in

If invoked without a target file or diff, prompt the user for one. Don't guess which file to audit.

## Inputs the skill reads first

- [`docs/arch/ws-protocol.md`](../../../docs/arch/ws-protocol.md) — the catalog of record. The skill cites §2.2, §2.3, §2.4, and §7 by number; read the whole document at least once to keep the inlined catalog (below) honest.
- [`docs/open-questions.md`](../../../docs/open-questions.md) — anchor source for the [D-G2](../../../docs/open-questions.md#d-g2-multi-client-input-arbitration), [D-G3](../../../docs/open-questions.md#d-g3-reattach-semantics), and [ND-01](../../../docs/open-questions.md#nd-01-claim-lock-timeout-duration) citation lines emitted in the report.
- The target file(s) or diff text the user provides.

## The catalog (frozen reference)

The twelve JSON `type` discriminators in force at the time this SKILL.md was written, grouped by direction, with one-line purpose each. The catalog is inlined here on purpose: it keeps the audit deterministic and makes the SKILL.md itself the canary if `ws-protocol.md` §2 grows or renames a frame type without a paired SKILL.md update.

| Direction       | `type`           | Purpose                                                                                                                    |
| --------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Client → Server | `claim`          | Request the per-session input lock. (§2.2)                                                                                 |
| Client → Server | `send`           | Deliver input bytes to the PTY (base64). Multi-send per claim; server releases on newline byte in payload. (§2.2, ND-24)   |
| Client → Server | `release`        | Voluntarily release a held claim. (§2.2)                                                                                   |
| Client → Server | `resize`         | PTY size update (cols, rows). Side-channel — independent of the §5.1 FSM. Last-writer-wins for multi-client. (§2.2, ND-23) |
| Server → Client | `hello`          | Always the first frame; pins session config. (§2.3)                                                                        |
| Server → Client | `claim_ack`      | Claim granted; carries `expiresAt`. (§2.3)                                                                                 |
| Server → Client | `busy`           | Claim rejected because another connection holds it. (§2.3)                                                                 |
| Server → Client | `claim_released` | Broadcast on lock release; `reason` enum. (§2.3)                                                                           |
| Server → Client | `replay_start`   | Opens the on-attach ring-buffer flush. (§2.3, §3)                                                                          |
| Server → Client | `replay_end`     | Closes the on-attach ring-buffer flush. (§2.3, §3)                                                                         |
| Server → Client | `session_ended`  | Agent exited or session killed; precedes close 1000. (§2.3)                                                                |
| Server → Client | `auth_expired`   | Token revoked mid-stream; precedes close 4401. (§2.3)                                                                      |
| Server → Client | `error`          | In-band protocol error with `fatal` flag. (§2.3, §4.1)                                                                     |

Plus one un-typed payload: **binary WebSocket frames** carry raw PTY output bytes server→client, with no application-layer envelope (§2.4). Rule 4 (D-G2 universal output) is the audit on the send-path for those binary frames.

## Resolution rules

For each of the four rules: **what to look for** in code, **what counts as a violation**, and **the citation** the report emits when a violation lands.

### Rule 1 — Catalog coverage

Every discriminator in the catalog table above must appear somewhere in the target as a string literal in a discriminator position — typically a `case "<X>":` arm, an `if (msg.type === "<X>")` branch, a Zod `discriminatedUnion` member (`z.object({ type: z.literal("<X>") … })`), or a registered handler key (`handlers["<X>"] = …`).

- **What to look for:** for each `<X>` in the catalog, search the target for `"<X>"` and `'<X>'`. Apply word-boundary judgment so a string like `"claim_released"` is not double-counted as a hit for `"claim"`.
- **Violation:** a catalog discriminator with zero discriminator-position occurrences in the target. Emit `missing_handler`.
- **Cite:** `ws-protocol.md §2.2` for missing client→server types, `§2.3` for missing server→client control types, `§2.4` for a missing binary-frame send path (no `ws.send(buffer)` / `socket.send(bytes, { binary: true })` anywhere).

### Rule 2 — No extras

Every string literal in the target that is used as a `type` discriminator must appear in the catalog. New frame types require a spec update in `ws-protocol.md` §2 first, then this SKILL.md gets the matching catalog row.

- **What to look for:** every `case "<X>":`, every `type: "<X>"` object property, every `z.literal("<X>")` inside a `discriminatedUnion("type", …)`.
- **Violation:** an `<X>` not present in the catalog table. Emit `extra_discriminator`.
- **Cite:** `ws-protocol.md §2` (the catalog is authoritative — the spec adds first).

### Rule 3 — ND-01 configurability

The 30-second auto-release window must come from configuration (`claimLockTimeoutSeconds` in `~/.relay/config.yaml`), never a hardcoded literal in the handler. [ND-01](../../../docs/open-questions.md#nd-01-claim-lock-timeout-duration) and `ws-protocol.md` §7 are explicit: the value is operator-tunable.

- **Bad patterns:** numeric literals `30`, `30000`, `30_000`, `1000 * 30`, `30 * 1000` appearing in proximity (same statement, same expression, same function body) to identifiers containing `claim`, `timeout`, `release`, `expires`, or `lock`.
- **Good patterns:** references to `claimLockTimeoutSeconds` (camelCase per the spec) — as a config object property, a function parameter, a destructured value, or a constant initialized from config parsing.
- **Violation:** a bad pattern with no nearby good pattern that overrides it. Emit `hardcoded_timeout`.
- **Cite:** `ws-protocol.md §7` and `ND-01`.

### Rule 4 — D-G2 universal output

PTY-output binary writes must reach **every** attached connection regardless of claim state. The contract is `ws-protocol.md` §2.4 quoting [D-G2](../../../docs/open-questions.md#d-g2-multi-client-input-arbitration) §5.1 rule 5 verbatim: _"PTY output is universal per D-G2 §5.1 rule 5: every attached client receives the full stream regardless of claim state."_ The reattach immediacy contract in [D-G3](../../../docs/open-questions.md#d-g3-reattach-semantics) §5.2 rule 1 has the same effect — a claim-gated output path also breaks D-G3 — so the report cites both.

- **Bad patterns:** a binary-write call site (`ws.send(buffer)`, `socket.send(bytes, { binary: true })`, `conn.write(ptyChunk)`, etc.) inside a conditional that tests claim state. Concretely: `if (conn.id === activeClaim.heldBy) { ws.send(ptyBytes) }`, `if (this.lock.isHeldBy(conn)) { conn.send(bytes) }`, `if (!claim || claim.holder === conn) { … send … }`.
- **Good patterns:** an unconditional fan-out over the attached-connection set — `for (const conn of session.connections) conn.send(ptyBytes)`, `this.connections.forEach(c => c.send(buf))` — with no claim-state predicate guarding the body.
- **Violation:** a binary send wrapped in a claim-state predicate. Emit `claim_gated_output`.
- **Cite:** `ws-protocol.md §2.4` (D-G2 §5.1 rule 5), plus a "see also" note pointing at `ws-protocol.md §5.2 rule 1` (D-G3 reattach immediacy) — both contracts forbid the same code shape.

### Rule 5 — ND-24 newline-conditional release

The server releases the per-session claim on a `send` ONLY when the decoded payload contains a newline byte (`\n` / 0x0a or `\r` / 0x0d). A `send` handler that releases unconditionally — i.e., calls `releaseAsHolder(..., 'delivered')` on every successful `send` regardless of payload content — collapses the [ND-24](../../../docs/open-questions.md#nd-24-per-keystroke-input-streaming-for-tui-agents) `Streaming` contract back into the pre-ND-24 one-send-per-claim shape. TUI agents (claude's compose box) cannot then see in-progress typing, which is a Phase 1 ship-blocker.

- **Bad patterns:** the `send` handler decodes `data` and calls `releaseAsHolder(..., 'delivered')` (or any function that broadcasts `claim_released { delivered }`) with no preceding scan of the decoded buffer for `0x0a` / `0x0d`. Concretely: `handle.write(bytes); state.lock.releaseAsHolder(ctx.id, 'delivered');` with no intervening newline check.
- **Good patterns:** the handler decodes, writes, then conditionally releases: `if (bytes.includes(0x0a) || bytes.includes(0x0d)) state.lock.releaseAsHolder(ctx.id, 'delivered');` — or any equivalent scan (`Buffer.indexOf`, `for` loop, `containsNewline(bytes)` helper) that gates the release call.
- **Violation:** a `send`-handling code path that releases the claim without a newline check on the just-written payload. Emit `unconditional_send_release`.
- **Cite:** `ws-protocol.md §5.2` row 4 (newline-conditional release), `ws-protocol.md §2.2` (multi-send per claim), and `ND-24`.

## Violation taxonomy

Every non-clean verdict names exactly one code:

| Code                         | Means                                                                                                                                                                                                                   |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `missing_handler`            | A catalog discriminator (or the binary send path) is absent from the target.                                                                                                                                            |
| `extra_discriminator`        | The target uses a `type` value not in the catalog.                                                                                                                                                                      |
| `hardcoded_timeout`          | The auto-release window appears as a numeric literal, not a `claimLockTimeoutSeconds` config read.                                                                                                                      |
| `claim_gated_output`         | A binary PTY-output write is inside a claim-state conditional.                                                                                                                                                          |
| `unconditional_send_release` | A `send` handler releases the claim without checking the decoded payload for a newline byte (ND-24 violation).                                                                                                          |
| `ambiguous`                  | The skill cannot decide from static patterns alone — e.g., handler dispatch is reflective / table-driven and the table is built at runtime from data the skill cannot statically inline. Reported, not silently passed. |

`ambiguous` is a real verdict; the user reads it as "go look at this by hand," not as a pass.

## Output format

One block per violation:

```
Violation: <code>
Where: <file>:<line>           (or "diff hunk @@ -<a>,<b> +<c>,<d> @@" for diff mode)
Snippet:
  <up to 6 lines of source, no truncation marker if shorter>
Expected: <one-line restatement of the contract>
Cite: ws-protocol.md §<N.N> [(<D-NN|ND-NN>)]
```

After the per-violation blocks, a markdown summary table:

```
| Code                | Where                            | Cite                       |
| ------------------- | -------------------------------- | -------------------------- |
| missing_handler     | ws/router.ts (no `auth_expired`) | ws-protocol.md §2.3        |
| hardcoded_timeout   | ws/claim.ts:42                   | ws-protocol.md §7, ND-01   |
| claim_gated_output  | ws/broadcast.ts:88               | ws-protocol.md §2.4 (D-G2) |
```

**On zero violations**, emit a single line so the user knows the audit ran and didn't silently no-op:

```
clean: <N> catalog frames matched, <M> discriminators audited, <K> binary send sites checked
```

## Diff vs file mode

When the input starts with `diff --git` or contains `@@ … @@` hunk markers, treat it as a unified diff and focus the audit on **added or changed lines** (`+` lines, excluding the `+++` file header). Report locations as `<file>` plus the hunk header rather than `<file>:<line>` — line numbers shift across hunks and the hunk header is the stable locator the reviewer can paste into a search.

When the input is a file path or a raw paste of source code, audit the whole file and report `<file>:<line>` directly. Either way, the four rules and their citations are identical — only the locator changes.

## Conventions worth restating

- **Read-only.** The skill never edits the target, never edits `ws-protocol.md`, and never edits `open-questions.md`. The only mutation surface is the report it returns.
- **Static heuristics, not a proof.** The skill flags smells; the implementer judges. `ambiguous` is the right verdict whenever discriminator dispatch, timeout reads, or binary-write predicates can't be resolved from the source text alone — don't downgrade to `pass`.
- **Catalog frozen in this SKILL.md.** If `ws-protocol.md` §2 grows or renames a frame type, this SKILL.md must be updated in the same change. Reviewers of a §2 edit should look for the paired SKILL.md edit; the inlined catalog table is the single point of drift detection between spec and skill.
- **Defer field shapes to `@relay/protocol`.** The Zod schemas in [`packages/protocol/`](../../../packages/protocol/) are the runtime check on JSON envelope shape (required fields, enum values, types). This skill checks discriminator names and presence, not field shapes — call that out if asked to validate a payload shape.
- **REST is out of scope.** REST endpoints, their error envelopes, and the [`rest-conventions.md`](../../../docs/arch/rest-conventions.md) error-shape contract are the surface of other skills and other reviews. This skill only audits WebSocket code under `packages/server/src/server/ws/`.
- **One frozen-catalog version per SKILL.md revision.** If the audit surfaces a real-world implementation pattern that the heuristics keep getting wrong (e.g., the WS handler legitimately gates a binary send on something that _looks_ like claim state but isn't), file an [ND-NN](../../../docs/open-questions.md) via the [`decision-log`](../decision-log/SKILL.md) skill rather than relaxing the rule silently here.
