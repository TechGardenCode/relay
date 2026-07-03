# @techgardencode/pwa

The Relay Phase-2 PWA — a terminal-style Angular client over the canonical
REST/WS contract (the same one `relay attach` and the IDE extension consume).
One of three first-party clients; the server stays client-agnostic (NFR-5).

- **What it is / does:** [`docs/design/pwa/`](../../docs/design/pwa/) (FR/NFR, interaction model), governed by [`D-18`](../../docs/decisions/D-18-pwa-terminal-substrate-and-mvp-scope.md).
- **How it's built (the spec):** [`docs/arch/pwa/`](../../docs/arch/pwa/) L0–L6.
- **Implementation plan:** [`docs/superpowers/plans/2026-07-02-p2-pwa-build.md`](../../docs/superpowers/plans/2026-07-02-p2-pwa-build.md).

## Stack

Angular 21 (standalone, signals, zoneless), Vitest, `@angular/pwa` (installability
only — no offline session data, NFR-7), `xterm.js` terminal viewport, Tailwind v4
as the design-system consumption seam (empty placeholder until L1 delivery —
foundations §4), `@relay/protocol` for all wire shapes.

## Commands (run from the repo root)

| Command                    | What it does                                                          |
| -------------------------- | --------------------------------------------------------------------- |
| `pnpm -F @relay/pwa build` | Production build (esbuild application builder) → `dist/pwa/browser/`. |
| `pnpm -F @relay/pwa test`  | Vitest via Angular's unit-test builder.                               |
| `pnpm -F @relay/pwa start` | Dev server.                                                           |

PWA specs are excluded from the root `pnpm test` (Angular owns its own runner) —
see the root `vitest.config.ts`.
