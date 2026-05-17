import BetterSqlite3 from 'better-sqlite3';
import { monotonicFactory } from 'ulid';

export type Database = BetterSqlite3.Database;

// Per D-12 + sqlite-schema.md §3: ULIDs are 26-char Crockford-Base32 TEXT.
// Monotonic factory guarantees lexicographic ordering even within the same millisecond.
export const ulid = monotonicFactory();

// MVP "single hidden tenant" model (prd/01-conceptual-model.md). A fixed ULID
// lets tenants.ensureSingleton use INSERT OR IGNORE for cross-process idempotency
// without coordinating an ID handshake.
export const SINGLETON_TENANT_ID = '01J0000000000000000TENANT0';

export interface OpenDatabaseOptions {
  filename: string;
}

export function openDatabase(opts: OpenDatabaseOptions): Database {
  const db = new BetterSqlite3(opts.filename);
  // Per sqlite-schema.md §5: FK enforcement requires this pragma per connection.
  db.pragma('foreign_keys = ON');
  // Per sqlite-schema.md §6.2 step 1: WAL on the configured connection.
  // No-op for :memory: databases.
  db.pragma('journal_mode = WAL');
  return db;
}
