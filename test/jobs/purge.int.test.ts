import { sql } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';
import { z } from 'zod';
import { createPool, createWithJob, purgeAppTables } from '../../src/core/api/db/testing.ts';
import type { WithJob } from '../../src/core/api/db/types.ts';
import { CORE_JOB_KEYS, coreJobs, JOB_LOCK_NAMESPACE, runJobsOnce } from '../../src/core/api/jobs/index.ts';
import { MAX_PURGE_BATCH } from '../../src/core/shared/limits.ts';
import { required } from './harness.ts';

// Opruimen van app-tabellen (spec achtergrondtaken, deel D: jobs/AC-39, jobs/AC-40, jobs/AC-43): core.purge via
// app.retention_targets() en app.purge_expired, als app_jobs; de rijen zet app_migrator klaar (de eigenaar, buiten RLS voor
// de fixturetabel; voor de bestaande tabellen via de insert-policies van app_definer, waarvan hij lid is). Echte database
// (`pnpm test:db`); alles wat deze tests committen ruimen ze zelf op.
const jobsPool = createPool(required('JOBS_DATABASE_URL'), { applicationName: 'jobs-purge-test', max: 3 });
const withJob = createWithJob(jobsPool);
const migrator = new pg.Pool({ connectionString: required('MIGRATOR_DATABASE_URL'), max: 2 });
const holder = new pg.Pool({ connectionString: required('JOBS_DATABASE_URL'), max: 1 });

const count = z.object({ n: z.number() });
async function countRows(query: string, params: readonly unknown[] = []): Promise<number> {
  const { rows } = await migrator.query(`select count(*)::int as n from ${query}`, [...params]);
  return count.parse(rows[0]).n;
}

// De SQLSTATE van een pg-fout, ook als drizzle hem als `cause` inpakt.
function sqlstateOf(error: unknown): string | undefined {
  const direct = z.object({ code: z.string() }).safeParse(error);
  if (direct.success) return direct.data.code;
  const wrapped = z.object({ cause: z.unknown() }).safeParse(error);
  return wrapped.success ? sqlstateOf(wrapped.data.cause) : undefined;
}

const FIXTURE = 'app.purge_fixture';

// Een tabel die een app aan de bewaarcatalogus toevoegt: eigenaar app_migrator, RLS aan (niet geforceerd, zodat de eigenaar de
// rijen kan klaarzetten), select en delete voor app_definer met een delete-policy op app.retention_cutoff.
async function createFixture(): Promise<void> {
  await dropFixture();
  await migrator.query(`create table ${FIXTURE} (id integer primary key, t timestamptz not null)`);
  await migrator.query(`alter table ${FIXTURE} enable row level security`);
  await migrator.query(`grant select, delete on ${FIXTURE} to app_definer`);
  await migrator.query(
    `create policy purge_fixture_definer_select on ${FIXTURE} for select to app_definer using (true)`,
  );
  await migrator.query(
    `create policy purge_fixture_definer_delete on ${FIXTURE} for delete to app_definer
       using (t < (select app.retention_cutoff('${FIXTURE}')))`,
  );
  await withRetentionWritable(() =>
    migrator.query(
      `insert into app.retention values ('${FIXTURE}', 't', interval '1 hour', 'app', 'fixture van de purge-integratietest')`,
    ),
  );
}

async function dropFixture(): Promise<void> {
  await withRetentionWritable(() =>
    migrator.query(`delete from app.retention where table_name = to_regclass('${FIXTURE}')`),
  );
  await migrator.query(`drop table if exists ${FIXTURE}`);
}

// app.retention heeft alleen een select-policy: de eigenaar schrijft er alleen met FORCE RLS tijdelijk uit (zoals db/tests).
async function withRetentionWritable(work: () => Promise<unknown>): Promise<void> {
  await migrator.query('alter table app.retention no force row level security');
  try {
    await work();
  } finally {
    await migrator.query('alter table app.retention force row level security');
  }
}

