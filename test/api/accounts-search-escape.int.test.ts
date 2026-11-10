import { afterAll, afterEach, beforeEach, describe, expect, test } from 'vitest';
import { buildApp } from '../../src/api/app.ts';
import { createServices } from '../../src/api/services.ts';
import { accountsListContract } from '../../src/shared/contracts/accounts.ts';
import { beginTestDb, createPool, type TestDb, type TestUser } from '../../src/core/api/db/testing.ts';
import { APP_ORIGIN, createTestApp, required } from '../auth/harness.ts';

// lijstpagina/AC-18 (spec lijstpagina, Lijstquery-helpers, leerpunt #662): `%`, `_` en `\` in `q` zoeken letterlijk, geen wildcard.
// Tegen de echte database, zoals accounts-sort.int.test.ts. De test maakt de accounts zelf aan en telt per `q` hoe vaak elk ervan
// in `items` staat, zodat een lege lijst niet kan slagen.
const { auth, pool: apiPool } = createTestApp();
const services = createServices(auth);
const pool = createPool(required('MIGRATOR_DATABASE_URL'));
afterAll(async () => {
  await Promise.all([pool.end(), apiPool.end()]);
});

let db: TestDb;
beforeEach(async () => {
  db = await beginTestDb(pool);
});
afterEach(async () => {
  await db.rollback();
});

async function list(user: TestUser, q: string) {
  const app = buildApp({ appOrigin: APP_ORIGIN, auth: user.auth, withUser: db.withUser, services });
  const response = await app.fetch(new Request(`${APP_ORIGIN}/api/accounts?q=${encodeURIComponent(q)}`));
  expect(response.status).toBe(200);
  return accountsListContract.output.parse(await response.json());
}

const NAMES = ['Zoek a_b', 'Zoek axb', 'Zoek 5%', 'Zoek 5x', 'Zoek a\\b'] as const;

// Hoe vaak elk van de vijf accounts in `items` staat, per naam.
function countPerName(items: readonly { id: string }[], ids: ReadonlyMap<string, string>): Record<string, number> {
  return Object.fromEntries([...ids].map(([name, id]) => [name, items.filter((item) => item.id === id).length]));
}

async function setup() {
  const admin = await db.asUser('admin', { name: 'Zoek Admin' });
  const ids = new Map<string, string>();
  for (const name of NAMES) ids.set(name, (await db.asUser('user', { name })).actor.userId);
  return { admin, ids };
}

describe('lijstpagina/AC-18: %, _ en \\ in q zijn geen wildcard', () => {
  test('q=a_b vindt alleen "Zoek a_b", precies één keer', async () => {
    const { admin, ids } = await setup();
    const result = await list(admin, 'a_b');

    expect(countPerName(result.items, ids)).toStrictEqual({
      'Zoek a_b': 1,
      'Zoek axb': 0,
      'Zoek 5%': 0,
      'Zoek 5x': 0,
      'Zoek a\\b': 0,
    });
  });

  test('q=5% vindt alleen "Zoek 5%", precies één keer', async () => {
    const { admin, ids } = await setup();
    const result = await list(admin, '5%');

    expect(countPerName(result.items, ids)).toStrictEqual({
      'Zoek a_b': 0,
      'Zoek axb': 0,
      'Zoek 5%': 1,
      'Zoek 5x': 0,
      'Zoek a\\b': 0,
    });
  });

  test('q=\\ vindt "Zoek a\\b" precies één keer en geen van de andere vier', async () => {
    const { admin, ids } = await setup();
    const result = await list(admin, '\\');

    expect(countPerName(result.items, ids)).toStrictEqual({
      'Zoek a_b': 0,
      'Zoek axb': 0,
      'Zoek 5%': 0,
      'Zoek 5x': 0,
      'Zoek a\\b': 1,
    });
  });
});
