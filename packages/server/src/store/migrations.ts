import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Database } from './db.js';

const FILENAME_REGEX = /^([0-9]{4})_([a-z][a-z0-9_]*)\.sql$/;

export type MigrationErrorCode = 'ahead' | 'gap' | 'duplicate' | 'bad_filename' | 'sql_error';

export interface MigrationErrorDetails {
  file?: string;
  missingVersion?: number;
  duplicateVersion?: number;
  dbVersion?: number;
  maxFileVersion?: number;
}

export class MigrationError extends Error {
  readonly code: MigrationErrorCode;
  readonly file?: string;
  readonly missingVersion?: number;
  readonly duplicateVersion?: number;
  readonly dbVersion?: number;
  readonly maxFileVersion?: number;

  constructor(
    code: MigrationErrorCode,
    message: string,
    details: MigrationErrorDetails = {},
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'MigrationError';
    this.code = code;
    this.file = details.file;
    this.missingVersion = details.missingVersion;
    this.duplicateVersion = details.duplicateVersion;
    this.dbVersion = details.dbVersion;
    this.maxFileVersion = details.maxFileVersion;
  }
}

export interface MigrationApplied {
  version: number;
  name: string;
}

export interface RunMigrationsResult {
  applied: MigrationApplied[];
  currentVersion: number;
}

interface ParsedFile {
  version: number;
  name: string;
  filename: string;
  path: string;
}

function parseMigrationsDir(migrationsDir: string): ParsedFile[] {
  let entries: string[];
  try {
    entries = readdirSync(migrationsDir);
  } catch {
    // Missing dir is treated as zero migrations — runner becomes a no-op
    // after schema_versions creation.
    return [];
  }

  const files: ParsedFile[] = [];
  for (const filename of entries) {
    if (!filename.endsWith('.sql')) continue;
    const match = FILENAME_REGEX.exec(filename);
    if (!match) {
      // Per sqlite-schema.md §6.1, filenames that don't match the convention
      // are a corrupted-dir signal.
      throw new MigrationError(
        'bad_filename',
        `Migration filename does not match NNNN_short_description.sql convention: ${filename}`,
        { file: filename },
      );
    }
    const versionStr = match[1];
    const name = match[2];
    if (versionStr === undefined || name === undefined) {
      throw new MigrationError('bad_filename', `Failed to parse migration filename: ${filename}`, {
        file: filename,
      });
    }
    files.push({
      version: Number.parseInt(versionStr, 10),
      name,
      filename,
      path: join(migrationsDir, filename),
    });
  }

  files.sort((a, b) => a.version - b.version);

  // Per sqlite-schema.md §6.2 step 4: reject duplicates and gaps.
  const seen = new Set<number>();
  for (const f of files) {
    if (seen.has(f.version)) {
      throw new MigrationError(
        'duplicate',
        `Duplicate migration version ${f.version} (file ${f.filename})`,
        { file: f.filename, duplicateVersion: f.version },
      );
    }
    seen.add(f.version);
  }
  for (let i = 0; i < files.length; i++) {
    const expected = i + 1;
    const file = files[i];
    if (file === undefined) continue;
    if (file.version !== expected) {
      throw new MigrationError(
        'gap',
        `Migration sequence has a gap at version ${expected} (next file is ${file.filename})`,
        { file: file.filename, missingVersion: expected },
      );
    }
  }

  return files;
}

export function runMigrations(db: Database, migrationsDir: string): RunMigrationsResult {
  // Per sqlite-schema.md §6.2 step 2: schema_versions creation is the only DDL
  // the runner emits outside of migration files.
  db.exec(
    `CREATE TABLE IF NOT EXISTS schema_versions (
       version    INTEGER PRIMARY KEY,
       name       TEXT NOT NULL,
       applied_at INTEGER NOT NULL
     ) STRICT;`,
  );

  const currentRow = db
    .prepare<[], { v: number | null }>('SELECT MAX(version) AS v FROM schema_versions')
    .get();
  const current = currentRow?.v ?? 0;

  const files = parseMigrationsDir(migrationsDir);
  const maxFileVersion = files.length === 0 ? 0 : (files.at(-1)?.version ?? 0);

  // 6A-specific guard: if the database is ahead of the on-disk files, the
  // operator has likely downgraded the binary. Refuse boot rather than
  // silently skip past migrations we no longer have source for.
  if (current > maxFileVersion) {
    throw new MigrationError(
      'ahead',
      `Database is at version ${current}, but the highest migration file on disk is ${maxFileVersion}. ` +
        `Downgrade detected — refuse boot per build-plan 6A.`,
      { dbVersion: current, maxFileVersion },
    );
  }

  const applied: MigrationApplied[] = [];
  for (const file of files) {
    if (file.version <= current) continue;

    const body = readFileSync(file.path, 'utf8');
    try {
      // Per sqlite-schema.md §6.2 step 5: runner-owned transaction. The
      // migration's own INSERT INTO schema_versions (...) footer rides
      // inside the same transaction so a partial apply cannot persist a
      // version row.
      db.transaction(() => {
        db.exec(body);
      })();
    } catch (cause) {
      throw new MigrationError(
        'sql_error',
        `Migration ${file.filename} failed to apply: ${cause instanceof Error ? cause.message : String(cause)}`,
        { file: file.filename },
        { cause },
      );
    }

    applied.push({ version: file.version, name: file.name });
  }

  return { applied, currentVersion: maxFileVersion };
}
