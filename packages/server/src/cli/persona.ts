// `relay persona {list,create}` handlers. Per the ND-16 proposal both are
// filesystem-direct — `list` reads `~/.relay/personas/*.yaml` plus an
// optional project-local override directory; `create` writes a new YAML
// stub under `~/.relay/personas/` and opens it in `$EDITOR`.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';

import { PERSONA_NAME_REGEX } from '@relay/protocol';

import { personasDir, projectPersonasDir } from '../config/paths.js';
import { loadAll } from '../persona/index.js';
import type { PersonaSource } from '../persona/index.js';

export interface PersonaCliOptions {
  homeOverride?: string;
  /** Optional canonical project path; when supplied, project-level overrides win per D-09. */
  projectPath?: string;
}

export interface PersonaListRow {
  name: string;
  source: PersonaSource;
  description: string | undefined;
  filePath: string;
}

export interface PersonaListResult {
  rows: PersonaListRow[];
  errors: { filePath: string; reason: string }[];
}

export function runPersonaList(opts: PersonaCliOptions = {}): PersonaListResult {
  const result = loadAll({
    tenantDir: personasDir(opts.homeOverride),
    projectDir: opts.projectPath !== undefined ? projectPersonasDir(opts.projectPath) : undefined,
  });
  const rows: PersonaListRow[] = [];
  for (const [name, input] of result.personas) {
    rows.push({
      name,
      source: input.source,
      description: input.persona.description,
      filePath: input.filePath,
    });
  }
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return {
    rows,
    errors: result.errors.map((err) => ({ filePath: err.filePath, reason: err.reason })),
  };
}

export class PersonaCreateError extends Error {
  constructor(
    message: string,
    readonly code: 'invalid_name' | 'already_exists' | 'editor_failed',
  ) {
    super(message);
    this.name = 'PersonaCreateError';
  }
}

export interface PersonaCreateInput {
  name: string;
  // Test seam: when set, the spawned editor command is overridden (default $EDITOR or vi).
  editorOverride?: string;
  // Test seam: when true, skip the editor spawn — used by unit tests that just assert the stub was written.
  skipEditor?: boolean;
}

export async function runPersonaCreate(
  input: PersonaCreateInput,
  opts: PersonaCliOptions = {},
): Promise<{ filePath: string }> {
  if (!PERSONA_NAME_REGEX.test(input.name)) {
    throw new PersonaCreateError(
      `persona name '${input.name}' must be kebab-case (lowercase letters, digits, '-').`,
      'invalid_name',
    );
  }
  const dir = personasDir(opts.homeOverride);
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, `${input.name}.yaml`);
  if (existsSync(filePath)) {
    throw new PersonaCreateError(
      `persona '${input.name}' already exists at ${filePath}.`,
      'already_exists',
    );
  }
  // Per docs/prd/09-persona-schema.md §1: schemaVersion + name are required,
  // every other field is optional. The stub seeds the load-bearing fields and
  // leaves systemPrompt empty for the operator to fill in.
  const stub = [
    'schemaVersion: 1',
    `name: ${input.name}`,
    'description: ""',
    'systemPrompt: |',
    '  # Describe how this persona should behave.',
    '',
  ].join('\n');
  writeFileSync(filePath, stub, { mode: 0o600 });

  if (input.skipEditor === true) return { filePath };

  const editor = input.editorOverride ?? process.env['EDITOR'] ?? 'vi';
  await spawnEditor(editor, filePath);
  return { filePath };
}

function spawnEditor(editor: string, filePath: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(editor, [filePath], { stdio: 'inherit' });
    child.on('error', (err) => {
      reject(new PersonaCreateError(`failed to spawn editor: ${err.message}`, 'editor_failed'));
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else
        reject(
          new PersonaCreateError(
            `editor exited with code ${String(code ?? 'null')}`,
            'editor_failed',
          ),
        );
    });
  });
}
