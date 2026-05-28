// session/ — orchestration glue for the foundation modules (store, pty,
// transcript) plus the auth revocation bus. Owns the boot orphan sweep
// (D-11), the shutdown discipline (Phase 0 surprise §2), and the D-G3
// universal-output fan-out. Build-plan task 6E. Per D-17 the persona module
// is dormant and no longer on the spawn path; sessions spawn a bare agent.

export { bootOrphanSweep } from './boot.js';
export {
  captureAgentSessionId,
  claudeProjectDir,
  encodeClaudeProjectPath,
  CAPTURE_TIMEOUT_MS,
  POLL_INTERVAL_MS,
  type CaptureOptions,
} from './agent-session-id.js';
export {
  createByteAccountant,
  DEFAULT_FLUSH_INTERVAL_MS,
  type ByteAccountant,
  type ByteAccountantOptions,
  type SessionByteHandle,
} from './byte-accounting.js';
// Per D-17: buildArgv/hashPersonaFile are removed (the persona bridge on the
// spawn path). Only the persona-agnostic transient-dir writer remains.
export { writeTransientDir, type WriteTransientDirArgs } from './spawn.js';
export {
  createRegistry,
  initServer,
  type InitServerOptions,
  type InitServerResult,
} from './registry.js';
export {
  SessionCreateError,
  type AgentSessionIdCapture,
  type AttachedClient,
  type RegistryDeps,
  type SessionCreateErrorCode,
  type SessionCreateInput,
  type SessionEndInfo,
  type SessionHandle,
  type SessionRegistry,
  type SupervisorFactory,
  type WriterFactory,
} from './types.js';
