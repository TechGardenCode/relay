// Per prd/03-server.md §2. Tenants are internal-at-MVP — the routes exist on
// the wire to preserve the Phase 4 multi-tenant seam, but no Phase 1 client UX
// exposes them. The singleton tenant is auto-created by `relay init` /
// `initServer()`.

import { z } from 'zod';

import { IsoTimestampSchema, UlidSchema } from './common.js';

export const TenantSchema = z
  .object({
    id: UlidSchema,
    createdAt: IsoTimestampSchema,
  })
  .strict();

export type Tenant = z.infer<typeof TenantSchema>;

export const TenantListResponseSchema = z
  .object({
    items: z.array(TenantSchema),
  })
  .strict();

export type TenantListResponse = z.infer<typeof TenantListResponseSchema>;
