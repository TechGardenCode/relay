# Kickoff: P2-PWA-build — plan & build the `packages/pwa/` Angular PWA (MVP)

_Written 2026-07-02. This kickoff is a point-in-time snapshot._

## ⚠️ Before you write any code (read this first)

1. **Re-read every file under [Required reads](#required-reads) now.** Do not rely on memory or on
   this kickoff's summaries — open the actual files. The `docs/arch/pwa/` L0–L6 set is your **spec**;
   it was authored and spec-reviewed but the code must be built _from the docs_, not from this recap.
2. **Treat the [D-NN / ND-NN cheatsheet](#d-nn--nd-nn-cheatsheet) as a snapshot captured on
   2026-07-02, not as current truth.** Verify each cited decision is still `resolved` (and each open
   ND still `open`) with the `prd-link` skill before you depend on it. In particular the four new
   couplings **ND-41…ND-44 may have resolved** into real server changes since this was written — if so,
   build against the resolved surface, not the stopgaps below.
3. **If more than a day has passed since 2026-07-02, regenerate this kickoff** (re-run
   `build-plan-kickoff`) rather than executing a stale one — the arch docs or decisions may have moved.

**Goal:** Stand up `packages/pwa/` and build the Phase-2 PWA MVP — a terminal-style Angular client over
the canonical REST/WS contract — from the `docs/arch/pwa/` L0–L6 architecture spec. Because this is a
greenfield build far too large for one pass, **step 1 is `superpowers:writing-plans`** to turn L0–L6
into a phased, reviewable implementation plan; then execute that plan phase-by-phase, verifying as you go.

**This is a code task** (unlike P2-PWA-tech, which was docs). It scaffolds a new workspace package,
installs deps, and writes Angular. It does **not** change the server: every server need is an open ND
(ND-41…ND-44) resolved in a **separate server pass**, not here — hold NFR-5 (client-agnosticism).

## Preflight

Resolve before writing implementation code:

1. **None blocks _planning_.** The L0–L6 spec is complete, committed (`0787b17`), and
   architect-verified. Run `superpowers:writing-plans` first; the plan owns the scaffold sequencing below.
2. **Scaffold (first phase of the produced plan, not a pre-req to planning):** `packages/pwa/` today is
   an empty placeholder (`.gitkeep` + `README.md`). Generate the Angular app **inside the monorepo** per
   [`app-shell.md`](../arch/pwa/app-shell.md) §6 — accept the CLI standard application schema; pin
   **Angular `^21`** (§1; revisit v22 per §7). Add `@angular/pwa` (§3), `xterm` + `@xterm/addon-fit`
   (D-18 substrate), and `@relay/protocol` as a **workspace dep** (§6.2 — pnpm symlink, no path aliases).
   Add any new native/build deps to `pnpm-workspace.yaml` `onlyBuiltDependencies` if they need it.
3. **Tailwind = empty placeholder config only** ([`foundations.md`](../arch/pwa/foundations.md) §4) —
   the L1 design-system delivery is **still pending**; do **not** author tokens/primitives it will
   prescribe. Wire the swap-seam (§6), style consumers abstractly, integrate the real scheme on delivery.
4. **Workspace sanity** after the scaffold lands: `pnpm install && pnpm typecheck && pnpm lint`.

## Required reads

(in this order — the spec first, then the contract it sits on)

**The build spec — `docs/arch/pwa/` L0–L6 (read all; this is what you are implementing):**

- [`README.md`](../arch/pwa/README.md) — L0. §3 layer map; §2 the client-only boundary (NFR-5).
- [`foundations.md`](../arch/pwa/foundations.md) — L1. Design-system-consumes-external-scheme;
  **delivery still pending** — build against the empty-config placeholder + swap-seam (§5, §6).
- [`app-shell.md`](../arch/pwa/app-shell.md) — L2. **The build's backbone:** Angular 21 era, routing
  (§4), soft-keyboard shell (§5), package layout (§6). Follow it literally.
- [`data-layer.md`](../arch/pwa/data-layer.md) — L3. The five services (§1.1), localStorage bearer
  (§2), native-WebSocket client + reconnect (§3.2) + ND-40 replay buffer (§3.3).
- [`feature-modules.md`](../arch/pwa/feature-modules.md) — L4. Every FR → module × shell surface ×
  service, with per-feature state shapes. §9 matrix is the build checklist; §10 the coupling list.
- [`cross-cutting.md`](../arch/pwa/cross-cutting.md) — L6. NFR budgets/posture (latency ≤150 ms §1;
  a11y checklist §7; iOS quirk list §5; observability §9).
- [`unresolved-dependencies.md`](../arch/pwa/unresolved-dependencies.md) — L5. The four server
  couplings the build must **stopgap or defer**, each now filed as an open ND (below).

**The product/UX inputs (authoritative for _what_ the client does):**

- [`requirements.md`](../design/pwa/requirements.md) — FR-1…14 / NFR-1…10, the acceptance surface.
- [`interaction-model.md`](../design/pwa/interaction-model.md) — IA, live-session screen, flows.

**The canonical wire the PWA is one of three clients over (consume; do NOT fork):**

- [`ws-protocol.md`](../arch/ws-protocol.md) — frames, claim FSM (§5.1 is the client contract),
  replay bracket (§3), browser subprotocol auth (§6).
- [`rest-conventions.md`](../arch/rest-conventions.md) — routes, RFC 9457 errors, status codes.
- [`client-agnosticism.md`](../arch/client-agnosticism.md) — NFR-5: no privileged PWA path.

**Governing decision + process:**

- [`D-18`](../decisions/D-18-pwa-terminal-substrate-and-mvp-scope.md) — scope contract (§3 in / §4 out).
- [`CLAUDE.md`](../../CLAUDE.md) — repo orientation + the code-comment `D-NN`/`ND-NN` citation convention.

**Phase 0 surprises that apply:** None directly assigned. Phase 0 validated the server-side PTY/WS
backbone; the Track 9 spike (build-plan **9A**, now deleted at tag `pre-cleanup-phase1`) proved the
terminal-style browser-client loop end-to-end over Tailscale — this build is the clean rebuild of that
proven path, not a fresh feasibility bet.

## D-NN / ND-NN cheatsheet

> Snapshot 2026-07-02 — verify each row with `prd-link` before relying on it.

**Resolved — the build must honor these:**

| ID | Where it bites | Implication for the build |
| --- | --- | --- |
| [`D-18`](../decisions/D-18-pwa-terminal-substrate-and-mvp-scope.md) | whole build | Terminal-style (xterm.js) + compose-first + control-rail; the §4 descopes (custom voice, OS push, file editing/diff GUI, waiting-for-input heuristic, personas) stay **out**. |
| [`ND-36`](../decisions/ND-36-subprotocol-sourced-bearer-token-for-browser-ws-auth.md) | WS client | Browser WS auth = `new WebSocket(url, ['relay.bearer', token])`; never header, never URL. |
| [`ND-40`](../decisions/ND-40-relay-attach-drops-replayed-bytes-in-connect-subscribe-gap.md) | WS client | Buffer inbound binary across the connect→subscribe gap (L3 §3.3) — no dropped replay bytes. |
| [`ND-03`](../decisions/ND-03-ring-buffer-size-for-attach-replay.md) | attach | On-attach ring-buffer replay bounds the ND-40 buffer. |
| [`D-G3`](../decisions/D-G3-reattach-semantics.md) | live-session | What a reattaching client repaints; the replay/live boundary the viewport renders. |
| [`ND-24`](../decisions/ND-24-per-keystroke-input-streaming-for-tui-agents.md) | compose · raw toggle · rail | Server releases claim on a newline byte; per-keystroke streaming for the raw toggle. |
| [`ND-02`](../decisions/ND-02-rejection-ux-for-busy-response.md) | BUSY | Dismissible inline indicator, preserve draft, manual retry — **no** auto-retry. |
| [`ND-23`](../decisions/ND-23-pty-size-negotiation-and-sigwinch-forwarding-for-attach-clients.md) | viewport | `fit-addon` re-fit → WS `resize` frame (wired to the keyboard handler in L2 §5.2). |
| [`ND-01`](../decisions/ND-01-claim-lock-timeout-duration.md) | claim UI | Fixed 30 s claim window (from `hello`) for the countdown; no re-arming. |
| [`ND-35`](../decisions/ND-35-diagnostics-and-error-ux-deep-dive.md) | error UX | `relay doctor` error-UX posture carried to the client (cause + next action). |
| [`D-13`](../decisions/D-13-first-run-pairing-ux.md) | pair/auth | `relay://pair?...` / QR pairing the `/pair` route consumes. |
| [`ND-39`](../decisions/ND-39-concurrent-multi-client-attach-tui-rendering-corruption.md) | multi-attach | Clamp-to-smallest is a **designed-around** consequence (phone + laptop) — document, don't fight. |

**Open — the build must _stopgap or defer_, not resolve (NFR-5; resolve in a separate server pass):**

| ID | Coupling | Build stance until resolved |
| --- | --- | --- |
| [`ND-41`](../decisions/ND-41-scratch-create-by-path-project-registration.md) | scratch / create-by-path | Scratch spawn (FR-9) + create-project (FR-10) **block on this** — sequence them after the server pass, or ship behind a flag. |
| [`ND-42`](../decisions/ND-42-control-key-claim-release-semantics.md) | control-key claim/release | Control rail (FR-5): client-side **send-then-explicit-`release`** stopgap works on today's wire — ship it, revisit if the server adopts a rule. |
| [`ND-43`](../decisions/ND-43-session-running-idle-status-field.md) | running/idle status field | Sessions home (FR-2): **client-derive** status from `updated_at`/`total_bytes` as a stopgap. |
| [`ND-44`](../decisions/ND-44-file-viewer-server-surface.md) | file-viewer server surface | File viewer (FR-13) is conditional/separable — **defer to a fast-follow**; nothing else depends on it. |

**Also open (not a blocker):** L1 design-system delivery ([`foundations.md`](../arch/pwa/foundations.md)
§5–§6) — build the whole skeleton against the placeholder config; the scheme swap-in is a config swap.

## What "done" means

**Sequencing guidance for the plan** (feed these constraints into `writing-plans`):

- **Build the no-server-dependency spine first** — scaffold → L2 shell + routing → L3 services (auth,
  localStorage bearer, native WS + reconnect + ND-40 buffer) → live-session core (terminal viewport,
  compose+send, raw toggle, BUSY, header/kill/detach/release). All of this runs on **today's** contract.
- **Ship the ND-42 control rail** with the client send-then-release stopgap; **client-derive** status
  (ND-43 stopgap) for the sessions home.
- **Gate on the server pass:** scratch/create-project (ND-41) and file viewer (ND-44). Slot a
  parallel/subsequent server track to resolve ND-41…ND-43 so the client can drop its stopgaps.
- **Gate on L1 delivery:** visual finish (tokens, primitives, terminal palette, a11y values). The
  skeleton lands first; styling swaps in.

**Done when** (phase-level — the plan will bite this into phases):

1. **`packages/pwa/` scaffolded** per L2 §6 (Angular 21, standalone/signals/zoneless, `@angular/pwa`,
   Tailwind placeholder, `@relay/protocol` workspace dep, xterm.js) — `pnpm -F @relay/pwa build` green.
2. **The MVP FRs that don't gate on an open ND are implemented** against L4's decomposition and pass
   verification — pair/auth, sessions home (client-derived status), live-session (viewport · rail ·
   compose · raw toggle · header/controls · BUSY), spawn-against-project.
3. **The live client drives a real server-side agent over LAN/Tailscale** — pair → attach → see live
   PTY → compose+send → control rail → reattach — validated end-to-end (see Verification).
4. **Every gated feature is explicitly deferred with its ND cited**, not silently dropped — scratch/
   create-project (ND-41), file viewer (ND-44), and the ND-42/ND-43 stopgaps flagged for revisit.
5. **The doc set stays honest** — flip build-plan **P2-PWA-tech** already `done`; add/complete a
   **P2-PWA-build** row; any new decision the build forces is filed via `decision-log` before it's cited.

**Output structure** (indicative — the plan refines it against L2 §6.1 layer-first org):

```
packages/pwa/
├── package.json            # @relay/pwa; @relay/protocol workspace dep
├── angular.json · tsconfig*.json · ngsw-config.json · <tailwind placeholder>
└── src/app/
    ├── components/         # live-session, terminal-viewport, control-rail, compose, sessions-home, pair, ...
    ├── services/           # auth, sessions, ws-client, compose, pty-output (L3 §1.1)
    └── guards/             # pairStatus guard (L2 §4.5)
```

**Verification** (evidence before "done" — a client build verifies by _driving the app_, not just green tests):

- `pnpm -F @relay/pwa build` + `pnpm typecheck` + `pnpm lint` clean; Vitest specs green (Angular 21 runner).
- **Terminal rendering** — drive the xterm viewport through the `tui-visual` harness for resize /
  keyboard-inset / alt-screen paths (raw-mode, SIGWINCH); a byte-level pass is not enough for the viewport.
- **Naive-user pass** — run `naive-user:naive-test` against the live PWA for first-run UX gaps.
- **Live LAN/Tailscale run** — against a real `relay` server (use `relay-deploy` to stand one up on the
  VM), walk pair → sessions → attach → live output → compose+send → rail → reattach on a real phone.
- **Spec fidelity** — hand the plan (and later the diff) to `relay-architect` for a D-18 + FR/NFR audit.

## Execution protocol (closeout)

Drive these as TodoWrite items with `superpowers:executing-plans` as the step-loop. **Do not claim
P2-PWA-build done until every box is checked.**

- [ ] **Re-read the Required reads** before writing code (per the freshness clause above) — the L0–L6
      spec, not this recap, is the contract.
- [ ] **Run `superpowers:writing-plans`** against L0–L6 to produce the phased `packages/pwa/`
      implementation plan, honoring the Sequencing guidance (no-server-dependency spine first; gate the
      ND-41/ND-44 features; L1 styling last). Have `relay-architect` spec-check the plan before building.
- [ ] **Execute the plan phase-by-phase** with `superpowers:executing-plans` (or
      `superpowers:subagent-driven-development` for independent phases). Scaffold first (Preflight #2–4).
- [ ] **Cite decisions in code** — add `D-NN`/`ND-NN` comments for non-obvious behavior per
      [`CLAUDE.md`](../../CLAUDE.md); if the build forces a new decision, file it via `decision-log`
      **before** writing the citation. Any control-rail/status stopgap carries its ND-42/ND-43 citation.
- [ ] **Run the Verification block and confirm it's green** — `superpowers:verification-before-completion`
      discipline: drive the live app (tui-visual + naive-user + a real LAN walk), evidence before assertions.
- [ ] **Keep the docs honest** — add/complete the **P2-PWA-build** build-plan row, link the artifact,
      and record which FRs shipped vs. which are deferred behind ND-41/ND-44.
- [ ] **Hand the diff to `relay-spec-reviewer`** for a drift audit against resolved decisions and the
      per-doc constraints before merge.

## Feeders

(skills + sub-agents to invoke during the work)

- `superpowers:writing-plans` — turn L0–L6 into the phased implementation plan (step 1).
- `superpowers:executing-plans` / `superpowers:subagent-driven-development` — execute the plan.
- `prd-link` — verify each cheatsheet + in-code citation is current before relying on it.
- `decision-log` — file any new decision the build forces; resolve ND-41…ND-43 if the server pass runs here.
- `relay-architect` — plan-time + diff-time spec-fidelity review against D-18 + FR/NFR (read-only).
- `relay-spec-reviewer` — diff-time drift audit at closeout.
- `tui-visual` — validate the xterm viewport's rendering (resize / keyboard / alt-screen), not just bytes.
- `naive-user:naive-test` — drive the live PWA as a first-time user; surface UX gaps before ship.
- `relay-deploy` / `vm-e2e` — stand up a real always-on server on the VM so the PWA has a live host to hit.
