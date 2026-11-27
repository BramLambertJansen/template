import { sql } from 'drizzle-orm';
import { drainBatches, type DrainResult } from '../jobs/drain.ts';
import { CORE_JOB_KEYS } from '../jobs/lock.ts';
import { MAX_PURGE_BATCH } from '../../shared/limits.ts';
import type { WithJob } from './types.ts';

const JOB = { name: 'core.purge', key: CORE_JOB_KEYS.purge } as const;

// Opruimen van app-tabellen (spec achtergrondtaken, deel D), in de databasemodule omdat alleen die SQL schrijft (R-LAAG-05);
// geen pool: de taak core.purge geeft zijn withJob mee. De tabellen komen uit app.retention_targets(), per tabel een reeks
// batches app.purge_expired, elk een eigen withJob-transactie onder dezelfde taaksleutel. Geeft withJob { ran: false } (een
// andere instantie heeft de lock), dan slaat deze ronde die tabel over; de volgende ronde ruimt hem op.
// De tabel gaat als oid heen en terug, niet als naam: app_jobs heeft geen usage op schema public, dus 'public.x'::regclass
// faalt als die rol, terwijl een cast van oid naar regclass niets opzoekt.
// Faalt één tabel, dan gaan de andere door; de eerste fout komt daarna terug, zodat de runner hem logt.
export async function purgeAppTables(withJob: WithJob, signal?: AbortSignal): Promise<Record<string, DrainResult>> {
  const targets = await withJob(JOB, async (tx) => {
    const result = await tx.execute<{ table_oid: string; table_name: string }>(
      sql`select t::oid::text as table_oid, t::text as table_name from app.retention_targets() as t`,
    );
    return result.rows;
  });
  if (!targets.ran) return {};
  const report: Record<string, DrainResult> = {};
  const failures: unknown[] = [];
  for (const target of targets.value) {
    try {
      report[target.table_name] = await drainBatches(
        () => purgeBatch(withJob, target.table_oid),
        signal === undefined ? {} : { signal },
      );
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > 0) throw failures[0];
  return report;
}

async function purgeBatch(withJob: WithJob, tableOid: string): Promise<number | null> {
  const batch = await withJob(JOB, async (tx) => {
    const result = await tx.execute<{ deleted: number }>(
      sql`select app.purge_expired(${tableOid}::oid::regclass, ${MAX_PURGE_BATCH}) as deleted`,
    );
    return result.rows[0]?.deleted ?? 0;
  });
  return batch.ran ? batch.value : null;
}
