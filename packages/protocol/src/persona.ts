// Per D-09 + docs/prd/09-persona-schema.md. This schema is the single source of
// truth for persona YAML field shapes; the runtime loader in
// packages/server/src/persona (build-plan 6C) wraps it, and the authoring-time
// linter in .claude/skills/persona-yaml-check enforces the same rules by hand.
//
// Strict mode rejects unknown top-level keys so typos surface as `extra_fields`
// failures rather than silent drops.

import { z } from 'zod';

export const PERSONA_NAME_REGEX = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

export const SUPPORTED_PERSONA_SCHEMA_VERSIONS = [1] as const;

export const PersonaSchema = z
  .object({
    schemaVersion: z
      .number()
      .int()
      .refine(
        (v): v is (typeof SUPPORTED_PERSONA_SCHEMA_VERSIONS)[number] =>
          (SUPPORTED_PERSONA_SCHEMA_VERSIONS as readonly number[]).includes(v),
        { error: 'unsupported_schema_version' },
      ),
    name: z.string().regex(PERSONA_NAME_REGEX, { error: 'name_format' }),
    description: z.string().optional(),
    systemPrompt: z.string().optional(),
    skills: z.array(z.string()).nullable().optional(),
    mcpServers: z.array(z.string()).nullable().optional(),
    model: z.string().optional(),
  })
  .strict();

export type Persona = z.infer<typeof PersonaSchema>;
