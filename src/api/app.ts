import type { AuthGateway } from '#core/api/auth/index.ts';
import type { WithUser } from '#core/api/db/types.ts';
import { createApp } from '#core/api/http/create-app.ts';
import { errors } from '#shared/errors.ts';
import { meRoute } from './routes/me.ts';

// Compositie-root van de app (ADR 0008): routes, foutcodes en wat server.ts aanlevert (auth, withUser).
export const routes = [meRoute] as const;

export function buildApp(config: { appOrigin: string; auth: AuthGateway; withUser: WithUser }) {
  return createApp({ ...config, routes, errors });
}
