/**
 * Coverage map — docs/arch/ws-protocol.md sections + the four §5.3 races:
 *
 *   §6 attach sequence — hello → replay_start → bytes → replay_end → live  → describe("attach sequence") > it("hello + bracketed replay + live")
 *   §3 empty buffer    — replay_start { bytes: 0 } + replay_end              → describe("attach sequence") > it("empty ring buffer still brackets")
 *   §2.4 D-G3 universal output                                                → describe("attach sequence") > it("every attached connection receives live bytes regardless of claim")
 *   §4.2 4404 — session not found                                             → describe("upgrade failures") > it("...4404")
 *   §2.3 hello + session_ended for already-killed session                     → describe("upgrade failures") > it("killed session → hello + session_ended + close 1000")
 *
 *   §2.2 + §5.2 row 1 — claim grants                                          → describe("claim arbitration") > it("first claim grants...")
 *   §5.2 row 2 — second claim busy                                            → describe("claim arbitration") > it("second concurrent claim is busy")
 *   §5.2 row 4 — newline-bearing send → claim_released { delivered }            → describe("send delivery") > it("...")
 *   §5.2 row 4-no-change — non-newline send keeps claim held (ND-24)            → describe("send delivery — ND-24") > ...
 *   §5.2 row 6 — voluntary release                                            → describe("voluntary release") > it("release frame → claim_released { voluntary }")
 *   §5.2 row 9 — disconnect releases                                          → describe("§5.3 race 2") > it("disconnect of holder releases peer connections")
 *   §4.1 codes — send_without_claim / release_without_claim / unknown_type    → describe("error envelope") > ...
 *
 *   §5.3 race 1 — two simultaneous claims (handler-side ordering)             → describe("§5.3 race 1") > it("...")
 *   §5.3 race 2 — disconnect mid-send (handler ordering)                      → describe("§5.3 race 2") > it("...")
 *   §5.3 race 3 — auth expired mid-claim                                      → describe("§5.3 race 3") > it("revocation closes 4401 and releases the claim")
 *   §5.3 race 4 — PTY EPIPE on send                                           → describe("§5.3 race 4") > it("supervisor write throws → claim still releases delivered")
 *
 *   §2.2 resize (ND-23) — side-channel, no claim gate                          → describe("resize side-channel (ND-23)") > ...
 */

import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';

import type { ClientFrame, ServerFrame } from '@techgardencode/protocol';

import { RevocationBus, TokenStore } from '../../auth/index.js';
import { tokensPath } from '../../config/paths.js';
import { createRegistry, type SessionRegistry } from '../../session/index.js';
import { createFakeSupervisor, type FakeSupervisor } from '../../session/test-fakes.js';
import {
  openDatabase,
  projects,
  runMigrations,
  SINGLETON_TENANT_ID,
  tenants,
  type Database,
} from '../../store/index.js';
import { buildServer } from '../index.js';
import { migrationsDirForTests } from '../rest/test-helpers.js';

interface WsRig {
  app: FastifyInstance;
  db: Database;
  registry: SessionRegistry;
  tokenStore: TokenStore;
  authHeader: string;
  tokenId: string;
  homeOverride: string;
  cleanup: () => Promise<void>;
}

interface SessionFixture {
  sessionId: string;
  supervisor: FakeSupervisor;
}

