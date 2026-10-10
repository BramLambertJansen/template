import { existsSync } from 'node:fs';
import path from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import type { App } from './create-app.ts';
import { securityHeaders } from './security-headers.ts';

// Productieserver voor één origin (ADR 0018): /api gaat naar de API-app, de rest is de gebouwde SPA uit `vite build`
// (dist/web) met de headers uit security-headers.ts. Bestanden in /assets/ hebben een hash in de naam en mogen
// onbeperkt in de cache; index.html en andere bestanden nooit zonder controle. Een schermroute zonder bestand
// (bijv. /admin/accounts) krijgt index.html; de router in de browser neemt het over.

const IMMUTABLE = 'public, max-age=31536000, immutable';
const REVALIDATE = 'no-cache';

// Alleen een pad zonder extensie is een schermroute; een ontbrekend bestand (/oud.js) blijft 404.
function isScreenRoute(requestPath: string): boolean {
  return path.posix.extname(requestPath) === '';
}

export function createWebApp(api: App, webDir: string): App {
  const root = path.resolve(webDir);
  if (!existsSync(path.join(root, 'index.html'))) {
    throw new Error(`createWebApp: ${root}/index.html ontbreekt; draai eerst pnpm build`);
  }
  const headers = securityHeaders();
  const app = new Hono();

  app.all('/api', async (c) => api.fetch(c.req.raw));
  app.all('/api/*', async (c) => api.fetch(c.req.raw));
  app.use('*', async (c, next) => {
    await next();
    for (const [name, value] of Object.entries(headers)) c.header(name, value);
    if (c.res.ok) c.header('Cache-Control', c.req.path.startsWith('/assets/') ? IMMUTABLE : REVALIDATE);
  });
  app.get('/assets/*', serveStatic({ root }), (c) => c.notFound());
  app.get('*', serveStatic({ root }));
  app.get('*', async (c, next) => {
    if (!isScreenRoute(c.req.path)) return c.notFound();
    await next();
  });
  app.get('*', serveStatic({ root, path: 'index.html' }));
  return { fetch: async (request) => app.fetch(request) };
}
