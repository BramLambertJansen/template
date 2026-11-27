import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, test } from 'vitest';
import { z } from 'zod';
import { createPool, createWithJob } from '../../src/core/api/db/testing.ts';
import { JOB_LOCK_NAMESPACE } from '../../src/core/api/jobs/index.ts';
import { gate, holdJobLock, holdNamedLock, required, sleep } from './harness.ts';

// withJob (spec achtergrondtaken, deel C: jobs/AC-19 t/m jobs/AC-23; ADR 0050 punt 1): één transactie als app_jobs onder een
// advisory lock in de twee-sleutelvorm. Echte database, twee verbindingen voor de races (`pnpm test:db`).
const pool = createPool(required('JOBS_DATABASE_URL'), { applicationName: 'jobs-test', max: 4 });
const withJob = createWithJob(pool);
const observer = createPool(required('JOBS_DATABASE_URL'), { applicationName: 'jobs-test-observer', max: 1 });
afterAll(async () => {
  await Promise.all([pool.end(), observer.end()]);
});

const identity = z.object({
  current_user: z.string(),
  session_user: z.string(),
  first: z.string(),
  second: z.string(),
});
const locks = z.object({ held: z.number() });

// Hoeveel advisory locks (namespace, key) er nu in de database staan.
async function lockCount(key: number): Promise<number> {
  const { rows } = await observer.query(
    "select count(*)::int as held from pg_catalog.pg_locks where locktype = 'advisory' and classid = $1 and objid = $2",
    [JOB_LOCK_NAMESPACE, key],
  );
  return locks.parse(rows[0]).held;
}

describe('withJob: rol en transactie (jobs/AC-19)', () => {
  const job = { name: 'test.rol', key: 1901 };

  test('jobs/AC-19: work draait in één transactie als app_jobs en de lock is na de commit weg', async () => {
    const result = await withJob(job, async (tx) => {
      const { rows } = await tx.execute(sql`select current_user, session_user,
        pg_catalog.txid_current()::text as first, pg_catalog.txid_current()::text as second`);
      return { identity: identity.parse(rows[0]), heldDuring: await lockCount(job.key) };
    });

    expect(result.ran).toBe(true);
    if (!result.ran) return;
    expect(result.value.identity).toMatchObject({ current_user: 'app_jobs', session_user: 'app_jobs' });
    expect(result.value.identity.first).toBe(result.value.identity.second);
    expect(result.value.heldDuring).toBe(1);
    expect(await lockCount(job.key)).toBe(0);
  });

  test('jobs/AC-19: een verbinding die niet als app_jobs inlogde draait geen taak en wordt weggegooid', async () => {
    const wrongPool = createPool(required('DATABASE_URL'), { applicationName: 'jobs-test-wrong', max: 1 });
    let ran = false;
    try {
      await expect(
        createWithJob(wrongPool)(job, () => {
          ran = true;
          return Promise.resolve();
        }),
      ).rejects.toThrow();
      expect(ran).toBe(false);
      expect(wrongPool.totalCount).toBe(0);
    } finally {
      await wrongPool.end();
    }
  });
});

describe('withJob: try-variant (jobs/AC-20)', () => {
  test('jobs/AC-20: twee gelijktijdige aanroepen met dezelfde taak: één voert uit, de ander krijgt { ran: false } zonder te wachten', async () => {
    const job = { name: 'test.race', key: 2001 };
    const started = gate();
    const release = gate();
    const first = withJob(job, async () => {
      started.open();
      await release.opened;
      return 'eerste';
    });
    await started.opened;

    // De eerste houdt de lock nog vast: de tweede moet meteen terugkomen.
    const second = await withJob(job, () => Promise.resolve('tweede'));
    release.open();

    expect(second).toStrictEqual({ ran: false });
    expect(await first).toStrictEqual({ ran: true, value: 'eerste' });
  });

  test('jobs/AC-20: met verschillende taaknummers draaien beide tegelijk', async () => {
    const bothStarted = gate();
    const release = gate();
    let running = 0;
    const work = async () => {
      running += 1;
      if (running === 2) bothStarted.open();
      await release.opened;
      return 'klaar';
    };
    const results = Promise.all([
      withJob({ name: 'test.a', key: 2002 }, work),
      withJob({ name: 'test.b', key: 2003 }, work),
    ]);
    await bothStarted.opened;
    release.open();

    expect(await results).toStrictEqual([
      { ran: true, value: 'klaar' },
      { ran: true, value: 'klaar' },
    ]);
  });
});