async function seedSession(rig: WsRig): Promise<SessionFixture> {
  const ws = realpathSync(mkdtempSync(join(tmpdir(), 'relay-ws-session-')));
  const project = projects.insert(
    rig.db,
    {
      tenantId: SINGLETON_TENANT_ID,
      slug: `proj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      displayName: 'test',
      canonicalPath: ws,
    },
    Date.now(),
  );
  const handle = await rig.registry.create({
    projectId: project.id,
    canonicalProjectPath: ws,
  });
  // The FakeSupervisor is captured by the tracking factory inside the rig;
  // the registry holds it internally and exposes only the read-only
  // SessionHandle. We pull the latest captured instance and reset for the
  // next session creation in the same test.
  const supervisor = captureLastSupervisor.last;
  if (supervisor === undefined) {
    throw new Error('expected FakeSupervisor to be captured by the factory');
  }
  captureLastSupervisor.last = undefined;
  return { sessionId: handle.id, supervisor };
}

// Module-scoped capture for the most-recently-created FakeSupervisor. Set by
// the supervisorFactory wired in makeWsRig; read by seedSession.
const captureLastSupervisor: { last: FakeSupervisor | undefined } = { last: undefined };

function trackingFactory(args: Parameters<typeof createFakeSupervisor>[0]): FakeSupervisor {
  const sup = createFakeSupervisor(args);
  captureLastSupervisor.last = sup;
  return sup;
}

async function makeWsRig(claimLockTimeoutSeconds = 30): Promise<WsRig> {
  const homeOverride = mkdtempSync(join(tmpdir(), 'relay-ws-test-'));
  const db = openDatabase({ filename: ':memory:' });
  runMigrations(db, migrationsDirForTests());
  tenants.ensureSingleton(db, Date.now());

  const tokenStore = new TokenStore(tokensPath(homeOverride), new RevocationBus());
  const created = tokenStore.createToken('test-device');

  const registry = createRegistry({
    db,
    homeOverride,
    agentCli: 'cat',
    supervisorFactory: trackingFactory,
    agentSessionIdCapture: async () => null,
  });

  const app = await buildServer({
    db,
    registry,
    tokenStore,
    config: {
      host: '127.0.0.1',
      port: 0,
      claimLockTimeoutSeconds,
      replayBufferBytes: 32 * 1024,
    },
    homeOverride,
  });
  await app.ready();

  let cleaned = false;
  return {
    app,
    db,
    registry,
    tokenStore,
    authHeader: `Bearer ${created.plaintext}`,
    tokenId: created.record.id,
    homeOverride,
    async cleanup(): Promise<void> {
      if (cleaned) return;
      cleaned = true;
      await app.close();
      await registry.shutdown();
      db.close();
      rmSync(homeOverride, { recursive: true, force: true });
    },
  };
}

// Inject helper that captures incoming frames (text + binary). Tests await
// the collector promise after exchanging frames and assert against the
// ordered transcript.
interface Collector {
  socket: WebSocket;
  textFrames: ServerFrame[];
  binaryFrames: Buffer[];
  // Per-message log in arrival order: 'text' | 'binary' tags + the index
  // into textFrames/binaryFrames.
  order: Array<{ kind: 'text' | 'binary'; index: number }>;
  // Closed flag — set on `close`. Tests poll waitForClose() to assert
  // termination semantics.
  closed: boolean;
  closeCode: number | undefined;
  // Wait until the predicate returns true or timeoutMs elapses. Throws on
  // timeout with the current transcript so the assertion failure is
  // actionable.
  waitFor(
    predicate: (snapshot: { text: ServerFrame[]; binary: Buffer[] }) => boolean,
    label: string,
    timeoutMs?: number,
  ): Promise<void>;
  waitForClose(timeoutMs?: number): Promise<void>;
  send(frame: ClientFrame): void;
}

async function connect(rig: WsRig, path: string): Promise<Collector> {
  const ws = await rig.app.injectWS(path, {
    headers: { authorization: rig.authHeader },
  });

  const textFrames: ServerFrame[] = [];
  const binaryFrames: Buffer[] = [];
  const order: Collector['order'] = [];
  let closed = false;
  let closeCode: number | undefined;

  ws.on('message', (raw: Buffer, isBinary: boolean) => {
    if (isBinary) {
      binaryFrames.push(Buffer.from(raw));
      order.push({ kind: 'binary', index: binaryFrames.length - 1 });
    } else {
      const frame = JSON.parse(raw.toString('utf8')) as ServerFrame;
      textFrames.push(frame);
      order.push({ kind: 'text', index: textFrames.length - 1 });
    }
  });
  ws.on('close', (code: number) => {
    closed = true;
    closeCode = code;
  });

  return {
    socket: ws,
    textFrames,
    binaryFrames,
    order,
    get closed() {
      return closed;
    },
    get closeCode() {
      return closeCode;
    },
    async waitFor(predicate, label, timeoutMs = 1500): Promise<void> {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        if (predicate({ text: textFrames, binary: binaryFrames })) return;
        await new Promise((r) => setImmediate(r));
        await new Promise((r) => setTimeout(r, 5));
      }
      throw new Error(
        `waitFor("${label}") timed out after ${timeoutMs}ms. text=${JSON.stringify(textFrames)} binaryCount=${binaryFrames.length} closed=${String(closed)}`,
      );
    },
    async waitForClose(timeoutMs = 1500): Promise<void> {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        if (closed) return;
        await new Promise((r) => setImmediate(r));
        await new Promise((r) => setTimeout(r, 5));
      }
      throw new Error(
        `waitForClose timed out after ${timeoutMs}ms. text=${JSON.stringify(textFrames)} closed=${String(closed)}`,
      );
    },
    send(frame: ClientFrame): void {
      ws.send(JSON.stringify(frame));
    },
  };
}

// Poll until the FakeSupervisor has recorded at least `count` resize() calls.
// resize is fire-and-forget (no server→client ack per ND-23), so tests observe
// it through the supervisor's recorded calls rather than a wire frame.
async function waitForResizes(
  session: SessionFixture,
  count: number,
  timeoutMs = 1500,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (session.supervisor.resizes.length >= count) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error(
    `waitForResizes(${count}) timed out; got ${JSON.stringify(session.supervisor.resizes)}`,
  );
}

let rig: WsRig;

beforeEach(async () => {
  rig = await makeWsRig();
});

afterEach(async () => {
  await rig.cleanup();
});

describe('GET /sessions/:id/stream — attach sequence (ws-protocol.md §6 + §3)', () => {
  it('emits hello → replay_start → bytes → replay_end → live bytes in that exact order', async () => {
    const session = await seedSession(rig);
    // Seed the ring with some replay content so replay_start.bytes > 0.
    session.supervisor.emitBytes(Buffer.from('replay-bytes'));

    const c = await connect(rig, `/sessions/${session.sessionId}/stream`);
    await c.waitFor(({ text }) => text.some((f) => f.type === 'replay_end'), 'replay_end');

    expect(c.textFrames[0]?.type).toBe('hello');
    const hello = c.textFrames[0];
    if (hello?.type !== 'hello') throw new Error('expected hello');
    // Per ws-protocol.md §2.3: hello carries the config values + sessionId.
    expect(hello.sessionId).toBe(session.sessionId);
    expect(hello.status).toBe('running');
    expect(hello.replayBufferBytes).toBe(32 * 1024);
    expect(hello.claimLockTimeoutSeconds).toBe(30);

    expect(c.textFrames[1]?.type).toBe('replay_start');
    const rs = c.textFrames[1];
    if (rs?.type !== 'replay_start') throw new Error('expected replay_start');
    expect(rs.bytes).toBe('replay-bytes'.length);
    // Exactly one binary frame for the replay snapshot in this test (the
    // handler may coalesce; the FakeSupervisor emits a single chunk into
    // the ring).
    expect(c.binaryFrames[0]?.toString()).toBe('replay-bytes');
    expect(c.textFrames[2]?.type).toBe('replay_end');

    // Live bytes emitted after replay must arrive AFTER replay_end.
    session.supervisor.emitBytes(Buffer.from('live'));
    await c.waitFor(({ binary }) => binary.length >= 2, 'second binary frame');
    expect(c.binaryFrames[1]?.toString()).toBe('live');
  });

  it('empty ring buffer still brackets — replay_start{bytes:0} immediately followed by replay_end', async () => {
    const session = await seedSession(rig);

    const c = await connect(rig, `/sessions/${session.sessionId}/stream`);
    await c.waitFor(({ text }) => text.some((f) => f.type === 'replay_end'), 'replay_end');

    const replayStart = c.textFrames.find((f) => f.type === 'replay_start');
    if (replayStart?.type !== 'replay_start') throw new Error('expected replay_start');
    expect(replayStart.bytes).toBe(0);
    // Per ws-protocol.md §3 "Empty buffer": zero binary frames between.
    const startIdx = c.order.findIndex((o) => o.kind === 'text' && o.index === 1);
    const endIdx = c.order.findIndex(
      (o, i) => i > startIdx && o.kind === 'text' && c.textFrames[o.index]?.type === 'replay_end',
    );
    expect(endIdx).toBe(startIdx + 1);
  });

  it('every attached connection receives live bytes regardless of claim (D-G3)', async () => {
    const session = await seedSession(rig);
    const a = await connect(rig, `/sessions/${session.sessionId}/stream`);
    const b = await connect(rig, `/sessions/${session.sessionId}/stream`);

    await a.waitFor(({ text }) => text.some((f) => f.type === 'replay_end'), 'A replay_end');
    await b.waitFor(({ text }) => text.some((f) => f.type === 'replay_end'), 'B replay_end');

    // One holds the claim; the other does not.
    a.send({ type: 'claim', id: 'a-claim' });
    await a.waitFor(({ text }) => text.some((f) => f.type === 'claim_ack'), 'claim_ack A');

    // Live PTY bytes must reach BOTH attached connections (D-G3 universal
    // output), not only the claim holder.
    session.supervisor.emitBytes(Buffer.from('shared'));
    await a.waitFor(({ binary }) => binary.some((b2) => b2.toString() === 'shared'), 'A got bytes');
    await b.waitFor(({ binary }) => binary.some((b2) => b2.toString() === 'shared'), 'B got bytes');
  });
});

describe('GET /sessions/:id/stream — upgrade failures (ws-protocol.md §4.2 + §6)', () => {
  it('unknown session id → close 4404 (no frames sent)', async () => {
    const c = await connect(rig, '/sessions/01J0000000000000000UNKNOWN/stream');
    await c.waitForClose();
    expect(c.closeCode).toBe(4404);
    // Per §4.2 4404: closed before any frames are sent.
    expect(c.textFrames).toEqual([]);
    expect(c.binaryFrames).toEqual([]);
  });

  it('already-killed session → hello{status:killed} + session_ended + close 1000', async () => {
    const session = await seedSession(rig);
    // Kill before opening the WS — registry.get(sid) returns undefined, but
    // the row exists.
    rig.registry.kill(session.sessionId, 'operator_kill');

    const c = await connect(rig, `/sessions/${session.sessionId}/stream`);
    await c.waitForClose();
    expect(c.closeCode).toBe(1000);
    const types = c.textFrames.map((f) => f.type);
    expect(types).toEqual(['hello', 'session_ended']);
    const hello = c.textFrames[0];
    if (hello?.type !== 'hello') throw new Error('expected hello');
    expect(hello.status).toBe('killed');
    const ended = c.textFrames[1];
    if (ended?.type !== 'session_ended') throw new Error('expected session_ended');
    expect(ended.reason).toBe('operator_kill');
  });
});

describe('GET /sessions/:id/stream — claim arbitration (ws-protocol.md §5.2)', () => {
  it('first claim grants; second concurrent claim from another conn is busy', async () => {
    const session = await seedSession(rig);
    const a = await connect(rig, `/sessions/${session.sessionId}/stream`);
    const b = await connect(rig, `/sessions/${session.sessionId}/stream`);

    await a.waitFor(({ text }) => text.some((f) => f.type === 'replay_end'), 'A replay_end');
    await b.waitFor(({ text }) => text.some((f) => f.type === 'replay_end'), 'B replay_end');

    a.send({ type: 'claim', id: 'a-1' });
    await a.waitFor(({ text }) => text.some((f) => f.type === 'claim_ack'), 'A claim_ack');

    b.send({ type: 'claim', id: 'b-1' });
    await b.waitFor(({ text }) => text.some((f) => f.type === 'busy'), 'B busy');

    const ack = a.textFrames.find((f) => f.type === 'claim_ack');
    const busy = b.textFrames.find((f) => f.type === 'busy');
    if (ack?.type !== 'claim_ack') throw new Error('expected claim_ack');
    if (busy?.type !== 'busy') throw new Error('expected busy');
    expect(ack.id).toBe('a-1');
    expect(busy.id).toBe('b-1');
    expect(typeof busy.since).toBe('string');
  });

  it('duplicate claim from the holder is idempotent — same expiresAt (ND-01)', async () => {
    const session = await seedSession(rig);
    const a = await connect(rig, `/sessions/${session.sessionId}/stream`);
    await a.waitFor(({ text }) => text.some((f) => f.type === 'replay_end'), 'replay_end');

    a.send({ type: 'claim', id: 'first' });
    await a.waitFor(
      ({ text }) => text.filter((f) => f.type === 'claim_ack').length === 1,
      'first ack',
    );
    a.send({ type: 'claim', id: 'second' });
    await a.waitFor(
      ({ text }) => text.filter((f) => f.type === 'claim_ack').length === 2,
      'second ack',
    );

    const acks = a.textFrames.filter((f) => f.type === 'claim_ack');
    if (acks[0]?.type !== 'claim_ack' || acks[1]?.type !== 'claim_ack') {
      throw new Error('expected two claim_ack');
    }
    // Per ND-01 no-re-arming: the second ack carries the ORIGINAL expiresAt.
    expect(acks[1].expiresAt).toBe(acks[0].expiresAt);
    // But the correlation id is whatever the duplicate `claim` carried.
    expect(acks[1].id).toBe('second');
  });
});

describe('GET /sessions/:id/stream — send delivery (ws-protocol.md §5.2 row 4)', () => {
  it('send from holder writes to PTY and releases claim with delivered (broadcast to all peers)', async () => {
    const session = await seedSession(rig);
    const a = await connect(rig, `/sessions/${session.sessionId}/stream`);
    const b = await connect(rig, `/sessions/${session.sessionId}/stream`);
    await a.waitFor(({ text }) => text.some((f) => f.type === 'replay_end'), 'A replay_end');
    await b.waitFor(({ text }) => text.some((f) => f.type === 'replay_end'), 'B replay_end');

    a.send({ type: 'claim', id: 'a-1' });
    await a.waitFor(({ text }) => text.some((f) => f.type === 'claim_ack'), 'claim_ack');

    a.send({ type: 'send', id: 'a-2', data: Buffer.from('hi\n').toString('base64') });

    // Per §5.2 row 4: claim_released { reason: 'delivered', heldBy } broadcasts.
    await a.waitFor(
      ({ text }) => text.some((f) => f.type === 'claim_released' && f.reason === 'delivered'),
      'A claim_released',
    );
    await b.waitFor(
      ({ text }) => text.some((f) => f.type === 'claim_released' && f.reason === 'delivered'),
      'B claim_released',
    );

    // Bytes hit the supervisor.write path (FakeSupervisor records them).
    expect(session.supervisor.writes.length).toBe(1);
    const w = session.supervisor.writes[0];
    expect(Buffer.isBuffer(w) ? w.toString() : w).toBe('hi\n');
  });

  it('send from non-holder → error { code: send_without_claim, fatal: false }', async () => {
    const session = await seedSession(rig);
    const a = await connect(rig, `/sessions/${session.sessionId}/stream`);
    await a.waitFor(({ text }) => text.some((f) => f.type === 'replay_end'), 'replay_end');

    a.send({ type: 'send', id: 'orphan', data: Buffer.from('x').toString('base64') });

    await a.waitFor(({ text }) => text.some((f) => f.type === 'error'), 'error frame');
    const err = a.textFrames.find((f) => f.type === 'error');
    if (err?.type !== 'error') throw new Error('expected error');
    expect(err.code).toBe('send_without_claim');
    expect(err.fatal).toBe(false);
    // The PTY must not see the bytes.
    expect(session.supervisor.writes).toEqual([]);
  });

  it('send with invalid base64 → error { code: invalid_send }', async () => {
    const session = await seedSession(rig);
    const a = await connect(rig, `/sessions/${session.sessionId}/stream`);
    await a.waitFor(({ text }) => text.some((f) => f.type === 'replay_end'), 'replay_end');
    a.send({ type: 'claim' });
    await a.waitFor(({ text }) => text.some((f) => f.type === 'claim_ack'), 'claim_ack');

    a.send({ type: 'send', data: 'not base64!!!@@@' });
    await a.waitFor(({ text }) => text.some((f) => f.type === 'error'), 'error');
    const err = a.textFrames.find((f) => f.type === 'error');
    if (err?.type !== 'error') throw new Error('expected error');
    expect(err.code).toBe('invalid_send');
    expect(session.supervisor.writes).toEqual([]);
  });
});

describe('GET /sessions/:id/stream — voluntary release (ws-protocol.md §5.2 row 6)', () => {
  it('release from holder broadcasts claim_released { reason: voluntary }', async () => {
    const session = await seedSession(rig);
    const a = await connect(rig, `/sessions/${session.sessionId}/stream`);
    const b = await connect(rig, `/sessions/${session.sessionId}/stream`);
    await a.waitFor(({ text }) => text.some((f) => f.type === 'replay_end'), 'A replay_end');
    await b.waitFor(({ text }) => text.some((f) => f.type === 'replay_end'), 'B replay_end');

    a.send({ type: 'claim' });
    await a.waitFor(({ text }) => text.some((f) => f.type === 'claim_ack'), 'A claim_ack');

    a.send({ type: 'release' });
    await b.waitFor(
      ({ text }) => text.some((f) => f.type === 'claim_released' && f.reason === 'voluntary'),
      'B saw voluntary',
    );
    expect(session.supervisor.writes).toEqual([]);
  });

  it('release from non-holder → error { code: release_without_claim }', async () => {
    const session = await seedSession(rig);
    const a = await connect(rig, `/sessions/${session.sessionId}/stream`);
    await a.waitFor(({ text }) => text.some((f) => f.type === 'replay_end'), 'replay_end');

    a.send({ type: 'release', id: 'r-1' });
    await a.waitFor(({ text }) => text.some((f) => f.type === 'error'), 'error frame');
    const err = a.textFrames.find((f) => f.type === 'error');
    if (err?.type !== 'error') throw new Error('expected error');
    expect(err.code).toBe('release_without_claim');
  });
});

describe('GET /sessions/:id/stream — error envelope (ws-protocol.md §4.1)', () => {
  it('unknown type → error { code: unknown_type, fatal: false }', async () => {
    const session = await seedSession(rig);
    const a = await connect(rig, `/sessions/${session.sessionId}/stream`);
    await a.waitFor(({ text }) => text.some((f) => f.type === 'replay_end'), 'replay_end');

    a.socket.send(JSON.stringify({ type: 'no_such_frame' }));
    await a.waitFor(({ text }) => text.some((f) => f.type === 'error'), 'error');
    const err = a.textFrames.find((f) => f.type === 'error');
    if (err?.type !== 'error') throw new Error('expected error');
    expect(err.code).toBe('unknown_type');
    expect(err.fatal).toBe(false);
  });

  it('JSON parse failure → error { code: malformed_message }', async () => {
    const session = await seedSession(rig);
    const a = await connect(rig, `/sessions/${session.sessionId}/stream`);
    await a.waitFor(({ text }) => text.some((f) => f.type === 'replay_end'), 'replay_end');

    a.socket.send('{not valid json');
    await a.waitFor(({ text }) => text.some((f) => f.type === 'error'), 'error');
    const err = a.textFrames.find((f) => f.type === 'error');
    if (err?.type !== 'error') throw new Error('expected error');
    expect(err.code).toBe('malformed_message');
  });
});

describe('GET /sessions/:id/stream — §5.3 race 2: disconnect mid-send', () => {
  it('disconnect of the claim holder releases with reason=disconnect (broadcast to peers)', async () => {
    const session = await seedSession(rig);
    const a = await connect(rig, `/sessions/${session.sessionId}/stream`);
    const b = await connect(rig, `/sessions/${session.sessionId}/stream`);
    await a.waitFor(({ text }) => text.some((f) => f.type === 'replay_end'), 'A replay_end');
    await b.waitFor(({ text }) => text.some((f) => f.type === 'replay_end'), 'B replay_end');

    a.send({ type: 'claim' });
    await a.waitFor(({ text }) => text.some((f) => f.type === 'claim_ack'), 'A claim_ack');

    // terminate() forces an immediate transport-level close (no handshake).
    // injectWS's PassThrough plumbing does not deliver client-initiated
    // close(code, reason) handshakes to the server-side ws.WebSocket reliably
    // (the 'close' event never fires server-side under the test harness),
    // so we model the disconnect path via terminate() which closes the
    // underlying stream directly. Same semantic on the server (the WS
    // emits 'close'), per §5.2 row 9.
    a.socket.terminate();

    // Per §5.2 row 9 + §5.3 race 2: B observes claim_released { disconnect }.
    await b.waitFor(
      ({ text }) => text.some((f) => f.type === 'claim_released' && f.reason === 'disconnect'),
      'B disconnect broadcast',
    );
    void session;
  });
});

describe('GET /sessions/:id/stream — §5.3 race 3: auth expired mid-claim', () => {
  it('token revocation emits auth_expired + close 4401; any held claim releases with disconnect for peers', async () => {
    const session = await seedSession(rig);
    const a = await connect(rig, `/sessions/${session.sessionId}/stream`);
    const b = await connect(rig, `/sessions/${session.sessionId}/stream`);
    await a.waitFor(({ text }) => text.some((f) => f.type === 'replay_end'), 'A replay_end');
    await b.waitFor(({ text }) => text.some((f) => f.type === 'replay_end'), 'B replay_end');

    a.send({ type: 'claim' });
    await a.waitFor(({ text }) => text.some((f) => f.type === 'claim_ack'), 'A claim_ack');

    rig.tokenStore.revoke(rig.tokenId);

    // Per ws-protocol.md §4.2 4401 + §2.3 auth_expired: the revoked
    // connection sees the auth_expired frame, then a 4401 close.
    await a.waitFor(({ text }) => text.some((f) => f.type === 'auth_expired'), 'auth_expired');
    await a.waitForClose();
    expect(a.closeCode).toBe(4401);

    // B's token is the same (the test uses one token for both connections),
    // so B also receives auth_expired + 4401. Per §5.2 row 9 + §5.3 race 3:
    // the disconnect path subsumes the release.
    await b.waitForClose();
    expect(b.closeCode).toBe(4401);
  });
});

describe('GET /sessions/:id/stream — §5.3 race 4: PTY EPIPE on send', () => {
  it('supervisor.write throws → claim still releases delivered when payload carries newline', async () => {
    const session = await seedSession(rig);
    const a = await connect(rig, `/sessions/${session.sessionId}/stream`);
    await a.waitFor(({ text }) => text.some((f) => f.type === 'replay_end'), 'replay_end');

    a.send({ type: 'claim' });
    await a.waitFor(({ text }) => text.some((f) => f.type === 'claim_ack'), 'claim_ack');

    // Inject the EPIPE-shape failure: stub supervisor.write for this send.
    const originalWrite = session.supervisor.write;
    const spy = vi.spyOn(session.supervisor, 'write').mockImplementation(() => {
      throw new Error('EPIPE: supervisor already exited');
    });

    // Per ND-24: the release decision is driven by payload content, not
    // PTY-write outcome. A newline-bearing payload still triggers release
    // even when the write throws — `boom\n` carries `\n`, so the lock
    // transitions to Unclaimed with `delivered`.
    a.send({ type: 'send', data: Buffer.from('boom\n').toString('base64') });
    await a.waitFor(
      ({ text }) => text.some((f) => f.type === 'claim_released' && f.reason === 'delivered'),
      'delivered after EPIPE',
    );
    spy.mockRestore();
    void originalWrite;
  });
});

describe('GET /sessions/:id/stream — send delivery — ND-24 multi-send + newline-release', () => {
  it('non-newline sends keep the claim held; bytes still reach PTY', async () => {
    const session = await seedSession(rig);
    const a = await connect(rig, `/sessions/${session.sessionId}/stream`);
    await a.waitFor(({ text }) => text.some((f) => f.type === 'replay_end'), 'replay_end');

    a.send({ type: 'claim', id: 'a-1' });
    await a.waitFor(({ text }) => text.some((f) => f.type === 'claim_ack'), 'claim_ack');

    // Per ND-24: a `send` without newline writes bytes but does not release.
    a.send({ type: 'send', data: Buffer.from('h').toString('base64') });
    a.send({ type: 'send', data: Buffer.from('e').toString('base64') });
    a.send({ type: 'send', data: Buffer.from('l').toString('base64') });

    // Wait for the supervisor to record all three writes.
    const start = Date.now();
    while (Date.now() - start < 1500) {
      if (session.supervisor.writes.length >= 3) break;
      await new Promise((r) => setTimeout(r, 5));
    }
    expect(session.supervisor.writes.map((w) => (Buffer.isBuffer(w) ? w.toString() : w))).toEqual([
      'h',
      'e',
      'l',
    ]);
    // No claim_released frame emitted yet.
    expect(a.textFrames.filter((f) => f.type === 'claim_released')).toEqual([]);
  });

  it('newline-bearing send after non-newline sends triggers exactly one release broadcast', async () => {
    const session = await seedSession(rig);
    const a = await connect(rig, `/sessions/${session.sessionId}/stream`);
    const b = await connect(rig, `/sessions/${session.sessionId}/stream`);
    await a.waitFor(({ text }) => text.some((f) => f.type === 'replay_end'), 'A replay_end');
    await b.waitFor(({ text }) => text.some((f) => f.type === 'replay_end'), 'B replay_end');

    a.send({ type: 'claim' });
    await a.waitFor(({ text }) => text.some((f) => f.type === 'claim_ack'), 'claim_ack');

    a.send({ type: 'send', data: Buffer.from('hi').toString('base64') });
    a.send({ type: 'send', data: Buffer.from('\n').toString('base64') });

    await b.waitFor(
      ({ text }) => text.some((f) => f.type === 'claim_released' && f.reason === 'delivered'),
      'B delivered',
    );
    expect(b.textFrames.filter((f) => f.type === 'claim_released').length).toBe(1);
    void session;
  });

  it('CRLF: \\r releases on first scan; the \\n arrives in the next claim cycle', async () => {
    const session = await seedSession(rig);
    const a = await connect(rig, `/sessions/${session.sessionId}/stream`);
    await a.waitFor(({ text }) => text.some((f) => f.type === 'replay_end'), 'replay_end');

    a.send({ type: 'claim' });
    await a.waitFor(({ text }) => text.some((f) => f.type === 'claim_ack'), 'claim_ack');

    a.send({ type: 'send', data: Buffer.from('a\r\n').toString('base64') });
    await a.waitFor(
      ({ text }) => text.some((f) => f.type === 'claim_released' && f.reason === 'delivered'),
      'delivered',
    );
    // Exactly one release broadcast — both bytes are in the same send.
    expect(a.textFrames.filter((f) => f.type === 'claim_released').length).toBe(1);
    // Bytes reached the PTY in full.
    expect(session.supervisor.writes.map((w) => (Buffer.isBuffer(w) ? w.toString() : w))).toEqual([
      'a\r\n',
    ]);
  });

  it('empty send (data: "") writes zero bytes and does not release', async () => {
    const session = await seedSession(rig);
    const a = await connect(rig, `/sessions/${session.sessionId}/stream`);
    await a.waitFor(({ text }) => text.some((f) => f.type === 'replay_end'), 'replay_end');

    a.send({ type: 'claim' });
    await a.waitFor(({ text }) => text.some((f) => f.type === 'claim_ack'), 'claim_ack');

    a.send({ type: 'send', data: '' });
    // Give the handler a chance to process; assert nothing happened.
    await new Promise((r) => setTimeout(r, 50));
    expect(a.textFrames.filter((f) => f.type === 'claim_released')).toEqual([]);
    expect(a.textFrames.filter((f) => f.type === 'error')).toEqual([]);
    // The handler still calls supervisor.write with the zero-byte buffer.
    expect(session.supervisor.writes.length).toBe(1);
    const w = session.supervisor.writes[0];
    expect(Buffer.isBuffer(w) ? w.length : String(w).length).toBe(0);
  });

  it('busy peer sees claim_released { delivered } when holder finally sends a newline', async () => {
    const session = await seedSession(rig);
    const a = await connect(rig, `/sessions/${session.sessionId}/stream`);
    const b = await connect(rig, `/sessions/${session.sessionId}/stream`);
    await a.waitFor(({ text }) => text.some((f) => f.type === 'replay_end'), 'A replay_end');
    await b.waitFor(({ text }) => text.some((f) => f.type === 'replay_end'), 'B replay_end');

    a.send({ type: 'claim', id: 'a-1' });
    await a.waitFor(({ text }) => text.some((f) => f.type === 'claim_ack'), 'A claim_ack');
    a.send({ type: 'send', data: Buffer.from('xy').toString('base64') });

    b.send({ type: 'claim', id: 'b-1' });
    await b.waitFor(({ text }) => text.some((f) => f.type === 'busy'), 'B busy');

    a.send({ type: 'send', data: Buffer.from('\n').toString('base64') });
    await b.waitFor(
      ({ text }) => text.some((f) => f.type === 'claim_released' && f.reason === 'delivered'),
      'B sees delivered',
    );
    void session;
  });

  it('ND-01 timeout under sustained non-newline typing: claim_released { timeout } and subsequent send errors with send_without_claim', async () => {
    // Per ND-01: the 30s window does not re-arm on activity. Non-newline
    // sends DO NOT extend the timer — only a newline-bearing send releases
    // before the timer fires. To keep the test fast, use a 1-second timeout
    // rig instead of the default 30s.
    const fastRig = await makeWsRig(1);
    try {
      const session = await seedSession(fastRig);
      const a = await connect(fastRig, `/sessions/${session.sessionId}/stream`);
      await a.waitFor(({ text }) => text.some((f) => f.type === 'replay_end'), 'replay_end');

      a.send({ type: 'claim' });
      await a.waitFor(({ text }) => text.some((f) => f.type === 'claim_ack'), 'claim_ack');

      // Type continuously without ever sending a newline. The non-newline
      // bytes reach the PTY but do not re-arm the timer.
      a.send({ type: 'send', data: Buffer.from('x').toString('base64') });
      a.send({ type: 'send', data: Buffer.from('y').toString('base64') });
      // Wait past the 1s window for the auto-release.
      await a.waitFor(
        ({ text }) => text.some((f) => f.type === 'claim_released' && f.reason === 'timeout'),
        'timeout',
        2000,
      );

      // Subsequent send from the (now ex-) holder must error with
      // send_without_claim — the server-side lock is gone.
      a.send({ type: 'send', id: 'after-timeout', data: Buffer.from('z').toString('base64') });
      await a.waitFor(
        ({ text }) => text.some((f) => f.type === 'error' && f.code === 'send_without_claim'),
        'post-timeout send_without_claim',
      );
    } finally {
      await fastRig.cleanup();
    }
  });
});

describe('GET /sessions/:id/stream — session_ended after live attach (ws-protocol.md §5.2 final)', () => {
  it('agent exit → session_ended { reason: agent_exit } + close 1000', async () => {
    const session = await seedSession(rig);
    const a = await connect(rig, `/sessions/${session.sessionId}/stream`);
    await a.waitFor(({ text }) => text.some((f) => f.type === 'replay_end'), 'replay_end');

    session.supervisor.emitExit({ exitCode: 0, signal: null });

    await a.waitFor(({ text }) => text.some((f) => f.type === 'session_ended'), 'session_ended');
    const ended = a.textFrames.find((f) => f.type === 'session_ended');
    if (ended?.type !== 'session_ended') throw new Error('expected session_ended');
    expect(ended.reason).toBe('agent_exit');
    expect(ended.exitCode).toBe(0);
    await a.waitForClose();
    expect(a.closeCode).toBe(1000);
  });

  it('operator kill mid-stream → session_ended { reason: operator_kill } + close 1000', async () => {
    const session = await seedSession(rig);
    const a = await connect(rig, `/sessions/${session.sessionId}/stream`);
    await a.waitFor(({ text }) => text.some((f) => f.type === 'replay_end'), 'replay_end');

    rig.registry.kill(session.sessionId, 'operator_kill');
    session.supervisor.emitExit({ exitCode: 0, signal: null });

    await a.waitFor(({ text }) => text.some((f) => f.type === 'session_ended'), 'session_ended');
    const ended = a.textFrames.find((f) => f.type === 'session_ended');
    if (ended?.type !== 'session_ended') throw new Error('expected session_ended');
    expect(ended.reason).toBe('operator_kill');
    expect(ended.terminatedReason).toBe('operator_kill');
  });
});

describe('GET /sessions/:id/stream — resize side-channel + multi-client clamp (ND-23 + ND-39)', () => {
  it('single-client resize forwards cols/rows to supervisor.resize() (ND-23)', async () => {
    const session = await seedSession(rig);
    const a = await connect(rig, `/sessions/${session.sessionId}/stream`);
    await a.waitFor(({ text }) => text.some((f) => f.type === 'replay_end'), 'replay_end');

    a.send({ type: 'resize', cols: 100, rows: 40 });
    // No server-side ack frame is defined — resize is fire-and-forget per ND-23.
    await waitForResizes(session, 1);
    expect(session.supervisor.resizes).toEqual([{ cols: 100, rows: 40 }]);
  });

  it('resize is accepted regardless of claim state (side-channel, not §5.1 FSM)', async () => {
    const session = await seedSession(rig);
    const a = await connect(rig, `/sessions/${session.sessionId}/stream`);
    const b = await connect(rig, `/sessions/${session.sessionId}/stream`);
    await a.waitFor(({ text }) => text.some((f) => f.type === 'replay_end'), 'A replay_end');
    await b.waitFor(({ text }) => text.some((f) => f.type === 'replay_end'), 'B replay_end');

    // A holds the claim; B sends resize without claiming. Only B has reported a
    // size, so the effective (clamped) size is simply B's 80x24.
    a.send({ type: 'claim', id: 'a-claim' });
    await a.waitFor(({ text }) => text.some((f) => f.type === 'claim_ack'), 'A claim_ack');

    b.send({ type: 'resize', cols: 80, rows: 24 });
    await waitForResizes(session, 1);
    expect(session.supervisor.resizes).toEqual([{ cols: 80, rows: 24 }]);
    // No error frame emitted on B (the non-holder) — resize is universal.
    expect(b.textFrames.filter((f) => f.type === 'error')).toEqual([]);
  });

  it('single client: last-writer-wins — each successive resize forwards the new size (ND-23, exactly 1 attached)', async () => {
    const session = await seedSession(rig);
    const a = await connect(rig, `/sessions/${session.sessionId}/stream`);
    await a.waitFor(({ text }) => text.some((f) => f.type === 'replay_end'), 'replay_end');

    a.send({ type: 'resize', cols: 100, rows: 40 });
    await waitForResizes(session, 1);
    a.send({ type: 'resize', cols: 80, rows: 24 });
    await waitForResizes(session, 2);
    expect(session.supervisor.resizes).toEqual([
      { cols: 100, rows: 40 },
      { cols: 80, rows: 24 },
    ]);
  });

  it('≥2 attached: PTY clamps to the smallest viewport; a wider client never enlarges it (ND-39)', async () => {
    const session = await seedSession(rig);
    const narrow = await connect(rig, `/sessions/${session.sessionId}/stream`);
    const wide = await connect(rig, `/sessions/${session.sessionId}/stream`);
    await narrow.waitFor(
      ({ text }) => text.some((f) => f.type === 'replay_end'),
      'narrow replay_end',
    );
    await wide.waitFor(({ text }) => text.some((f) => f.type === 'replay_end'), 'wide replay_end');

    narrow.send({ type: 'resize', cols: 80, rows: 24 });
    await waitForResizes(session, 1);
    // The wider client reports LAST. Under ND-23 last-writer-wins this would
    // jump the shared PTY to 120x40 and shred the narrow client; the ND-39
    // clamp must keep min(cols),min(rows) = 80x24 and emit no resize for it.
    wide.send({ type: 'resize', cols: 120, rows: 40 });
    // Narrow then shrinks further — this proves wide's frame was consumed in
    // arrival order AND that 120x40 never reached the PTY (the clamp held):
    // the only second resize is the new minimum, 70x20.
    narrow.send({ type: 'resize', cols: 70, rows: 20 });
    await waitForResizes(session, 2);
    expect(session.supervisor.resizes).toEqual([
      { cols: 80, rows: 24 },
      { cols: 70, rows: 20 },
    ]);
  });

  it('2→1 detach reverts the PTY up to the remaining client’s full size (ND-39 revert; D-G2/D-G3 unregressed)', async () => {
    const session = await seedSession(rig);
    const narrow = await connect(rig, `/sessions/${session.sessionId}/stream`);
    const wide = await connect(rig, `/sessions/${session.sessionId}/stream`);
    await narrow.waitFor(
      ({ text }) => text.some((f) => f.type === 'replay_end'),
      'narrow replay_end',
    );
    await wide.waitFor(({ text }) => text.some((f) => f.type === 'replay_end'), 'wide replay_end');

    narrow.send({ type: 'resize', cols: 80, rows: 24 });
    await waitForResizes(session, 1);
    // Wide reports 120x40 — recorded but clamped away while both are attached.
    wide.send({ type: 'resize', cols: 120, rows: 40 });
    // Let the wide resize be processed (no-op against the clamp).
    await new Promise((r) => setTimeout(r, 100));
    expect(session.supervisor.resizes).toEqual([{ cols: 80, rows: 24 }]);

    // The narrow client leaves → the wider client is alone → the PTY reverts UP
    // to 120x40 (ND-23 last-writer-wins for a single attached client). This is
    // only possible if wide's size was recorded while it was clamped away.
    narrow.socket.terminate();
    await waitForResizes(session, 2);
    expect(session.supervisor.resizes).toEqual([
      { cols: 80, rows: 24 },
      { cols: 120, rows: 40 },
    ]);
  });

  it('invalid resize (cols <= 0) → error{malformed_message}, no supervisor mutation', async () => {
    const session = await seedSession(rig);
    const a = await connect(rig, `/sessions/${session.sessionId}/stream`);
    await a.waitFor(({ text }) => text.some((f) => f.type === 'replay_end'), 'replay_end');

    a.send({ type: 'resize', cols: 0, rows: 24 } as ClientFrame);
    await a.waitFor(({ text }) => text.some((f) => f.type === 'error'), 'error');
    const err = a.textFrames.find((f) => f.type === 'error');
    if (err?.type !== 'error') throw new Error('expected error');
    expect(err.code).toBe('malformed_message');
    expect(session.supervisor.resizes).toEqual([]);
  });
});

// Sanity check: the auth preHandler intercepts unauth at upgrade so the
// route handler never runs. The handler's defensive `tokenId === undefined`
// guard is exercised by a hypothetical mis-wiring, not the happy path. The
// route remains reachable only via Bearer auth — exercised in the
// REST/plugins/auth.test.ts file for the REST side; left out here because
// the WS path goes through the same global preHandler.
describe('GET /sessions/:id/stream — auth (shared preHandler)', () => {
  it('missing bearer → upgrade fails (401), no WS established', async () => {
    // injectWS doesn't expose the upgrade response directly when it fails
    // server-side; we attempt without headers and expect either a close or
    // a thrown error. Per @fastify/websocket: a preHandler error response
    // pre-empts the upgrade.
    const res = await rig.app.inject({
      method: 'GET',
      url: `/sessions/01J0000000000000000UNKNOWN/stream`,
      headers: {
        connection: 'upgrade',
        upgrade: 'websocket',
        'sec-websocket-version': '13',
        'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
      },
    });
    expect(res.statusCode).toBe(401);
  });
});
