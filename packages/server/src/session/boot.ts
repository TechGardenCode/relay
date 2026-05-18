import { sessions, type Database } from '../store/index.js';

// Per D-11: at server boot, every `running` session row is unconditionally
// transitioned to `killed` with terminated_reason = 'server_restart'. The
// type signature on sessions.markRunningAsKilled enforces that this is the
// ONLY code path that writes that string value — any other writer would have
// to launder the literal past the type system.
//
// Phase 0 spike (phase-0-report.md §2) caught the dual-writer bug: the spike's
// pty.onExit listener stamped 'agent_exit' during shutdown before the server
// died, leaving zero `running` rows for the boot sweep to flip. The fix is
// registry-side discipline (the `shuttingDown` flag in registry.ts); this
// function is just the SQL primitive.
export function bootOrphanSweep(db: Database, now: number = Date.now()): { affected: number } {
  return sessions.markRunningAsKilled(db, 'server_restart', now);
}
