/**
 * Coverage map — packages/server/src/session/CLAUDE.md constraints:
 *   Owns:
 *     - Session lifecycle: insert row → write transient dir → spawn supervisor
 *       → open transcript writer → fan bytes out to attached clients         → describe("create — happy path") > it("...")
 *   Surprising constraints:
 *     - pty.onExit listeners early-return when registry.shuttingDown=true
 *       (Phase 0 surprise §2)                                                → describe("shutdown discipline (Phase 0 §2)") > it("shutdown then onExit leaves row 'running'")
 *     - kill('operator_kill') mutates explicitlyKilled BEFORE the signal,
 *       so onExit skips its own 'agent_exit' write                            → describe("kill discipline") > it("kill then onExit does not overwrite operator_kill")
 *     - PTY bytes fan out to every attached client regardless of claim state
 *       (D-G3)                                                                → describe("D-G3 universal output") > it("...all attached clients") + it("late attach sees post-attach only") + it("misbehaving client does not poison fan-out")
 *     - agentSessionId capture is fire-and-forget and non-fatal (ND-11)       → describe("agent-session-id capture (ND-11)") > it("resolves to UUID → column populated") + it("resolves to null → column stays NULL")
 *     - Persona resolved BEFORE row inserted; persona_not_found leaves
 *       no orphan running row                                                 → describe("create — error paths") > it("persona_not_found throws without inserting a row")
 *     - Spawn failure after insert → row marked 'operator_kill'               → describe("create — error paths") > it("supervisor factory throws → row marked operator_kill")
 *   Does NOT own (deferred to composition):
 *     - The HTTP/REST surface (→ server/rest/, 6F)                           → enforced at e2e layer; 6F maps SessionCreateError codes to status
 *     - WS claim-lock state machine (→ server/ws/, 6G)                       → enforced at e2e layer; 6G layers CLAIM/SEND/RELEASE on top of attach()
 */

import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { sessionWorkDir } from '../config/paths.js';
import {
  openDatabase,
  projects,
  runMigrations,
  sessions,
  SINGLETON_TENANT_ID,
  tenants,
  type Database,
  type SessionRow,
} from '../store/index.js';
import type { CreateWriterArgs, TranscriptWriter } from '../transcript/index.js';

import { createRegistry } from './registry.js';
import {
  createFakeSupervisor,
  minimalPersonaYaml,
  tick,
  writePersonaFixture,
  type FakeSupervisor,
} from './test-fakes.js';
import {
  SessionCreateError,
  type AgentSessionIdCapture,
  type AttachedClient,
  type RegistryDeps,
  type SessionEndInfo,
  type SupervisorFactory,
  type WriterFactory,
} from './types.js';

const MIGRATIONS_DIR = resolve(import.meta.dirname, '../store/migrations');
const CANONICAL = '/home/dev/demo';

interface FakeWriter extends TranscriptWriter {
  readonly chunks: Buffer[];
  readonly closed: boolean;
  readonly closeCount: number;
}

function createFakeWriter(args: CreateWriterArgs): FakeWriter {
  const chunks: Buffer[] = [];
  let bytesWritten = 0;
  let closed = false;
  let closeCount = 0;
  void args;
  return {
    append(chunk: Buffer): void {
      chunks.push(chunk);
      bytesWritten += chunk.length;
    },
    get bytesWritten(): number {
      return bytesWritten;
    },
    async close(): Promise<void> {
      closed = true;
      closeCount += 1;
    },
    get chunks(): Buffer[] {
      return chunks;
    },
    get closed(): boolean {
      return closed;
    },
    get closeCount(): number {
      return closeCount;
    },
  };
}

interface Harness {
  db: Database;
  projectId: string;
  homeOverride: string;
  lastSupervisor: FakeSupervisor | undefined;
  lastWriter: FakeWriter | undefined;
  supervisorFactoryCalls: number;
  writerFactoryCalls: number;
  captureCalls: number;
  resolveCapture: (id: string | null) => void;
}

interface DepsOverrides {
  supervisorFactory?: SupervisorFactory;
  agentSessionIdCapture?: AgentSessionIdCapture;
  writerFactory?: WriterFactory;
}

