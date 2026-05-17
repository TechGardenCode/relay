export type SessionStatus = 'running' | 'killed';

export type TerminatedReason = 'server_restart' | 'agent_exit' | 'operator_kill';

export interface SessionRecord {
  id: string;
  status: SessionStatus;
  spawnCommand: string;
  spawnArgs: string[];
  startedAt: string;
  endedAt?: string;
  terminatedReason?: TerminatedReason;
}

export interface SpikeConfig {
  host: string;
  port: number;
  bearerToken: string;
  spawnCommand: string;
  spawnArgs: string[];
  stateDir: string;
  replayBufferBytes: number;
}

export interface HelloFrame {
  type: 'hello';
  sessionId: string;
  status: SessionStatus;
  replayBufferBytes: number;
}

export interface SendFrame {
  type: 'send';
  data: string;
}

export interface ResizeFrame {
  type: 'resize';
  cols: number;
  rows: number;
}

export interface SessionEndedFrame {
  type: 'session_ended';
  reason: TerminatedReason;
}

export interface ErrorFrame {
  type: 'error';
  code: string;
  message: string;
}

export type ClientFrame = SendFrame | ResizeFrame;
export type ServerControlFrame = HelloFrame | SessionEndedFrame | ErrorFrame;
