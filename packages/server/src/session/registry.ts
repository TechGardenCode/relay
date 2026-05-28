import {
  MigrationError,
  openDatabase,
  runMigrations,
  sessions,
  tenants,
  type SessionRow,
} from '../store/index.js';
import { createSupervisor, type PtySupervisor } from '../pty/index.js';
import { createWriter, transcriptPath, type TranscriptWriter } from '../transcript/index.js';

import { bootOrphanSweep } from './boot.js';
import { captureAgentSessionId } from './agent-session-id.js';
import {
  createByteAccountant,
  type ByteAccountant,
  type SessionByteHandle,
} from './byte-accounting.js';
import { writeTransientDir } from './spawn.js';
import {
  SessionCreateError,
  type AttachedClient,
  type RegistryDeps,
  type SessionCreateInput,
  type SessionEndInfo,
  type SessionHandle,
  type SessionRegistry,
} from './types.js';

const DEFAULT_AGENT_CLI = 'claude';

// Per D-17: personas are descoped from MVP. Sessions spawn a bare agent, but
// the `sessions.persona_name` column + wire field are retained (sentinel-backed)
// so the store row, CLI, and IDE displays are unchanged for the Phase-2 re-enable.
// This value is server-stamped and NEVER user-supplied — SessionCreateInput has
// no personaName field, so there is no path to route a client value here.
const PERSONA_SENTINEL = 'agent';

interface InternalRecord {
  handle: SessionHandle;
  supervisor: PtySupervisor;
  writer: TranscriptWriter;
  attached: Set<AttachedClient>;
  byteHandle: SessionByteHandle;
  unsubBytes: () => void;
  unsubExit: () => void;
  // Mutated by kill() before the supervisor signal so the eventual onExit
  // listener doesn't clobber the explicit terminated_reason with 'agent_exit'.
  explicitlyKilled: boolean;
}

function cleanEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

