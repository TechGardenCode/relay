# Kickoff: P2-PWA-tech — finish the PWA tech-architecture doc set (L4 + L6)

_Written 2026-07-02. This kickoff is a point-in-time snapshot._

## ⚠️ Before you write anything (read this first)

1. **Re-read every file under [Required reads](#required-reads) now.** Do not rely on memory or on this kickoff's summaries — open the actual files. The three already-authored layers (L1 `foundations.md`, L2 `app-shell.md`, L3 `data-layer.md`) set the house style you must match, and they already made decisions L4/L6 build on top of.
2. **Treat the [D-NN / ND-NN cheatsheet](#d-nn--nd-nn-cheatsheet) as a snapshot captured on 2026-07-02, not as current truth.** Verify each cited decision is still `resolved` and unchanged using the `prd-link` skill before you depend on it.
3. **If more than a day has passed since 2026-07-02, regenerate this kickoff** (re-run `build-plan-kickoff`) rather than executing a stale one.

**Goal:** Finish the `docs/arch/pwa/` tech-architecture doc set by authoring its two remaining stub layers — **L4 `feature-modules.md`** (UI module decomposition) and **L6 `cross-cutting.md`** (cross-cutting concerns) — then harvest every server coupling those two layers surface into **L5 `unresolved-dependencies.md`** and file the accumulated candidate NDs as real open `ND-NN` entries. This closes the P2-PWA-tech row and unblocks the `writing-plans` → build cycle.

**This is a documentation-authoring task, not a code task.** No deps to install, no module to scaffold, no tests to run. The output is two Markdown files (plus L5 appends + filed NDs), matching the established doc-set conventions.

## Preflight

None — the `docs/arch/pwa/` scaffold, both target stub files (`feature-modules.md` and `cross-cutting.md`, ~5 lines each today), and the L5 harvest target (`unresolved-dependencies.md`) are all in place. This is authoring, not scaffolding.

Two standing constraints to hold, not blockers:

- **L1 design-system delivery is still pending** (`foundations.md` §5). L4 must reference component primitives, tokens, and the terminal palette **abstractly** — never hand-roll or pin token/primitive names the external Claude Design delivery will prescribe. "Consumers use the scheme; they do not redefine it."
- **`docs/` is excluded from Prettier** (`pnpm format` skips it). Match the surrounding docs' wrap and heading style by hand; there is no formatter to lean on.

## Required reads

(in this order)

**The task's own doc set — read all five; L4/L6 must be consistent with them:**

- [`docs/arch/pwa/README.md`](../arch/pwa/README.md) — L0. §3 is the **layer map** that defines exactly what L4 and L6 must contain. §2 is the client-only boundary (the rule that server couplings get harvested to L5, never resolved here). §4 is the canonical reading list.
- [`docs/arch/pwa/foundations.md`](../arch/pwa/foundations.md) — L1. The design-system-consumes-external-scheme contract L4 components must honor (§5 guarantees).
- [`docs/arch/pwa/app-shell.md`](../arch/pwa/app-shell.md) — L2. Already fixes routing/nav per view (§4.1), the live-session shell composition (§5.1), keyboard handling (§5.2), Angular era + layer-first `src/` org (§2, §6.1). **L4 decomposes _within_ these decisions** — the file panel, terminal viewport, control rail, and compose buffer are already named here.
- [`docs/arch/pwa/data-layer.md`](../arch/pwa/data-layer.md) — L3. The service surface (§1.1: `AuthService` / `SessionsService` / `WsClientService` / `ComposeService` / `PtyOutputService`) that L4 feature modules consume. L4 details the concrete per-feature state shapes L3 §1.1 defers to it.
- [`docs/arch/pwa/unresolved-dependencies.md`](../arch/pwa/unresolved-dependencies.md) — L5. The harvest target. Already carries three seed couplings (scratch create-by-path, control-key claim/release, session status field). L4/L6 append here; §2 is the "surfaced during the session" bucket.

**The authoritative product/UX inputs (design docs are _inputs_; nothing here changes them):**

- [`docs/design/pwa/requirements.md`](../design/pwa/requirements.md) — FR-1…FR-14, NFR-1…NFR-10. **L4 decomposes the FRs into modules; L6 is organized around the NFRs.** This is the spine of both docs.
- [`docs/design/pwa/interaction-model.md`](../design/pwa/interaction-model.md) — IA, live-session screen, spawn/scratch flows, file viewer, status awareness. The UX that L4 turns into a module decomposition.
- [`docs/design/pwa/server-touchpoints.md`](../design/pwa/server-touchpoints.md) — the additive-surface seed already mirrored into L5.
- [`docs/decisions/D-18-pwa-terminal-substrate-and-mvp-scope.md`](../decisions/D-18-pwa-terminal-substrate-and-mvp-scope.md) — governing decision. §6 is the design-vs-arch doc taxonomy; §7 deferred this whole tech phase.

**The canonical client contract L4/L6 consume (do NOT restate or fork these):**

- [`docs/arch/ws-protocol.md`](../arch/ws-protocol.md), [`docs/arch/rest-conventions.md`](../arch/rest-conventions.md), [`docs/arch/client-agnosticism.md`](../arch/client-agnosticism.md) — the wire the PWA is one of three clients over. NFR-5: the PWA has no privileged path; any additive need is a candidate ND in L5.

**Phase 0 surprises that apply:** None. Phase 0 validated the server-side PTY/WS backbone; this task is client-side documentation with no Phase 0 dependency.

## D-NN / ND-NN cheatsheet

> Snapshot captured 2026-07-02 — verify each row with `prd-link` before relying on it. All rows below are `resolved`.

| ID | Where it bites | Implication for L4 / L6 |
| --- | --- | --- |
| [`D-18`](../decisions/D-18-pwa-terminal-substrate-and-mvp-scope.md) | governing | Terminal-style substrate (xterm.js), MVP scope, and the design-vs-arch doc split (§6). Everything L4/L6 records lives under it. |
| NFR-5 / [`client-agnosticism.md`](../arch/client-agnosticism.md) | both | **The load-bearing rule of this task.** No server coupling is resolved in the arch docs — each is harvested to L5 as a candidate ND. L4/L6 must not invent server behavior. |
| [`ND-36`](../decisions/ND-36-subprotocol-sourced-bearer-token-for-browser-ws-auth.md) | L4 pair/auth, live-session | Browser WS auth is subprotocol-sourced bearer — not header, not URL. Already fixed in L3 §2; L4 cites it. |
| [`ND-40`](../decisions/ND-40-relay-attach-drops-replayed-bytes-in-connect-subscribe-gap.md) | L4 terminal viewport, L6 reliability | Inbound-binary buffer across the connect→subscribe gap. L3 §3.3 adopted the recipe; L4 wires it to the xterm viewport. |
| [`ND-03`](../decisions/ND-03-ring-buffer-size-for-attach-replay.md) | L4 live-session, L6 reliability | On-attach ring-buffer replay bounds the ND-40 buffer. |
| [`D-G3`](../decisions/D-G3-reattach-semantics.md) | L4 live-session | What a reattaching client sees — the replay/live boundary the viewport renders. |
| [`ND-24`](../decisions/ND-24-per-keystroke-input-streaming-for-tui-agents.md) | L4 raw toggle + control rail | Per-keystroke streaming; claim releases on newline. Drives the raw-input toggle and the L5 §1.2 control-key coupling. |
| [`ND-01`](../decisions/ND-01-claim-lock-timeout-duration.md) | L5 §1.2 | The inactivity timeout a bare control byte would otherwise hold the claim until — the reason the control-rail coupling exists. |
| [`ND-02`](../decisions/ND-02-rejection-ux-for-busy-response.md) | L4 BUSY, status/error UX | Dismissible inline BUSY indicator; preserve draft; manual retry, no auto-retry. |
| [`ND-23`](../decisions/ND-23-pty-size-negotiation-and-sigwinch-forwarding-for-attach-clients.md) | L4 terminal viewport, L6 latency | `fit-addon` re-fit → WS `resize` frame (already wired to keyboard handling in L2 §5.2). |
| [`ND-35`](../decisions/ND-35-diagnostics-and-error-ux-deep-dive.md) | L4 status/error, L6 observability | `relay doctor` error-UX posture carried to the client (NFR-10). |
| [`ND-13`](../decisions/ND-13-byte-accounting-cadence-for-sessions-total-bytes.md) | L5 §1.3 | Byte-accounting cadence — input to the client-derived-vs-server-computed session-status question. |
| [`D-12`](../decisions/D-12-project-record-storage-and-relay-project-add-semantics.md) | L4 create-project/scratch, L5 §1.1 | `relay project add` registers an _existing_ path; scratch create-by-path (FR-9/10) is the additive coupling. |
| [`D-13`](../decisions/D-13-first-run-pairing-ux.md) | L4 pair/auth | `relay://pair?...` / QR pairing snippet the `/pair` route consumes. |

## What "done" means

**Done when:**

1. **L4 `feature-modules.md` is authored** — decomposes the FRs into client modules per README §3: pair/auth (FR-1) · sessions home (FR-2/3) · live-session (FR-4…7, 11, 12 — terminal viewport · control rail · compose buffer · raw toggle · header/controls · BUSY · file panel) · spawn/scratch/create-project (FR-8/9/10) · file viewer (FR-13) · status & error UX (FR-12, NFR-10) · dictation (FR-6 voice via OS keyboard). Each module maps to the L3 §1.1 services and the L2 §4.1/§5.1 shell it lives in; each recorded decision carries a **Cites** line back to its FR/NFR/D-NN/ND-NN. Component primitives referenced abstractly per the pending L1 delivery.
2. **L6 `cross-cutting.md` is authored** — organized around the NFRs per README §3: latency (NFR-1) · reliability/reconnect (NFR-2) · statelessness (NFR-3) · security (NFR-4) · compatibility + iOS Safari PWA quirks (NFR-6) · offline posture (NFR-7) · a11y/ergonomics (NFR-8) · disposability/migration (NFR-9) · observability (NFR-10). Where L2/L3 already treated a concern (reconnect in L3 §3.2, keyboard/viewport in L2 §5), **consolidate and cross-reference — do not duplicate the decision.**
3. **Every server coupling L4/L6 surfaces is harvested into L5 §2** as a candidate ND (need · what's open for the server pass · citations), matching the three seed entries' shape.
4. **The accumulated L5 candidate NDs are filed as real open `ND-NN` entries** via the `decision-log` skill (the build-plan row's "filing NDs"). Their server-side _resolution_ is explicitly a **later server-side pass** — not this task (L5 scope + README §2.1). Filing = promoting each candidate to an open ND row so client code/config can cite it.
5. **The doc set is internally consistent** — README §3 layer map still accurate, both new docs carry the Status/Scope/Out-of-scope header block, all cross-links resolve.

**Output structure:**

```
docs/arch/pwa/
├── feature-modules.md      # L4 — authored (was a ~5-line stub)
├── cross-cutting.md        # L6 — authored (was a ~5-line stub)
└── unresolved-dependencies.md   # L5 — §2 appended with newly surfaced couplings
docs/decisions/ND-NN-*.md   # candidate NDs promoted to open entries (via decision-log skill)
```

**Verification** (this is a doc task — verify meaning, not test-green):

- Run `prd-link` over both new docs — every `D-NN` / `ND-NN` / `[[slug]]` / `§N.N` citation resolves, no broken links.
- Every recorded decision in L4/L6 has a **Cites** line (the doc-set convention from L1–L3).
- **No server coupling is resolved inline** in L4/L6 — grep the diff: anything describing new server behavior must instead appear as an L5 candidate ND. This is the NFR-5 gate.
- README §3 layer map and §4 reading list still describe the set accurately after L4/L6 land.
- Hand the finished doc set to the `relay-architect` sub-agent for a spec-fidelity pass against D-18 + the FR/NFR set before closeout.

## Execution protocol (closeout)

Drive these as TodoWrite items with the `superpowers:executing-plans` skill as the step-loop. **Do not claim P2-PWA-tech is done until every box is checked.**

- [ ] **Re-read the Required reads** before authoring (per the freshness clause above) — especially L1–L3, whose decisions L4/L6 build on.
- [ ] **Author L4 `feature-modules.md`** decomposing the FRs into modules against the L2 shell + L3 services; abstract component-primitive references per pending L1 delivery.
- [ ] **Author L6 `cross-cutting.md`** around the NFRs; consolidate + cross-reference existing L2/L3 treatments rather than duplicating them.
- [ ] **Harvest every surfaced server coupling into L5 §2**, matching the seed-entry shape.
- [ ] **File the L5 candidate NDs as open `ND-NN` entries** via the `decision-log` skill; leave server-side resolution to the later pass. Add `D-NN` / `ND-NN` citation comments/links for any non-obvious recorded behavior per [`CLAUDE.md`](../../CLAUDE.md) → "Code-comment convention".
- [ ] **Run the Verification block above and confirm it passes** — `superpowers:verification-before-completion` discipline: `prd-link` clean, NFR-5 gate held, links resolve. Evidence before assertions.
- [ ] **Flip the P2-PWA-tech row to `done`** in [`docs/build-plan.md`](../build-plan.md), link the completed `docs/arch/pwa/` set, and replace the in-flight pointer with a one-line completion pointer.
- [ ] **Hand the diff to the `relay-architect` sub-agent** for a spec-fidelity audit against D-18 + FR/NFR before considering the phase closed. (Then: the `writing-plans` → build cycle is unblocked, on request.)

## Feeders

(skills + sub-agents to invoke during the work)

- `prd-link` — verify each cheatsheet + in-doc citation is current before relying on it.
- `decision-log` — file the L5 candidate NDs as open `ND-NN` entries (done-when #4).
- `relay-architect` — plan-time / doc spec-fidelity review of the authored L4/L6 against D-18 + FR/NFR (the read-only reviewer; `relay-spec-reviewer` is for code diffs and won't add value on a docs-only change).
- `re-orient` — if you're picking this up cold after a gap, run it first to re-anchor state.
