// Per prd/03-server.md §2 + §3 + §7 (CLI mirror). POST body matches the
// `relay project add <path> [--name <slug>]` shape; the response row matches
// the store-layer ProjectRow projected to camelCase ISO-timestamps.

import { z } from 'zod';

import { IsoTimestampSchema, UlidSchema } from './common.js';

// Kebab-case per prd/03-server.md §3 + 09-persona-schema.md naming precedent.
// Project slugs are unique per tenant and used in URLs / CLI affordances.
export const PROJECT_SLUG_REGEX = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

export const ProjectSchema = z
  .object({
    id: UlidSchema,
    tenantId: UlidSchema,
    slug: z.string().regex(PROJECT_SLUG_REGEX),
    displayName: z.string(),
    canonicalPath: z.string(),
    agentCli: z.string(),
    createdAt: IsoTimestampSchema,
    updatedAt: IsoTimestampSchema,
  })
  .strict();

export type Project = z.infer<typeof ProjectSchema>;

// `path` is the user-supplied directory; the server canonicalizes via realpath
// before the store INSERT (per D-12). `slug` overrides the auto-derived slug
// (basename, kebab-sanitized); `displayName` overrides the human label
// (defaults to basename). The CLI's `relay project add <path> [--name <slug>]`
// flag maps `--name` to `slug` per prd/03-server.md §7.
export const ProjectCreateRequestSchema = z
  .object({
    path: z.string().min(1),
    slug: z.string().regex(PROJECT_SLUG_REGEX).optional(),
    displayName: z.string().optional(),
    agentCli: z.string().optional(),
  })
  .strict();

export type ProjectCreateRequest = z.infer<typeof ProjectCreateRequestSchema>;

export const ProjectListResponseSchema = z
  .object({
    items: z.array(ProjectSchema),
  })
  .strict();

export type ProjectListResponse = z.infer<typeof ProjectListResponseSchema>;
