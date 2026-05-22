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
      // Sibling worktrees (e.g., 6I IDE extension) live here; their
      // checkouts are managed independently and aren't part of this
      // branch's lint surface.
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
    files: ['spike/**/*.{ts,mjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        URL: 'readonly',
      },
    },
  },
  {
    // Per Track 8 spike: spike-pwa is browser code; default ESLint env
    // expects Node globals. Declare the browser globals it touches so
    // the lint surface is honest rather than awash in no-undef errors.
    files: ['packages/spike-pwa/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        URLSearchParams: 'readonly',
        URL: 'readonly',
        btoa: 'readonly',
        atob: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        localStorage: 'readonly',
        window: 'readonly',
        document: 'readonly',
        WebSocket: 'readonly',
        MessageEvent: 'readonly',
        CloseEvent: 'readonly',
        KeyboardEvent: 'readonly',
        Event: 'readonly',
        ResizeObserver: 'readonly',
        HTMLDivElement: 'readonly',
      },
    },
  },
);
