---
id: ND-18
status: open
title: "Lazy-load CLI dispatcher contract"
affects: "docs/arch/repo-layout.md §3 (cli/ module description), packages/server/src/cli/relay.ts, docs/prd/04-ide-extension.md §4 (relay attach spawn from extension)"
surfaced-by: "vm-e2e walk (2026-05-18) — fresh pnpm install --ignore-scripts on the cross-device VM left relay --help and relay attach unable to load because cli/relay.ts eagerly imports every action handler at the top, including runServer and runInit which transitively pull node-pty, better-sqlite3, and fastify. The VM doesn't need any of those for the thin-client attach path. Workaround was pnpm rebuild node-pty (build tools were present); the cleaner fix is to lazy-load the heavy modules inside each commander .action() callback so --help and attach don't pay for them. This bites the IDE extension (6I) the moment a user installs @relay/relay on a thin-client-only device."
---

# ND-18 — Lazy-load CLI dispatcher contract


**Status:** open
**Affects:** `docs/arch/repo-layout.md` §3 (`cli/` module description), `packages/server/src/cli/relay.ts`, `docs/prd/04-ide-extension.md` §4 (`relay attach` spawn from extension)
**Surfaced by:** vm-e2e walk (2026-05-18) — fresh `pnpm install --ignore-scripts` on the cross-device VM left `relay --help` and `relay attach` unable to load because `cli/relay.ts` eagerly imports every action handler at the top, including `runServer` and `runInit` which transitively pull `node-pty`, `better-sqlite3`, and `fastify`. The VM doesn't need any of those for the thin-client `attach` path. Workaround was `pnpm rebuild node-pty` (build tools were present); the cleaner fix is to lazy-load the heavy modules inside each `commander` `.action()` callback so `--help` and `attach` don't pay for them. This bites the IDE extension (6I) the moment a user installs `@relay/relay` on a thin-client-only device.

## Question
Is the lazy-load shape a load-bearing CLI contract — "no `relay` subcommand other than `server`, `init`, and the data-plane CLI verbs may transitively load `node-pty` / `better-sqlite3` / `fastify` at module-init time" — or is it just a 6H implementation detail to fix without spec ceremony?

## Elaboration prompt
The `commander` dispatcher in `cli/relay.ts` currently does:

```ts
import { runInit } from './init.js';
import { runProjectAdd, runProjectList, runProjectRemove } from './project.js';
import { runSessionKill, runSessionList, runSessionShow } from './session.js';
import { runServer } from './server.js';
import { runAttach } from './attach.js';
// ...
```

All five `run*` imports are eagerly evaluated as soon as `node relay.js` boots — including for `relay --help`, `relay attach <sid>`, and `relay --version`. Each pulls a different cone of dependencies:

| Import | Pulls transitively |
| --- | --- |
| `runInit` | `store` (better-sqlite3 native) + `runMigrations` |
| `runProjectAdd/List/Remove` | `store` (better-sqlite3) + cli/http (small) |
| `runSessionKill/List/Show` | `store` (better-sqlite3) + cli/http |
| `runServer` | `store` + `session` (→ `pty` → node-pty native) + `server/index` (→ fastify, ws) |
| `runAttach` | `attach/` (ws only — pure WebSocket + TTY bridge) |

A user installing `@relay/relay` on a phone-class device, an IDE extension's spawn target, or a CI runner with no `claude` binary should not be forced to compile node-pty or better-sqlite3. The PRD §7 lists `relay attach` as a first-class subcommand of the single `relay` binary (D-08 one-binary distribution) — splitting into `relay-attach` is not on the table — so the constraint falls on the dispatcher: heavy deps must only load when the matching action fires.

What to validate before resolving: (a) whether the lazy-load discipline extends to `relay token list` / `relay persona list` (both touch only files + json/yaml; both feel like they should work on a thin-client device); (b) whether `@relay/protocol` Zod schemas are heavy enough to count (they aren't — pure JS, no native deps); (c) whether the rule belongs in `docs/arch/repo-layout.md` §3 as a stated boundary on `cli/`'s public surface, or in a `packages/server/src/cli/CLAUDE.md` per-module note (cli/ is not load-bearing today; adding a CLAUDE.md just for this would be ceremony-heavy); (d) whether a startup-cost regression test belongs in the test suite — e.g., a test that spawns `node dist/cli/relay.js --help` with `--inspect-brk` and asserts that `better-sqlite3` and `node-pty` are not in the loaded-modules list (achievable via `--experimental-vm-modules` listing or process.moduleLoadList).

Proposed direction: ship a strict rule — **`relay attach`, `relay --help`, `relay --version`, `relay token *`, `relay persona list/create` must not load `node-pty`, `better-sqlite3`, or `fastify` at boot.** All other subcommands legitimately need their data plane. The dispatcher uses dynamic `await import('./init.js')` inside each `.action()` for the heavy paths. Build-plan 6I (IDE extension) directly depends on this — the extension spawns `relay attach` from PATH on the user's machine, which may not have the native build toolchain.

This is filed as `open` so the resolution lands as a deliberate `docs/arch/repo-layout.md` §3 edit naming the rule, plus a regression test that asserts the loaded-module set. Build-plan 6H lands the lazy-import refactor in code provisionally; the propagation closes the doc gap.