function freshHarness(): Harness {
  const homeOverride = mkdtempSync(join(tmpdir(), 'relay-registry-test-'));
  const db = openDatabase({ filename: ':memory:' });
  runMigrations(db, MIGRATIONS_DIR);
  tenants.ensureSingleton(db, 1);
  const project = projects.insert(
    db,
    {
      tenantId: SINGLETON_TENANT_ID,
      slug: 'demo',
      displayName: 'Demo',
      canonicalPath: CANONICAL,
    },
    1,
  );
  return {
    db,
    projectId: project.id,
    homeOverride,
    lastSupervisor: undefined,
    lastWriter: undefined,
    supervisorFactoryCalls: 0,
    writerFactoryCalls: 0,
    captureCalls: 0,
    // Replaced below in buildDeps when callers want to control the capture.
    resolveCapture: () => undefined,
  };
}

function buildDeps(h: Harness, overrides: DepsOverrides = {}): RegistryDeps {
  const supervisorFactory: SupervisorFactory =
    overrides.supervisorFactory ??
    ((args) => {
      h.supervisorFactoryCalls += 1;
      const sup = createFakeSupervisor(args);
      h.lastSupervisor = sup;
      return sup;
    });

  const writerFactory: WriterFactory =
    overrides.writerFactory ??
    ((args) => {
      h.writerFactoryCalls += 1;
      const w = createFakeWriter(args);
      h.lastWriter = w;
      return w;
    });

  // Default capture: pending promise the test never resolves (so it doesn't
  // race the assertion path). Tests that need the resolved branch pass their
  // own capture function via overrides.
  const defaultCapture: AgentSessionIdCapture = () =>
    new Promise<string | null>((resolve_) => {
      h.resolveCapture = resolve_;
    });

  return {
    db: h.db,
    homeOverride: h.homeOverride,
    agentCli: 'fake-claude',
    env: { FOO: 'fooval', BAR: 'barval' },
    byteFlushIntervalMs: 100_000,
    supervisorFactory,
    writerFactory,
    agentSessionIdCapture: overrides.agentSessionIdCapture ?? defaultCapture,
  };
}

function seedPersona(h: Harness, name = 'tester'): void {
  writePersonaFixture(h.homeOverride, name, minimalPersonaYaml(name));
}

function fakeClient(id: string): AttachedClient & {
  received: Buffer[];
  ended: SessionEndInfo[];
} {
  const received: Buffer[] = [];
  const ended: SessionEndInfo[] = [];
  return {
    id,
    onBytes(chunk: Buffer): void {
      received.push(chunk);
    },
    onSessionEnd(info: SessionEndInfo): void {
      ended.push(info);
    },
    received,
    ended,
  };
}

let h: Harness;

beforeEach(() => {
  h = freshHarness();
});

afterEach(() => {
  rmSync(h.homeOverride, { recursive: true, force: true });
});

describe('createRegistry — create happy path', () => {
  it('inserts a running row, writes spawn.json, calls supervisor with persona argv', async () => {
    seedPersona(h);
    const reg = createRegistry(buildDeps(h));
    const handle = await reg.create({
      projectId: h.projectId,
      personaName: 'tester',
      canonicalProjectPath: CANONICAL,
    });

    expect(handle.row.status).toBe('running');
    expect(handle.row.terminatedReason).toBeNull();
    expect(handle.row.totalBytes).toBe(0);

    // spawn.json materialized under the homeOverride.
    const spawnJsonPath = join(sessionWorkDir(handle.id, h.homeOverride), 'spawn.json');
    expect(statSync(spawnJsonPath).isFile()).toBe(true);

    // Supervisor factory was called with the persona-derived argv
    // (--append-system-prompt 'be terse' from the minimal fixture).
    expect(h.supervisorFactoryCalls).toBe(1);
    expect(h.lastSupervisor?.spawnArgs.command).toBe('fake-claude');
    expect(h.lastSupervisor?.spawnArgs.args).toEqual(['--append-system-prompt', 'be terse']);
    expect(h.lastSupervisor?.spawnArgs.cwd).toBe(CANONICAL);
    await reg.shutdown();
  });
});

describe('createRegistry — shutdown discipline (Phase 0 §2)', () => {
  it('shutdown then onExit leaves the row as running (boot sweep owns the flip)', async () => {
    seedPersona(h);
    const reg = createRegistry(buildDeps(h));
    const handle = await reg.create({
      projectId: h.projectId,
      personaName: 'tester',
      canonicalProjectPath: CANONICAL,
    });
    const sup = h.lastSupervisor as FakeSupervisor;

    await reg.shutdown();

    // Per session/CLAUDE.md "Surprising constraints" §2: pty.onExit listeners
    // early-return when registry.shuttingDown=true. The next boot's D-11
    // sweep flips the row to killed/server_restart. Nothing in shutdown
    // path writes terminated_reason.
    sup.emitExit({ exitCode: 0, signal: null });

    const row = sessions.findById(h.db, handle.id) as SessionRow;
    expect(row.status).toBe('running');
    expect(row.terminatedReason).toBeNull();
  });

  it('shuttingDown getter flips false → true', async () => {
    seedPersona(h);
    const reg = createRegistry(buildDeps(h));
    expect(reg.shuttingDown).toBe(false);
    await reg.shutdown();
    expect(reg.shuttingDown).toBe(true);
  });
});

