// Visual-testing harness: drive the REAL attach pipeline at chosen terminal
// sizes and read back what each client would render.
//
// Why the real pipeline (not the FakeSupervisor / FakeWebSocket the rest of the
// suite uses): ND-38 and ND-39 are rendering/lifecycle defects that only exist
// in the genuine path — a single shared real PTY (supervisor.ts), the §5.1 WS
// round-trip over a real socket, the raw-mode/SIGWINCH bridge in attach/tty.ts,
// and a full-screen TUI's alt-screen draws. Fakes short-circuit exactly the
// surfaces that break, so they cannot see these bugs.
//
// Topology:
//   bootHarnessServer()  → real buildServer on 127.0.0.1:0, whose registry
//                          spawns the deterministic fixture (fullscreen-tui.mjs)
//                          through the real createSupervisor — one shared PTY.
//   spawnHarnessClient() → a real AttachClient + runTty wired to in-memory TTY
//                          streams at a chosen cols×rows. Captures stdout and
//                          renders it via @xterm/headless.
//   spawnRealAttachClient() → the built `dist/cli/relay.js attach` as a child
//                          inside a real node-pty — the only way to observe the
//                          ND-38 process-exit (hang) defect.

import { spawn as ptySpawn, type IPty } from 'node-pty';
import {
  existsSync,
  globSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PassThrough, Writable } from 'node:stream';

import { AttachClient, runTty } from '../attach/index.js';
import { RevocationBus, TokenStore } from '../auth/index.js';
import { configPath, tokensPath } from '../config/paths.js';
import { createSupervisor, type PtySupervisor, type SpawnArgs } from '../pty/index.js';
import { buildServer } from '../server/index.js';
import { migrationsDirForTests } from '../server/rest/test-helpers.js';
import { createRegistry, type SessionRegistry } from '../session/index.js';
import {
  openDatabase,
  projects,
  runMigrations,
  SINGLETON_TENANT_ID,
  tenants,
  type Database,
} from '../store/index.js';

import { renderCapture, type Capture } from './headless-grid.js';

const FIXTURE = fileURLToPath(new URL('./fixtures/fullscreen-tui.mjs', import.meta.url));
// Line-oriented (non-TUI) agent that never enters the alt screen — for the
// ND-38 non-TUI teardown guard (the reset must not harm a primary-screen agent).
export const LINE_FIXTURE = fileURLToPath(new URL('./fixtures/line-agent.mjs', import.meta.url));
// Full-screen TUI that DIES without restoring the screen (no SIGHUP handler) —
// models the ND-38 Flow B defect where the agent leaves the alt screen dirty.
export const CRASHING_FIXTURE = fileURLToPath(
  new URL('./fixtures/crashing-tui.mjs', import.meta.url),
);
const ARTIFACTS_DIR = fileURLToPath(new URL('../../.tui-artifacts/', import.meta.url));

// Resolved by dispatcher-deps.test.ts's convention: the built thin-client.
export const DIST_CLI = join(import.meta.dirname, '..', '..', 'dist', 'cli', 'relay.js');

// ---------------------------------------------------------------------------
// Server side
// ---------------------------------------------------------------------------

export interface HarnessServer {
  wsUrl: string;
  sessionId: string;
  token: string;
  registry: SessionRegistry;
  db: Database;
  cleanup: () => Promise<void>;
}

