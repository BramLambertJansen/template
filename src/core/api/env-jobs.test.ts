import { describe, expect, test } from 'vitest';
import { DEMO_DB_PASSWORDS, parseEnv } from './env.ts';

// Spec achtergrondtaken (namespace jobs), deel B: de verplichte env JOBS_DATABASE_URL (jobs/AC-15) en de regels voor
// het demo-wachtwoord buiten local/test (jobs/AC-16). Vorm als env-schema.test.ts.
const JOBS_URL = 'postgres://app_jobs:Rt5kN8dW3pQ6@db.example.com:5432/app';

const production = {
  APP_ENV: 'production',
  APP_ORIGIN: 'https://app.example.com',
  AUTH_BASE_URL: 'https://app.example.com',
  AUTH_SECRET: 'ab12'.repeat(10),
  DATABASE_URL: 'postgres://api_user:Kp4wQ9zL2xR7@db.example.com:5432/app',
  AUTH_DATABASE_URL: 'postgres://auth_service:Vb8nM3cT6yH1@db.example.com:5432/app',
  JOBS_DATABASE_URL: JOBS_URL,
  SMTP_URL: 'smtp://mail.example.com:587',
  CLIENT_IP_HEADER: 'x-real-ip',
};

const local = {
  APP_ENV: 'local',
  APP_ORIGIN: 'http://localhost:5173',
  AUTH_BASE_URL: 'http://localhost:5173',
  AUTH_SECRET: 'local-demo-secret-change-per-environment-000000',
  DATABASE_URL: 'postgres://api_user:api_user@127.0.0.1:54322/app',
  AUTH_DATABASE_URL: 'postgres://auth_service:auth_service@127.0.0.1:54322/app',
  JOBS_DATABASE_URL: 'postgres://app_jobs:app_jobs@127.0.0.1:54322/app',
  SMTP_URL: 'smtp://127.0.0.1:54325',
};

describe('JOBS_DATABASE_URL: verplicht postgres-URL', () => {
  test('jobs/AC-15: een geldige waarde komt in Env.jobsDatabaseUrl', () => {
    expect(parseEnv(production).jobsDatabaseUrl).toBe(JOBS_URL);
  });

  test.each(['local', 'production'])(
    'jobs/AC-15: %s zonder JOBS_DATABASE_URL weigert met een melding voor die variabele',
    (appEnv) => {
      const base = appEnv === 'local' ? local : production;
      expect(() => parseEnv({ ...base, JOBS_DATABASE_URL: undefined })).toThrow('JOBS_DATABASE_URL');
    },
  );

  test.each(['local', 'production'])(
    'jobs/AC-15: %s met lege JOBS_DATABASE_URL weigert met een melding voor die variabele',
    (appEnv) => {
      const base = appEnv === 'local' ? local : production;
      expect(() => parseEnv({ ...base, JOBS_DATABASE_URL: '' })).toThrow('JOBS_DATABASE_URL');
    },
  );

  test('jobs/AC-15: een niet-postgres-URL faalt', () => {
    expect(() => parseEnv({ ...production, JOBS_DATABASE_URL: 'mysql://app_jobs:x@db/app' })).toThrow(
      'JOBS_DATABASE_URL: geen postgres-URL',
    );
  });
});

describe('JOBS_DATABASE_URL: demo-wachtwoord buiten local/test', () => {
  const withPassword = (password: string) => `postgres://app_jobs:${password}@db.example.com:5432/app`;

  test('jobs/AC-16: app_jobs staat in DEMO_DB_PASSWORDS', () => {
    expect(DEMO_DB_PASSWORDS).toContain('app_jobs');
  });

  // Eén test per regel van DEMO_DB_PASSWORDS; de lijst is vast zodat een regel die verdwijnt de test laat falen.
  test.each(['postgres', 'app_migrator', 'api_user', 'auth_service', 'password', 'app_jobs'])(
    'jobs/AC-16: wachtwoord %s (DEMO_DB_PASSWORDS) faalt in production',
    (password) => {
      expect(DEMO_DB_PASSWORDS).toContain(password);
      expect(() => parseEnv({ ...production, JOBS_DATABASE_URL: withPassword(password) })).toThrow(
        'JOBS_DATABASE_URL: leeg of demo-wachtwoord',
      );
    },
  );

  test('jobs/AC-16: zonder wachtwoord faalt in production', () => {
    expect(() => parseEnv({ ...production, JOBS_DATABASE_URL: 'postgres://app_jobs@db.example.com:5432/app' })).toThrow(
      'JOBS_DATABASE_URL: leeg of demo-wachtwoord',
    );
  });

  test('jobs/AC-16: wachtwoord gelijk aan de gebruikersnaam faalt in staging', () => {
    expect(() =>
      parseEnv({
        ...production,
        APP_ENV: 'staging',
        JOBS_DATABASE_URL: 'postgres://jobs_worker:jobs_worker@db.example.com:5432/app',
      }),
    ).toThrow('JOBS_DATABASE_URL: leeg of demo-wachtwoord');
  });

  test('jobs/AC-16: een ge-encodeerd demo-wachtwoord faalt ook', () => {
    expect(() => parseEnv({ ...production, JOBS_DATABASE_URL: withPassword('%61pp_jobs') })).toThrow(
      'JOBS_DATABASE_URL: leeg of demo-wachtwoord',
    );
  });

  test.each(['local', 'test'])('jobs/AC-16: met APP_ENV=%s slaagt de demo-waarde', (appEnv) => {
    expect(parseEnv({ ...local, APP_ENV: appEnv }).jobsDatabaseUrl).toBe(local.JOBS_DATABASE_URL);
  });
});
