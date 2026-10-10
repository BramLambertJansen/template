import { betterAuth } from 'better-auth';
import pg from 'pg';
import { UserId } from '../../shared/ids.ts';
import { SESSION_ABSOLUTE_SECONDS } from '../../shared/limits.ts';
import { AUTH_BASE_PATH, type AuthConfig, createAuthOptions, DISABLED_PREFIXES } from './options.ts';

export interface CreateAuthConfig extends AuthConfig {
  // AUTH_DATABASE_URL: de rol auth_service (framework §3, uitzondering op "alleen src/core/api/db raakt pg").
  readonly databaseUrl: string;
}

const AUTH_POOL_SIZE = 3;

export function createAuth(config: CreateAuthConfig) {
  const pool = new pg.Pool({ connectionString: config.databaseUrl, max: AUTH_POOL_SIZE });
  // closePool: alleen bij het stoppen van het proces (src/api/server.ts), na de laatste request.
  return Object.assign(betterAuth(createAuthOptions(config, pool)), { closePool: () => pool.end() });
}

export type Auth = ReturnType<typeof createAuth>;

export interface SessionInfo {
  readonly userId: UserId;
  readonly sessionStrength: 'password' | 'mfa';
  readonly name: string;
  readonly email: string;
}

export interface SessionLookup {
  readonly session: SessionInfo | null;
  // Better Auth verlengt de sessie (idle 12 uur); zonder deze Set-Cookie verloopt hij in de browser alsnog.
  readonly setCookie: readonly string[];
}

// Wat createApp van auth nodig heeft (ADR 0003, 0013): de handler voor /api/auth/* en de sessie per request.
export interface AuthGateway {
  readonly handler: (request: Request) => Promise<Response>;
  readonly getSession: (headers: Headers) => Promise<SessionLookup>;
}

export function authGateway(auth: Auth, now: () => number = Date.now): AuthGateway {
  return {
    handler: async (request) => {
      const path = new URL(request.url).pathname.slice(AUTH_BASE_PATH.length);
      if (DISABLED_PREFIXES.some((prefix) => path.startsWith(prefix)))
        return new Response('Not Found', { status: 404 });
      return auth.handler(request);
    },
    getSession: async (headers) => {
      const { headers: responseHeaders, response } = await auth.api.getSession({ headers, returnHeaders: true });
      const setCookie = responseHeaders.getSetCookie();
      if (response === null) return { session: null, setCookie };
      const { session, user } = response;
      // Absoluut 7 dagen na inloggen (ADR 0003), ook als de sessie actief bleef: intrekken en als uitgelogd behandelen.
      if (now() - session.createdAt.getTime() > SESSION_ABSOLUTE_SECONDS * 1000) {
        await (await auth.$context).internalAdapter.deleteSession(session.token);
        return { session: null, setCookie };
      }
      const strength = session.sessionStrength;
      if (strength !== 'password' && strength !== 'mfa') return { session: null, setCookie };
      return {
        session: { userId: UserId.parse(user.id), sessionStrength: strength, name: user.name, email: user.email },
        setCookie,
      };
    },
  };
}