export async function bootHarnessServer(opts: { fixture?: string } = {}): Promise<HarnessServer> {
  const fixture = opts.fixture ?? FIXTURE;
  const homeOverride = realpathSync(mkdtempSync(join(tmpdir(), 'relay-tui-')));
  const projectDir = realpathSync(mkdtempSync(join(tmpdir(), 'relay-tui-proj-')));
  const db = openDatabase({ filename: ':memory:' });
  runMigrations(db, migrationsDirForTests());
  tenants.ensureSingleton(db, Date.now());

  const tokenStore = new TokenStore(tokensPath(homeOverride), new RevocationBus());
  const token = tokenStore.createToken('tui-harness');

  // Real supervisor, but rewrite the command to run our deterministic fixture
  // instead of `claude`. Keeping the registry's cwd/env means all the row /
  // transcript / fan-out wiring runs through a genuine node-pty at the
  // production default 120x32 (supervisor.ts) — exactly the single shared PTY
  // ND-39 is about.
  const harnessSupervisorFactory = (args: SpawnArgs): PtySupervisor =>
    createSupervisor({
      command: process.execPath,
      args: [fixture],
      cwd: args.cwd,
      env: args.env,
    });

  const registry = createRegistry({
    db,
    homeOverride,
    agentCli: process.execPath,
    supervisorFactory: harnessSupervisorFactory,
    // The fixture is not claude; the ND-11 jsonl poll would never resolve.
    agentSessionIdCapture: () => Promise.resolve(null),
  });

  const project = projects.insert(
    db,
    {
      tenantId: SINGLETON_TENANT_ID,
      slug: `tui-${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`,
      displayName: 'tui',
      canonicalPath: projectDir,
    },
    Date.now(),
  );
  // Per D-17: bare-agent spawn — no persona fixture needed.
  const handle = await registry.create({
    projectId: project.id,
    canonicalProjectPath: projectDir,
  });

  const app = await buildServer({
    db,
    registry,
    tokenStore,
    config: {
      host: '127.0.0.1',
      port: 0,
      claimLockTimeoutSeconds: 30,
      replayBufferBytes: 32 * 1024,
    },
    homeOverride,
  });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;

  let cleaned = false;
  return {
    wsUrl: `ws://127.0.0.1:${String(port)}`,
    sessionId: handle.id,
    token: token.plaintext,
    registry,
    db,
    async cleanup(): Promise<void> {
      if (cleaned) return;
      cleaned = true;
      await app.close();
      await registry.shutdown();
      db.close();
      rmSync(homeOverride, { recursive: true, force: true });
      rmSync(projectDir, { recursive: true, force: true });
    },
  };
}

// ---------------------------------------------------------------------------
// In-process client (rendering + overlay observation)
// ---------------------------------------------------------------------------

// Captures everything runTty writes and exposes it for rendering.
class CaptureWritable extends Writable {
  readonly chunks: Buffer[] = [];
  isTTY = true;
  columns: number;
  rows: number;
  constructor(cols: number, rows: number) {
    super();
    this.columns = cols;
    this.rows = rows;
  }
  override _write(chunk: Buffer, _enc: BufferEncoding, cb: (e?: Error | null) => void): void {
    this.chunks.push(Buffer.from(chunk));
    cb();
  }
  get bytes(): Buffer {
    return Buffer.concat(this.chunks);
  }
  get text(): string {
    return this.bytes.toString('utf8');
  }
  setSize(cols: number, rows: number): void {
    this.columns = cols;
    this.rows = rows;
    // Mirrors process.stdout's SIGWINCH event that attach/tty.ts listens for.
    this.emit('resize');
  }
}

export interface HarnessClient {
  readonly client: AttachClient;
  /** WS close code; resolves on detach/session-end (runTty's done promise). */
  readonly done: Promise<number>;
  /** Whether runTty's setRawMode seam was last toggled on (true) or off. */
  readonly rawModeLog: boolean[];
  /** Inject keystrokes as if typed at this client's terminal. */
  type(data: string | Buffer): void;
  /** Press Ctrl+D (the raw-mode detach byte 0x04). */
  pressCtrlD(): void;
  /** Resize this client's viewport — fires SIGWINCH → a `resize` WS frame. */
  resize(cols: number, rows: number): void;
  /** Render this client's stdout at its current size. */
  capture(): Promise<Capture>;
  /** Render stdout followed by stderr — models a single physical screen where
   *  the `[relay] …` notices land on top of the agent's frame (ND-38 overlay). */
  captureCombined(): Promise<Capture>;
  /** Text written to stderr (the `[relay] …` lifecycle notices). */
  stderr(): string;
}

