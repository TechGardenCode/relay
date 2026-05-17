import { composeByName } from './compose.js';
import { loadPersonasFromDirectory } from './loader.js';
import type { PersonaInput, PersonaLoadError } from './types.js';

export { composeByName } from './compose.js';
export { loadPersonasFromDirectory } from './loader.js';
export { validatePersona, type ValidateResult } from './validator.js';
export type {
  PersonaInput,
  PersonaLoadError,
  PersonaLoadReason,
  PersonaLoadResult,
  PersonaSource,
} from './types.js';

export interface LoadAllOptions {
  tenantDir: string;
  projectDir?: string;
}

export interface LoadAllResult {
  personas: Map<string, PersonaInput>;
  errors: PersonaLoadError[];
}

// One-shot helper for session/ and the REST list endpoint: read both
// directories (tenant always, project when supplied), compose by name, return
// both the resolved map and the aggregate per-file error list. Per
// 09-persona-schema.md §4, errors never block — callers log / surface and
// move on.
//
// Per ND-08, populated `skills:` lists on the resolved PersonaInput are
// advisory at MVP — they pass through to session/ unenforced. Re-evaluate when
// Claude Code exposes a skill-subset primitive.
export function loadAll(opts: LoadAllOptions): LoadAllResult {
  const tenant = loadPersonasFromDirectory(opts.tenantDir, 'tenant');
  const project =
    opts.projectDir !== undefined
      ? loadPersonasFromDirectory(opts.projectDir, 'project')
      : { valid: [], invalid: [] };
  const personas = composeByName(tenant.valid, project.valid);
  const errors = [...tenant.invalid, ...project.invalid];
  return { personas, errors };
}
