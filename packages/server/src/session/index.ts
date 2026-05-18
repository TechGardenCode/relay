// session/ — orchestration glue for the four foundation modules (store,
// persona, pty, transcript) plus the auth revocation bus. Owns the boot
// orphan sweep (D-11), the shutdown discipline (Phase 0 surprise §2), and
// the D-G3 universal-output fan-out. Build-plan task 6E.

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
export {
  buildArgv,
  hashPersonaFile,
  writeTransientDir,
  type BuildArgvResult,
  type WriteTransientDirArgs,
} from './spawn.js';
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
  type SessionHandle,
  type SessionRegistry,
  type SupervisorFactory,
  type WriterFactory,
} from './types.js';
