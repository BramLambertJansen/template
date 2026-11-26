import { sql } from 'drizzle-orm';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createPool, createWithUser } from '../../src/core/api/db/testing.ts';
import { UserId } from '../../src/core/shared/ids.ts';
import { required } from './harness.ts';
import {
  addAccount,
  cleanupTestRoles,
  hasCountedBeheer,
  isLastAdmin,
  migratorPool,
  onlyCountedBeheer,
  reasonOf,
  registerTestRoles,
  uniqueId,
} from './role-register-harness.ts';

// De laatste-beheerder-regel onder gelijktijdigheid (spec rollenregister, ST-16: rollenregister/AC-10 a, b en c), tegen de echte
// database met twee of drie verbindingen (`pnpm test:db`). De rollen planner, eigenaar en toezicht worden gecommit; elke test
// ruimt ze op in `finally` en het bestand in beforeAll (idempotent), want een achtergebleven beheerrol breekt de bestaande
// racetests (test/auth/roles.int.test.ts en de accountracetests rekenen met `admin` als enige beheerrol).
const migrator = migratorPool(8);
const apiPool = createPool(required('DATABASE_URL'));
const withUser = createWithUser(apiPool);

beforeAll(async () => {
  await cleanupTestRoles(migrator);
});
afterAll(async () => {
  try {
    await cleanupTestRoles(migrator);
  } finally {
    await Promise.all([migrator.end(), apiPool.end()]);
  }
});

const mfa = (id: string) => ({ userId: UserId.parse(id), sessionStrength: 'mfa' }) as const;

// Beide kanten wachten even, zodat de aanroepen elkaar waarschijnlijk overlappen (zoals test/auth/roles.int.test.ts). AC-10a
// rekent daar niet op maar houdt de lock vast (whileLockHeld).
const degrade = (actor: string, target: string) =>
  withUser(mfa(actor), async (tx) => {
    await tx.execute(sql`select pg_sleep(0.05)`);
    await tx.execute(sql`select app.assign_role(${target}, 'user')`);
  });
const block = (actor: string, target: string) =>
  withUser(mfa(actor), async (tx) => {
    await tx.execute(sql`select pg_sleep(0.05)`);
    await tx.execute(sql`select app.set_account_blocked(${target}, true)`);
  });

