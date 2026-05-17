import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { resolve } from 'node:path';

import { spawn as ptySpawn, type IPty } from 'node-pty';
import { WebSocketServer, type WebSocket } from 'ws';

import { ByteRingBuffer } from './ring-buffer.js';
import { SessionStateFile } from './state.js';
import type {
  ClientFrame,
  HelloFrame,
  SessionEndedFrame,
  SessionRecord,
  SpikeConfig,
} from './types.js';

interface LiveSession {
  record: SessionRecord;
  pty: IPty;
  ring: ByteRingBuffer;
  clients: Set<WebSocket>;
}

const STREAM_PATH = /^\/sessions\/([A-Za-z0-9_-]+)\/stream$/;

// Per D-11: boot sweep is the source of truth for terminatedReason on restart.
// Shutdown handler sets this so pty.onExit skips the state update — state file
// stays `running`, next boot's sweep flips to killed/server_restart.
let shuttingDown = false;

function loadConfig(path: string): SpikeConfig {
  const raw = readFileSync(path, 'utf8');
  return JSON.parse(raw) as SpikeConfig;
}

function extractBearer(req: IncomingMessage): string | undefined {
  const header = req.headers['authorization'];
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    return header.slice('Bearer '.length).trim();
  }
  const url = new URL(req.url ?? '/', 'http://placeholder');
  const tokenParam = url.searchParams.get('token');
  return tokenParam ?? undefined;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function sendControl(ws: WebSocket, frame: HelloFrame | SessionEndedFrame): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(frame));
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function spawnSession(config: SpikeConfig, state: SessionStateFile): LiveSession {
  const id = randomUUID();
  const pty = ptySpawn(config.spawnCommand, config.spawnArgs, {
    name: 'xterm-256color',
    cols: 120,
    rows: 32,
    cwd: process.cwd(),
    env: { ...process.env } as Record<string, string>,
  });
  const ring = new ByteRingBuffer(config.replayBufferBytes);
  const record: SessionRecord = {
    id,
    status: 'running',
    spawnCommand: config.spawnCommand,
    spawnArgs: [...config.spawnArgs],
    startedAt: new Date().toISOString(),
  };
  state.upsert(record);
  const session: LiveSession = { record, pty, ring, clients: new Set() };

  pty.onData((chunk) => {
    const buf = Buffer.from(chunk, 'utf8');
    ring.push(buf);
    for (const ws of session.clients) {
      if (ws.readyState === ws.OPEN) ws.send(buf, { binary: true });
    }
  });

  pty.onExit(({ exitCode, signal }) => {
    if (shuttingDown) return; // D-11 — leave state as `running` for the boot sweep to flip.
    const ended = new Date().toISOString();
    record.status = 'killed';
    record.endedAt = ended;
    record.terminatedReason = 'agent_exit';
    state.upsert(record);
    const frame: SessionEndedFrame = { type: 'session_ended', reason: 'agent_exit' };
    for (const ws of session.clients) {
      sendControl(ws, frame);
      ws.close(1000, `exit=${exitCode ?? 'signal-' + (signal ?? 'unknown')}`);
    }
    session.clients.clear();
  });

  return session;
}

function attachClient(ws: WebSocket, session: LiveSession, config: SpikeConfig): void {
  session.clients.add(ws);
  const hello: HelloFrame = {
    type: 'hello',
    sessionId: session.record.id,
    status: session.record.status,
    replayBufferBytes: config.replayBufferBytes,
  };
  sendControl(ws, hello);

  const replay = session.ring.snapshot();
  if (replay.length > 0) ws.send(replay, { binary: true });

  ws.on('message', (raw, isBinary) => {
    if (isBinary) {
      // Phase 0 accepts binary input as a fallback path; write directly to PTY.
      session.pty.write((raw as Buffer).toString('utf8'));
      return;
    }
    let frame: ClientFrame;
    try {
      frame = JSON.parse((raw as Buffer).toString('utf8')) as ClientFrame;
    } catch {
      ws.send(JSON.stringify({ type: 'error', code: 'bad_frame', message: 'invalid JSON' }));
      return;
    }
    if (frame.type === 'send') {
      const bytes = Buffer.from(frame.data, 'base64');
      session.pty.write(bytes.toString('utf8'));
    } else if (frame.type === 'resize') {
      const cols = Math.max(1, Math.floor(frame.cols));
      const rows = Math.max(1, Math.floor(frame.rows));
      session.pty.resize(cols, rows);
    } else {
      ws.send(
        JSON.stringify({ type: 'error', code: 'unknown_type', message: 'unknown frame type' }),
      );
    }
  });

  ws.on('close', () => {
    session.clients.delete(ws);
  });
}

function main(): void {
  const configPath = resolve(process.argv[2] ?? 'config.json');
  const config = loadConfig(configPath);
  const statePath = SessionStateFile.resolvePath(config.stateDir);
  const state = new SessionStateFile(statePath);
  state.load();
  const swept = state.sweepOrphans();
  if (swept > 0) {
    process.stdout.write(`[spike] D-11 boot sweep: ${swept} orphan(s) marked killed\n`);
  }

  const live = new Map<string, LiveSession>();

  const httpServer = createServer(async (req, res) => {
    try {
      const token = extractBearer(req);
      if (token !== config.bearerToken) {
        sendJson(res, 401, { error: 'unauthorized' });
        return;
      }

      const url = new URL(req.url ?? '/', 'http://placeholder');

      if (req.method === 'POST' && url.pathname === '/sessions') {
        await readJsonBody(req).catch(() => ({}));
        const session = spawnSession(config, state);
        live.set(session.record.id, session);
        sendJson(res, 201, { sessionId: session.record.id });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/sessions') {
        sendJson(res, 200, { sessions: state.list() });
        return;
      }

      const streamMatch = STREAM_PATH.exec(url.pathname);
      if (req.method === 'GET' && streamMatch) {
        sendJson(res, 426, { error: 'upgrade_required' });
        return;
      }

      sendJson(res, 404, { error: 'not_found' });
    } catch (err) {
      sendJson(res, 500, { error: 'internal', message: (err as Error).message });
    }
  });

  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    const token = extractBearer(req);
    if (token !== config.bearerToken) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    const url = new URL(req.url ?? '/', 'http://placeholder');
    const match = STREAM_PATH.exec(url.pathname);
    if (!match) {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }
    const sessionId = match[1]!;
    const session = live.get(sessionId);
    if (!session) {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      attachClient(ws, session, config);
    });
  });

  httpServer.listen(config.port, config.host, () => {
    process.stdout.write(
      `[spike] listening on http://${config.host}:${config.port} (token gate on)\n`,
    );
    process.stdout.write(`[spike] state file: ${statePath}\n`);
    process.stdout.write(
      `[spike] spawn target: ${config.spawnCommand} ${config.spawnArgs.join(' ')}\n`,
    );
  });

  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    process.stdout.write(`\n[spike] ${signal} received — closing\n`);
    for (const session of live.values()) {
      try {
        session.pty.kill();
      } catch {
        // ignore
      }
    }
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 2000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main();
