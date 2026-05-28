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
  // process env (per D-10 — server-level pass-through is the mechanism; docs
  // lead with `claude login` OAuth per ND-19, ANTHROPIC_API_KEY is the
  // documented fallback). The full process.env inherits $HOME so spawned
  // agents read the operator's OAuth state (Keychain on macOS, ~/.claude/
  // .credentials.json on Linux) without Relay touching it.
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
  // Per D-17: personas are descoped from MVP, so create() takes no persona —
  // it spawns a bare agent. No personaName field exists here precisely so no
  // caller can route a client-supplied value back onto the spawn path.
  // Canonical project path resolved by 6F (per D-12) before calling create().
  canonicalProjectPath: string;
}

export interface SessionEndInfo {
  // Per ws-protocol.md §2.3: 'session_ended' frame discriminator. The
  // registry distinguishes these two locally; 'server_shutdown' is fired
  // from registry.shutdown() instead of pty.onExit.
  reason: 'agent_exit' | 'operator_kill' | 'server_shutdown';
  exitCode: number | null;
  // Mirrors sessions.terminated_reason at the moment of dispatch. NULL
  // when the row is still 'running' (e.g., shutdown path where the boot
  // sweep owns the eventual flip per D-11).
  terminatedReason: string | null;
}

// A connected client receiving the universal output stream (per D-G3). 6G's
// WS handler implements this; tests use a thin in-memory shim.
export interface AttachedClient {
  readonly id: string;
  onBytes(chunk: Buffer): void;
  // Optional: the WS handler (6G) uses this to emit `session_ended` + close
  // 1000 when the supervisor exits or the registry shuts down. Tests that
  // only care about byte fan-out may omit it.
  onSessionEnd?(info: SessionEndInfo): void;
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

// Per D-17 the 'persona_not_found' code is removed (no persona on the spawn
// path). 'session_not_found' remains for the project-resolution failure 6F maps.
export type SessionCreateErrorCode = 'session_not_found';

export class SessionCreateError extends Error {
  readonly code: SessionCreateErrorCode;
  constructor(code: SessionCreateErrorCode, message: string) {
    super(message);
    this.name = 'SessionCreateError';
    this.code = code;
  }
}
