import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import { load as yamlLoad, YAMLException } from 'js-yaml';

import type { PersonaLoadResult, PersonaSource } from './types.js';
import { validatePersona } from './validator.js';

export function loadPersonasFromDirectory(dir: string, source: PersonaSource): PersonaLoadResult {
  const valid: PersonaLoadResult['valid'] = [];
  const invalid: PersonaLoadResult['invalid'] = [];

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch (err) {
    // A missing directory is the common case for project-scoped personas
    // (most projects ship no `.relay/personas/`). Return an empty result
    // rather than surfacing as an error.
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { valid, invalid };
    }
    throw err;
  }

  for (const entry of entries) {
    if (!entry.endsWith('.yaml')) continue;

    const filePath = join(dir, entry);
    const stem = basename(entry, '.yaml');

    let raw: string;
    try {
      raw = readFileSync(filePath, 'utf8');
    } catch (err) {
      invalid.push({
        filePath,
        source,
        reason: 'io_error',
        detail: (err as Error).message,
      });
      continue;
    }

    let parsed: unknown;
    try {
      parsed = yamlLoad(raw);
    } catch (err) {
      invalid.push({
        filePath,
        source,
        reason: 'parse_error',
        detail: err instanceof YAMLException ? err.message : String(err),
      });
      continue;
    }

    const result = validatePersona(parsed, stem);
    if (result.ok) {
      valid.push({ persona: result.persona, source, filePath });
    } else {
      invalid.push({
        filePath,
        source,
        reason: result.reason,
        detail: result.detail,
      });
    }
  }

  return { valid, invalid };
}
