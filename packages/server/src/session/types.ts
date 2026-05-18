import type { CreateWriterArgs, TranscriptWriter } from '../transcript/index.js';
import type { PtySupervisor, SpawnArgs } from '../pty/index.js';
import type { Database, SessionRow } from '../store/index.js';

export type SupervisorFactory = (args: SpawnArgs) => PtySupervisor;
export type WriterFactory = (args: CreateWriterArgs) => TranscriptWriter;
export type AgentSessionIdCapture = (opts: {
  canonicalProjectPath: string;
  homeOverride?: string;
}) => Promise<string | null>;

export interface RegistryDeps {
  db: Database;
  // Test seam: override the homedir() lookup used by config/paths.ts and
  // agent-session-id.ts. Production callers omit.
  homeOverride?: string;
  // Agent CLI binary name. Defaults to 'claude'. Tests override with a
  // benign command (`cat`, `printf`).
  agentCli?: string;
  // Env passed through to the spawned agent process. Defaults to the parent
  // process env (per D-10 — ANTHROPIC_API_KEY is server-level, never per-session).
  env?: Record<string, string>;
  // Per ND-13: 1 s in production; tests override with shorter values for
  // fake-timer assertions.
  byteFlushIntervalMs?: number;
  // Test seam: inject a fake supervisor matching pty/supervisor.ts. Production
  // callers omit (uses createSupervisor from pty/).
  supervisorFactory?: SupervisorFactory;
  // Test seam: inject a fake writer matching transcript/writer.ts. Production
  // callers omit (uses createWriter from transcript/).
  writerFactory?: WriterFactory;
  // Test seam: stub the post-spawn ND-11 directory poll. Production callers
  // omit (uses captureAgentSessionId from agent-session-id.ts).
  agentSessionIdCapture?: AgentSessionIdCapture;
}

export interface SessionCreateInput {
  projectId: string;
  personaName: string;
  // Canonical project path resolved by 6F (per D-12) before calling create().
  canonicalProjectPath: string;
}

// A connected client receiving the universal output stream (per D-G3). 6G's
// WS handler implements this; tests use a thin in-memory shim.
export interface AttachedClient {
  readonly id: string;
  onBytes(chunk: Buffer): void;
}

// What create() returns to 6F. Read-only view of the underlying supervisor
// plus a fresh row read. Claim-lock arbitration and the WS state machine
// live in 6G — `attach()` is just registry membership.
export interface SessionHandle {
  readonly id: string;
  readonly row: SessionRow;
  readonly pid: number;
  readonly bytesEmitted: number;
  write(data: Buffer | string): void;
  resize(cols: number, rows: number): void;
  snapshot(): Buffer;
}

export interface SessionRegistry {
  create(input: SessionCreateInput): Promise<SessionHandle>;
  get(sid: string): SessionHandle | undefined;
  attach(sid: string, client: AttachedClient): { unsubscribe: () => void };
  kill(sid: string, reason: 'operator_kill'): { killed: boolean };
  shutdown(): Promise<void>;
  readonly shuttingDown: boolean;
}

export type SessionCreateErrorCode = 'persona_not_found' | 'session_not_found';

export class SessionCreateError extends Error {
  readonly code: SessionCreateErrorCode;
  constructor(code: SessionCreateErrorCode, message: string) {
    super(message);
    this.name = 'SessionCreateError';
    this.code = code;
  }
}
