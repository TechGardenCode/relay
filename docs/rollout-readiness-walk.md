# Rollout-readiness walk — 7F gate report

> **Distinct from the [6Z Phase-1 acceptance walk](phase-1-acceptance-walk.md).** Per [`ux-rollout-posture.md`](arch/ux-rollout-posture.md) §7 the two gates are *complementary, not alternatives*: 6Z is "scenarios A–G pass on a clean install" (Phase-1 acceptance); this 7F gate is "a non-author can install and use Relay without DMing the author" (wider rollout). This file is 7F's verdict.

**Date:** 2026-05-27
**HEAD:** `11f6743` (7C-polish — ND-33 P1 picker + status-bar polish landed; last Track-7 row before 7F)
**Walked by:** autonomous runner on the author's macOS laptop (Darwin 25.5.0). Binary built from source via `pnpm typecheck` (`tsc -b`); invoked as `node packages/server/dist/cli/relay.js …` (no `relay` on PATH — source-install path per [[d-16-phase-1-ships-without-distribution]]).

---

## Method & verification provenance (read this before the tables)

7F's Done-when has two axes. This walk fully closes one and partially closes the other; the split is stated honestly here so no verdict over-claims.

1. **Decision/contract axis — the §7 bar itself.** "Every ND-32..35 resolved or deliberately deferred with documented rationale." **Fully verified this session** by reading each ND's Resolution and confirming the status against [`decisions/index.md`](decisions/index.md). This is the gate's literal pass criterion. **PASS.**

2. **Live-evidence axis — the Done-when's "re-run scenario-runner A–H + walk the 6I e2e flow" clause.** The four Track-7 P0 code deliverables were **freshly verified on this host** (see [Fresh evidence](#fresh-evidence-captured-this-session)). The **cross-device leg (scenario E, the 6I e2e flow)** and the **IDE-GUI legs (scenarios C, D, and the F/G status-bar checks)** could **not be re-executed from this runner**:
   - **VM unreachable for this session.** SSH to the `vm-e2e` peer (`techgardencode@10.0.60.221`) was not authorized for this run, so scenario E and the cross-device 6I flow could not be driven live. The 6I "Validation outstanding" note and this kickoff's preflight both flag the VM as required for C/D/E.
   - **No paired IDE.** A sideloaded `.vsix` + paired Cursor/VS Code is not available to a headless runner, so the IDE-GUI interaction legs cannot be clicked through.

   For these legs the **2026-05-22 baseline** ([`phase-1-acceptance-walk.md`](phase-1-acceptance-walk.md)) — which *did* exercise them on the VM + Remote-SSH Cursor (**36 pass / 1 n/a / 0 fail** under the A–G gate) — stands as the most recent live evidence. **No Track-7 change alters the A–G *contracts* that baseline validated**; Track 7 is additive UX (`relay init` bridge, sessions tree view, single-press `^D`, `relay doctor`). The legs are therefore recorded `carried (baseline)` or `blocked (this runner)`, never re-asserted as freshly-passed here.

