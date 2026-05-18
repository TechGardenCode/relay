// server/ws/ — owned by 6G (WS handler + claim-lock state machine per
// docs/arch/ws-protocol.md). Layers CLAIM/SEND/RELEASE on top of the
// `attached` Set maintained by session/registry.ts; PTY bytes fan out to
// every attached client unconditionally (D-G3).

export { registerWs, type WsPluginOptions } from './handler.js';
export {
  createClaimLock,
  type ClaimLock,
  type ClaimLockHooks,
  type ClaimResult,
  type ClaimReleasedEvent,
  type ClaimReleasedReason,
  type CreateClaimLockOptions,
} from './claim-lock.js';
