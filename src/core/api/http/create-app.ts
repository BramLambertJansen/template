import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { requestId } from 'hono/request-id';
import { secureHeaders } from 'hono/secure-headers';
import type { CoreErrorCode, ErrorBody } from '../../shared/errors.ts';
import { MAX_BODY_BYTES } from '../../shared/limits.ts';
import { csrf } from './csrf.ts';

export interface AppConfig {
  // Exact de origin van de SPA (ADR 0007); zonder waarde weigert de CSRF-controle elke Origin-header.
  readonly appOrigin?: string;
}

// Vaste volgorde (framework §6): requestId, secureHeaders, CSRF, bodyLimit, routes; één onError en notFound met
// alleen `{ code, requestId }`. De health-route is de publieke uitzondering uit framework §3. In stuk 3a krijgt createApp
// de RouteDef[] uit defineRoute.
export function createApp(config: AppConfig = {}) {
  const fail = (code: CoreErrorCode, id: string): ErrorBody => ({ code, requestId: id });

  return new Hono()
    .basePath('/api')
    .use(requestId())
    .use(secureHeaders())
    .use(csrf(config.appOrigin))
    .use(
      bodyLimit({
        maxSize: MAX_BODY_BYTES,
        onError: (c) => c.json(fail('PAYLOAD_TOO_LARGE', c.get('requestId')), 413),
      }),
    )
    .onError((error, c) => {
      console.error(`[${c.get('requestId')}]`, error);
      return c.json(fail('INTERNAL_ERROR', c.get('requestId')), 500);
    })
    .notFound((c) => c.json(fail('NOT_FOUND', c.get('requestId')), 404))
    .get('/health', (c) => c.json({ ok: true }));
}
