import type { AuthGateway } from '#core/api/auth/index.ts';
import type { WithUser } from '#core/api/db/types.ts';
import { createApp, type DevLogin } from '#core/api/http/create-app.ts';
import type { Readiness } from '#core/api/http/readiness.ts';
import type { RequestLog } from '#core/api/obs/request-log.ts';
import { errors } from '#shared/errors.ts';
import { accountsListRoute, inviteRoute, reinviteRoute } from './routes/accounts.ts';
import { meRoute } from './routes/me.ts';
import type { AppServices } from './services.ts';

// Compositie-root van de app (ADR 0008): routes, foutcodes en wat server.ts aanlevert (auth, withUser, services, devLogin).
export const routes = [meRoute, accountsListRoute, inviteRoute, reinviteRoute] as const;

export interface BuildAppConfig {
  readonly appOrigin: string;
  readonly auth: AuthGateway;
  readonly withUser: WithUser;
  readonly services: AppServices;
  // Alleen bij APP_ENV=local (server.ts); anders bestaat /api/dev/login-as niet.
  readonly devLogin?: DevLogin;
  // Eén regel per request; server.ts geeft writeJsonLine mee, tests laten hem weg.
  readonly log?: RequestLog;
  // GET /api/ready; server.ts geeft hem mee, tests laten hem weg.
  readonly ready?: Readiness;
}

export function buildApp(config: BuildAppConfig) {
  return createApp<AppServices>({ ...config, routes, errors });
}
