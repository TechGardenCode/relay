# Kickoff: 7C-polish — IDE picker filters + REST-poll status-bar enrichment (P1)

> ✅ **Completed 2026-05-27.** Shipped: grouped/filterable persona + attach quick-picks, a REST-poll running-session status-bar indicator reusing a shared `PollLoop` extracted from `sessionsTree.ts` (ND-37 #6), 23 new specs. See the **7C-polish** done entry in [`docs/build-plan.md`](../build-plan.md). This file is retained as a historical artifact — do not re-execute.

_Written 2026-05-27. This kickoff is a point-in-time snapshot._

## ⚠️ Before you write any code (read this first)

1. **Re-read every file under [Required reads](#required-reads) now.** Do not rely on memory or on this kickoff's summaries — open the actual files. In particular re-open `startSession.ts` and `attachSession.ts`: both **already** set `matchOnDescription: true`, so this task is an incremental polish, not a from-scratch filter build. If you skip the re-read you will re-add what is already there.
2. **Treat the [D-NN / ND-NN cheatsheet](#d-nn--nd-nn-cheatsheet) as a snapshot captured on 2026-05-27, not as current truth.** Verify each cited decision is still `resolved` / `open` and unchanged using the `prd-link` skill before you depend on it. `ND-30` and `ND-31` were `open` at write time — if either has resolved, the scope of the status-bar indicator and the multi-server posture may have moved.
3. **If more than a day has passed since 2026-05-27, regenerate this kickoff** (re-run `build-plan-kickoff`) rather than executing a stale one.

**Goal:** Implement the ND-33 P1 polish — `matchOnDescription` / `matchOnDetail` + per-project (and per-source) grouping on the persona quick-pick (item b) and the attach quick-pick (item f), plus a REST-poll-derived running-session indicator in the status bar (item i, the non-ND-30-gated part). The P0 tree view (7C-tree) already absorbs primary discovery; this row sharpens the secondary paths it does not replace.

**Preflight** (resolve these before writing implementation code):

None — every dependency, directory, and fixture this task needs is in place. Specifically verified on 2026-05-27:

- The extension Vitest harness exists (7C-tree shipped it): [`packages/extension/vitest.config.ts`](../../packages/extension/vitest.config.ts), the mocked `vscode` module, the `vscode-test-augment.d.ts` augmentation, and five co-located `*.test.ts` specs. **Do not** re-bootstrap it — extend it. (Read the harness section of [`packages/extension/CLAUDE.md`](../../packages/extension/CLAUDE.md) before authoring specs: the `vscode` alias must be added in **both** vitest configs for any new mock symbol, and test-only symbols need a matching augmentation.)
- [`packages/extension/src/restClient.ts`](../../packages/extension/src/restClient.ts) already exposes `listRunningSessions()` and `listPersonas()` — the data the status-bar indicator and the grouped pickers need is already fetchable. No new REST client surface required (confirm the running-session shape carries `projectId` for grouping).
- Both quick-picks (`startSession.ts` persona pick, `attachSession.ts` session pick) already pass `matchOnDescription: true` — remaining work is `matchOnDetail: true` + grouping via `QuickPickItemKind.Separator`.
- `pnpm -F relay-extension typecheck && pnpm -F relay-extension test` is green on the current branch — start from green.

## Required reads

(in this order)

- [`docs/decisions/ND-33-ide-gui-overhaul-deep-dive.md`](../decisions/ND-33-ide-gui-overhaul-deep-dive.md) — the parent resolution. Items **(b)** persona picker, **(f)** attach quick-pick, and **(i)** status-bar richness are the P1 scope; Contract #7 names this exact row. Note that **(i) is split**: only the REST-poll-derived running-session indicator is in scope — claim-holder and agent-activity indicators are deferred with the BUSY surface on ND-30.
- [`docs/prd/04-ide-extension.md`](../prd/04-ide-extension.md) §6 — the "GUI affordances roadmap" P1 bullet is the canonical task surface ("persona quick-pick … and the session quick-pick … gain `matchOnDescription` / `matchOnDetail` and per-project grouping. The status bar gains a REST-poll-derived running-session indicator.").
- [`docs/decisions/ND-37-rest-poll-cadence-and-lifecycle-for-extension-live-surfaces.md`](../decisions/ND-37-rest-poll-cadence-and-lifecycle-for-extension-live-surfaces.md) — **load-bearing.** Contract #6 mandates the status-bar indicator reuse the **same** 5s, visibility-gated, in-place-error, dispose-on-deactivate poll contract as the tree view — "the extension never runs two divergent timers." Read 7C-tree's poll loop in [`packages/extension/src/sessionsTree.ts`](../../packages/extension/src/sessionsTree.ts) and reuse its mechanism rather than inventing a second timer.
- [`packages/extension/src/commands/startSession.ts`](../../packages/extension/src/commands/startSession.ts) — `pickPersona()` is the item-(b) target.
- [`packages/extension/src/commands/attachSession.ts`](../../packages/extension/src/commands/attachSession.ts) — the session quick-pick is the item-(f) target.
- [`packages/extension/src/statusBar.ts`](../../packages/extension/src/statusBar.ts) — the item-(i) target. **Today it is purely event-driven** (`onDidChangeActiveTextEditor` / `onDidChangeWorkspaceFolders` / `secrets.onDidChange`); it has no timer. Note that `vscode.StatusBarItem` has **no** `onDidChangeVisibility`, so ND-37's visibility gating cannot be wired the way the tree view does it — decide how to honor the "cost proportional to attention" intent (e.g. poll while paired + a bound/active root exists, tear down on unpair) and document the adaptation with an ND-37 citation.
- [`packages/extension/CLAUDE.md`](../../packages/extension/CLAUDE.md) — Owns/does-NOT-own (no WS client; REST-poll only), the Vitest harness shape, and the verification gates (specs are typechecked under strict config; guard indexed access; `import type`).

**Phase 0 surprises that apply:**

None directly assigned. The Phase 0 spike concerned cross-device PTY attach (the `relay attach` client and the boot orphan sweep); none of its six surprises touch the extension's GUI polish surface.

## D-NN / ND-NN cheatsheet

> Snapshot — verify each row with `prd-link` before relying on it.

| ID | Status | Implication for this task |
| -- | -- | -- |
| [ND-33](../decisions/ND-33-ide-gui-overhaul-deep-dive.md) | resolved | The parent. Items (b)/(f)/(i) are P1 and Contract #7 names this row. (i) is split — only the REST-pollable running-session indicator is in scope here. |
| [ND-37](../decisions/ND-37-rest-poll-cadence-and-lifecycle-for-extension-live-surfaces.md) | resolved | **Load-bearing.** The status-bar indicator MUST reuse the shared 5s / visibility-gated / render-error-and-keep-polling / dispose-on-deactivate contract — no second divergent timer. Manual-refresh and not-paired placeholder behaviors apply. |
| [D-G2](../decisions/D-G2-multi-client-input-arbitration.md) | resolved | No WebSocket in the extension. The status-bar indicator and pickers are REST-poll / REST-fetch only; the claim FSM stays in `relay attach`. |
| [D-11](../decisions/D-11-server-restart-and-session-orphaning.md) | resolved | `running` / `idle` / `killed` are the lifecycle states the indicator and grouping reflect (status semantics, not invented labels). |
| [ND-30](../decisions/ND-30-relay-attach-stderr-event-stream-for-subprocess-of-attach-consumers.md) | **open** | Gates the claim-holder + agent-activity status-bar indicators and the anchored BUSY notice — all **out of scope** here. Do not scrape stderr as a fallback (ND-33 Contract #4). Ship only the running-session count/state. |
| [ND-31](../decisions/ND-31-secretstorage-key-namespace-for-multi-server-ide-pairing.md) | **open** | Gates the multi-server picker — out of scope. Single-server posture stands; do not add server-switching UI. |

**Done when** (from build-plan row): Quick-picks filter + group; status bar shows running-session count/state from REST poll; co-located specs on the harness from 7C-tree; `pnpm -F relay-extension typecheck && build && vsix` clean. (No acceptance scenario is unblocked — 7C-polish is P1 and does **not** gate 7F, which sequences on 7C-tree, already done.)

**Output structure:**

```
packages/extension/src/
├── commands/
│   ├── startSession.ts          # pickPersona(): + matchOnDetail + source/project grouping (separators)
│   ├── startSession.test.ts     # NEW — quick-pick item shape + grouping (or extend an existing spec)
│   ├── attachSession.ts         # session quick-pick: + matchOnDetail + per-project grouping (separators)
│   └── attachSession.test.ts    # NEW — grouped/filterable session list
├── statusBar.ts                 # + REST-poll running-session indicator reusing the ND-37 contract
├── statusBar.test.ts            # NEW — poll lifecycle (start/stop/dispose), error placeholder, count render
└── (optional) poll.ts           # extract sessionsTree's poll loop into a shared helper if it de-dupes the timer
packages/extension/src/sessionsTree.ts   # only if you extract the shared poll helper per ND-37 #6
```

Decide early whether to **extract** the tree view's poll loop into a shared helper (ND-37 #6's "reused verbatim" is easiest to honor literally via extraction) or to **replicate the mechanism** in the status bar. Either satisfies the contract; extraction is cleaner but touches 7C-tree's shipped code — call it out for `relay-spec-reviewer` if you go that way.

**Verification:**

- `pnpm -F relay-extension test` — all specs green (existing 5 + the new ones).
- `pnpm -F relay-extension typecheck` — no TS errors (specs are typechecked under strict config per the package `CLAUDE.md`).
- `pnpm -F relay-extension build && pnpm -F relay-extension vsix` — esbuild bundle + `.vsix` package clean.
- `pnpm lint && pnpm format:check` — extension specs are covered by both.
- Manual smoke (if a server is reachable): persona/attach quick-picks show grouped, filterable items; status bar shows a running-session count that updates on the 5s cadence and renders a placeholder (not a crash) when the server is unreachable.

## Execution protocol (closeout)

Drive these as TodoWrite items with the `superpowers:executing-plans` skill as the step-loop. **Do not claim this task is done until every box is checked.**

- [ ] **Re-read the Required reads** before writing code (per the freshness clause above) — especially confirm what `matchOnDescription`/`matchOnDetail` is already set so you add only what's missing.
- [ ] **Author specs via the `relay-test-author` sub-agent and gate on them** — the extension `CLAUDE.md` (harness shape + verification gates) is the test contract; the ND-37 poll lifecycle (start-on-visible/paired, stop, dispose, error-placeholder-and-keep-polling) is the must-assert behavior for the status-bar indicator. Honor the sub-agent's verification-gate contract (implementation isn't done until its specs pass).
- [ ] **Add `ND-37` / `ND-33` / `D-G2` citation comments** for any non-obvious behavior (the shared-poll reuse, the status-bar visibility-gating adaptation, the no-WS / no-stderr-scrape constraints), per [`CLAUDE.md`](../../CLAUDE.md) → "Code-comment convention". If you introduce behavior that warrants a new decision, file it via the `decision-log` skill _before_ writing the citation.
- [ ] **Run the Verification block above and confirm it is green** — `superpowers:verification-before-completion` discipline: evidence before assertions, no "done" claim on unrun or red checks.
- [ ] **Flip the build-plan row to `done`**, link the artifact, and replace this task's kickoff stub with a one-line pointer in [`docs/build-plan.md`](../build-plan.md) (per CLAUDE.md "How agents should work in this repo").
- [ ] **Hand the diff to the `relay-spec-reviewer` sub-agent** for a drift audit against ND-33 / ND-37 / D-G2 and the extension `CLAUDE.md` constraints before merge — especially if you extracted/touched `sessionsTree.ts`.

## Feeders

(skills + sub-agents to invoke during the work)

- `prd-link` — verify each cheatsheet citation is current (ND-30 / ND-31 were `open` at write time).
- `decision-log` — file any new decision a non-obvious behavior warrants (e.g. if the status-bar visibility-gating adaptation needs a named contract).
- `relay-test-author` — author and gate the picker + status-bar specs on the 7C-tree harness.
- `relay-spec-reviewer` — diff-time drift audit at closeout.
- `relay-architect` — optional plan-time review of the extract-vs-replicate poll decision against ND-37 #6 before you write it.
