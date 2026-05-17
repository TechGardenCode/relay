// Per ND-03: 32 KB global default for the on-attach ring buffer. Operators
// override via `~/.relay/config.yaml` key `replayBufferBytes`; `session/` (6E)
// resolves the value and passes it as `ringBufferBytes` on the spawn args.
export const DEFAULT_RING_BUFFER_BYTES = 32 * 1024;

export interface SpawnArgs {
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  cols?: number;
  rows?: number;
  ringBufferBytes?: number;
  name?: string;
}

export interface ExitInfo {
  exitCode: number | null;
  signal: number | null;
}

export type Unsubscribe = () => void;

export interface PtySupervisor {
  readonly pid: number;
  /**
   * Subscribe to PTY byte events. Per D-G3 universal output, the supervisor
   * fans the same byte slice out to every subscriber regardless of the WS
   * claim-lock state — that state lives in `server/ws/`, not here.
   */
  onBytes(listener: (chunk: Buffer) => void): Unsubscribe;
  onExit(listener: (info: ExitInfo) => void): Unsubscribe;
  write(data: Buffer | string): void;
  resize(cols: number, rows: number): void;
  /** Best-effort SIGHUP-by-default kill. `onExit` is the source of truth. */
  kill(signal?: string): void;
  /**
   * Fresh copy of the ring buffer contents in chronological order. Safe to
   * mutate or hand to a subscriber.
   */
  snapshot(): Buffer;
  /**
   * Running count of bytes emitted by the PTY since spawn. `session/` (6E)
   * uses this to advance `sessions.total_bytes` (sqlite-schema.md §2).
   */
  readonly bytesEmitted: number;
}
