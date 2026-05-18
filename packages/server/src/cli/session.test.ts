// `relay session {list,show,kill}` handlers.
// list/show: direct SQLite reads (no server required).
// kill: hits DELETE /sessions/:id over loopback.

import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runInit } from './init.js';
import { runServer } from './server.js';
import { runSessionKill, runSessionList, runSessionShow } from './session.js';
import { CliHttpError, CliHttpUnreachableError } from './http.js';
import { dbPath } from '../config/paths.js';
import { openDatabase, projects, sessions, tenants } from '../store/index.js';

const DEFAULT_PERSONAS_DIR = join(import.meta.dirname, '..', '..', 'personas', 'defaults');

let home: string;
let server: Awaited<ReturnType<typeof runServer>> | undefined;
let savedHome: string | undefined;
let savedRelayToken: string | undefined;

beforeEach(async () => {
  home = realpathSync(mkdtempSync(join(tmpdir(), 'relay-cli-session-')));
  savedHome = process.env['HOME'];
  savedRelayToken = process.env['RELAY_TOKEN'];
  process.env['HOME'] = home;

  const result = runInit({ home, defaultPersonasDir: DEFAULT_PERSONAS_DIR });
  process.env['RELAY_TOKEN'] = result.tokenPlaintext;

  writeFileSync(
    join(home, '.relay', 'config.yaml'),
    'host: 127.0.0.1\nport: 7777\nclaimLockTimeoutSeconds: 30\nreplayBufferBytes: 32768\n',
  );
  server = await runServer({
    homeOverride: home,
    migrationsDirOverride: join(import.meta.dirname, '..', 'store', 'migrations'),
    logger: false,
    listenOverride: { host: '127.0.0.1', port: 0 },
  });
  const address = server.app.server.address();
  if (address === null || typeof address === 'string') throw new Error('no bound port');
  writeFileSync(
    join(home, '.relay', 'config.yaml'),
    `host: 127.0.0.1\nport: ${String(address.port)}\nclaimLockTimeoutSeconds: 30\nreplayBufferBytes: 32768\n`,
  );
});

afterEach(async () => {
  if (server !== undefined) {
    await server.shutdown();
    server = undefined;
  }
  rmSync(home, { recursive: true, force: true });
  if (savedHome === undefined) delete process.env['HOME'];
  else process.env['HOME'] = savedHome;
  if (savedRelayToken === undefined) delete process.env['RELAY_TOKEN'];
  else process.env['RELAY_TOKEN'] = savedRelayToken;
});

function seedKilledSession(): { sessionId: string; projectId: string } {
  // Insert a project + session row directly; we don't need a live PTY since
  // list/show/kill all operate on persisted state.
  const db = openDatabase({ filename: dbPath(home) });
  try {
    const tenant = tenants.ensureSingleton(db, Date.now());
    const project = projects.insert(
      db,
      {
        tenantId: tenant.id,
        slug: 'demo',
        displayName: 'demo',
        canonicalPath: '/tmp/demo',
        agentCli: 'claude',
      },
      Date.now(),
    );
    const session = sessions.insert(
      db,
      {
        projectId: project.id,
        personaName: 'dev',
        agentCli: 'claude',
      },
      Date.now(),
    );
    sessions.markKilled(db, session.id, 'operator_kill', Date.now());
    return { sessionId: session.id, projectId: project.id };
  } finally {
    db.close();
  }
}

describe('runSessionList', () => {
  it('defaults to status=running (per D-11) — a killed-only DB returns []', () => {
    seedKilledSession();
    expect(runSessionList({}, { homeOverride: home })).toEqual([]);
  });

  it('--status=all returns rows across every status', () => {
    seedKilledSession();
    const rows = runSessionList({ status: 'all' }, { homeOverride: home });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('killed');
    expect(rows[0]?.terminatedReason).toBe('operator_kill');
  });

  it('filters by projectId', () => {
    const { projectId } = seedKilledSession();
    const matching = runSessionList({ status: 'all', projectId }, { homeOverride: home });
    expect(matching).toHaveLength(1);
    const nonMatching = runSessionList(
      { status: 'all', projectId: '01J0000000000000000UNKNOWN0' },
      { homeOverride: home },
    );
    expect(nonMatching).toHaveLength(0);
  });

  it('works without a running server (direct SQLite per ND-16)', async () => {
    seedKilledSession();
    if (server !== undefined) {
      await server.shutdown();
      server = undefined;
    }
    const rows = runSessionList({ status: 'all' }, { homeOverride: home });
    expect(rows).toHaveLength(1);
  });
});

describe('runSessionShow', () => {
  it('returns the row when present', () => {
    const { sessionId } = seedKilledSession();
    const row = runSessionShow(sessionId, { homeOverride: home });
    expect(row?.id).toBe(sessionId);
    expect(row?.status).toBe('killed');
  });

  it('returns undefined for an unknown id (the dispatcher renders the exit-1 error)', () => {
    expect(runSessionShow('01J0000000000000000UNKNOWN0', { homeOverride: home })).toBeUndefined();
  });
});

describe('runSessionKill', () => {
  it('returns 204 idempotently for an already-killed session (D-11)', async () => {
    const { sessionId } = seedKilledSession();
    // The REST handler returns 204 on the second kill — runSessionKill resolves.
    await expect(runSessionKill(sessionId)).resolves.toEqual({ killed: true });
  });

  it('surfaces 404 (CliHttpError status=404) when the session id is unknown', async () => {
    await expect(runSessionKill('01J0000000000000000UNKNOWN0')).rejects.toBeInstanceOf(
      CliHttpError,
    );
  });

  it('fails with CliHttpUnreachableError when the server is not running', async () => {
    const { sessionId } = seedKilledSession();
    if (server !== undefined) {
      await server.shutdown();
      server = undefined;
    }
    writeFileSync(
      join(home, '.relay', 'config.yaml'),
      'host: 127.0.0.1\nport: 1\nclaimLockTimeoutSeconds: 30\nreplayBufferBytes: 32768\n',
    );
    await expect(runSessionKill(sessionId)).rejects.toBeInstanceOf(CliHttpUnreachableError);
  });
});
