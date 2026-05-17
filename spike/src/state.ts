import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import type { SessionRecord } from './types.js';

export class SessionStateFile {
  private records = new Map<string, SessionRecord>();

  constructor(private readonly filePath: string) {}

  static resolvePath(stateDir: string, filename = 'state.json'): string {
    const expanded = stateDir.startsWith('~') ? join(homedir(), stateDir.slice(1)) : stateDir;
    return join(expanded, filename);
  }

  load(): void {
    try {
      const raw = readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as { sessions?: SessionRecord[] };
      this.records.clear();
      for (const rec of parsed.sessions ?? []) {
        this.records.set(rec.id, rec);
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') throw err;
      this.records.clear();
    }
  }

  // Per D-11: on boot, any session row with status=running is unconditionally
  // transitioned to killed with terminated_reason=server_restart.
  sweepOrphans(now = new Date().toISOString()): number {
    let swept = 0;
    for (const rec of this.records.values()) {
      if (rec.status === 'running') {
        rec.status = 'killed';
        rec.endedAt = now;
        rec.terminatedReason = 'server_restart';
        swept += 1;
      }
    }
    if (swept > 0) this.flush();
    return swept;
  }

  upsert(rec: SessionRecord): void {
    this.records.set(rec.id, { ...rec });
    this.flush();
  }

  get(id: string): SessionRecord | undefined {
    return this.records.get(id);
  }

  list(): SessionRecord[] {
    return [...this.records.values()].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  }

  private flush(): void {
    const dir = dirname(this.filePath);
    mkdirSync(dir, { recursive: true });
    const payload = JSON.stringify({ sessions: [...this.records.values()] }, null, 2);
    const tmp = `${this.filePath}.tmp`;
    writeFileSync(tmp, payload, 'utf8');
    renameSync(tmp, this.filePath);
  }
}
