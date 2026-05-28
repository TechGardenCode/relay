// Shared fakes for session/ unit tests. Not a *.test.ts file so the tree-shaker
// can drop it from production builds (tsup `external` + `noEmit` on tests).
//
// Per session/CLAUDE.md "Test isolation": session/ unit tests inject a fake
// PtySupervisor via RegistryDeps.supervisorFactory instead of spawning real
// node-pty. The fake matches the pty/types.ts interface byte-for-byte and
// exposes controllable emitBytes/emitExit hooks plus visibility into the
// listener Sets so attach/detach race assertions can introspect.

import type { ExitInfo, PtySupervisor, SpawnArgs, Unsubscribe } from '../pty/index.js';

export interface FakeSupervisor extends PtySupervisor {
  // Test seam: drive a byte event as if the PTY had emitted bytes.
  emitBytes(chunk: Buffer): void;
  // Test seam: drive an exit event. The fake supervisor records that exit
  // was called but does not auto-kill listeners — registry.shutdown() owns
  // the unsubscribe sweep.
  emitExit(info?: ExitInfo): void;
  // Introspection seams.
  readonly byteListeners: Set<(chunk: Buffer) => void>;
  readonly exitListeners: Set<(info: ExitInfo) => void>;
  readonly killed: boolean;
  readonly killSignals: string[];
  readonly writes: Array<Buffer | string>;
  readonly resizes: Array<{ cols: number; rows: number }>;
  readonly spawnArgs: SpawnArgs;
}

let nextFakePid = 10_000;

export function createFakeSupervisor(args: SpawnArgs): FakeSupervisor {
  const byteListeners = new Set<(chunk: Buffer) => void>();
  const exitListeners = new Set<(info: ExitInfo) => void>();
  const writes: Array<Buffer | string> = [];
  const resizes: Array<{ cols: number; rows: number }> = [];
  const killSignals: string[] = [];
  const ringChunks: Buffer[] = [];
  const pid = nextFakePid++;
  let bytesEmitted = 0;
  let killed = false;

  const supervisor: FakeSupervisor = {
    get pid(): number {
      return pid;
    },
    get bytesEmitted(): number {
      return bytesEmitted;
    },
    get killed(): boolean {
      return killed;
    },
    get killSignals(): string[] {
      return killSignals;
    },
    get writes(): Array<Buffer | string> {
      return writes;
    },
    get resizes(): Array<{ cols: number; rows: number }> {
      return resizes;
    },
    get byteListeners(): Set<(chunk: Buffer) => void> {
      return byteListeners;
    },
    get exitListeners(): Set<(info: ExitInfo) => void> {
      return exitListeners;
    },
    get spawnArgs(): SpawnArgs {
      return args;
    },
    onBytes(listener: (chunk: Buffer) => void): Unsubscribe {
      byteListeners.add(listener);
      return () => byteListeners.delete(listener);
    },
    onExit(listener: (info: ExitInfo) => void): Unsubscribe {
      exitListeners.add(listener);
      return () => exitListeners.delete(listener);
    },
    write(data: Buffer | string): void {
      writes.push(data);
    },
    resize(cols: number, rows: number): void {
      resizes.push({ cols, rows });
    },
    kill(signal?: string): void {
      killed = true;
      killSignals.push(signal ?? 'SIGHUP');
    },
    snapshot(): Buffer {
      return Buffer.concat(ringChunks);
    },
    emitBytes(chunk: Buffer): void {
      bytesEmitted += chunk.length;
      ringChunks.push(chunk);
      // Per pty/CLAUDE.md "Universal output": every subscriber sees every byte.
      // Iterate a snapshot of the Set so a listener that unsubscribes during
      // dispatch does not skip the rest of the iteration.
      const snapshot = Array.from(byteListeners);
      for (const l of snapshot) l(chunk);
    },
    emitExit(info: ExitInfo = { exitCode: 0, signal: null }): void {
      const snapshot = Array.from(exitListeners);
      for (const l of snapshot) l(info);
    },
  };
  return supervisor;
}

// Per D-17: writePersonaFixture()/minimalPersonaYaml() were removed — they
// seeded a persona YAML so registry.create() could resolve it, but create() no
// longer takes a persona (bare-agent spawn). Restore from git history for the
// Phase-2 persona re-enable.

// Per ND-13 §5: registry.ts chains writer.close() → drain() → markKilled() as
// Promises behind pty.onExit so the fsync precedes the SQL UPDATE. Tests that
// emitExit synchronously then read the row must advance the event loop one
// macrotask to let the chain settle. `await tick()` is sufficient.
export function tick(): Promise<void> {
  return new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
}
