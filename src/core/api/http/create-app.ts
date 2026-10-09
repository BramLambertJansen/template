import { Hono } from 'hono';

// Skelet: alleen de publieke health-route (framework §3, uitzondering). In roadmap stuk 3a krijgt createApp
// de RouteDef[] uit defineRoute en zet het CSRF, bodyLimit, secureHeaders en onError in vaste volgorde.
export function createApp() {
  return new Hono().basePath('/api').get('/health', (c) => c.json({ ok: true }));
}