// Oud genoeg om op te ruimen; verse rijen verouderen en verdwijnen daarna, zodat er niets committed achterblijft.
async function cleanRows(): Promise<void> {
  await migrator.query(
    `update app.rate_limits set window_start = pg_catalog.now() - interval '1 hour' where key like 'pj:%'`,
  );
  await migrator.query(
    `update app.one_time_use set expires_at = pg_catalog.now() - interval '1 hour' where key like 'pj:%'`,
  );
  await migrator.query(`delete from app.rate_limits where key like 'pj:%'`);
  await migrator.query(`delete from app.one_time_use where key like 'pj:%'`);
  await migrator.query(
    `delete from app.audit_log where request_id like 'pj-%' and at < pg_catalog.now() - interval '1 year'`,
  );
}

beforeAll(async () => {
  await cleanRows();
});
afterEach(async () => {
  await dropFixture();
  await cleanRows();
});
afterAll(async () => {
  await Promise.all([jobsPool.end(), migrator.end(), holder.end()]);
});

async function seed(): Promise<void> {
  await migrator.query(
    `insert into app.audit_log (at, action, request_id) values
       (pg_catalog.now() - interval '2 years', 'pj.old', 'pj-audit-1'),
       (pg_catalog.now() - interval '2 years', 'pj.old', 'pj-audit-2'),
       (pg_catalog.now() - interval '13 months', 'pj.old', 'pj-audit-3')`,
  );
  await migrator.query(
    `insert into app.rate_limits (key, window_start, hits) values
       ('pj:old-1', pg_catalog.now() - interval '2 minutes', 1),
       ('pj:old-2', pg_catalog.now() - interval '61 seconds', 1),
       ('pj:fresh', pg_catalog.now() - interval '10 seconds', 1)`,
  );
  await migrator.query(
    `insert into app.one_time_use (key, expires_at) values
       ('pj:expired', pg_catalog.now() - interval '1 minute'),
       ('pj:valid', pg_catalog.now() + interval '10 minutes')`,
  );
}

describe('core.purge via app.retention_targets (jobs/AC-39)', () => {
  test('jobs/AC-39: na één ronde zijn er in app.audit_log, app.one_time_use en app.rate_limits geen rijen ouder dan hun termijn', async () => {
    await seed();

    const report = await purgeAppTables(withJob);

    expect(Object.keys(report)).toStrictEqual(
      expect.arrayContaining(['app.audit_log', 'app.one_time_use', 'app.rate_limits']),
    );
    expect(report['app.audit_log']?.deleted).toBeGreaterThanOrEqual(3);
    expect(await countRows(`app.audit_log where at < pg_catalog.now() - interval '1 year'`)).toBe(0);
    expect(await countRows(`app.audit_log where request_id like 'pj-%'`)).toBe(0);
    expect(await countRows(`app.rate_limits where key like 'pj:old-%'`)).toBe(0);
    expect(await countRows(`app.one_time_use where key = 'pj:expired'`)).toBe(0);
    // Wat nog binnen de termijn valt, blijft.
    expect(await countRows(`app.rate_limits where key = 'pj:fresh'`)).toBe(1);
    expect(await countRows(`app.one_time_use where key = 'pj:valid'`)).toBe(1);
  });

  test('jobs/AC-39: een tabel die een fixture aan app.retention toevoegt, wordt ook opgeruimd', async () => {
    await createFixture();
    await migrator.query(
      `insert into ${FIXTURE} (id, t) values (1, pg_catalog.now() - interval '2 hours'), (2, pg_catalog.now() - interval '90 minutes'),
         (3, pg_catalog.now())`,
    );

    const report = await purgeAppTables(withJob);

    expect(report[FIXTURE]).toMatchObject({ deleted: 2, stoppedBy: 'drained' });
    expect(await countRows(FIXTURE)).toBe(1);
    expect(await countRows(`${FIXTURE} where id = 3`)).toBe(1);
  });

  test('jobs/AC-39: core.purge draait als taak van coreJobs via runJobsOnce zonder foutlog', async () => {
    await seed();
    const logged: unknown[] = [];

    await runJobsOnce({
      core: coreJobs({ purgeExpired: () => Promise.resolve({}), purgeAppTables }),
      app: [],
      withJob,
      log: (line) => logged.push(line),
    });

    expect(logged).toStrictEqual([]);
    expect(await countRows(`app.audit_log where request_id like 'pj-%'`)).toBe(0);
  });
});

