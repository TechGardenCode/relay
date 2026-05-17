import type { PersonaInput } from './types.js';

// Per D-09 §3, the project file fully replaces the tenant file by name — no
// per-field merging. Implemented as `Map.set` keyed on persona name: tenant
// entries are inserted first, project entries overwrite by name. Iteration
// order is therefore "tenant-only first, then project-overridden / project-only"
// which is what the REST list endpoint (6F) wants for a stable, scannable
// response shape.
export function composeByName(
  tenant: readonly PersonaInput[],
  project: readonly PersonaInput[] = [],
): Map<string, PersonaInput> {
  const composed = new Map<string, PersonaInput>();
  for (const entry of tenant) {
    composed.set(entry.persona.name, entry);
  }
  for (const entry of project) {
    composed.set(entry.persona.name, entry);
  }
  return composed;
}
