import { betterAuth } from 'better-auth';
import pg from 'pg';
import { AUTH_BASE_PATH, type AuthConfig, createAuthOptions, DISABLED_PREFIXES } from './options.ts';

export interface CreateAuthConfig extends AuthConfig {
  // AUTH_DATABASE_URL: de rol auth_service (framework §3, uitzondering op "alleen src/core/api/db raakt pg").
  readonly databaseUrl: string;
}

const AUTH_POOL_SIZE = 3;

export function createAuth(config: CreateAuthConfig) {
  const pool = new pg.Pool({ connectionString: config.databaseUrl, max: AUTH_POOL_SIZE });
  return betterAuth(createAuthOptions(config, pool));
}

export type Auth = ReturnType<typeof createAuth>;

// Wat createApp op /api/auth/* aanroept: eerst de paden met een parameter die publiek dicht zijn (ADR 0013).
export function authHandler(auth: { handler: (request: Request) => Promise<Response> }) {
  return {
    handler: async (request: Request): Promise<Response> => {
      const path = new URL(request.url).pathname.slice(AUTH_BASE_PATH.length);
      if (DISABLED_PREFIXES.some((prefix) => path.startsWith(prefix)))
        return new Response('Not Found', { status: 404 });
      return auth.handler(request);
    },
  };
}
