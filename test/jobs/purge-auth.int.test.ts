import pg from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { createPurgeExpired } from '../../src/core/api/auth/purge.ts';
import { AUTH_RATE_LIMIT_KEEP_SECONDS, MAX_PURGE_BATCH } from '../../src/core/shared/limits.ts';
import { Browser, createTestApp } from '../auth/harness.ts';
import { required } from './harness.ts';

// purgeExpired() voor better_auth (spec achtergrondtaken, deel D: jobs/AC-34 t/m jobs/AC-38): als auth_service op de pool van
// Better Auth, in batches onder de lock van core.purge_auth. Echte database (`pnpm test:db`); wat de tests committen ruimen ze op.
const pool = new pg.Pool({ connectionString: required('AUTH_DATABASE_URL'), max: 4 });
const purgeExpired = createPurgeExpired(pool);
const USER = 'pa-user';

const count = z.object({ n: z.number() });
async function countRows(table: string, where: string): Promise<number> {
  const { rows } = await pool.query(`select count(*)::int as n from ${table} where ${where}`);
  return count.parse(rows[0]).n;
}

async function cleanup(): Promise<void> {
  await pool.query(`delete from better_auth.session where id like 'pa-%'`);
  await pool.query(`delete from better_auth.verification where id like 'pa-%'`);
  await pool.query(`delete from better_auth."rateLimit" where id like 'pa-%'`);
  await pool.query(`delete from better_auth."user" where id = $1`, [USER]);
}

beforeAll(async () => {
  await cleanup();
  // Verlopen rijen van andere tests tellen niet mee in de aantallen hieronder.
  await purgeExpired();
});
beforeEach(async () => {
  await pool.query(
    `insert into better_auth."user" (id, name, email, "emailVerified") values ($1, 'Purge', 'pa-user@example.test', true)`,
    [USER],
  );
});
afterEach(cleanup);
afterAll(async () => {
  await cleanup();
  await pool.end();
});

// Zet n sessies klaar met een eigen id-prefix.
// Wat de test van een vi.spyOn op client.query leest: de argumenten van elke aanroep.
interface QuerySpy {
  readonly mock: { readonly calls: readonly (readonly unknown[])[] };
}

interface SessionAge {
  readonly createdAgo: string;
  readonly expiresIn: string;
}

async function insertSessions(prefix: string, n: number, age: SessionAge): Promise<void> {
  await pool.query(
    `insert into better_auth.session (id, "expiresAt", token, "createdAt", "updatedAt", "userId")
     select $1 || g, pg_catalog.now() + $4::interval, $1 || 'token-' || g, pg_catalog.now() - $3::interval, pg_catalog.now(), $5
     from generate_series(1, $2::int) g`,
    [prefix, n, age.createdAgo, age.expiresIn, USER],
  );
}

describe('sessies en verificaties (jobs/AC-34)', () => {
  test('jobs/AC-34: een verlopen sessie, en een sessie ouder dan 7 dagen met expiresAt in de toekomst, verdwijnen; een van 6 dagen blijft', async () => {
    await insertSessions('pa-expired-', 1, { createdAgo: '1 hour', expiresIn: '-1 minute' });
    await insertSessions('pa-old-', 1, { createdAgo: '7 days 1 minute', expiresIn: '1 day' });
    await insertSessions('pa-young-', 1, { createdAgo: '6 days', expiresIn: '1 day' });

    const report = await purgeExpired();

    expect(report.session).toBeGreaterThanOrEqual(2);
    expect(await countRows('better_auth.session', `id = 'pa-expired-1'`)).toBe(0);
    expect(await countRows('better_auth.session', `id = 'pa-old-1'`)).toBe(0);
    expect(await countRows('better_auth.session', `id = 'pa-young-1'`)).toBe(1);
  });

  test('jobs/AC-34: verificaties met expiresAt in het verleden verdwijnen, een geldige (uitnodigingslink) blijft', async () => {
    await pool.query(
      `insert into better_auth.verification (id, identifier, value, "expiresAt") values
         ('pa-verify-expired', 'pa-i-1', 'v', pg_catalog.now() - interval '1 minute'),
         ('pa-verify-valid', 'pa-i-2', 'v', pg_catalog.now() + interval '1 day')`,
    );

    const report = await purgeExpired();

    expect(report.verification).toBeGreaterThanOrEqual(1);
    expect(await countRows('better_auth.verification', `id = 'pa-verify-expired'`)).toBe(0);
    expect(await countRows('better_auth.verification', `id = 'pa-verify-valid'`)).toBe(1);
  });
});

