// Shared primitives for the REST wire schemas. Timestamps are ISO-8601 strings
// per rest-conventions.md §6; the server converts from store-layer numeric
// epoch-ms at the boundary.

import { z } from 'zod';

export const IsoTimestampSchema = z.string().datetime({ offset: true });
export type IsoTimestamp = z.infer<typeof IsoTimestampSchema>;

// ULIDs are 26-character Crockford-Base32. Used for tenant / project /
// session ids. The store layer mints them; the wire treats them as opaque
// strings.
export const UlidSchema = z.string().length(26);
export type Ulid = z.infer<typeof UlidSchema>;
