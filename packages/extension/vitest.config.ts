import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

// `relay-extension` co-locates Vitest specs next to source. The extension
// imports `vscode`, which is NOT an npm package (the host injects it at
// runtime; only @types/vscode is installed), so resolve it to the in-repo mock.
// The repo-root vitest.config.ts carries the same alias so a full-tree
// `pnpm test` run resolves these specs too.
export default defineConfig({
  test: {
    include: ['src/**/*.{test,spec}.ts'],
    environment: 'node',
  },
  resolve: {
    alias: {
      vscode: fileURLToPath(new URL('./test/vscode-mock.ts', import.meta.url)),
    },
  },
});
