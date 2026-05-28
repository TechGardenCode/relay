import { afterEach, describe, expect, it } from 'vitest';

import { spawnHelperReady } from './spawn-helper-ready.js';
import {
  bootHarnessServer,
  spawnHarnessClient,
  waitForCapture,
  writeArtifact,
  type HarnessServer,
} from './tui-harness.js';

const helper = spawnHelperReady();
const d = helper.ok ? describe : describe.skip;

let server: HarnessServer | undefined;
afterEach(async () => {
  await server?.cleanup();
  server = undefined;
});

d('tui-harness smoke', () => {
  it('boots a server, attaches a client, and renders the fixture frame', async () => {
    server = await bootHarnessServer();
    const client = await spawnHarnessClient(server, { cols: 40, rows: 10 });
    // The client viewport is 40x10, so once its resize lands the fixture
    // redraws to 40x10 and the label reads its own size.
    client.resize(40, 10);
    const cap = await waitForCapture(client, (c) => c.grid.includes('40x10') && c.altActive);
    writeArtifact('smoke-client.txt', cap, 'harness smoke: single 40x10 client');
    expect(cap.altActive).toBe(true);
    expect(cap.grid).toContain('[ 40x10 ]');
    // The frame border is drawn at the edges.
    expect(cap.grid.split('\n')[0]).toMatch(/^\+-+\+$/);
  }, 15000);
});
