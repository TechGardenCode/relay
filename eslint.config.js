import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/out-tsc/**',
      '**/node_modules/**',
      '**/coverage/**',
      'docs/**',
      '.angular/**',
      // Sibling worktrees live here; their checkouts are managed
      // independently and aren't part of this branch's lint surface.
      '.claude/worktrees/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    files: ['packages/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
  },
  {
    // The deterministic TUI fixture is plain ESM run by `node` inside the
    // visual-testing harness; declare the Node globals it touches (the default
    // flat env doesn't add them for a bare .mjs the way typescript-eslint does
    // for .ts).
    files: ['packages/server/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
      },
    },
  },
);
