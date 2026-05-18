import { promises as fsp } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Per ND-11: case-insensitive UUID v4 shape with .jsonl extension.
// Both conditions (extension AND UUID stem) must hold — Claude Code creates
// bare-UUID sidecar directories with the same stem, plus a `memory/`
// directory, in the same parent.
const UUID_JSONL_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jsonl$/i;

// Per ND-11 §4: tunables are hardcoded constants, not config/persona-overridable.
export const POLL_INTERVAL_MS = 250;
export const CAPTURE_TIMEOUT_MS = 30_000;

export interface CaptureOptions {
  canonicalProjectPath: string;
  // Test seam: override the homedir() lookup so the poll targets a tmp dir.
  homeOverride?: string;
  // Test seam: shorten the polling cadence + total timeout for fast assertions.
  intervalMs?: number;
  timeoutMs?: number;
  // Optional abort plumbing for the registry.shutdown() path.
  signal?: AbortSignal;
}

// Per ND-11 + persona-application.md §4.3: Claude Code's project sessions
// directory at ~/.claude/projects/<encodedPath>/, where encodedPath replaces
// every '/' with '-' (including the leading '/'). The encoding rule is
// convention, not a documented contract — verified empirically on 2026-05-17
// against a host running Claude Code. Spaces (untested in the empirical
// sample) pass through textually.
export function encodeClaudeProjectPath(canonicalProjectPath: string): string {
  return canonicalProjectPath.replaceAll('/', '-');
}

export function claudeProjectDir(canonicalProjectPath: string, homeOverride?: string): string {
  const home = homeOverride ?? homedir();
  return join(home, '.claude', 'projects', encodeClaudeProjectPath(canonicalProjectPath));
}

async function listMatchingNames(dir: string): Promise<Set<string>> {
  try {
    const entries = await fsp.readdir(dir);
    const out = new Set<string>();
    for (const e of entries) {
      if (UUID_JSONL_REGEX.test(e)) out.add(e);
    }
    return out;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return new Set();
    throw err;
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      resolve();
    }, ms);
    // Don't keep the event loop alive on the poll alone.
    timer.unref();
    if (signal !== undefined) {
      const onAbort = (): void => {
        clearTimeout(timer);
        resolve();
      };
      if (signal.aborted) {
        onAbort();
      } else {
        signal.addEventListener('abort', onAbort, { once: true });
      }
    }
  });
}

// Per ND-11: pre-snapshot the .jsonl filenames in the project dir before the
// caller spawns the agent, then poll until a new matching entry appears (the
// first such entry's UUID stem is the capture target), or until the timeout
// expires (returns null — non-fatal).
//
// Usage by session/registry.ts:
//   void captureAgentSessionId({ canonicalProjectPath, homeOverride })
//     .then((id) => { if (id !== null) sessions.updateAgentSessionId(...); });
// — fire-and-forget. NULL on the column is a valid terminal state; the WS
// `hello` frame omits the field entirely per ws-protocol.md §2.3.
export async function captureAgentSessionId(opts: CaptureOptions): Promise<string | null> {
  const intervalMs = opts.intervalMs ?? POLL_INTERVAL_MS;
  const timeoutMs = opts.timeoutMs ?? CAPTURE_TIMEOUT_MS;
  const dir = claudeProjectDir(opts.canonicalProjectPath, opts.homeOverride);
  const baseline = await listMatchingNames(dir);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (opts.signal?.aborted === true) return null;
    const current = await listMatchingNames(dir);
    for (const name of current) {
      if (!baseline.has(name)) {
        // Strip the .jsonl suffix to get the UUID stem.
        return name.slice(0, -'.jsonl'.length);
      }
    }
    await sleep(intervalMs, opts.signal);
  }
  return null;
}
