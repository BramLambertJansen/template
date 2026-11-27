import { sql } from 'drizzle-orm';
import { drainBatches, type DrainResult } from '../jobs/drain.ts';
import { CORE_JOB_KEYS } from '../jobs/lock.ts';
import { MAX_PURGE_BATCH } from '../../shared/limits.ts';
import type { WithJob } from './types.ts';

const JOB = { name: 'core.purge', key: CORE_JOB_KEYS.purge } as const;

// Opruimen van app-tabellen (spec achtergrondtaken, deel D), in de databasemodule omdat alleen die SQL schrijft (R-LAAG-05);
// geen pool: de taak core.purge geeft zijn withJob mee. de tabellen komen uit app.retention_targets(), per tabel een
// reeks batches app.purge_expired, elk een eigen withJob-transactie onder dezelfde taaksleutel. Geeft withJob { ran: false }
// (een andere instantie heeft de lock), dan slaat deze ronde die tabel over; de volgende ronde ruimt hem op.
export async function purgeAppTables(withJob: WithJob, signal?: AbortSignal): Promise<Record<string, DrainResult>> {
  const targets = await withJob(JOB, async (tx) => {
    const result = await tx.execute<{ table_name: string }>(sql`select app.retention_targets()::text as table_name`);
    return result.rows.map((row) => row.table_name);
  });
  if (!targets.ran) return {};
  const report: Record<string, DrainResult> = {};
  for (const table of targets.value) {
    report[table] = await drainBatches(
      async () => {
        const batch = await withJob(JOB, async (tx) => {
          const result = await tx.execute<{ deleted: number }>(
            sql`select app.purge_expired(${table}::regclass, ${MAX_PURGE_BATCH}) as deleted`,
          );
          return result.rows[0]?.deleted ?? 0;
        });
        return batch.ran ? batch.value : null;
      },
      signal === undefined ? {} : { signal },
    );
  }
  return report;
}
