import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Pool } from 'pg';
import { describe, expect, test } from 'vitest';
import { AUTH_RATE_LIMIT_WINDOW_SECONDS } from '../../shared/limits.ts';
import { unsafeCast } from '../../shared/unsafe-cast.ts';
import { createAuthOptions } from './options.ts';

// Spec achtergrondtaken (namespace jobs), jobs/AC-36 (unitdeel): Better Auth gebruikt AUTH_RATE_LIMIT_WINDOW_SECONDS als
// rateLimit.window, en de geïnstalleerde better-auth is exact 1.7.7. De int-test (test/jobs/purge-auth.int.test.ts) toetst
// de vierde 429.
const pool = unsafeCast<Pool>({}, 'test: createAuthOptions gebruikt de pool pas bij een aanroep van Better Auth');

function installedBetterAuthVersion(): string {
  const file = path.join(import.meta.dirname, '../../../../node_modules/better-auth/package.json');
  const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
  const version: unknown = typeof parsed === 'object' && parsed !== null ? Reflect.get(parsed, 'version') : undefined;
  return String(version);
}

describe('rate limit van Better Auth', () => {
  // Waarom exact: in better-auth/dist/api/rate-limiter/index.mjs geeft getDefaultSpecialRules (o.a. /forget-password,
  // /sign-in/email) een eigen venster van 60 s. AUTH_RATE_LIMIT_KEEP_SECONDS (60) in de opruimtaak is daarop afgestemd;
  // een andere versie kan een langer venster hebben, dan verwijdert de opruiming rijen die nog tellen.
  test('jobs/AC-36: de geïnstalleerde better-auth is exact 1.7.7 (getDefaultSpecialRules: 60 s)', () => {
    expect(installedBetterAuthVersion()).toBe('1.7.7');
  });

  test('jobs/AC-36: package.json pint better-auth op exact 1.7.7 (geen ^ of ~)', () => {
    const file = path.join(import.meta.dirname, '../../../../package.json');
    const manifest = readFileSync(file, 'utf8');

    expect(manifest).toMatch(/"better-auth":\s*"1\.7\.7"/);
  });

  test('jobs/AC-36: AUTH_RATE_LIMIT_WINDOW_SECONDS is 10 en blijft onder het langste venster (60 s)', () => {
    expect(AUTH_RATE_LIMIT_WINDOW_SECONDS).toBe(10);
  });

  test('jobs/AC-36: createAuthOptions zet rateLimit.window = AUTH_RATE_LIMIT_WINDOW_SECONDS, in de database', () => {
    const options = createAuthOptions(
      {
        origin: 'https://app.example.test',
        secret: 'x'.repeat(32),
        sendInvitation: () => Promise.resolve(),
        appName: 'Voorbeeld',
      },
      pool,
    );

    expect(options.rateLimit).toMatchObject({
      enabled: true,
      storage: 'database',
      window: AUTH_RATE_LIMIT_WINDOW_SECONDS,
    });
  });
});
