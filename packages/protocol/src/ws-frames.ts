// WebSocket wire-format schemas for GET /sessions/:id/stream. The contract
// lives in docs/arch/ws-protocol.md §2. The eleven JSON discriminators below
// must stay in lockstep with the catalog inlined in
// .claude/skills/ws-protocol-check/SKILL.md — adding a frame here requires
// editing both that catalog and the spec.

import { z } from 'zod';

import { IsoTimestampSchema, UlidSchema } from './rest/common.js';

// Per ws-protocol.md §2.1: client-originated correlation id, echoed by the
// server on the matching claim_ack / busy / error response.
export const CorrelationIdSchema = z.string().min(1).max(64);

// ----- Client → Server (§2.2) -----

export const ClaimFrameSchema = z
  .object({
    type: z.literal('claim'),
    id: CorrelationIdSchema.optional(),
  })
  .strict();
export type ClaimFrame = z.infer<typeof ClaimFrameSchema>;

export const SendFrameSchema = z
  .object({
    type: z.literal('send'),
    id: CorrelationIdSchema.optional(),
    // Per ws-protocol.md §2.2: base64 encoding of the raw input bytes. The
    // server validates decodability and emits `invalid_send` on failure
    // (§4.1). Length is unbounded at the application layer; WS-frame caps
    // apply.
    data: z.string(),
  })
  .strict();
export type SendFrame = z.infer<typeof SendFrameSchema>;

export const ReleaseFrameSchema = z
  .object({
    type: z.literal('release'),
    id: CorrelationIdSchema.optional(),
  })
  .strict();
export type ReleaseFrame = z.infer<typeof ReleaseFrameSchema>;

export const ClientFrameSchema = z.discriminatedUnion('type', [
  ClaimFrameSchema,
  SendFrameSchema,
  ReleaseFrameSchema,
]);
export type ClientFrame = z.infer<typeof ClientFrameSchema>;

// ----- Server → Client control (§2.3) -----

export const HelloFrameSchema = z
  .object({
    type: z.literal('hello'),
    sessionId: UlidSchema,
    // Per ND-11: omitted when capture has not (yet) resolved.
    agentSessionId: z.string().optional(),
    status: z.enum(['running', 'killed']),
    replayBufferBytes: z.number().int().nonnegative(),
    claimLockTimeoutSeconds: z.number().int().positive(),
    serverTime: IsoTimestampSchema,
  })
  .strict();
export type HelloFrame = z.infer<typeof HelloFrameSchema>;

export const ClaimAckFrameSchema = z
  .object({
    type: z.literal('claim_ack'),
    id: CorrelationIdSchema.optional(),
    expiresAt: IsoTimestampSchema,
  })
  .strict();
export type ClaimAckFrame = z.infer<typeof ClaimAckFrameSchema>;

export const BusyFrameSchema = z
  .object({
    type: z.literal('busy'),
    id: CorrelationIdSchema.optional(),
    since: IsoTimestampSchema.optional(),
  })
  .strict();
export type BusyFrame = z.infer<typeof BusyFrameSchema>;

export const ClaimReleasedReasonSchema = z.enum([
  'delivered',
  'timeout',
  'disconnect',
  'voluntary',
  'session_ended',
]);
export type ClaimReleasedReason = z.infer<typeof ClaimReleasedReasonSchema>;

export const ClaimReleasedFrameSchema = z
  .object({
    type: z.literal('claim_released'),
    reason: ClaimReleasedReasonSchema,
    // Opaque server-assigned connection id of the prior holder. Per §2.3:
    // informational, not authenticated.
    heldBy: z.string().optional(),
  })
  .strict();
export type ClaimReleasedFrame = z.infer<typeof ClaimReleasedFrameSchema>;

export const ReplayStartFrameSchema = z
  .object({
    type: z.literal('replay_start'),
    // Exact total byte count of the binary frames that follow before replay_end.
    bytes: z.number().int().nonnegative(),
  })
  .strict();
export type ReplayStartFrame = z.infer<typeof ReplayStartFrameSchema>;

export const ReplayEndFrameSchema = z
  .object({
    type: z.literal('replay_end'),
  })
  .strict();
export type ReplayEndFrame = z.infer<typeof ReplayEndFrameSchema>;

export const SessionEndedReasonSchema = z.enum(['agent_exit', 'operator_kill', 'server_shutdown']);
export type SessionEndedReason = z.infer<typeof SessionEndedReasonSchema>;

export const SessionEndedFrameSchema = z
  .object({
    type: z.literal('session_ended'),
    reason: SessionEndedReasonSchema,
    exitCode: z.number().int().optional(),
    terminatedReason: z.string().optional(),
  })
  .strict();
export type SessionEndedFrame = z.infer<typeof SessionEndedFrameSchema>;

export const AuthExpiredFrameSchema = z
  .object({
    type: z.literal('auth_expired'),
    tokenId: z.string().optional(),
  })
  .strict();
export type AuthExpiredFrame = z.infer<typeof AuthExpiredFrameSchema>;

export const WsErrorCodeSchema = z.enum([
  'malformed_message',
  'unknown_type',
  'invalid_send',
  'send_without_claim',
  'release_without_claim',
  'rate_limited',
]);
export type WsErrorCode = z.infer<typeof WsErrorCodeSchema>;

export const ErrorFrameSchema = z
  .object({
    type: z.literal('error'),
    code: WsErrorCodeSchema,
    message: z.string(),
    id: CorrelationIdSchema.optional(),
    fatal: z.boolean(),
  })
  .strict();
export type ErrorFrame = z.infer<typeof ErrorFrameSchema>;

export const ServerFrameSchema = z.discriminatedUnion('type', [
  HelloFrameSchema,
  ClaimAckFrameSchema,
  BusyFrameSchema,
  ClaimReleasedFrameSchema,
  ReplayStartFrameSchema,
  ReplayEndFrameSchema,
  SessionEndedFrameSchema,
  AuthExpiredFrameSchema,
  ErrorFrameSchema,
]);
export type ServerFrame = z.infer<typeof ServerFrameSchema>;

// Per ws-protocol.md §4.2: transport-level close codes. Distinct from the
// in-band `error` frame (§4.1) which leaves the socket open.
export const WsCloseCode = {
  Normal: 1000,
  PolicyViolation: 1008,
  ServerError: 1011,
  AuthExpired: 4401,
  SessionNotFound: 4404,
  ConnectionCapExceeded: 4409,
} as const;
export type WsCloseCode = (typeof WsCloseCode)[keyof typeof WsCloseCode];
