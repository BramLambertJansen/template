import { describe, expect, test } from 'vitest';
import { createJobsCheck, createPool } from '../../src/core/api/db/testing.ts';
import { required } from './harness.ts';

// Opstartcontrole van de jobs-verbinding (spec achtergrondtaken, jobs/AC-44; ADR 0049 punt 3): slaagt met JOBS_DATABASE_URL,
// faalt bij een geweigerde login en bij de gegevens van een andere rol. Echte database (`pnpm test:db`).
async function checkWith(url: string): Promise<void> {
  const pool = createPool(url, { applicationName: 'jobs-check-test', max: 1 });
  try {
    await createJobsCheck(pool)();
  } finally {
    await pool.end();
  }
}

describe('createJobsCheck (jobs/AC-44)', () => {
  test('jobs/AC-44: slaagt met JOBS_DATABASE_URL (session_user is app_jobs)', async () => {
    await expect(checkWith(required('JOBS_DATABASE_URL'))).resolves.toBeUndefined();
  });

  test('jobs/AC-44: faalt bij een geweigerde login (wachtwoord met één teken erbij)', async () => {
    const url = new URL(required('JOBS_DATABASE_URL'));
    url.password = `${url.password}x`;

    await expect(checkWith(url.toString())).rejects.toThrow();
  });

  test('jobs/AC-44: faalt bij een URL met de gegevens van api_user (session_user is niet app_jobs)', async () => {
    await expect(checkWith(required('DATABASE_URL'))).rejects.toThrow();
  });

  test('jobs/AC-44: faalt bij een onbereikbare database', async () => {
    const url = new URL(required('JOBS_DATABASE_URL'));
    url.port = '1';

    await expect(checkWith(url.toString())).rejects.toThrow();
  });
});
