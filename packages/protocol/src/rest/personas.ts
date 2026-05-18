// Per prd/03-server.md §2 + 09-persona-schema.md (D-09). The persona resource
// on the REST surface is the persona YAML body plus provenance: which
// directory it was loaded from and the absolute on-disk path.
//
// Identity on the wire is the persona `name` (kebab-case, matches the
// filename stem per D-09). Routes use it as `:id`.

import { z } from 'zod';

import { PersonaSchema } from '../persona.js';

export const PersonaSourceSchema = z.enum(['tenant', 'project']);
export type PersonaSource = z.infer<typeof PersonaSourceSchema>;

// The Zod merge here is intentional: every field of PersonaSchema (the
// YAML shape) flows through, with `source` and `filePath` added.
export const PersonaResourceSchema = PersonaSchema.extend({
  source: PersonaSourceSchema,
  filePath: z.string(),
}).strict();

export type PersonaResource = z.infer<typeof PersonaResourceSchema>;

// POST /personas — body is the persona YAML (PersonaSchema). The server
// writes ~/.relay/personas/<name>.yaml. The `name` field is the source of
// truth for the filename; mismatch is a 422 (per D-09).
export const PersonaCreateRequestSchema = PersonaSchema;
export type PersonaCreateRequest = z.infer<typeof PersonaCreateRequestSchema>;

// PATCH /personas/:id — partial update. `name` must match the URL `:id` if
// supplied. Server rewrites the YAML file with the merged content.
export const PersonaUpdateRequestSchema = PersonaSchema.partial().strict();
export type PersonaUpdateRequest = z.infer<typeof PersonaUpdateRequestSchema>;

// Per 09-persona-schema.md §4, per-file load failures do not block the
// listing — the server returns successful personas in `items` and surfaces
// invalid files in `errors[]` for the operator to act on.
export const PersonaLoadReasonSchema = z.enum([
  'io_error',
  'parse_error',
  'missing_required',
  'unsupported_schema_version',
  'name_format',
  'name_stem_mismatch',
  'list_type',
  'model_type',
  'extra_fields',
]);
export type PersonaLoadReason = z.infer<typeof PersonaLoadReasonSchema>;

export const PersonaLoadErrorSchema = z
  .object({
    filePath: z.string(),
    source: PersonaSourceSchema,
    reason: PersonaLoadReasonSchema,
    detail: z.string(),
  })
  .strict();
export type PersonaLoadError = z.infer<typeof PersonaLoadErrorSchema>;

export const PersonaListResponseSchema = z
  .object({
    items: z.array(PersonaResourceSchema),
    errors: z.array(PersonaLoadErrorSchema),
  })
  .strict();
export type PersonaListResponse = z.infer<typeof PersonaListResponseSchema>;
