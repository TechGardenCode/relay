# `@relay/extension` — Package context

The VS Code family extension (`.vsix` output). Spawns `relay attach` from the
user's PATH for terminal integration and renders the sessions tree view in the
Activity Bar. Authoritative surface lives in [`docs/prd/04-ide-extension.md`](../../docs/prd/04-ide-extension.md)
and [`docs/arch/repo-layout.md`](../../docs/arch/repo-layout.md) §6.

## Owns / does NOT own

- **Owns** the GUI surface (tree view, status bar, node commands) and spawning
  `relay attach` as a terminal subprocess.
- **REST-poll only — no WebSocket.** Per D-G2 the extension holds **no** claim
  state; the spawned `relay attach` subprocess opens the WS and its close
  performs the actual claim release. "Release" in the extension just disposes the
  terminal. Do not add a WS client here.

## Vitest harness (read before authoring or editing any spec)

Non-obvious shape, figured out the hard way — read it as context, don't
rediscover it:

- **`vscode` is NOT an npm package.** The extension host injects it at runtime;
  only `@types/vscode` is installed. Importing it in a spec resolves to nothing
  unless aliased.
- Specs alias `vscode` → [`test/vscode-mock.ts`](test/vscode-mock.ts) in **both**
  [`vitest.config.ts`](vitest.config.ts) **and** the repo-root
  [`vitest.config.ts`](../../vitest.config.ts) — the latter so a full-tree
  `pnpm test` resolves these specs too. Add the alias in both, or one of the two
  run modes breaks.
- Test-only symbols the mock exposes that `@types/vscode` lacks (e.g. the
  `__test` lifecycle handle) need a module augmentation in
  [`src/vscode-test-augment.d.ts`](src/vscode-test-augment.d.ts) so `tsc` accepts
  them. Add the symbol to the mock **and** the augmentation together.
- Keep the mock **behavioral, not exhaustive** — add a symbol only when a spec
  needs it (the note at the top of `vscode-mock.ts` says the same).

## Verification gates (specs must pass them)

- Specs are co-located as `src/**/*.test.ts` and **are typechecked** by
  `tsc -b`: this package's `tsconfig.json` does `include: ["src/**/*"]` with no
  test carve-out and extends the root [`tsconfig.base.json`](../../tsconfig.base.json)
  — so every spec compiles under the **same strict config as source**
  (`strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`). Guard indexed
  access (`arr[0]` is `T | undefined`); use `import type` for type-only imports.
- ESLint (`packages/**/*.ts`) and Prettier ([`.prettierrc.json`](../../.prettierrc.json))
  also cover specs. Output must be typecheck/lint/format-clean — run
  `pnpm typecheck && pnpm lint && pnpm format:check` before committing.