export async function spawnHarnessClient(
  server: HarnessServer,
  size: { cols: number; rows: number },
): Promise<HarnessClient> {
  const client = new AttachClient({
    wsUrl: server.wsUrl,
    sessionId: server.sessionId,
    token: server.token,
  });

  const stdin = new PassThrough();
  Object.assign(stdin, { isTTY: true });
  const stdout = new CaptureWritable(size.cols, size.rows);
  const stderr = new CaptureWritable(size.cols, size.rows);
  const rawModeLog: boolean[] = [];

  // Production ordering, mirroring cli/attach.ts exactly: connect FIRST, then
  // runTty (which subscribes via client.subscribe). Per ND-40 the AttachClient
  // buffers any replay binary that coalesced with the 101/open before subscribe
  // ran and flushes it on subscribe, so the agent's initial `\x1b[?1049h`
  // alt-screen enter survives even though we subscribe after connect. The old
  // harness subscribed BEFORE connect specifically to dodge that gap — which
  // masked the very race this harness must reflect.
  await client.connect();
  const { done } = runTty({
    client,
    stdin: stdin as unknown as Parameters<typeof runTty>[0]['stdin'],
    stdout: stdout as unknown as Parameters<typeof runTty>[0]['stdout'],
    stderr,
    setRawMode: (enabled: boolean): void => {
      rawModeLog.push(enabled);
    },
    // Never touch process-level exit hooks from inside the harness.
    installExitHook: (): void => {},
  });
  // runTty's startup resize fires now that the socket is open; this explicit
  // resize keeps the PTY synced to this client's viewport deterministically.
  client.resize(size.cols, size.rows);

  return {
    client,
    done,
    rawModeLog,
    type(data: string | Buffer): void {
      stdin.write(typeof data === 'string' ? Buffer.from(data) : data);
    },
    pressCtrlD(): void {
      stdin.write(Buffer.from([0x04]));
    },
    resize(cols: number, rows: number): void {
      stdout.setSize(cols, rows);
    },
    capture(): Promise<Capture> {
      return renderCapture(stdout.bytes, stdout.columns, stdout.rows);
    },
    captureCombined(): Promise<Capture> {
      return renderCapture(
        Buffer.concat([stdout.bytes, stderr.bytes]),
        stdout.columns,
        stdout.rows,
      );
    },
    stderr(): string {
      return stderr.text;
    },
  };
}

// ---------------------------------------------------------------------------
// Real-binary client (ND-38 process-exit / hang observation)
// ---------------------------------------------------------------------------

export interface RealAttachClient {
  /** Raw bytes the attach process has written to its pty so far. */
  output(): Buffer;
  capture(cols: number, rows: number): Promise<Capture>;
  write(data: string | Buffer): void;
  pressCtrlD(): void;
  resize(cols: number, rows: number): void;
  /** Resolves with the child's exit code/signal when it actually terminates. */
  readonly exited: Promise<{ exitCode: number; signal?: number }>;
  /** True once the child process has exited. */
  hasExited(): boolean;
  kill(): void;
  cleanup(): void;
}

export function spawnRealAttachClient(
  server: HarnessServer,
  size: { cols: number; rows: number },
): RealAttachClient {
  // The thin client resolves its URL from ~/.relay/config.yaml and its token
  // from RELAY_TOKEN. Give it a throwaway HOME pointing at our ephemeral server.
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'relay-tui-attach-')));
  const cfgPath = configPath(home);
  mkdirSync(dirname(cfgPath), { recursive: true });
  const port = new URL(server.wsUrl).port;
  writeFileSync(
    cfgPath,
    `host: 127.0.0.1\nport: ${port}\nclaimLockTimeoutSeconds: 30\nreplayBufferBytes: 32768\n`,
  );

  const proc: IPty = ptySpawn(process.execPath, [DIST_CLI, 'attach', server.sessionId], {
    name: 'xterm-256color',
    cols: size.cols,
    rows: size.rows,
    cwd: home,
    env: { ...(process.env as Record<string, string>), HOME: home, RELAY_TOKEN: server.token },
  });

  const chunks: Buffer[] = [];
  proc.onData((d: string): void => {
    chunks.push(Buffer.from(d, 'binary'));
  });

  let exited = false;
  const exitedPromise = new Promise<{ exitCode: number; signal?: number }>((resolve) => {
    proc.onExit(({ exitCode, signal }) => {
      exited = true;
      resolve({ exitCode, signal });
    });
  });

  return {
    output: (): Buffer => Buffer.concat(chunks),
    capture: (cols: number, rows: number): Promise<Capture> =>
      renderCapture(Buffer.concat(chunks), cols, rows),
    write: (data: string | Buffer): void => {
      proc.write(typeof data === 'string' ? data : data.toString('binary'));
    },
    pressCtrlD: (): void => {
      proc.write('\x04');
    },
    resize: (cols: number, rows: number): void => {
      proc.resize(cols, rows);
    },
    exited: exitedPromise,
    hasExited: (): boolean => exited,
    kill: (): void => {
      try {
        proc.kill();
      } catch {
        // best-effort
      }
    },
    cleanup: (): void => {
      try {
        proc.kill();
      } catch {
        // best-effort
      }
      rmSync(home, { recursive: true, force: true });
    },
  };
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

