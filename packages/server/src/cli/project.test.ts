// `relay project {add,list,remove}` handlers. `add` and `remove` hit a real
// in-process Fastify server through fetch; `list` reads SQLite direct.
// Validates the ND-16 split: read direct, mutate via REST.

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runInit } from './init.js';
import { runServer } from './server.js';
import { runProjectAdd, runProjectList, runProjectRemove } from './project.js';
import { dbPath } from '../config/paths.js';
import { openDatabase, projects, tenants } from '../store/index.js';
import { CliHttpError, CliHttpUnreachableError } from './http.js';

let home: string;
let projectDir: string;
let server: Awaited<ReturnType<typeof runServer>> | undefined;
let savedHome: string | undefined;
let savedRelayToken: string | undefined;
let savedPort: string | undefined;

beforeEach(async () => {
  // realpath both because macOS resolves /var/folders/ → /private/var/folders/
  // and the REST handler canonicalizes via realpath per D-12; we want the
  // assertions to compare the canonical form.
  home = realpathSync(mkdtempSync(join(tmpdir(), 'relay-cli-project-')));
  projectDir = realpathSync(mkdtempSync(join(tmpdir(), 'relay-cli-project-target-')));
  savedHome = process.env['HOME'];
  savedRelayToken = process.env['RELAY_TOKEN'];
  savedPort = process.env['PORT'];
  process.env['HOME'] = home;

  const result = runInit({ home });
  process.env['RELAY_TOKEN'] = result.tokenPlaintext;

  // Boot the server on an ephemeral port. The handlers under test resolve
  // their URL by reading $HOME/.relay/config.yaml; we rewrite it to point
  // at port 0 so we can capture the bound port and feed it back via --url.
  // Config requires port >= 1, so the file holds a real (placeholder) value;
  // we bind to port 0 via the test seam and rewrite the file once the port is
  // known so resolveAttachConfig (which the CLI shim uses) points at the real
  // bound port.
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
  // Rewrite config to the bound port so resolveAttachConfig picks it up.
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
  rmSync(projectDir, { recursive: true, force: true });
  if (savedHome === undefined) delete process.env['HOME'];
  else process.env['HOME'] = savedHome;
  if (savedRelayToken === undefined) delete process.env['RELAY_TOKEN'];
  else process.env['RELAY_TOKEN'] = savedRelayToken;
  if (savedPort === undefined) delete process.env['PORT'];
  else process.env['PORT'] = savedPort;
});

describe('runProjectAdd', () => {
  it('registers the project, writes the marker file, and appends to .gitignore', async () => {
    const row = await runProjectAdd({ path: projectDir });
    expect(row.id).toMatch(/^[0-9A-HJ-KMNP-TV-Z]{26}$/);
    expect(row.canonicalPath).toBe(projectDir);

    // ND-07 marker file landed at <project>/.relay/project.json.
    const markerPath = join(projectDir, '.relay', 'project.json');
    expect(existsSync(markerPath)).toBe(true);
    const marker = JSON.parse(readFileSync(markerPath, 'utf8')) as {
      schemaVersion: number;
      projectId: string;
    };
    expect(marker.projectId).toBe(row.id);

    // .gitignore got the entry appended.
    expect(readFileSync(join(projectDir, '.gitignore'), 'utf8')).toContain('.relay/project.json');
  });

  it('honors an explicit --name slug override', async () => {
    const row = await runProjectAdd({ path: projectDir, slug: 'my-cool-app' });
    expect(row.slug).toBe('my-cool-app');
  });

  it('returns 409 (mapped to CliHttpError with status=409) when the same path is re-added', async () => {
    await runProjectAdd({ path: projectDir });
    await expect(runProjectAdd({ path: projectDir })).rejects.toBeInstanceOf(CliHttpError);
    try {
      await runProjectAdd({ path: projectDir });
    } catch (err) {
      expect((err as CliHttpError).status).toBe(409);
    }
  });
});

describe('runProjectList', () => {
  it('reads directly from SQLite — no server required', async () => {
    // First add via REST (server still running), then shut server down and
    // confirm list still works.
    await runProjectAdd({ path: projectDir });
    if (server !== undefined) {
      await server.shutdown();
      server = undefined;
    }
    const rows = runProjectList({ homeOverride: home });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.canonicalPath).toBe(projectDir);
  });
});

describe('runProjectRemove', () => {
  it('deletes the project row via DELETE /projects/:id', async () => {
    const row = await runProjectAdd({ path: projectDir });
    await runProjectRemove(row.id);
    expect(runProjectList({ homeOverride: home })).toHaveLength(0);
  });

  it('surfaces 404 as a CliHttpError when the id is unknown', async () => {
    await expect(runProjectRemove('01J0000000000000000UNKNOWN0')).rejects.toBeInstanceOf(
      CliHttpError,
    );
  });
});

describe('CliHttpUnreachableError', () => {
  it('fires when the server is not running (any mutating call hits the network)', async () => {
    if (server !== undefined) {
      await server.shutdown();
      server = undefined;
    }
    // Point config at a port nothing is listening on.
    writeFileSync(
      join(home, '.relay', 'config.yaml'),
      'host: 127.0.0.1\nport: 1\nclaimLockTimeoutSeconds: 30\nreplayBufferBytes: 32768\n',
    );
    await expect(runProjectAdd({ path: projectDir })).rejects.toBeInstanceOf(
      CliHttpUnreachableError,
    );
  });
});

describe('runProjectList — store layer integrity check', () => {
  it('uses the singleton tenant; the store helper is the same one the REST handler uses', async () => {
    // Smoke: the underlying store API is what the CLI list reads from.
    await runProjectAdd({ path: projectDir });
    const db = openDatabase({ filename: dbPath(home) });
    try {
      const tenant = tenants.ensureSingleton(db, Date.now());
      const rows = projects.listByTenant(db, tenant.id);
      expect(rows).toHaveLength(1);
    } finally {
      db.close();
    }
  });
});

// Silence unused-import lint for fixtures we pull in for setup convenience.
void mkdirSync;
