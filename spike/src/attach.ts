import WebSocket from 'ws';

import type { ResizeFrame, SendFrame } from './types.js';

const DETACH_BYTE = 0x04; // Ctrl-D — matches the relay attach contract in prd/03-server.md §7.

function parseArgs(argv: string[]): { url: string; token: string; sessionId: string } {
  const [hostport, token, sessionId] = argv;
  if (!hostport || !token || !sessionId) {
    process.stderr.write('usage: tsx src/attach.ts <host:port> <bearer-token> <session-id>\n');
    process.exit(2);
  }
  const url = `ws://${hostport}/sessions/${sessionId}/stream`;
  return { url, token, sessionId };
}

function main(): void {
  const { url, token, sessionId } = parseArgs(process.argv.slice(2));
  const ws = new WebSocket(url, { headers: { Authorization: `Bearer ${token}` } });
  let detaching = false;

  const restoreTty = (): void => {
    if (process.stdin.isTTY && process.stdin.setRawMode) {
      try {
        process.stdin.setRawMode(false);
      } catch {
        // ignore
      }
    }
    process.stdin.pause();
  };

  const detach = (code: number, reason: string): void => {
    if (detaching) return;
    detaching = true;
    restoreTty();
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close(1000, reason);
    }
    process.stderr.write(`\n[attach] ${reason}\n`);
    setTimeout(() => process.exit(code), 100).unref();
  };

  ws.on('open', () => {
    process.stderr.write(`[attach] connected to ${url} (session ${sessionId})\n`);
    process.stderr.write('[attach] press Ctrl-D to detach\n');
    if (process.stdin.isTTY && process.stdin.setRawMode) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    if (process.stdout.isTTY) {
      const sendResize = (): void => {
        const cols = process.stdout.columns ?? 120;
        const rows = process.stdout.rows ?? 32;
        const frame: ResizeFrame = { type: 'resize', cols, rows };
        ws.send(JSON.stringify(frame));
      };
      sendResize();
      process.stdout.on('resize', sendResize);
    }
  });

  ws.on('message', (raw, isBinary) => {
    if (isBinary) {
      process.stdout.write(raw as Buffer);
      return;
    }
    const text = (raw as Buffer).toString('utf8');
    try {
      const frame = JSON.parse(text) as { type?: string; reason?: string };
      if (frame.type === 'hello') {
        // first control frame — already announced on open
      } else if (frame.type === 'session_ended') {
        detach(0, `session ended (${frame.reason ?? 'unknown'})`);
      } else if (frame.type === 'error') {
        process.stderr.write(`[attach] server error: ${text}\n`);
      }
    } catch {
      process.stderr.write(`[attach] non-JSON text frame: ${text}\n`);
    }
  });

  process.stdin.on('data', (chunk) => {
    if (chunk.includes(DETACH_BYTE)) {
      detach(0, 'detached by Ctrl-D');
      return;
    }
    const frame: SendFrame = { type: 'send', data: chunk.toString('base64') };
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(frame));
  });

  ws.on('close', (code, reason) => {
    detach(0, `socket closed (${code}) ${reason.toString()}`);
  });
  ws.on('error', (err) => {
    detach(1, `socket error: ${err.message}`);
  });
}

main();