describe('rateLimit (jobs/AC-35)', () => {
  test('jobs/AC-35: een rij met lastRequest van 61 s geleden verdwijnt, een van 59 s geleden blijft', async () => {
    expect(AUTH_RATE_LIMIT_KEEP_SECONDS).toBe(60);
    await pool.query(
      `insert into better_auth."rateLimit" (id, key, count, "lastRequest") values
         ('pa-rl-old', 'pa-key-old', 1, (extract(epoch from pg_catalog.now()) * 1000)::bigint - 61000),
         ('pa-rl-new', 'pa-key-new', 1, (extract(epoch from pg_catalog.now()) * 1000)::bigint - 59000)`,
    );

    const report = await purgeExpired();

    expect(report.rateLimit).toBeGreaterThanOrEqual(1);
    expect(await countRows('better_auth."rateLimit"', `id = 'pa-rl-old'`)).toBe(0);
    expect(await countRows('better_auth."rateLimit"', `id = 'pa-rl-new'`)).toBe(1);
  });
});

describe('opruimen verkort geen lopend venster (jobs/AC-36)', () => {
  test('jobs/AC-36: vier anonieme requests op /api/auth/forget-password/x binnen 60 s geven bij de vierde 429, ook met purgeExpired() ertussen', async () => {
    const { app, auth, pool: appPool } = createTestApp();
    const browser = new Browser(app);
    try {
      const statuses: number[] = [];
      for (let attempt = 0; attempt < 4; attempt += 1) {
        if (attempt === 3) await auth.purgeExpired();
        statuses.push((await browser.post('/api/auth/forget-password/x', {})).status);
      }

      expect(statuses.slice(0, 3)).not.toContain(429);
      expect(statuses[3]).toBe(429);
    } finally {
      await pool.query(`delete from better_auth."rateLimit" where key like $1`, [`${browser.ip}%`]);
      await Promise.all([appPool.end(), auth.closePool()]);
    }
  });
});

describe('batches (jobs/AC-37)', () => {
  test('jobs/AC-37: 1001 verlopen sessies zijn na één aanroep weg, in twee transacties; het rapport telt 1001', async () => {
    await insertSessions('pa-batch-', MAX_PURGE_BATCH + 1, { createdAgo: '2 hours', expiresIn: '-1 minute' });
    await insertSessions('pa-valid-', 1, { createdAgo: '1 hour', expiresIn: '1 day' });
    const spied = new WeakSet<pg.PoolClient>();
    const spies: QuerySpy[] = [];
    pool.on('acquire', (client) => {
      if (spied.has(client)) return;
      spied.add(client);
      spies.push(vi.spyOn(client, 'query'));
    });

    try {
      const report = await purgeExpired();

      expect(report.session).toBe(MAX_PURGE_BATCH + 1);
      expect(await countRows('better_auth.session', `id like 'pa-batch-%'`)).toBe(0);
      expect(await countRows('better_auth.session', `id = 'pa-valid-1'`)).toBe(1);
      // Twee batches voor de sessies, één lege batch voor verificaties en één voor rateLimit: elk een eigen transactie.
      const commits = spies.flatMap((spy) => spy.mock.calls).filter((call) => call[0] === 'commit');
      expect(commits).toHaveLength(4);
    } finally {
      pool.removeAllListeners('acquire');
      vi.restoreAllMocks();
    }
  });
});

describe('twee gelijktijdige aanroepen (jobs/AC-38)', () => {
  test('jobs/AC-38: samen verwijderen ze elke verlopen rij precies één keer en geen geldige rij', async () => {
    const expired = 2 * MAX_PURGE_BATCH + 500;
    await insertSessions('pa-race-', expired, { createdAgo: '2 hours', expiresIn: '-1 minute' });
    await insertSessions('pa-racevalid-', 3, { createdAgo: '1 hour', expiresIn: '1 day' });

    const reports = await Promise.all([purgeExpired(), purgeExpired()]);

    const deleted = reports.reduce((sum, report) => sum + report.session, 0);
    expect(deleted).toBe(expired);
    expect(await countRows('better_auth.session', `id like 'pa-race-%'`)).toBe(0);
    expect(await countRows('better_auth.session', `id like 'pa-racevalid-%'`)).toBe(3);
  }, 30_000);
});