// T1 in (b): register_role in een eigen transactie, met dezelfde wachttijd.
async function registerInTransaction(name: string, beheer: boolean): Promise<void> {
  const client = await migrator.connect();
  try {
    await client.query('begin');
    await client.query('select pg_sleep(0.05)');
    await client.query('select app.register_role($1, $2)', [name, beheer]);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

// Twee beheerders met verschillende beheerrollen; andere dragers van een beheerrol gaan terug naar user.
async function twoBeheerders(): Promise<[string, string]> {
  const [a, b] = [uniqueId('race-a'), uniqueId('race-b')];
  await addAccount(migrator, a, { role: 'eigenaar' });
  await addAccount(migrator, b, { role: 'toezicht' });
  await onlyCountedBeheer(migrator, [a, b]);
  return [a, b];
}

async function beheerdersAmong(ids: string[]): Promise<string[]> {
  const { rows } = await migrator.query<{ user_id: string }>(
    `select ur.user_id from public.user_roles ur join app.roles r on r.name = ur.role
     where r.beheer and ur.user_id = any($1) order by 1`,
    [ids],
  );
  return rows.map((row) => row.user_id);
}

async function blockedAmong(ids: string[]): Promise<string[]> {
  const { rows } = await migrator.query<{ id: string }>(
    'select id from better_auth."user" where id = any($1) and blocked_at is not null order by 1',
    [ids],
  );
  return rows.map((row) => row.id);
}

// Vaste overlap voor AC-10a. assign_role en set_account_blocked controleren de actor (app.is_mfa_admin()) vóór de lock van de
// laatste-beheerder-regel. Commit de ene kant voordat de andere die controle doet, dan is de verliezer al gedegradeerd of
// geblokkeerd en krijgt hij FORBIDDEN in plaats van LAST_ADMIN: een wachttijd alleen garandeert de overlap niet (CI-run
// 45889240479). Daarom houdt een derde verbinding de lock vast tot beide aanroepen hun actorcontrole voorbij zijn en op de lock
// wachten; daarna beslist de regel binnen de lock, zoals de AC vraagt.
async function whileLockHeld(
  start: () => [Promise<unknown>, Promise<unknown>],
): Promise<[PromiseSettledResult<unknown>, PromiseSettledResult<unknown>]> {
  const holder = await migrator.connect();
  // Zonder geslaagde vrijgave gaat de verbinding weg in plaats van terug naar de pool: een lock op sessieniveau mag niet blijven.
  let unlocked = false;
  try {
    await holder.query("select pg_advisory_lock(hashtext('public.user_roles:last_admin'))");
    const calls = start();
    // Meteen afhandelen: een aanroep die al vóór de lock faalt, is dan geen onafgehandelde rejection.
    const settled = Promise.allSettled(calls);
    try {
      await waitForLockWaiters(2);
    } finally {
      await holder.query("select pg_advisory_unlock(hashtext('public.user_roles:last_admin'))");
      unlocked = true;
    }
    return await settled;
  } finally {
    holder.release(!unlocked);
  }
}

function expectOneWinner(results: PromiseSettledResult<unknown>[]): void {
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  const losers = results.filter((result) => result.status === 'rejected');
  expect(losers).toHaveLength(1);
  // Precies LAST_ADMIN: de verliezer is niet al gedegradeerd (FORBIDDEN) maar botst binnen de lock op de regel.
  expect(losers.map(reasonOf).map(isLastAdmin)).toStrictEqual([true]);
}

describe('twee beheerders met verschillende beheerrollen (AC-10a)', () => {
  test('rollenregister/AC-10a: eigenaar en toezicht degraderen elkaar tegelijk: precies één slaagt, de ander krijgt LAST_ADMIN', async () => {
    try {
      await registerTestRoles(migrator);
      const [a, b] = await twoBeheerders();

      const results = await whileLockHeld(() => [degrade(a, b), degrade(b, a)]);

      expectOneWinner(results);
      const winner = results[0].status === 'fulfilled' ? a : b;
      expect(await beheerdersAmong([a, b])).toStrictEqual([winner]);
      expect(await hasCountedBeheer(migrator)).toBe(true);
    } finally {
      await cleanupTestRoles(migrator);
    }
  });

  test('rollenregister/AC-10a: eigenaar en toezicht blokkeren elkaar tegelijk: precies één slaagt, de ander krijgt LAST_ADMIN', async () => {
    try {
      await registerTestRoles(migrator);
      const [a, b] = await twoBeheerders();

      const results = await whileLockHeld(() => [block(a, b), block(b, a)]);

      expectOneWinner(results);
      const winner = results[0].status === 'fulfilled' ? a : b;
      const loser = winner === a ? b : a;
      expect(await blockedAmong([a, b])).toStrictEqual([loser]);
      expect(await hasCountedBeheer(migrator)).toBe(true);
    } finally {
      await cleanupTestRoles(migrator);
    }
  });

  test('rollenregister/AC-10a: de ene beheerder degradeert de andere terwijl die hem blokkeert: precies één slaagt', async () => {
    try {
      await registerTestRoles(migrator);
      const [a, b] = await twoBeheerders();

      const results = await whileLockHeld(() => [degrade(a, b), block(b, a)]);

      expectOneWinner(results);
      const degraded = results[0].status === 'fulfilled';
      expect(degraded ? await beheerdersAmong([a, b]) : await blockedAmong([a, b])).toStrictEqual([a]);
      expect(await hasCountedBeheer(migrator)).toBe(true);
    } finally {
      await cleanupTestRoles(migrator);
    }
  });
});

describe('register_role tegen blokkeren van de laatste admin (AC-10b)', () => {
  test('rollenregister/AC-10b: register_role(eigenaar, false) en het blokkeren van de laatste admin: precies één slaagt, de ander krijgt LAST_ADMIN', async () => {
    try {
      await registerTestRoles(migrator);
      // A: de admin die geblokkeerd wordt; E: eigenaar, telbaar. Z: een beheerder die zelf niet telt (gedeactiveerd) en
      // blokkeert, zodat zijn eigen rol niet verandert tijdens de race.
      const [a, e, z] = [uniqueId('race-adm'), uniqueId('race-eig'), uniqueId('race-zon')];
      await addAccount(migrator, a, { role: 'admin' });
      await addAccount(migrator, e, { role: 'eigenaar' });
      await addAccount(migrator, z, { role: 'toezicht', deactivated: true });
      await onlyCountedBeheer(migrator, [a, e, z]);

      const results = await Promise.allSettled([registerInTransaction('eigenaar', false), block(z, a)]);

      expectOneWinner(results);
      const { rows } = await migrator.query<{ beheer: boolean }>(
        "select beheer from app.roles where name = 'eigenaar'",
      );
      expect(rows[0]?.beheer === false).toBe(results[0].status === 'fulfilled');
      expect((await blockedAmong([a])).length === 1).toBe(results[1].status === 'fulfilled');
      expect(await hasCountedBeheer(migrator)).toBe(true);
    } finally {
      await cleanupTestRoles(migrator);
    }
  });
});

// Wacht tot zoveel verbindingen op een advisory lock wachten (de lock van de laatste-beheerder-regel); zo staan T2 en T3 van
// AC-10c in een vaste volgorde in de wachtrij en zijn beide aanroepen van AC-10a hun actorcontrole voorbij (whileLockHeld),
// zonder te rekenen op tijd. Na de wachttijd gaat de test door: de asserts melden het dan. Telt via pg_locks, niet via
// pg_stat_activity: die toont de wachtstatus van sessies van een andere rol (api_user, de AC-10a-aanroepen) aan app_migrator
// als NULL. De int-tests draaien serieel (vitest.config.ts), dus andere advisory locks tellen niet mee.
async function waitForLockWaiters(count: number): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const { rows } = await migrator.query<{ n: number }>(
      "select count(*)::integer as n from pg_locks where locktype = 'advisory' and not granted",
    );
    if ((rows[0]?.n ?? 0) >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

describe('register_role zonder dragers, open, tegen een toekenning en een degradatie (AC-10c)', () => {
  test('rollenregister/AC-10c: T1 register_role(eigenaar, false) open, T2 kent eigenaar toe, T3 degradeert de laatste admin: T3 geweigerd met LAST_ADMIN en er blijft een telbare beheerder', async () => {
    let t1: pg.PoolClient | undefined;
    try {
      await registerTestRoles(migrator);
      // A: de laatste telbare admin; X: een telbaar account (user) dat eigenaar wordt; eigenaar heeft geen dragers.
      const [a, x] = [uniqueId('race-c-adm'), uniqueId('race-c-x')];
      await addAccount(migrator, a, { role: 'admin' });
      await addAccount(migrator, x, { role: 'user' });
      await onlyCountedBeheer(migrator, [a]);

      t1 = await migrator.connect();
      await t1.query('begin');
      await t1.query("select app.register_role('eigenaar', false)");
      const second = migrator.query("select app.assign_role($1, 'eigenaar')", [x]);
      await waitForLockWaiters(1);
      const third = migrator.query("select app.assign_role($1, 'user')", [a]);
      await waitForLockWaiters(2);
      await t1.query('commit');
      const results = await Promise.allSettled([second, third]);

      // T1 was eerst: de rol is zonder dragers beheerloos geworden, T2 slaagt en T3 zou de laatste telbare beheerder wegnemen.
      expect(results[0].status).toBe('fulfilled');
      expect(results[1].status).toBe('rejected');
      expect(
        results
          .map(reasonOf)
          .filter((reason) => reason !== undefined)
          .map(isLastAdmin),
      ).toStrictEqual([true]);
      expect(await hasCountedBeheer(migrator)).toBe(true);
      expect(await beheerdersAmong([a])).toStrictEqual([a]);
    } finally {
      if (t1 !== undefined) {
        await t1.query('rollback').catch(() => undefined);
        t1.release();
      }
      await cleanupTestRoles(migrator);
    }
  });
});
