import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool, PoolClient } from 'pg';
import { JOB_LOCK_NAMESPACE } from '../jobs/lock.ts';
import { watchClient } from './client-lease.ts';
import type { JobRef, JobResult, Tx, WithJob, WithJobOptions } from './types.ts';

// De enige rol waarmee een taak draait (ADR 0050 punt 5): geen tabelrechten, alleen execute op functies van klasse job.
const JOBS_ROLE = 'app_jobs';

class WrongJobsRoleError extends Error {
  constructor() {
    super(`withJob: verbinding is niet ${JOBS_ROLE} (of niet als session_user); weggegooid`);
  }
}

// Een verbinding die niet als app_jobs inlogde (verkeerde JOBS_DATABASE_URL) of een andere rol aanneemt, draait geen taak.
async function assertJobsRole(client: PoolClient): Promise<void> {
  const { rows } = await client.query<{ ok: boolean }>(
    'select current_user = session_user and session_user = $1 as ok',
    [JOBS_ROLE],
  );
  if (rows[0]?.ok !== true) throw new WrongJobsRoleError();
}

// Try-lock (standaard) of wachtende lock ({ wait: true }), beide in de transactie: de lock vervalt bij commit, rollback of
// het wegvallen van de verbinding.
async function takeLock(client: PoolClient, key: number, options: WithJobOptions | undefined): Promise<boolean> {
  if (options?.wait === true) {
    await client.query('select pg_catalog.pg_advisory_xact_lock($1, $2)', [JOB_LOCK_NAMESPACE, key]);
    return true;
  }
  const { rows } = await client.query<{ locked: boolean }>(
    'select pg_catalog.pg_try_advisory_xact_lock($1, $2) as locked',
    [JOB_LOCK_NAMESPACE, key],
  );
  return rows[0]?.locked === true;
}

async function rollback(client: PoolClient): Promise<boolean> {
  try {
    await client.query('rollback');
    return true;
  } catch {
    return false;
  }
}

// Eén batch van een taak (ADR 0050 punt 2): één transactie als app_jobs met de advisory lock (JOB_LOCK_NAMESPACE, key).
// Geen actor (geen set_config): app.current_user_id() is null, dus functies van klasse client weigeren. Fouten gaan onvertaald
// door; de runner logt alleen de foutklasse (src/core/api/jobs/runner.ts).
export function createWithJob(pool: Pool): WithJob {
  return async <T>(job: JobRef, work: (tx: Tx) => Promise<T>, options?: WithJobOptions): Promise<JobResult<T>> => {
    const client = await pool.connect();
    const lease = watchClient(client);
    let destroy = false;
    const state = { started: false };
    try {
      return await lease.run(async () => {
        await assertJobsRole(client);
        await client.query('begin');
        state.started = true;
        if (!(await takeLock(client, job.key, options))) {
          await client.query('rollback');
          return { ran: false } as const;
        }
        const value = await lease.run(() => work(drizzle({ client })));
        await client.query('commit');
        return { ran: true, value } as const;
      });
    } catch (error) {
      destroy = lease.broken() || error instanceof WrongJobsRoleError || (state.started && !(await rollback(client)));
      throw error;
    } finally {
      lease.release(destroy);
    }
  };
}

// De opstartcontrole (ADR 0049 punt 3): één verbinding uit de pool van withJob, die als app_jobs moet inloggen. Faalt bij een
// geweigerde login, een onbereikbare database of de gegevens van een andere rol.
export function createJobsCheck(pool: Pool): () => Promise<void> {
  return async () => {
    const client = await pool.connect();
    let destroy = true;
    try {
      await assertJobsRole(client);
      destroy = false;
    } finally {
      client.release(destroy);
    }
  };
}
