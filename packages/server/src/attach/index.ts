// `attach/` — WS-client + raw-mode TTY bridge for `relay attach <sid>`.
// Imported by `cli/attach.ts` (the dispatcher) and by the IDE extension's
// terminal integration (it spawns the same binary out of PATH per
// prd/04-ide-extension.md §4).

export { AttachClient } from './client.js';
export type { AttachClientOptions, ClientCallbacks, ClientState } from './client.js';
export { runTty } from './tty.js';
export type { RunTtyOptions, RunTtyResult } from './tty.js';
export { resolveAttachConfig, AttachConfigError } from './config.js';
export type { ResolveAttachConfigOptions, ResolvedAttachConfig } from './config.js';
