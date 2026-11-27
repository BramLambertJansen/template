import pg from 'pg';
import { JOB_LOCK_NAMESPACE } from '../../src/core/api/jobs/index.ts';

// Hulpen voor de integratietests van de achtergrondtaken (spec achtergrondtaken, deel B–D). Draait via `pnpm test:db` tegen
// de echte database (ADR 0044): JOBS_DATABASE_URL is app_jobs, MIGRATOR_DATABASE_URL is app_migrator.
export function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') throw new Error(`${name} ontbreekt: draai via pnpm test:db`);
  return value;
}

export interface HeldLock {
  readonly release: () => Promise<void>;
}

// Houdt een transactie-advisory-lock vast op een eigen verbinding (als app_jobs) tot release(): de "andere transactie" van
// de racetests.
async function hold(lockSql: string, params: readonly unknown[]): Promise<HeldLock> {
  const client = new pg.Client({ connectionString: required('JOBS_DATABASE_URL') });
  await client.connect();
  try {
    await client.query('begin');
    await client.query(lockSql, [...params]);
  } catch (error) {
    await client.end();
    throw error;
  }
  return {
    release: async () => {
      try {
        await client.query('rollback');
      } finally {
        await client.end();
      }
    },
  };
}

// De lock van een taak (twee-sleutelvorm).
export function holdJobLock(key: number): Promise<HeldLock> {
  return hold('select pg_catalog.pg_advisory_xact_lock($1, $2)', [JOB_LOCK_NAMESPACE, key]);
}

// De één-sleutelvorm met hashtext(naam), zoals de laatste-admin-lock.
export function holdNamedLock(name: string): Promise<HeldLock> {
  return hold('select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext($1))', [name]);
}

// Een promise die je van buiten opent: een taak die wacht tot de test hem vrijgeeft.
export function gate(): { readonly opened: Promise<void>; readonly open: () => void } {
  let open: () => void = () => {};
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