describe('withJob: wachtende variant (jobs/AC-21)', () => {
  test('jobs/AC-21: wacht tot de andere transactie de lock loslaat en voert dan work uit', async () => {
    const job = { name: 'test.wacht', key: 2101 };
    const holder = await holdJobLock(job.key);
    let ran = false;
    let settled = false;
    const waiting = withJob(
      job,
      () => {
        ran = true;
        return Promise.resolve('daarna');
      },
      { wait: true },
    ).finally(() => {
      settled = true;
    });

    await sleep(500);
    expect(settled).toBe(false);
    expect(ran).toBe(false);

    await holder.release();
    expect(await waiting).toStrictEqual({ ran: true, value: 'daarna' });
  });

  test('jobs/AC-21: houdt de ander de lock langer vast dan de statement_timeout, dan faalt de aanroep met 57014 en draait work niet', async () => {
    const job = { name: 'test.timeout', key: 2102 };
    const holder = await holdJobLock(job.key);
    let ran = false;
    try {
      await expect(
        withJob(
          job,
          () => {
            ran = true;
            return Promise.resolve();
          },
          { wait: true },
        ),
      ).rejects.toMatchObject({ code: '57014' });
    } finally {
      await holder.release();
    }
    expect(ran).toBe(false);
    // Niets gecommit en niets blijven hangen: de lock is vrij en de taak draait weer.
    expect(await withJob(job, () => Promise.resolve('weer'))).toStrictEqual({ ran: true, value: 'weer' });
  }, 20_000);
});

describe('withJob: lockruimte (jobs/AC-22)', () => {
  test("jobs/AC-22: loopt door terwijl een andere transactie hashtext('public.user_roles:last_admin') vasthoudt", async () => {
    const holder = await holdNamedLock('public.user_roles:last_admin');
    try {
      const tried = await withJob({ name: 'test.admin-try', key: 2201 }, () => Promise.resolve('try'));
      const waited = await withJob({ name: 'test.admin-wait', key: 2202 }, () => Promise.resolve('wait'), {
        wait: true,
      });

      expect(tried).toStrictEqual({ ran: true, value: 'try' });
      expect(waited).toStrictEqual({ ran: true, value: 'wait' });
    } finally {
      await holder.release();
    }
  });
});

describe('withJob: fouten (jobs/AC-23)', () => {
  test('jobs/AC-23: een fout in work gaat onvertaald door, draait terug en laat de lock los', async () => {
    const job = { name: 'test.fout', key: 2301 };
    const boom = new Error('kapot');

    await expect(
      withJob(job, async (tx) => {
        await tx.execute(sql`select 1`);
        throw boom;
      }),
    ).rejects.toBe(boom);
    expect(await lockCount(job.key)).toBe(0);
    expect(await withJob(job, () => Promise.resolve('volgende'))).toStrictEqual({ ran: true, value: 'volgende' });
  });

  test('jobs/AC-23: een databasefout in work (42501 op een tabel) draait terug en de volgende aanroep van dezelfde taak draait', async () => {
    const job = { name: 'test.db-fout', key: 2302 };

    await expect(withJob(job, (tx) => tx.execute(sql`select * from app.audit_log`))).rejects.toThrow();
    expect(await lockCount(job.key)).toBe(0);
    expect(await withJob(job, () => Promise.resolve('volgende'))).toStrictEqual({ ran: true, value: 'volgende' });
  });
});
