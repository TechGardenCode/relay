// Test-only module augmentation. At runtime, specs resolve `vscode` to
// test/vscode-mock.ts (via the Vitest alias), which exposes a `__test` handle
// for driving terminal lifecycle and resetting module state. `@types/vscode`
// has no such symbol, so declare it here for `tsc` — this affects only this
// package's compilation and is never referenced by production code.

import type { Terminal } from 'vscode';

declare module 'vscode' {
  export const __test: {
    createdTerminals: Terminal[];
    reset(): void;
    fireTerminalClose(terminal: Terminal): void;
    getCommand(command: string): ((...args: unknown[]) => unknown) | undefined;
  };
}
