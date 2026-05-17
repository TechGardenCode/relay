import type { Persona } from '@relay/protocol';

export type PersonaSource = 'tenant' | 'project';

// What session/ consumes at spawn time. Carries the validated persona plus
// the provenance (which directory it came from) and absolute file path so
// downstream errors can name the offending file.
export interface PersonaInput {
  persona: Persona;
  source: PersonaSource;
  filePath: string;
}

// Mirrors the persona-yaml-check skill's violation taxonomy so operator UX
// can map runtime errors back to the same lint codes used at authoring time.
// `io_error` is the one runtime addition (the lint skill assumes the file is
// already readable).
export type PersonaLoadReason =
  | 'io_error'
  | 'parse_error'
  | 'missing_required'
  | 'unsupported_schema_version'
  | 'name_format'
  | 'name_stem_mismatch'
  | 'list_type'
  | 'model_type'
  | 'extra_fields';

export interface PersonaLoadError {
  filePath: string;
  source: PersonaSource;
  reason: PersonaLoadReason;
  detail: string;
}

// Per 09-persona-schema.md §4, per-file failures do not block startup —
// callers iterate `valid` and surface `invalid` (e.g. via REST or logs).
export interface PersonaLoadResult {
  valid: PersonaInput[];
  invalid: PersonaLoadError[];
}
