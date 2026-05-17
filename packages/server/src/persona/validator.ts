import { ZodError, type ZodIssue } from 'zod';

import { PersonaSchema, type Persona } from '@relay/protocol';

import type { PersonaLoadReason } from './types.js';

export type ValidateResult =
  | { ok: true; persona: Persona }
  | { ok: false; reason: PersonaLoadReason; detail: string };

export function validatePersona(parsed: unknown, filenameStem: string): ValidateResult {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return {
      ok: false,
      reason: 'parse_error',
      detail: 'YAML root is not a mapping',
    };
  }

  // Per D-09 §4 first bullet, required fields must be present. Checked before
  // Zod so we can distinguish "field missing" (missing_required) from "field
  // present but wrong type" (unsupported_schema_version / name_format etc.) —
  // Zod reports both as `invalid_type` and we want the more specific reason.
  const obj = parsed as Record<string, unknown>;
  if (obj.schemaVersion === undefined || obj.schemaVersion === null) {
    return {
      ok: false,
      reason: 'missing_required',
      detail: 'schemaVersion is required',
    };
  }
  if (obj.name === undefined || obj.name === null) {
    return {
      ok: false,
      reason: 'missing_required',
      detail: 'name is required',
    };
  }

  const result = PersonaSchema.safeParse(obj);
  if (!result.success) {
    return { ok: false, ...mapZodError(result.error) };
  }

  // Per D-09 §1, the filename stem is canonical. Enforced here rather than in
  // the Zod schema because the schema doesn't know about filenames.
  if (result.data.name !== filenameStem) {
    return {
      ok: false,
      reason: 'name_stem_mismatch',
      detail: `name "${result.data.name}" does not match filename stem "${filenameStem}"`,
    };
  }

  return { ok: true, persona: result.data };
}

interface MappedError {
  reason: PersonaLoadReason;
  detail: string;
}

function mapZodError(error: ZodError): MappedError {
  const issues = error.issues;
  const detail = issues.map(formatIssue).join('; ');

  // Priority order matches the persona-yaml-check rules: schemaVersion errors
  // beat name errors beat list-shape errors beat model-shape errors beat
  // extra-key errors. When multiple issues co-exist, the highest-priority
  // reason is reported; `detail` carries the full set.
  if (issues.some((i) => firstPath(i) === 'schemaVersion')) {
    return { reason: 'unsupported_schema_version', detail };
  }
  if (issues.some((i) => firstPath(i) === 'name')) {
    return { reason: 'name_format', detail };
  }
  if (issues.some((i) => firstPath(i) === 'skills' || firstPath(i) === 'mcpServers')) {
    return { reason: 'list_type', detail };
  }
  if (issues.some((i) => firstPath(i) === 'model')) {
    return { reason: 'model_type', detail };
  }
  if (issues.some((i) => i.code === 'unrecognized_keys')) {
    return { reason: 'extra_fields', detail };
  }
  return { reason: 'parse_error', detail };
}

function firstPath(issue: ZodIssue): unknown {
  return issue.path[0];
}

function formatIssue(issue: ZodIssue): string {
  const pathStr = issue.path.length > 0 ? issue.path.join('.') : '<root>';
  return `${pathStr}: ${issue.message}`;
}
