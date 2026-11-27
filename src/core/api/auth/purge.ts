import type { Pool } from 'pg';
import { AUTH_RATE_LIMIT_KEEP_SECONDS, MAX_PURGE_BATCH, SESSION_ABSOLUTE_SECONDS } from '../../shared/limits.ts';
import { drainBatches } from '../jobs/drain.ts';
import { CORE_JOB_KEYS, JOB_LOCK_NAMESPACE } from '../jobs/lock.ts';

export interface PurgeReport {
  readonly session: number;
  readonly verification: number;
  readonly rateLimit: number;
}

// Per tabel de where-clausule van wat verlopen is (spec achtergrondtaken, deel D; ADR 0050 punt 3). Termijnen uit limits.ts
// als parameter $1, de batchgrootte als $2; de tijd komt van de database. Vaste tekst: geen invoer in de SQL.
const EXPIRED = {
  // Verlopen, of ouder dan de absolute termijn van 7 dagen (ADR 0041), ook als expiresAt door verlengen later ligt.
  session: {
    table: 'better_auth.session',
    where: `"expiresAt" < pg_catalog.now() or "createdAt" < pg_catalog.now() - pg_catalog.make_interval(secs => $1)`,
    seconds: SESSION_ABSOLUTE_SECONDS,
  },
  // De geldigheid zit al in expiresAt (uitnodigingen, resetlinks); $1 alleen voor dezelfde vorm.
  verification: {
    table: 'better_auth.verification',
    where: `"expiresAt" < pg_catalog.now() - pg_catalog.make_interval(secs => $1)`,
    seconds: 0,
  },
  // lastRequest is epoch-ms (bigint): ouder dan het langste vaste venster van Better Auth 1.7.7.
  rateLimit: {
    table: 'better_auth."rateLimit"',
    where: `"lastRequest" < (pg_catalog.date_part('epoch', pg_catalog.now()) * 1000)::bigint - $1::bigint * 1000`,
    seconds: AUTH_RATE_LIMIT_KEEP_SECONDS,
  },
} as const;

type Target = (typeof EXPIRED)[keyof typeof EXPIRED];

// Eén batch in een eigen transactie op de pool van Better Auth (auth_service), onder de lock van core.purge_auth: bezet bij een
// andere instantie → null (overslaan tot de volgende ronde).
async function purgeBatch(pool: Pool, target: Target): Promise<number | null> {
  const client = await pool.connect();
  let destroy = false;
  try {
    await client.query('begin');
    const { rows } = await client.query<{ locked: boolean }>(
      'select pg_catalog.pg_try_advisory_xact_lock($1, $2) as locked',
      [JOB_LOCK_NAMESPACE, CORE_JOB_KEYS.purgeAuth],
    );
    if (rows[0]?.locked !== true) {
      await client.query('rollback');
      return null;
    }
    const result = await client.query(
      `delete from ${target.table} where ctid = any (array(select ctid from ${target.table} where ${target.where} limit $2))`,
      [target.seconds, MAX_PURGE_BATCH],
    );
    await client.query('commit');
    return result.rowCount ?? 0;
  } catch (error) {
    destroy = await client.query('rollback').then(
      () => false,
      () => true,
    );
    throw error;
  } finally {
    client.release(destroy);
  }
}

// Opruimen van better_auth (ADR 0050 punt 3): sessies, verificaties en rate-limit-rijen, per tabel in batches van
// MAX_PURGE_BATCH, hooguit MAX_PURGE_BATCHES_PER_ROUND per tabel. Alleen hier: rijen van better_auth zijn van Better Auth en
// alleen src/core/api/auth raakt ze als auth_service (R-DB-13). signal: het proces stopt, geen nieuwe batch.
export function createPurgeExpired(pool: Pool): (signal?: AbortSignal) => Promise<PurgeReport> {
  const purge = async (target: Target, signal: AbortSignal | undefined) =>
    (await drainBatches(() => purgeBatch(pool, target), signal === undefined ? {} : { signal })).deleted;
  return async (signal) => ({
    session: await purge(EXPIRED.session, signal),
    verification: await purge(EXPIRED.verification, signal),
    rateLimit: await purge(EXPIRED.rateLimit, signal),
  });
}