describe('createRegistry — D-G3 universal output', () => {
  it('every attached client receives the same byte slice', async () => {
    seedPersona(h);
    const reg = createRegistry(buildDeps(h));
    const handle = await reg.create({
      projectId: h.projectId,
      personaName: 'tester',
      canonicalProjectPath: CANONICAL,
    });
    const sup = h.lastSupervisor as FakeSupervisor;

    const a = fakeClient('a');
    const b = fakeClient('b');
    reg.attach(handle.id, a);
    reg.attach(handle.id, b);

    sup.emitBytes(Buffer.from('hello'));
    // Per D-G3: every byte goes to every attached client regardless of
    // claim state. Claim arbitration lives in 6G's WS handler.
    expect(a.received.map((c) => c.toString())).toEqual(['hello']);
    expect(b.received.map((c) => c.toString())).toEqual(['hello']);
    await reg.shutdown();
  });

  it('late-attached client only sees post-attach bytes (no replay; 6G owns replay)', async () => {
    seedPersona(h);
    const reg = createRegistry(buildDeps(h));
    const handle = await reg.create({
      projectId: h.projectId,
      personaName: 'tester',
      canonicalProjectPath: CANONICAL,
    });
    const sup = h.lastSupervisor as FakeSupervisor;

    const early = fakeClient('early');
    reg.attach(handle.id, early);

    sup.emitBytes(Buffer.from('pre'));

    const late = fakeClient('late');
    reg.attach(handle.id, late);

    sup.emitBytes(Buffer.from('post'));

    expect(early.received.map((c) => c.toString())).toEqual(['pre', 'post']);
    // Per D-G3 §2: on-attach replay is the ring-buffer responsibility, which
    // is 6G's WS-layer concern. The session/ attached-set itself never replays.
    expect(late.received.map((c) => c.toString())).toEqual(['post']);
    await reg.shutdown();
  });

  it('detached client stops receiving subsequent bytes', async () => {
    seedPersona(h);
    const reg = createRegistry(buildDeps(h));
    const handle = await reg.create({
      projectId: h.projectId,
      personaName: 'tester',
      canonicalProjectPath: CANONICAL,
    });
    const sup = h.lastSupervisor as FakeSupervisor;

    const a = fakeClient('a');
    const b = fakeClient('b');
    reg.attach(handle.id, a);
    const sub = reg.attach(handle.id, b);

    sup.emitBytes(Buffer.from('one'));
    sub.unsubscribe();
    sup.emitBytes(Buffer.from('two'));

    expect(a.received.map((c) => c.toString())).toEqual(['one', 'two']);
    expect(b.received.map((c) => c.toString())).toEqual(['one']);
    await reg.shutdown();
  });

  it('a client whose onBytes throws does NOT poison the fan-out', async () => {
    seedPersona(h);
    const reg = createRegistry(buildDeps(h));
    const handle = await reg.create({
      projectId: h.projectId,
      personaName: 'tester',
      canonicalProjectPath: CANONICAL,
    });
    const sup = h.lastSupervisor as FakeSupervisor;

    const broken: AttachedClient = {
      id: 'broken',
      onBytes(): void {
        throw new Error('boom');
      },
    };
    const good = fakeClient('good');

    reg.attach(handle.id, broken);
    reg.attach(handle.id, good);

    sup.emitBytes(Buffer.from('xy'));

    // Per registry.ts comment + D-G3: a misbehaving client must not block
    // the next subscriber. 6G evicts the bad client; session/ keeps going.
    expect(good.received.map((c) => c.toString())).toEqual(['xy']);
    await reg.shutdown();
  });
});

