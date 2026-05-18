// `relay attach <session-id>` — thin client. Wires the `attach/` module
// (WS client + TTY bridge) to the local terminal. Exits 0 on clean ^D
// detach, non-zero on session-not-found / auth-failure / network-loss
// per prd/03-server.md §7.

import { AttachClient, runTty, resolveAttachConfig } from '../attach/index.js';

export interface AttachRunOptions {
  sessionId: string;
  url?: string;
  token?: string;
  homeOverride?: string;
}

export async function runAttach(opts: AttachRunOptions): Promise<number> {
  const config = resolveAttachConfig({
    url: opts.url,
    token: opts.token,
    homeOverride: opts.homeOverride,
  });
  const client = new AttachClient({
    wsUrl: config.wsUrl,
    sessionId: opts.sessionId,
    token: config.token,
  });
  try {
    await client.connect();
  } catch (err) {
    process.stderr.write(`relay attach: ${(err as Error).message}\n`);
    return 2;
  }
  const { done } = runTty({
    client,
    stdin: process.stdin,
    stdout: process.stdout,
    stderr: process.stderr,
  });
  const code = await done;
  // ws-protocol.md §4.2: 1000 clean detach; 4401 token revoked; 4404 session
  // not found; 1008 policy violation (bad token at upgrade); 1011 server
  // error or missed pong.
  if (code === 1000) return 0;
  return 1;
}
