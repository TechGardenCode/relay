import type { FastifyInstance } from 'fastify';

import type { Tenant, TenantListResponse } from '@techgardencode/protocol';

import { tenants, type Database, type TenantRow } from '../../../store/index.js';

// Per prd/03-server.md §2: tenants are internal at MVP. `GET /tenants` and
// `GET /tenants/self` back the relay doctor probe and extension pairing; the
// singleton tenant is auto-created at boot by initServer().

export interface TenantsRoutesOptions {
  db: Database;
}

function toWire(row: TenantRow): Tenant {
  return {
    id: row.id,
    createdAt: new Date(row.createdAt).toISOString(),
  };
}

export async function registerTenantsRoutes(
  app: FastifyInstance,
  opts: TenantsRoutesOptions,
): Promise<void> {
  app.get('/tenants', async (): Promise<TenantListResponse> => {
    // The MVP singleton lookup; multi-tenant Phase 4 swaps in a real listing.
    const singleton = tenants.ensureSingleton(opts.db, Date.now());
    return { items: [toWire(singleton)] };
  });

  app.get('/tenants/self', async (): Promise<Tenant> => {
    const singleton = tenants.ensureSingleton(opts.db, Date.now());
    return toWire(singleton);
  });
}
