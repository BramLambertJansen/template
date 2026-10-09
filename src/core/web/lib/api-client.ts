import { hc } from 'hono/client';
import type { Hono } from 'hono';

// Enige plek met fetch (via hc). Same-origin: Vite proxyt /api lokaal naar Hono.
// 401 → inloggen en foutcodes → ApiError volgen in roadmap stuk 3b.
export function createApiClient<T extends Hono>() {
  return hc<T>(globalThis.location.origin, { init: { credentials: 'same-origin' } });
}