describe('createRegistry — create error paths', () => {
  it('persona_not_found throws SessionCreateError and inserts NO session row', async () => {
    // No persona seeded.
    const reg = createRegistry(buildDeps(h));
    await expect(
      reg.create({
        projectId: h.projectId,
        personaName: 'missing',
        canonicalProjectPath: CANONICAL,
      }),
    ).rejects.toMatchObject({
      name: 'SessionCreateError',
      code: 'persona_not_found',
    });

    // Per session/CLAUDE.md "Surprising constraints" §8: persona resolved
    // BEFORE insert — a not-found throw never leaves an orphan running row.
    expect(sessions.listByProject(h.db, h.projectId)).toEqual([]);
    await reg.shutdown();
  });

  it('supervisor factory throws → row marked operator_kill, error propagates', async () => {
    seedPersona(h);
    const failingFactory: SupervisorFactory = () => {
      throw new Error('spawn failed');
    };
    const reg = createRegistry(buildDeps(h, { supervisorFactory: failingFactory }));

    await expect(
      reg.create({
        projectId: h.projectId,
        personaName: 'tester',
        canonicalProjectPath: CANONICAL,
      }),
    ).rejects.toThrow(/spawn failed/);

    // Per registry.ts comment + session/CLAUDE.md "Surprising constraints" §8:
    // a failed spawn after insert marks the row 'operator_kill' — never
    // 'server_restart' (that's reserved for the boot sweep per D-11).
    const rows = sessions.listByProject(h.db, h.projectId);
    expect(rows).toHaveLength(1);
    const only = rows[0] as SessionRow;
    expect(only.status).toBe('killed');
    expect(only.terminatedReason).toBe('operator_kill');
    await reg.shutdown();
  });
});

describe('createRegistry — natural exit / kill discipline', () => {
  it('natural onExit marks killed/agent_exit; subsequent get returns undefined', async () => {
    seedPersona(h);
    const reg = createRegistry(buildDeps(h));
    const handle = await reg.create({
      projectId: h.projectId,
      personaName: 'tester',
      canonicalProjectPath: CANONICAL,
    });
    const sup = h.lastSupervisor as FakeSupervisor;

    sup.emitExit({ exitCode: 0, signal: null });
    // Per ND-13 §5: registry chains writer.close() → drain() → markKilled()
    // behind a Promise so fsync precedes the SQL UPDATE. Advance one
    // macrotask to let the chain settle before reading the row.
    await tick();

    const row = sessions.findById(h.db, handle.id) as SessionRow;
    expect(row.status).toBe('killed');
    expect(row.terminatedReason).toBe('agent_exit');
    expect(reg.get(handle.id)).toBeUndefined();
    await reg.shutdown();
  });

  it('kill then onExit does not overwrite operator_kill with agent_exit', async () => {
    seedPersona(h);
    const reg = createRegistry(buildDeps(h));
    const handle = await reg.create({
      projectId: h.projectId,
      personaName: 'tester',
      canonicalProjectPath: CANONICAL,
    });
    const sup = h.lastSupervisor as FakeSupervisor;

    const result = reg.kill(handle.id, 'operator_kill');
    expect(result.killed).toBe(true);

    // Per session/CLAUDE.md "Surprising constraints" §3: kill mutates
    // explicitlyKilled BEFORE signalling the supervisor so the eventual
    // onExit listener skips its 'agent_exit' write.
    sup.emitExit({ exitCode: 0, signal: null });

    const row = sessions.findById(h.db, handle.id) as SessionRow;
    expect(row.terminatedReason).toBe('operator_kill');
    await reg.shutdown();
  });

  it('kill on an unknown sid returns { killed: false } without throwing', async () => {
    seedPersona(h);
    const reg = createRegistry(buildDeps(h));
    expect(reg.kill('does-not-exist', 'operator_kill')).toEqual({ killed: false });
    await reg.shutdown();
  });

  it('attach on an unknown sid throws SessionCreateError(session_not_found)', async () => {
    seedPersona(h);
    const reg = createRegistry(buildDeps(h));
    expect(() => reg.attach('does-not-exist', fakeClient('x'))).toThrow(SessionCreateError);
    try {
      reg.attach('does-not-exist', fakeClient('x'));
    } catch (err) {
      expect((err as SessionCreateError).code).toBe('session_not_found');
    }
    await reg.shutdown();
  });
});

