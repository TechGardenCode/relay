import type { FastifyInstance, FastifyRequest } from 'fastify';

import type { Tenant, TenantListResponse } from '@relay/protocol';

import { tenants, type Database, type TenantRow } from '../../../store/index.js';
import { HttpProblemError } from '../http-error.js';

// Per prd/03-server.md §2: tenants are internal at MVP; the routes exist on
// the wire to keep the data model seam intact for Phase 4 multi-tenant. The
// singleton tenant is auto-created at boot by initServer() so `POST /tenants`
// is effectively idempotent into the singleton row.

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

  app.get(
    '/tenants/:id',
    async (req: FastifyRequest<{ Params: { id: string } }>): Promise<Tenant> => {
      const row = tenants.findById(opts.db, req.params.id);
      if (row === undefined) {
        throw new HttpProblemError({
          status: 404,
          typeSlug: 'tenant-not-found',
          title: 'Tenant not found',
          detail: `No tenant with id ${req.params.id}.`,
        });
      }
      return toWire(row);
    },
  );

  app.post('/tenants', async (_req, reply): Promise<Tenant> => {
    // MVP: there is only the singleton. Future Phase 4 work replaces this
    // with a Zod-validated body shape and a real tenants.insert call.
    const singleton = tenants.ensureSingleton(opts.db, Date.now());
    reply.status(201).header('Location', `/tenants/${singleton.id}`);
    return toWire(singleton);
  });
}
