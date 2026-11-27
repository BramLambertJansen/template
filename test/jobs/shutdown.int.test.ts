import { sql } from 'drizzle-orm';
import pg from 'pg';
import { describe, expect, test, vi } from 'vitest';
import { createPool, createWithJob, createWithUser } from '../../src/core/api/db/testing.ts';
import { startJobs } from '../../src/core/api/jobs/index.ts';
import { UserId } from '../../src/core/shared/ids.ts';
import { gate, required, sleep } from './harness.ts';

// Stoppen met een lopende batch (spec achtergrondtaken, jobs/AC-27; ADR 0050): stop() wacht op de batch, die commit; er start
// geen nieuwe batch of ronde; pas daarna gaan de pools dicht en falen withJob en withUser. app_jobs heeft geen tabelrechten,
// dus de commit is zichtbaar via pg_notify: een melding komt bij de luisteraar alleen aan als de transactie committe.
const CHANNEL = 'jobs_shutdown_test';
const JOB_KEY = 2701;

describe('startJobs().stop() (jobs/AC-27)', () => {
  test('jobs/AC-27: de lopende batch commit, er start geen nieuwe batch of ronde, daarna sluiten de pools en falen withJob en withUser', async () => {
    const pool = createPool(required('JOBS_DATABASE_URL'), { applicationName: 'jobs-shutdown-test', max: 2 });
    const withJob = createWithJob(pool);
    const apiPool = createPool(required('DATABASE_URL'), { applicationName: 'api-shutdown-test', max: 1 });
    const withUser = createWithUser(apiPool);
    const listener = new pg.Client({ connectionString: required('JOBS_DATABASE_URL') });
    const notifications: string[] = [];
    listener.on('notification', (message) => {
      if (message.payload !== undefined) notifications.push(message.payload);
    });
    await listener.connect();
    await listener.query(`listen ${CHANNEL}`);

    const events: string[] = [];
    const batchRunning = gate();
    let batchesStarted = 0;
    const runner = startJobs({
      core: [],
      app: [
        {
          name: 'test.shutdown',
          key: 100,
          // Een korte pauze: een ronde die na het stoppen nog start, zou binnen de wachttijd hieronder zichtbaar zijn.
          intervalSeconds: 1,
          run: async ({ withJob: runWithJob, signal }) => {
            for (let batch = 0; batch < 5 && !signal.aborted; batch += 1) {
              await runWithJob({ name: 'test.shutdown', key: JOB_KEY }, async (tx) => {
                batchesStarted += 1;
                batchRunning.open();
                await tx.execute(sql`select pg_catalog.pg_sleep(1)`);
                await tx.execute(sql`select pg_catalog.pg_notify(${CHANNEL}, ${`batch-${String(batchesStarted)}`})`);
              });
              events.push('batch-committed');
            }
          },
        },
      ],
      withJob,
      log: () => {},
    });

    await batchRunning.opened;
    await runner.stop();
    events.push('stop-resolved');

    // stop() kwam pas terug na de batch, en de batch is gecommit: de melding is er.
    expect(events).toStrictEqual(['batch-committed', 'stop-resolved']);
    await vi.waitFor(() => {
      expect(notifications).toStrictEqual(['batch-1']);
    });

    // Geen nieuwe batch en geen nieuwe ronde na het stoppen (het interval is 1 s).
    await sleep(1500);
    expect(batchesStarted).toBe(1);
    expect(notifications).toStrictEqual(['batch-1']);

    // Pas daarna de pools dicht: daarna faalt elke aanroep.
    await Promise.all([pool.end(), apiPool.end(), listener.end()]);
    await expect(withJob({ name: 'test.na-stop', key: JOB_KEY }, () => Promise.resolve())).rejects.toThrow();
    await expect(
      withUser({ userId: UserId.parse('shutdown-user'), sessionStrength: 'password' }, () => Promise.resolve(), {
        requestId: 'shutdown-test',
      }),
    ).rejects.toThrow();
  }, 30_000);
});