describe('createRegistry — agent-session-id capture (ND-11)', () => {
  it('capture resolves to a UUID → sessions.agent_session_id is updated', async () => {
    seedPersona(h);
    const known = '11111111-2222-4333-8444-555555555555';
    const captureResolved: AgentSessionIdCapture = () => Promise.resolve(known);
    const reg = createRegistry(buildDeps(h, { agentSessionIdCapture: captureResolved }));

    const handle = await reg.create({
      projectId: h.projectId,
      personaName: 'tester',
      canonicalProjectPath: CANONICAL,
    });

    // The capture promise resolves asynchronously after create() returns.
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    const row = sessions.findById(h.db, handle.id) as SessionRow;
    // Per ND-11 §2: the UUID stem is written via updateAgentSessionId.
    expect(row.agentSessionId).toBe(known);
    await reg.shutdown();
  });

  it('capture resolves to null → agent_session_id stays NULL (non-fatal per ND-11 §5)', async () => {
    seedPersona(h);
    const captureNull: AgentSessionIdCapture = () => Promise.resolve(null);
    const reg = createRegistry(buildDeps(h, { agentSessionIdCapture: captureNull }));

    const handle = await reg.create({
      projectId: h.projectId,
      personaName: 'tester',
      canonicalProjectPath: CANONICAL,
    });

    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    const row = sessions.findById(h.db, handle.id) as SessionRow;
    // Per ND-11 §5: NULL on the column is a valid terminal state; the WS
    // hello frame omits the field per ws-protocol.md §2.3.
    expect(row.agentSessionId).toBeNull();
    await reg.shutdown();
  });
});

describe('createRegistry — onSessionEnd notifications (ws-protocol.md §2.3)', () => {
  it('natural exit fires onSessionEnd with reason=agent_exit and the exitCode', async () => {
    seedPersona(h);
    const reg = createRegistry(buildDeps(h));
    const handle = await reg.create({
      projectId: h.projectId,
      personaName: 'tester',
      canonicalProjectPath: CANONICAL,
    });
    const sup = h.lastSupervisor as FakeSupervisor;

    const client = fakeClient('a');
    reg.attach(handle.id, client);

    sup.emitExit({ exitCode: 7, signal: null });
    await tick();

    expect(client.ended).toHaveLength(1);
    expect(client.ended[0]).toMatchObject({ reason: 'agent_exit', exitCode: 7 });
    await reg.shutdown();
  });

  it('operator kill fires onSessionEnd with reason=operator_kill and terminatedReason mirrored from the row', async () => {
    seedPersona(h);
    const reg = createRegistry(buildDeps(h));
    const handle = await reg.create({
      projectId: h.projectId,
      personaName: 'tester',
      canonicalProjectPath: CANONICAL,
    });
    const sup = h.lastSupervisor as FakeSupervisor;

    const client = fakeClient('a');
    reg.attach(handle.id, client);

    reg.kill(handle.id, 'operator_kill');
    sup.emitExit({ exitCode: 0, signal: null });
    await tick();

    expect(client.ended).toHaveLength(1);
    expect(client.ended[0]?.reason).toBe('operator_kill');
    expect(client.ended[0]?.terminatedReason).toBe('operator_kill');
    await reg.shutdown();
  });

  it('shutdown fires onSessionEnd with reason=server_shutdown (Phase 0 §2 — boot sweep owns the row flip)', async () => {
    seedPersona(h);
    const reg = createRegistry(buildDeps(h));
    const handle = await reg.create({
      projectId: h.projectId,
      personaName: 'tester',
      canonicalProjectPath: CANONICAL,
    });

    const client = fakeClient('a');
    reg.attach(handle.id, client);

    await reg.shutdown();

    expect(client.ended).toHaveLength(1);
    expect(client.ended[0]?.reason).toBe('server_shutdown');
    // Per Phase 0 §2 + D-11: shutdown does not write terminated_reason; the
    // row stays 'running' until the next boot's sweep flips it.
    expect(client.ended[0]?.terminatedReason).toBeNull();
  });
});

describe('createRegistry — byte accounting integration (ND-13)', () => {
  it('shutdown drains pending byte deltas before returning', async () => {
    seedPersona(h);
    const reg = createRegistry(buildDeps(h));
    const handle = await reg.create({
      projectId: h.projectId,
      personaName: 'tester',
      canonicalProjectPath: CANONICAL,
    });
    const sup = h.lastSupervisor as FakeSupervisor;

    sup.emitBytes(Buffer.from('hello'));
    sup.emitBytes(Buffer.from(' world'));

    // Pre-shutdown: the byte-accountant's batched flush hasn't fired yet
    // (interval is 100_000 ms in the test deps), so total_bytes is still 0.
    expect((sessions.findById(h.db, handle.id) as SessionRow).totalBytes).toBe(0);

    // Per ND-13 + session/CLAUDE.md "Owns": shutdown synchronously drains
    // the byte-accountant. byteAccountant.stop() runs before per-session
    // drain so any pending delta is counted exactly once.
    await reg.shutdown();

    const row = sessions.findById(h.db, handle.id) as SessionRow;
    expect(row.totalBytes).toBe('hello world'.length);
  });
});
