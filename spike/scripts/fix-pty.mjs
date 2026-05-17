// Re-apply executable bit to node-pty's spawn-helper. pnpm's content-addressable
// hardlinks can drop the bit during install; until Phase 1 owns this fixup as
// part of @relay/relay install, the spike repairs it on demand.
//
// node-pty's spawn-helper only exists on macOS (per binding.gyp's
// `OS=="mac"` target). Linux uses an in-process code path and Windows uses
// conpty. So this script is a no-op on those platforms.
import { chmodSync, globSync } from 'node:fs';
import { resolve } from 'node:path';

if (process.platform !== 'darwin') {
  process.stdout.write(`[fix-pty] no-op on ${process.platform} — spawn-helper is macOS-only\n`);
  process.exit(0);
}

const sub = `prebuilds/${process.platform}-${process.arch}/spawn-helper`;
const candidates = [
  `../../node_modules/.pnpm/node-pty@*/node_modules/node-pty/${sub}`,
  `../node_modules/.pnpm/node-pty@*/node_modules/node-pty/${sub}`,
];
const here = import.meta.dirname;
const found = candidates.flatMap((p) =>
  globSync(p, { cwd: here }).map((rel) => resolve(here, rel)),
);

if (found.length === 0) {
  process.stderr.write(`[fix-pty] no spawn-helper found for ${process.platform}-${process.arch}\n`);
  process.exit(1);
}
for (const abs of found) {
  chmodSync(abs, 0o755);
  process.stdout.write(`[fix-pty] chmod +x ${abs}\n`);
}
