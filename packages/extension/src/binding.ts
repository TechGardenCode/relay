// Per-root marker reader + writer. ND-07 is the source of truth for the
// schema; this module enforces strict-parse with refuse-to-bind on unknown
// schemaVersion.
//
// The local Zod schema here does NOT import from @relay/protocol because the
// marker is workspace-filesystem state, not a wire surface. Keeping it local
// also keeps the @relay/protocol surface minimal (no consumer outside the
// extension reads project.json over the wire).

import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';

import { z } from 'zod';
import * as vscode from 'vscode';

export const MARKER_DIRNAME = '.relay';
export const MARKER_FILENAME = 'project.json';
export const MARKER_RELATIVE_PATH = `${MARKER_DIRNAME}/${MARKER_FILENAME}`;

// Per ND-07: schemaVersion + projectId required; serverUrl + displayName
// optional. Strict mode rejects unknown fields at the *known* schemaVersion
// (rule 6: "unrecognized fields at the current schemaVersion … Ignored").
// We use passthrough so the strict-rejection isn't a parse failure — the
// ignored-fields rule means future v1-compatible writers can add fields and
// older readers still bind.
export const MarkerSchemaV1 = z
  .object({
    schemaVersion: z.literal(1),
    projectId: z.string().min(1),
    serverUrl: z.string().url().optional(),
    displayName: z.string().optional(),
  })
  .passthrough();

export type MarkerV1 = z.infer<typeof MarkerSchemaV1>;

export type MarkerReadResult =
  | { kind: 'ok'; marker: MarkerV1 }
  | { kind: 'missing' }
  // Per ND-07 rule 5: refuse-to-bind on unknown schemaVersion. The discovery
  // surface renders the "upgrade your Relay extension" notification.
  | { kind: 'unsupported-version'; foundVersion: number }
  | { kind: 'malformed'; reason: string };

function markerPath(rootPath: string): string {
  return join(rootPath, MARKER_DIRNAME, MARKER_FILENAME);
}

export async function readMarker(root: vscode.WorkspaceFolder): Promise<MarkerReadResult> {
  const path = markerPath(root.uri.fsPath);
  let raw: string;
  try {
    raw = await fs.readFile(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { kind: 'missing' };
    return { kind: 'malformed', reason: (err as Error).message };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return { kind: 'malformed', reason: `JSON parse failed: ${(err as Error).message}` };
  }
  if (typeof parsed === 'object' && parsed !== null) {
    const sv = (parsed as { schemaVersion?: unknown }).schemaVersion;
    // Per ND-07 rule 5: explicit unsupported-version branch BEFORE the strict
    // parse so a v2 marker surfaces a clear "upgrade" notice rather than a
    // generic "malformed" one.
    if (typeof sv === 'number' && sv !== 1) {
      return { kind: 'unsupported-version', foundVersion: sv };
    }
  }
  const result = MarkerSchemaV1.safeParse(parsed);
  if (!result.success) {
    return { kind: 'malformed', reason: result.error.message };
  }
  return { kind: 'ok', marker: result.data };
}

// Per ND-07 rule 4: gitignore the marker by default. POST /projects already
// does this server-side; this function exists for the "bind to existing"
// branch where the extension writes the marker itself (the server isn't
// asked to create a project).
export async function writeMarker(root: vscode.WorkspaceFolder, marker: MarkerV1): Promise<void> {
  const path = markerPath(root.uri.fsPath);
  await fs.mkdir(dirname(path), { recursive: true });
  await fs.writeFile(path, JSON.stringify(marker, null, 2) + '\n');
  await appendToGitignore(root.uri.fsPath);
}

async function appendToGitignore(rootPath: string): Promise<void> {
  const gitignorePath = join(rootPath, '.gitignore');
  let existing = '';
  try {
    existing = await fs.readFile(gitignorePath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
  const lines = existing.split('\n').map((l) => l.trim());
  if (lines.includes(MARKER_RELATIVE_PATH) || lines.includes(`/${MARKER_RELATIVE_PATH}`)) {
    return;
  }
  const needsLeadingNewline = existing.length > 0 && !existing.endsWith('\n');
  await fs.appendFile(gitignorePath, `${needsLeadingNewline ? '\n' : ''}${MARKER_RELATIVE_PATH}\n`);
}
