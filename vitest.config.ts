import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    passWithNoTests: true,
    include: ['packages/**/*.{test,spec}.ts'],
    // packages/pwa is an Angular 21 app with its own test runner (`ng test` →
    // Angular's Vitest integration, a different Vitest major). Exclude it from
    // the root run; use `pnpm -F @relay/pwa test` for PWA specs.
    exclude: ['**/node_modules/**', '**/dist/**', 'packages/pwa/**'],
  },
  resolve: {
    // `vscode` is not an npm package — the VS Code host injects it at runtime.
    // packages/extension specs alias it to an in-repo mock; mirror that here so
    // a full-tree `pnpm test` run resolves the extension specs too. Harmless to
    // other packages, none of which import `vscode`.
    alias: {
      vscode: fileURLToPath(new URL('./packages/extension/test/vscode-mock.ts', import.meta.url)),
    },
  },
});