**Bottom line:** the gate is **met on the axis that defines it** and on the new P0 levers; the live cross-device + IDE re-execution is the one outstanding confirmation, achievable with a `vm-e2e` run + a sideloaded `.vsix`. See the [overall verdict](#overall-rollout-readiness-verdict).

---

## §7 rollout-readiness bar (verbatim — the gate being verified)

From [`docs/arch/ux-rollout-posture.md`](arch/ux-rollout-posture.md) §7:

> **Wider rollout of Relay — beyond the operator/dogfood loop, to users who did not author the codebase — requires [[nd-32-install-and-onboarding-deep-dive]], [[nd-33-ide-gui-overhaul-deep-dive]], [[nd-34-session-and-attach-polish-deep-dive]], and [[nd-35-diagnostics-and-error-ux-deep-dive]] to each be resolved or deliberately deferred with documented rationale in the ND's Resolution.** Track 7 row 7F (rollout-readiness re-walk) is the gate's verification step.

> The Phase 1 [`6Z`](build-plan.md) acceptance gate ships independently of this bar — `6Z` is "scenarios A–G pass on a clean install" (scenario H deferred to post-2.0 / Track 8 per [[d-16-phase-1-ships-without-distribution]]); this is "a non-author user can install and use Relay without DMing the author." The two gates are complementary, not alternatives — wider rollout requires both Track 7 *and* Track 8 (since distribution is what makes "non-author install" possible).

---

## Per-scenario A–H verdict

H is `deferred` per [D-16](decisions/D-16-phase-1-ships-without-distribution.md), never `fail`. Disposition legend: **pass (fresh)** = re-verified this session; **carried (baseline)** = contract unchanged by Track 7, most-recent live evidence is the 2026-05-22 VM/IDE walk; **blocked (this runner)** = live re-execution needs VM/IDE not reachable here.

| Scenario | 2026-05-22 baseline | Track-7 surface change | 7F disposition | Cite |
| -- | -- | -- | -- | -- |
| **A** — Server bring-up + project registration | pass (7/7) | `relay init` next-steps bridge (ND-32) | **pass (fresh, live)** — local isolated-`$HOME` server: init bridge + 7 personas + token auth (401→200) + project add (marker + `.gitignore` + REST canonicalPath) + 409 `project-path-taken` + 422 `project-slug-undeducible` recovery text + restart→`server_restart` killed sweep (D-11). Single-binary `relay --help` re-verified | [D-11] [D-12] [D-13] [ND-32] |
| **B** — Persona × project composition | pass (4/4) | none (composition contract unchanged) | **carried (baseline)** — persona *enumeration* re-verified live (CLI+REST, 7 each); persona-*behavior* marker check needs a non-first-run agent (isolated `$HOME` hits Claude's first-run TUI). D-09/D-G1 contracts untouched by Track 7 | [D-09] [D-G1] |
| **C** — Single-client lifecycle (IDE) | pass (4/4, C.5 n/a) | sessions tree view (ND-33 / 7C-tree) | **carried (baseline)** + tree-view P0 re-verified via extension harness (`sessionsTree.test.ts`, 23 specs); **live IDE-GUI leg needs operator** (no headless GUI) | [D-G6] [ND-07] [ND-33] |
| **D** — Session survives disconnect | pass (5/5) | single-press `^D` + detach confirmation (ND-34 / 7D) | **pass (fresh, live) with a finding** — single `^D` under a real PTY detaches on the **first** press and prints the "still running / reattach with…" line; session stays `running` server-side. **But the `relay attach` process does not exit after the raw-mode detach** — see [Finding F-1](#finding-f-1--relay-attach-hangs-after-a-clean-d-detach-in-raw-mode). IDE-pane leg still needs operator | [D-G3] [ND-03] [ND-25] [ND-34] |
| **E** — Cross-device continuation | pass (5/5) | none (reattach contract unchanged) | **needs operator (VM)** — genuinely cross-machine; SSH to the VM is classifier-blocked from this runner. Baseline live-pass stands | [D-G3] [03-server.md §5.2] |
| **F** — Concurrent multi-client arbitration | pass (5/5, ND-30 caveat) | none (CLI BUSY unchanged — ND-34 (j) deferred) | **functional pass (baseline) + new finding F-3** — operator ran two live clients on one TUI session: universal output + claim serialization hold, but **rendering is corrupted** (last-writer-wins viewport conflict) → [Finding F-3](#finding-f-3--concurrent-multi-client-attach-to-a-tui-agent-renders-corrupted) / [ND-39](decisions/ND-39-concurrent-multi-client-attach-tui-rendering-corruption.md). BUSY interim line present (ND-30) | [D-G2] [ND-01] [ND-02] [ND-30] [ND-39] |
| **G** — Multi-session isolation | pass (5/5) | none (isolation contract unchanged) | **pass (fresh, live)** — two sessions in distinct (project, persona) pairs both `running`; each PTY's cwd = its own project root (`lsof`: `/private/tmp/proj-relay-a` vs `…-b`); `session list` distinguishes them | [D-G1] [03-server.md §3,§4] |
| **H** — Distribution paths | deferred (H.1/H.3 blocked on 6J) | none (Track 8, not Track 7) | **deferred (D-16)** — H.2 single-binary shape re-verified fresh via `relay --help` | [D-16] [D-08] |

**Aggregate (7F):** decision axis **PASS**; A, G, H.2 **pass (fresh, live)**; D **pass (fresh, live) with Finding F-1**; B/C/F **carried (baseline) + P0 re-verified**; C-IDE & E **need operator**. **0 contract fail.** One shipped-code defect (Finding F-1) surfaced — does not fail the §7 *decision* gate but must be triaged.

---

## Per-ND status (the gate's core assertion)

Each row: status (vs [`decisions/index.md`](decisions/index.md)), P0 shipped, **fresh evidence this session**, and whether the deferral rationale is actually written in the Resolution (a deferral is only a *pass* if the rationale exists).

| ND | Status | P0 shipped | Fresh evidence (this session) | Rationale written? |
| -- | -- | -- | -- | -- |
| [ND-32](decisions/ND-32-install-and-onboarding-deep-dive.md) install + onboarding | **resolved (2026-05-26)** | self-narrating `relay init` next-steps bridge | `relay init` in isolated `$HOME` printed the 5-step bridge (`claude auth login` → `relay server` → IDE pair → register project → start session) + handbook link; `last-pairing.txt` held **only** the pairing payload (contract item 2 ✓). `init.test.ts` 9/9 | **yes** — bar statement + per-item (a)–(h) deferral rationale (Marketplace/binary-probe/`--start`/cross-device on-ramp → P1/Track-8; telemetry out-of-posture; attach-package → ND-29) |
| [ND-33](decisions/ND-33-ide-gui-overhaul-deep-dive.md) IDE GUI overhaul | **resolved (2026-05-26)** | sessions tree view (7C-tree); P1 picker/status-bar polish (7C-polish) | extension harness 57/57 incl. `sessionsTree.test.ts` (23), `quickPickGroups.test.ts` (4), `statusBar.test.ts` (7), `poll.test.ts` (5, ND-37 cadence) | **yes** — bar statement + deferrals: BUSY notice → ND-30, multi-server → ND-31, claim/activity indicators → ND-30, persona-switch → D-G1, subdir → D-01, webview out-of-scope |
| [ND-34](decisions/ND-34-session-and-attach-polish-deep-dive.md) session + attach polish | **resolved (2026-05-27)** | single-press `^D` detach + still-running confirmation | `tty.test.ts` 15/15 (single-press `^D` via `stdin.on('end')`; `localDetach`-gated "still running / reattach with…" line; no close-code-1000 overload). ND-15/17/25 resolved inline | **yes** — bar statement + deferrals: session naming (P1, high fan-out), persona-switch (D-G1), `idle` fill-in (punt held), CLI BUSY polish (P1), attach-package (ND-29) |
| [ND-35](decisions/ND-35-diagnostics-and-error-ux-deep-dive.md) diagnostics + error UX | **resolved (2026-05-27)** | `relay doctor` read-only probe set + REST recovery docs (`rest-conventions.md` §7) | live `relay doctor`: 7 named probes, every FAIL carries a `→` remediation, credentials detected via macOS Keychain OAuth, server probe = WARN without token, version header prints, **exit code 1 on FAIL** (scriptable ✓). `doctor.test.ts` 11/11 | **yes** — bar statement + deferrals: pre-spawn credential gate (P1, partial-gate cost), `recovery` field (P1, no consumer), in-IDE logs (P1), attach-exit notices → ND-30, marker-mismatch → ND-31, `relay audit` → Phase 3 |

**All four target NDs are resolved-and-P0-shipped with deferral rationale written in the Resolution.** The §7 bar is satisfied.

---

## Known-deferred friction the walk treats as pass-not-fail

These are documented, deliberately-deferred gaps (open NDs verified still `open`). Encountering them is **not** a 7F fail — recording them is.

- **ND-30 — BUSY anchoring is an unstructured `relay attach` stderr line.** [ND-30](decisions/ND-30-relay-attach-stderr-event-stream-for-subprocess-of-attach-consumers.md) confirmed **open** (Resolution still `*(unresolved)*`). The interim signal (`[relay] another device is interacting with this session.` on stderr) is present-but-suboptimal, never silent; the ND-02-compliant anchored notice is gated on the structured event stream ND-30 will define. ND-33 §(c) and ND-35 §(e)/(f) both explicitly defer to it. Per F.3 of the baseline, accepted as `pass with caveat: ND-30 pending`.
- **ND-31 — multi-server SecretStorage.** [ND-31](decisions/ND-31-secretstorage-key-namespace-for-multi-server-ide-pairing.md) confirmed **open** (Resolution still `*(unresolved)*`). Interim is single-server keys (`relay.serverUrl` + `relay.token`) + refuse-to-bind on `serverUrl` mismatch (honors [[nd-07-marker-file-schema]] rule 5). A multi-server gap is not a 7F fail; ND-33 §(d) and ND-35 §(h) defer to it.
- **ND-29 — `relay attach` as a standalone package.** [ND-29](decisions/ND-29-distribute-relay-attach-as-a-standalone-package.md) confirmed **deferred** (single-binary holds per [[d-08-single-binary-vs-separate-packages]]); out of scope for daily non-author use, with a documented re-open trigger (constrained-distribution consumer or PWA native helper).

---

## Findings

### Finding F-1 — `relay attach` does not tear down the terminal on close (process hang + screen corruption)

**Severity:** code defect in the ND-34 / ND-25 attach-teardown path. Does **not** fail the §7 *decision* gate (the decided behaviors all work and the messaging is correct on every close path), but it contradicts `cli/attach.ts`'s "Exits 0 on clean ^D detach" contract and leaves the operator's terminal visibly broken — a daily papercut for direct-terminal `relay attach` users. **Two coupled defects:**

**Defect 1 — process does not exit on a clean `^D` detach (raw mode).** Confirmed in a runner harness (Python `pty.fork`) **and live by the operator on a real host TTY (Step 8: "`^D` requires `^C` to close")**: a single `^D` detaches on the first press and prints `[relay] detached from session <id>; the session is still running. Reattach with: relay attach <id>`, the session stays `running` server-side — **but the `relay attach` process stays alive**, so the shell prompt never returns until the operator presses `^C`.

**Defect 2 — terminal screen not restored on close (any close path).** Confirmed live by the operator (Remote-SSH'd Cursor pane, Claude Code v2.1.153 TUI agent, 2 screenshots, recorded in [ND-38](decisions/ND-38-relay-attach-process-hangs-after-clean-ctrl-d-detach-in-raw-mode.md) "Observed live"). `cleanup()` reverts raw mode but never exits the agent's alternate-screen buffer / resets the display, so the frozen TUI frame stays on screen and the `[relay] …` line is painted **into the middle of it** → "bugged out" display. Reproduces on **both** a `^D` detach **and** a `^C`-driven `session_ended` close. (Positive sidebar: on the `session_ended` path relay correctly printed `session ended` / `disconnected (1000: session ended)`, **not** the "still running" line — confirming ND-34's close-code-1000 overload guard. And `^C` going to the agent, not relay, is by design.)

**Root cause (code):**
- `attach/tty.ts` `runTty` resolves its `done` promise on close; `cleanup()` reverts raw mode (`enableRaw(false)`) but **never pauses / unrefs / destroys `stdin`**, and the `stdin.on('data')` / `stdin.on('end')` listeners stay attached.
- `cli/attach.ts` `runAttach` does `const code = await done; return 0/1` and `cli/relay.ts` does `if (code !== 0) process.exitCode = code` — **on a clean detach (code 0) nothing calls `process.exit`**.
- In **raw mode** (`setRawMode` succeeds — the normal interactive case), `^D` is a `0x04` data byte, never an EOF, so `stdin` never ends. A flowing, ref'd TTY `stdin` keeps the Node event loop alive → the process hangs (defect 1). The ND-25(b) **canonical-mode** path is unaffected because a real EOF ends `stdin` and lets the process exit — which is why the unit tests (`tty.test.ts`, 15 specs, mocked client resolving `done`) pass without catching it: they never exercise the real `process.stdin` lifecycle / process exit.
- `cleanup()` also **never restores the display** — it reverts raw mode but never exits the alternate-screen buffer the agent's TUI entered (via PTY passthrough) nor resets the cursor, so the frozen frame + the `[relay] …` line overlay each other (defect 2). Fires on every close path, not just `^D`.

**Likely fix (not applied per 7F's "don't silently fix" rule):** on close, in `runTty`'s `cleanup()` / after `await done` in `cli/attach.ts`: (1) emit a terminal reset before the `[relay]` line — exit alt-screen + reset attributes (e.g. `\x1b[?1049l\x1b[0m`, conservatively) so the message lands on the restored main screen; (2) release stdin — `process.stdin.pause(); process.stdin.unref?.()` (or `process.exit(code)` once output is flushed). Add a co-located test that asserts both the real-stdin release and the reset-on-close (not just that `done` resolves).

**Disposition:** filed as **[ND-38](decisions/ND-38-relay-attach-process-hangs-after-clean-ctrl-d-detach-in-raw-mode.md)** (open; defect against the resolved ND-34/ND-25 *implementation*, not a reopening of their decisions). Per the 7F kickoff's "don't silently fix" rule, **the fix is deferred** to a follow-up task that resolves ND-38; the root cause + proposed fix + a real-stdin-lifecycle test requirement are captured there. Cite: [ND-38] [ND-34] [ND-25] [D-G3].

### Finding F-3 — concurrent multi-client attach to a TUI agent renders corrupted

**Severity:** low-frequency / high-visual-impact. A decided trade-off ([ND-23](decisions/ND-23-pty-size-negotiation-and-sigwinch-forwarding-for-attach-clients.md) **last-writer-wins** resize) biting an unconsidered case (scenario F concurrent attach), **not** a contract regression — D-G2 universal output + claim serialization still hold. Filed as **[ND-39](decisions/ND-39-concurrent-multi-client-attach-tui-rendering-corruption.md)** (open, fix deferred).

**Observed live (operator screenshots, 2026-05-27):** two `relay attach` clients on one session (Claude Code TUI). One client's frame is shredded — the agent reply "I see you sent 'test'… what would you like me to help you with?" is broken across lines with horizontal-rule artifacts, the other client's `> test` input bleeds in, and `[relay] another device is interacting with this session.` stacks into the frame.

**Root cause:** one shared PTY can be only one size; ND-23's last-writer-wins means each client's `resize` re-sizes the PTY to *its* viewport, the TUI repaints for that width, and D-G2 broadcasts those width-specific bytes to *both* clients → any client of a different width renders garbage. ND-23 explicitly rejected the tmux-style clamp-to-smallest (Option B) on the assumption that attach is near-instant and single — which doesn't hold for *simultaneous* attach. The BUSY line stacking is the ND-30 interim with no frame isolation (same class as F-1 defect 2).

**Disposition:** held for triage in ND-39 (default lean: clamp-to-smallest-while-multi-attached + document the residual; per-client rendering stays Phase 2). The operator notes a single user rarely drives two live clients on one session — so a documented limitation is the floor even if the code fix defers.

### Finding F-2 (minor doc) — kickoff preflight build command is a no-op

`pnpm -F @relay/relay build` errors `ERR_PNPM_RECURSIVE_RUN_NO_SCRIPT` — `@relay/relay` defines only a `typecheck` script, no `build`. The actual compile is `pnpm typecheck` (`tsc -b`), which emits `dist/cli/relay.js`. CLAUDE.md's scripts table already notes `pnpm build` is a no-op "until packages define `build`." A kickoff/preflight wording bug, not a contract regression — reopens no ND. A future kickoff regeneration should cite `pnpm typecheck`. The extension's `vsix` step has the inverse gotcha — it needs `pnpm -F relay-extension build` (esbuild → `dist/index.cjs`) run first, which `typecheck` does not produce.

---

## Fresh evidence captured this session

All on HEAD `11f6743`, binary compiled via `tsc -b`.

```
relay --help          → single binary: init, doctor, token, project, persona, server, attach   (H.2 / D-08 ✓)
relay --version       → 0.0.0
relay doctor          → 7 probes [relay-home FAIL, tokens FAIL, claude-binary OK, credentials OK
                        (Keychain OAuth), personas OK, storage FAIL, server WARN(no token)],
                        each FAIL has a "→" remediation line; exit code = 1 on FAIL   (ND-35 ✓)
relay init (iso HOME) → pairing snippet + 5-step next-steps bridge + handbook link;
                        last-pairing.txt = pairing payload only (not persisted bridge)  (ND-32 ✓)

vitest packages/server: attach/tty.test.ts 15/15 (ND-34), cli/init.test.ts 9/9 (ND-32),
                        cli/doctor.test.ts 11/11 (ND-35)        → 35/35 pass
vitest relay-extension: 57/57 pass (sessionsTree 23, statusBar 7, quickPickGroups 4,
                        poll 5, attach/kill/release node + startSession + attachSession)  (ND-33 ✓)
```

(The `relay doctor` FAILs reflect that this host's real `~/.relay` is uninitialized — which is exactly the actionable, remediation-bearing output the ND-35 bar promises, not a defect.)

### Fresh live local walk — isolated `$HOME` server (2026-05-27)

A real `relay server` was booted on `127.0.0.1:7799` under an isolated `HOME=/tmp/relay-7f-live` (so the operator's real `~/.relay` and parallel sessions were never touched; torn down after). Live results:

```
A.1 init artifacts        ~/.relay config + tokens + 7 personas + last-pairing       PASS
A.2 personas (CLI≡REST)   7 each (architect/design/dev/infra/product/review/test)    PASS
A.3 bearer token auth     GET /tenants/self: no-auth 401 → with-auth 200             PASS
A.4 project add (in place) marker {schemaVersion,projectId} + .gitignore append;
                          relay project list + REST /projects canonicalPath match    PASS
A.5 re-add same path      POST /projects → 409 project-path-taken (problem+json)      PASS
    (incidental)          bad slug → 422 project-slug-undeducible w/ inline recovery  PASS (ND-35 §c)
A.7 server restart        SIGTERM → restart log "D-11 boot sweep: 2 orphan(s) marked
    /D-11                 killed"; both sessions killed/server_restart, bytes intact,
                          zero auto-relaunch                                          PASS
G.1 two sessions          (proj-a,dev)+(proj-b,infra) both running, distinct ids      PASS
G.2 cwd isolation         lsof: PTY cwds = /private/tmp/proj-relay-a vs …-b           PASS
G.5 list distinguishes    distinct (status,persona,projectId) rows                    PASS
ND-15 session show        full field set (status/persona/project/ptyPid/bytes/ts)     PASS
ND-35 doctor + token      valid→[OK] server accepted; bad→[FAIL] 401; exit 1          PASS
ND-25/34 single ^D        real PTY: first press detaches + "still running" line;
                          session stays running server-side                          PASS (behavior)
                          …but relay attach process does not exit → see Finding F-1   FINDING
```

---

## Overall rollout-readiness verdict

**The §7 rollout-readiness gate is MET on its defining (decision) axis.** All four deep-dive NDs (ND-32/33/34/35) are resolved with their P0 levers shipped and their deferral rationale written into each Resolution — the bar's literal criterion. The four P0 deliverables a non-author actually touches were verified working: `relay init` self-narration, `relay doctor`, and multi-session/server-restart server behavior were **freshly verified live** against a real isolated-`$HOME` server this session (scenarios A & G full-pass live); the sessions tree view via its 57-spec extension harness; single-press `^D` detach + confirmation live under a real PTY. The open-ND frictions encountered (ND-30 BUSY stderr, ND-31 multi-server) are documented, deliberately-deferred gaps; ND-29 stays deferred.

**Two shipped-code defects surfaced in the attach surface (both confirmed live, both held for triage, neither patched inline per 7F's no-silent-fix rule):**

- **[Finding F-1](#finding-f-1--relay-attach-does-not-tear-down-the-terminal-on-close-process-hang--screen-corruption) → [ND-38](decisions/ND-38-relay-attach-process-hangs-after-clean-ctrl-d-detach-in-raw-mode.md):** `relay attach` detaches correctly on a single `^D` (decided behavior intact) but then **(1) the process hangs** (operator-confirmed: `^D` requires a follow-up `^C` to close) and **(2) the terminal screen isn't restored** (the agent's TUI frame freezes with `[relay]` lines painted in). This is **not an edge case — it hits every single-client detach**, so although the §7 *decision* gate is met (the resolution + decided behaviors exist), it materially dents ND-34's stated bar of "a single `^D` cleanly detaches … without friction or doubt." **Recommend fixing ND-38 before wider rollout.**
- **[Finding F-3](#finding-f-3--concurrent-multi-client-attach-to-a-tui-agent-renders-corrupted) → [ND-39](decisions/ND-39-concurrent-multi-client-attach-tui-rendering-corruption.md):** concurrent multi-client attach to a TUI agent renders corrupted (ND-23 last-writer-wins viewport conflict). Functional arbitration (D-G2) holds; lower frequency for a single user — documented limitation is the floor, fix deferrable.

**Two live legs still need the operator:** the genuinely cross-device leg (scenario E + the 6I install→pair→start→attach→BUSY→detach→reattach flow over a second machine — VM SSH is classifier-blocked from this runner) and the IDE-GUI interaction legs (C/D clicks, F/G status bar — no headless GUI). The 2026-05-22 baseline exercised both live (36 pass / A–G); a `vm-e2e` run + a sideloaded `.vsix` closes them into a fresh full-stack pass.

**Verdict: the §7 *decision* gate is MET (all four NDs resolved with rationale), but the live walk shows the attach UX is not yet painless in practice — ND-38 (every single-client `^D` detach hangs + corrupts the screen) should be fixed before wider rollout, and ND-39 (concurrent-attach TUI corruption) documented/deferred. Cross-device (E) and IDE-GUI legs remain operator-driven via `vm-e2e` + `.vsix`. Net: decision-ready, with one rollout-blocking attach defect (ND-38) to fix and one lower-priority limitation (ND-39) to track.**

---

## 7G follow-up — Finding F-1 fixed (ND-38) + replay-drop race (ND-40), 2026-05-28

The rollout-blocking attach defect [Finding F-1 / ND-38](#finding-f-1--relay-attach-does-not-tear-down-the-terminal-on-close-process-hang--screen-corruption) is **resolved** in task 7G, plus a third defect surfaced while making the tui-visual harness faithful to the shipped binary: a **replay-drop race** ([ND-40](decisions/ND-40-relay-attach-drops-replayed-bytes-in-connect-subscribe-gap.md)) where coalesced replay frames were dropped in the `connect()→subscribe()` gap (~20% flap on loopback). Every fix shipped **red→green with pasted evidence**; the race bugs were quantified over N runs. (Finding F-2 — the no-op `build` script — is also fixed: `@relay/relay` now defines `build: tsc -b --force`, so `pnpm -F @relay/relay build` works.)

**Fixes:** A — ND-40 inbound-binary buffer + flush-on-subscribe in `AttachClient`. B — ND-38 screen restore (`\x1b[?1049l\x1b[0m\x1b[?25h`) in `runTty` `cleanup()` on every close path. C — ND-38 stdin release (detach listeners + `pause()` + `unref()`) in `cleanup()` so a clean raw-mode `^D` drains the loop and exits. D — tui-visual harness made faithful: `spawnHarnessClient` uses production connect→subscribe ordering; a real-binary during-attach `altActive` assertion; `distCliBuilt()` (existsSync) replaced with a `distFreshness()` guard (absent→skip, stale→fail loud).

### Validation ledger (pasted evidence)

> `--repeat N` is unsupported by this repo's vitest (2.1.9); the N-run proofs use a shell loop counting all-pass vs any-fail runs (the fake's microtask ordering is deterministic, so the loop quantifies stability faithfully).

| # | Check | Pre-fix (RED) | Post-fix (GREEN) |
|---|-------|---------------|------------------|
| 1 | Fix A deterministic unit (drop in gap), `client.test.ts -t "replay.*gap"`, 50 runs | `all-pass runs=0  any-fail runs=50` (drop is deterministic) | `all-pass runs=50  any-fail runs=0` |
| 2 | Fix A integration: `tui:capture` ×20, in-proc + real-binary during-attach `altScreen` | (race flapped ~20% on the real binary pre-fix) | `passing_runs=20 failed_runs=0 \| in-process altScreen=true: 20/20 \| real-binary altScreen=true: 20/20` |
| 3 | Fix B overlay guard de-`.fails` (`tty-visual.test.ts`) | `expected true to be false` (`after.altActive` was `true`) | GREEN; `nd38-overlay.txt` now `altScreen=false` |
| 4 | Fix B non-TUI agent unharmed (line-agent fixture) | n/a (guard: passes both — `\x1b[?1049l` is a no-op off the alt screen) | GREEN; `nd38-nontui-after-detach.txt` retains `LINE-AGENT-READY` |
| 5 | Fix B `session_ended` close restores screen (crashing-tui fixture) | `expected true to be false` (`after.altActive` was `true`) | GREEN (`altActive===false`) |
| 6 | Fix C hang → prompt exit (FRESH dist), real-binary describe, 10 runs | `expected 'timeout' to be 'exited'` (process hung > 2s) | `pass=10 fail=0` (exits ≤2s) |
| 7 | Fix C canonical-mode not regressed (`tty.test.ts`) | n/a | `17 passed (17)` (incl. ND-25 `'end'` detach) |
| 8 | Fix D freshness guard (`touch src/attach/tty.ts; tui:capture`) | real-binary suite **fails loud**: `Error: dist is STALE … Run pnpm -F @relay/relay build` | after rebuild: `6 passed (6)` |
| 9 | Full suite (`typecheck && lint && test`) | baseline `501 passed (501)` | `514 passed (514)` / 57 files; typecheck + lint clean; no new masking skips |
| 10 | Real-LAN proof (`vm-e2e`) | — | **BLOCKED this session** — SSH to the `vm-e2e` peer (`techgardencode@10.0.60.221`) is auto-mode-classifier-blocked from this runner (same blocker the 7F walk recorded for scenario E). Local real-binary proof (#6, fresh dist, 10/10) stands in until the operator runs `vm-e2e`. |

**Net:** ND-38 (Finding F-1) is fixed and locked behind permanent regression tests; ND-40 fixed and quantified; the tui-visual harness now reflects the shipped binary (production ordering + freshness guard) so these cannot silently regress. The one outstanding confirmation is the real-LAN `vm-e2e` leg (#10), unchanged in posture from the 7F walk. ND-39 remains the deferred follow-up (7H).
