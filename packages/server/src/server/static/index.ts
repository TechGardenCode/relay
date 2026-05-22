// Per ND-36 + Track 8 spike: serve `packages/spike-pwa/` Angular build at
// `/app/*`. The bundle is public-by-design — only HTML/JS the browser
// fetches before pairing. Every authenticated surface the PWA touches
// (REST + WS) is gated by the auth preHandler in `rest/plugins/auth.ts`,
// which explicitly skips the `/app/*` prefix (and only that prefix).
//
// SPA fallback: any path under `/app/*` that does not match a built
// asset returns `index.html`, so Angular's HTML5 router can render deep
// links after a page reload.
//
// If the dist directory is missing (developer hasn't run
// `pnpm --filter @relay/spike-pwa build`), this module logs and skips —
// the server still boots and REST + WS work normally; only `/app/*`
// returns 404. This keeps the spike disposable: deleting
// `packages/spike-pwa/` doesn't break `buildServer`.

import { existsSync } from 'node:fs';

import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';

export interface StaticPluginOptions {
  // Absolute path to the spike-pwa build output (typically resolved by
  // the caller via `import.meta.url` so the server finds it regardless
  // of CWD). Pass `undefined` to skip registration outright — useful in
  // tests that don't exercise the static surface.
  spikePwaDist: string | undefined;
}

export async function registerStatic(
  app: FastifyInstance,
  opts: StaticPluginOptions,
): Promise<void> {
  if (opts.spikePwaDist === undefined) return;
  if (!existsSync(opts.spikePwaDist)) {
    app.log.warn(
      { spikePwaDist: opts.spikePwaDist },
      'spike-pwa dist directory not found; /app/* will 404. Run `pnpm --filter @relay/spike-pwa build`.',
    );
    return;
  }
  const dist = opts.spikePwaDist;
  // Encapsulate inside a child context so `setNotFoundHandler` is scoped
  // to `/app/*` rather than overriding the server-wide 404 mapper. The
  // child also inherits the auth preHandler from the parent — but the
  // preHandler's first action is to skip `/app/*`, so the inherited hook
  // is a no-op for these routes (intentional, see ND-36).
  await app.register(
    async (child) => {
      await child.register(fastifyStatic, {
        root: dist,
      });
      child.setNotFoundHandler(async (_req, reply) => {
        return reply.type('text/html').sendFile('index.html');
      });
    },
    { prefix: '/app' },
  );
}