export type DistState = 'fresh' | 'stale' | 'absent';
export interface DistFreshness {
  state: DistState;
  reason: string;
}

function newestMtime(globs: string[], cwd: string): number {
  let newest = 0;
  for (const pattern of globs) {
    for (const rel of globSync(pattern, { cwd })) {
      if (rel.includes('.test.')) continue; // test files run from src, never ship in dist
      const m = statSync(join(cwd, rel)).mtimeMs;
      if (m > newest) newest = m;
    }
  }
  return newest;
}

// Replaces the old existsSync-only `distCliBuilt`. The real-binary suite spawns
// `dist/cli/relay.js attach`, so a dist that predates the attach/cli sources is
// silently testing OLD code (exactly the trap that let the ND-38 hang and the
// ND-40 race hide). Distinguish three states so the suite can react correctly:
//   - absent → clean `describe.skip` (fresh checkout, nothing built yet)
//   - stale  → loud failure (someone edited a source and forgot to rebuild)
//   - fresh  → run the real-binary suite for real
export function distFreshness(): DistFreshness {
  if (!existsSync(DIST_CLI)) {
    return {
      state: 'absent',
      reason: `dist not built (${DIST_CLI} missing) — run \`pnpm -F @relay/relay build\``,
    };
  }
  const serverRoot = join(import.meta.dirname, '..', '..');
  const newestSrc = newestMtime(['src/attach/**/*.ts', 'src/cli/**/*.ts'], serverRoot);
  const newestDist = newestMtime(['dist/attach/**/*.js', 'dist/cli/**/*.js'], serverRoot);
  if (newestSrc > newestDist) {
    return {
      state: 'stale',
      reason:
        'dist is STALE — a source under src/attach/ or src/cli/ is newer than the built dist. ' +
        'Run `pnpm -F @relay/relay build` (tsc -b --force) before the real-binary suite.',
    };
  }
  return { state: 'fresh', reason: 'dist is fresh' };
}

export async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 4000,
): Promise<void> {
  const start = Date.now();
  for (;;) {
    if (await predicate()) return;
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 20));
  }
}

/** Poll a client's rendered grid until `match` is satisfied, then return it. */
export async function waitForCapture(
  client: { capture: () => Promise<Capture> },
  match: (cap: Capture) => boolean,
  timeoutMs = 4000,
): Promise<Capture> {
  let last: Capture | undefined;
  await waitFor(async () => {
    last = await client.capture();
    return match(last);
  }, timeoutMs);
  return last as Capture;
}

/** Write a captured grid to .tui-artifacts/<name> so an agent can Read it. */
export function writeArtifact(name: string, capture: Capture, header = ''): void {
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  const banner = `# ${name}  (${String(capture.cols)}x${String(capture.rows)}, altScreen=${String(capture.altActive)})\n${header ? header + '\n' : ''}`;
  const ruler = '+' + '-'.repeat(Math.max(0, capture.cols)) + '+\n';
  const framed =
    ruler +
    capture.grid
      .split('\n')
      .map((l) => '|' + l.padEnd(capture.cols, ' ') + '|')
      .join('\n') +
    '\n' +
    ruler;
  writeFileSync(join(ARTIFACTS_DIR, name), banner + framed);
}
