// Per D-19: co-located *.test.ts are compiled by `tsc -b` (so tests are
// typechecked) but must NOT ship in the published tarball. `files: ["dist"]`
// includes dist unconditionally (npm ignores .npmignore for a bare-dir allowlist
// entry), so we strip the compiled test artifacts at prepack time instead.
import { globSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const distDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const matches = globSync('**/*.test.{js,d.ts,js.map,d.ts.map}', { cwd: distDir });
for (const rel of matches) rmSync(join(distDir, rel));
process.stdout.write(`[strip-dist-tests] removed ${matches.length} compiled test artifact(s)\n`);