export function createRegistry(deps: RegistryDeps): SessionRegistry {
  const { db } = deps;
  const homeOverride = deps.homeOverride;
  const agentCli = deps.agentCli ?? DEFAULT_AGENT_CLI;
  const env = deps.env ?? cleanEnv(process.env);
  const supervisorFactory = deps.supervisorFactory ?? createSupervisor;
  const writerFactory = deps.writerFactory ?? createWriter;
  const capture = deps.agentSessionIdCapture ?? captureAgentSessionId;
  const records = new Map<string, InternalRecord>();
  const byteAccountant: ByteAccountant = createByteAccountant({
    db,
    intervalMs: deps.byteFlushIntervalMs,
  });
  let shuttingDown = false;

  async function create(input: SessionCreateInput): Promise<SessionHandle> {
    // Per D-17: bare-agent spawn. No persona is resolved; the row carries the
    // server-stamped PERSONA_SENTINEL and the agent runs with an empty argv
    // (no --model / --append-system-prompt / --mcp-config / --disable-slash-commands).
    const insertNow = Date.now();
    const row = sessions.insert(
      db,
      {
        projectId: input.projectId,
        personaName: PERSONA_SENTINEL,
        agentCli,
      },
      insertNow,
    );
    const sid = row.id;

    const argv: string[] = [];
    writeTransientDir({
      sid,
      homeOverride,
      spawnRecord: {
        schemaVersion: 1,
        sessionId: sid,
        projectId: input.projectId,
        // Per D-17 the persona fields are omitted (optional in SpawnRecordSchema).
        argv: [agentCli, ...argv],
        envNames: Object.keys(env).sort(),
        cwd: input.canonicalProjectPath,
        agentCli,
        mcpJsonPath: null,
        spawnedAt: new Date(insertNow).toISOString(),
      },
    });

    let supervisor: PtySupervisor;
    let writer: TranscriptWriter;
    try {
      supervisor = supervisorFactory({
        command: agentCli,
        args: argv,
        cwd: input.canonicalProjectPath,
        env,
      });
      writer = writerFactory({ filePath: transcriptPath(sid, homeOverride) });
    } catch (err) {
      // Per D-11: 'server_restart' is reserved for the boot sweep. A failed
      // spawn writes 'operator_kill' so we never leave a `running` row
      // without a live supervisor.
      sessions.markKilled(db, sid, 'operator_kill', Date.now());
      throw err;
    }

    // Stamp the OS pid onto the row now that the supervisor has spawned the
    // child. Operators read this via `relay session show <id>` for ad-hoc
    // recovery when the supervisor itself is unreachable.
    sessions.updatePtyPid(db, sid, supervisor.pid, Date.now());

    const byteHandle = byteAccountant.track(sid);
    const attached = new Set<AttachedClient>();

    const unsubBytes = supervisor.onBytes((chunk: Buffer): void => {
      // The transcript writer is the persistence path; byte-accountant
      // batches the SQL UPDATE (per ND-13); the attached set is the D-G3
      // universal-output fan-out (every byte, every client, no claim check).
      writer.append(chunk);
      byteHandle.record(chunk.length);
      for (const client of attached) {
        try {
          client.onBytes(chunk);
        } catch {
          // A misbehaving client must not poison the fan-out — the next
          // subscriber still gets the byte. 6G is responsible for evicting
          // clients that throw.
        }
      }
    });

    const unsubExit = supervisor.onExit((info): void => {
      // Per Phase 0 surprise §2: do NOT touch the row during shutdown. The
      // next boot's D-11 sweep writes 'server_restart' as the authoritative
      // terminated_reason. Without this guard, the spike's listener stamped
      // 'agent_exit' before the server died, leaving zero `running` rows.
      if (shuttingDown) return;
      const rec = records.get(sid);
      const wasExplicitlyKilled = rec?.explicitlyKilled ?? false;
      // Per ws-protocol.md §2.3 + state machine §5.2: notify attached clients
      // BEFORE the async writer.close()/drain chain so the WS `session_ended`
      // frame and the close 1000 land as close to the actual exit as possible.
      // The handler reads the freshest row inside onSessionEnd, so the
      // 'operator_kill' write (which markKilled performed before the signal
      // for that path) is already visible.
      if (rec !== undefined) {
        const reason: 'agent_exit' | 'operator_kill' = wasExplicitlyKilled
          ? 'operator_kill'
          : 'agent_exit';
        const freshRow = sessions.findById(db, sid);
        const endInfo: SessionEndInfo = {
          reason,
          exitCode: info.exitCode,
          terminatedReason: freshRow?.terminatedReason ?? null,
        };
        for (const client of rec.attached) {
          try {
            client.onSessionEnd?.(endInfo);
          } catch {
            // A misbehaving handler must not block the cleanup chain.
          }
        }
      }
      records.delete(sid);
      // Per ND-13 §5: drain order on pty.onExit is writer.close() (await) →
      // handle.drain() → handle.release(). The fsync must land before the
      // SQL UPDATE so `sessions.total_bytes` equals `fstat(sidecar).size` at
      // the moment the row transitions. The supervisor's onExit listener
      // type is sync; we chain through Promises rather than awaiting.
      writer
        .close()
        .catch(() => {
          // Close errors are non-actionable at this layer — the supervisor
          // is already dead; the fd is gone either way. Still drain so we
          // don't leak the pending counter.
        })
        .then(() => {
          byteHandle.drain();
          byteHandle.release();
          if (!wasExplicitlyKilled) {
            sessions.markKilled(db, sid, 'agent_exit', Date.now());
          }
        })
        .catch(() => {
          // Defensive: a throw inside the drain/markKilled path is itself
          // non-actionable from this listener.
        });
    });

    // Per ND-11: fire-and-forget capture. The agent CLI may take seconds to
    // write its <uuid>.jsonl; we don't block create() on it. On success the
    // UPDATE lands silently; on timeout (or any error) the column stays NULL
    // and the WS hello frame omits the field per ws-protocol.md §2.3.
    void capture({
      canonicalProjectPath: input.canonicalProjectPath,
      homeOverride,
    })
      .then((agentId) => {
        if (agentId === null) return;
        if (!records.has(sid)) return;
        sessions.updateAgentSessionId(db, sid, agentId, Date.now());
      })
      .catch(() => {
        // Per ND-11 §5: capture failure is non-fatal.
      });

    const handle: SessionHandle = {
      get id(): string {
        return sid;
      },
      get row(): SessionRow {
        const fresh = sessions.findById(db, sid);
        if (fresh === undefined) {
          throw new Error(`session/${sid}: row vanished after create`);
        }
        return fresh;
      },
      get pid(): number {
        return supervisor.pid;
      },
      get bytesEmitted(): number {
        return supervisor.bytesEmitted;
      },
      write(data: Buffer | string): void {
        supervisor.write(data);
      },
      resize(cols: number, rows: number): void {
        supervisor.resize(cols, rows);
      },
      snapshot(): Buffer {
        return supervisor.snapshot();
      },
    };

    records.set(sid, {
      handle,
      supervisor,
      writer,
      attached,
      byteHandle,
      unsubBytes,
      unsubExit,
      explicitlyKilled: false,
    });
    return handle;
  }

  function get(sid: string): SessionHandle | undefined {
    return records.get(sid)?.handle;
  }

  function attach(sid: string, client: AttachedClient): { unsubscribe: () => void } {
    const rec = records.get(sid);
    if (rec === undefined) {
      throw new SessionCreateError('session_not_found', `session '${sid}' not found`);
    }
    rec.attached.add(client);
    return {
      unsubscribe(): void {
        rec.attached.delete(client);
      },
    };
  }

  function kill(sid: string, reason: 'operator_kill'): { killed: boolean } {
    const rec = records.get(sid);
    if (rec === undefined) return { killed: false };
    // Mark explicitly killed BEFORE the supervisor signal so the eventual
    // onExit listener skips the 'agent_exit' write.
    rec.explicitlyKilled = true;
    sessions.markKilled(db, sid, reason, Date.now());
    rec.supervisor.kill();
    return { killed: true };
  }

  async function shutdown(): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    // Stop the shared timer first; the per-session drain below covers
    // anything pending. Order matters — if a flush fires after stop() but
    // before drain(), the same delta would be counted twice.
    byteAccountant.stop();
    const cleanups: Promise<void>[] = [];
    for (const [, rec] of records) {
      // The onExit listener early-returns because shuttingDown is true, so
      // we own the cleanup explicitly here. Per Phase 0 §2 fix: nothing in
      // this path writes a terminated_reason; the next boot's sweep does.
      // Per ND-13 §5: close(await) → drain → release so the SQL UPDATE
      // reflects the on-disk sidecar size, not the still-buffered count.
      // Per ws-protocol.md §2.3: server-initiated shutdown emits
      // `session_ended { reason: server_shutdown }` to every attached client
      // before the supervisor is signalled, so each client surfaces the
      // shutdown rather than seeing a bare TCP close.
      const endInfo: SessionEndInfo = {
        reason: 'server_shutdown',
        exitCode: null,
        terminatedReason: null,
      };
      for (const client of rec.attached) {
        try {
          client.onSessionEnd?.(endInfo);
        } catch {
          // Defensive: a throwing handler must not block the cleanup chain.
        }
      }
      rec.supervisor.kill();
      rec.attached.clear();
      rec.unsubBytes();
      rec.unsubExit();
      const byteHandle = rec.byteHandle;
      cleanups.push(
        rec.writer
          .close()
          .catch(() => {
            // See onExit close handler — non-actionable.
          })
          .then(() => {
            byteHandle.drain();
            byteHandle.release();
          }),
      );
    }
    records.clear();
    await Promise.all(cleanups);
  }

  return {
    create,
    get,
    attach,
    kill,
    shutdown,
    get shuttingDown(): boolean {
      return shuttingDown;
    },
  };
}

export interface InitServerOptions extends RegistryDeps {
  // Absolute path to the SQL migrations dir
  // (typically packages/server/src/store/migrations/ in dev,
  // ${__dirname}/migrations in dist).
  migrationsDir: string;
}

export interface InitServerResult {
  registry: SessionRegistry;
  shutdown: () => Promise<void>;
}

// 6F's server entrypoint calls this once at boot. The boot sweep runs
// synchronously before the registry exists, so no create() call can race
// against it.
export async function initServer(opts: InitServerOptions): Promise<InitServerResult> {
  runMigrations(opts.db, opts.migrationsDir);
  tenants.ensureSingleton(opts.db, Date.now());
  const { affected } = bootOrphanSweep(opts.db);
  if (affected > 0) {
    process.stdout.write(`[relay] D-11 boot sweep: ${affected} orphan(s) marked killed\n`);
  }
  const registry = createRegistry(opts);
  return { registry, shutdown: () => registry.shutdown() };
}

// Re-export for callers that don't want to do their own MigrationError /
// openDatabase imports just to compose initServer.
export { MigrationError, openDatabase };