describe('MAX_PURGE_BATCH is gelijk aan de grens in app.purge_expired (jobs/AC-40)', () => {
  test('jobs/AC-40: als app_jobs slaagt de aanroep met MAX_PURGE_BATCH en geeft MAX_PURGE_BATCH + 1 22023', async () => {
    const job = { name: 'test.grens', key: 4001 };
    const atLimit = await withJob(job, async (tx) => {
      const result = await tx.execute(
        sql`select app.purge_expired('app.rate_limits'::regclass, ${MAX_PURGE_BATCH}) as deleted`,
      );
      return z.object({ deleted: z.number() }).parse(result.rows[0]).deleted;
    });
    expect(atLimit.ran).toBe(true);

    const error: unknown = await withJob(job, (tx) =>
      tx.execute(sql`select app.purge_expired('app.rate_limits'::regclass, ${MAX_PURGE_BATCH + 1})`),
    ).catch((caught: unknown) => caught);
    expect(sqlstateOf(error)).toBe('22023');
  });
});

describe('core.purge met een bezette lock (jobs/AC-43)', () => {
  // De lock van core.purge, vastgehouden door een andere transactie, precies tijdens de eerste batch van een ronde.
  function withBusyBatch(): { readonly wrapped: WithJob; readonly calls: () => number } {
    let calls = 0;
    const wrapped: WithJob = async (job, work, options) => {
      calls += 1;
      if (calls !== 2) return withJob(job, work, options);
      const client = await holder.connect();
      try {
        await client.query('begin');
        await client.query('select pg_catalog.pg_advisory_xact_lock($1, $2)', [
          JOB_LOCK_NAMESPACE,
          CORE_JOB_KEYS.purge,
        ]);
        return await withJob(job, work, options);
      } finally {
        await client.query('rollback');
        client.release();
      }
    };
    return { wrapped, calls: () => calls };
  }

  test('jobs/AC-43: de bezette tabel wordt overgeslagen zonder fout of foutlog, de volgende tabel komt aan de beurt en de volgende ronde ruimt hem op', async () => {
    await seed();
    const logged: unknown[] = [];
    const { wrapped } = withBusyBatch();

    // Aanroep 1 leest de tabellen (app.audit_log eerst), aanroep 2 is de eerste batch van app.audit_log: lock bezet.
    await runJobsOnce({
      core: coreJobs({ purgeExpired: () => Promise.resolve({}), purgeAppTables }),
      app: [],
      withJob: wrapped,
      log: (line) => logged.push(line),
    });

    expect(logged).toStrictEqual([]);
    expect(await countRows(`app.audit_log where request_id like 'pj-%'`)).toBe(3);
    expect(await countRows(`app.rate_limits where key like 'pj:old-%'`)).toBe(0);
    expect(await countRows(`app.one_time_use where key = 'pj:expired'`)).toBe(0);

    await runJobsOnce({
      core: coreJobs({ purgeExpired: () => Promise.resolve({}), purgeAppTables }),
      app: [],
      withJob,
      log: (line) => logged.push(line),
    });

    expect(logged).toStrictEqual([]);
    expect(await countRows(`app.audit_log where request_id like 'pj-%'`)).toBe(0);
  });

  test('jobs/AC-43: purgeAppTables meldt de overgeslagen tabel als skipped', async () => {
    await seed();
    const { wrapped } = withBusyBatch();

    const report = await purgeAppTables(wrapped);

    expect(report['app.audit_log']).toMatchObject({ deleted: 0, batches: 0, stoppedBy: 'skipped' });
    expect(report['app.rate_limits']).toMatchObject({ stoppedBy: 'drained' });
  });
});
