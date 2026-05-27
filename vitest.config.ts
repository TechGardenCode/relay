import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    passWithNoTests: true,
    include: ['packages/**/*.{test,spec}.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
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
