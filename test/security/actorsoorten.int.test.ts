import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { z } from 'zod';
import { routes } from '../../src/api/app.ts';
import { defineRoles, type Roles } from '../../src/core/shared/roles.ts';
import { cleanupTestRoles, migratorPool } from '../auth/role-register-harness.ts';
import type { AppRoute, RouteSample } from './fixtures.ts';

// suitecontract/AC-17 (docs/template/specs/suite-volgt-contract.md, ontwerp 7, leerpunt #719): de enige plek met een echte derde
// rol. `createSecurityFixtures(bron)` maakt voor een rol uit het register van de bron het account met die rol in
// public.user_roles en de juiste sessiesterkte (password, of mfa voor `<rol>Mfa`). Testrollen suitetest_planner (geen beheer) en
// suitetest_beheer (beheer) worden gecommit via app.register_role en idempotent opgeruimd met cleanupTestRoles (in beforeAll en
// in finally), zodat ze niet botsen met planner, eigenaar en toezicht uit de andere roltests. Echte database, Better Auth en
// Mailpit (`pnpm test:db`).
//
// Verwachte interface (door de developer te bouwen in test/security/fixtures.ts): `createSecurityFixtures(bron?)` met
// `bron = { register: Roles, oracle: Readonly<Record<string, readonly string[]>>, mfaRollen: readonly string[] }`;
// `actor(soort: string, categorie)`, `stuurAls(soort: string, ...)`, `A(rol: string = 'user')` en `B(rol: string = 'user')` nemen
// elke soort of rolnaam uit het register van de bron; `account()` in test/api/account-harness.ts neemt elke rolnaam. Hier
// dynamisch gelezen en met een eigen minimale interface getypt, zodat dit bestand compileert voordat ze bestaan en dan op een
// assertie faalt.
const LANG = 120_000;
const PLANNER = 'suitetest_planner';
const BEHEER = 'suitetest_beheer';
const TESTROLLEN = [PLANNER, BEHEER];

interface Bron {
  readonly register: Roles;
  readonly oracle: Readonly<Record<string, readonly string[]>>;
  readonly mfaRollen: readonly string[];
}
interface Actor {
  readonly soort: string;
  readonly userId: string;
  readonly email: string;
}
interface Sessie {
  readonly session_strength: string;
}
interface Fixtures {
  readonly actor: (soort: string, categorie: string) => Promise<Actor>;
  readonly stuurAls: (soort: string, route: AppRoute, verzoek: { readonly sample: RouteSample }) => Promise<unknown>;
  readonly A: (rol?: string) => Promise<Actor>;
  readonly B: (rol?: string) => Promise<Actor>;
  readonly sessionsOf: (userId: string) => Promise<Sessie[]>;
  readonly close: () => Promise<unknown>;
}

const fixturesModule = z.object({
  createSecurityFixtures: z.custom<(bron: Bron) => Fixtures>((waarde) => typeof waarde === 'function'),
});

const migrator = migratorPool();
const bron: Bron = {
  register: defineRoles({ [PLANNER]: { beheer: false }, [BEHEER]: { beheer: true } }),
  oracle: { 'app.use': ['user', 'admin', PLANNER, BEHEER] },
  mfaRollen: ['admin', BEHEER],
};
let t: Fixtures;

beforeAll(async () => {
  await cleanupTestRoles(migrator, TESTROLLEN);
  await migrator.query('select app.register_role($1, false)', [PLANNER]);
  await migrator.query('select app.register_role($1, true)', [BEHEER]);
  const gelezen = fixturesModule.safeParse(await import('./fixtures.ts'));
  expect(gelezen.success, 'test/security/fixtures.ts exporteert createSecurityFixtures').toBe(true);
  if (!gelezen.success) throw new Error('test/security/fixtures.ts exporteert createSecurityFixtures niet');
  t = gelezen.data.createSecurityFixtures(bron);
}, LANG);

afterAll(async () => {
  try {
    await cleanupTestRoles(migrator, TESTROLLEN);
  } finally {
    await Promise.all([t.close(), migrator.end()]);
  }
}, LANG);

async function rolenVan(userId: string): Promise<string[]> {
  const { rows } = await migrator.query<{ role: string }>('select role from public.user_roles where user_id = $1', [
    userId,
  ]);
  return rows.map((rij) => rij.role);
}

async function sterktes(userId: string): Promise<string[]> {
  return (await t.sessionsOf(userId)).map((sessie) => sessie.session_strength);
}

describe('suitecontract/AC-17: een echte derde rol uit het register', { timeout: LANG }, () => {
  test('suitecontract/AC-17: actor(suitetest_planner) heeft een account met rol suitetest_planner en een password-sessie', async () => {
    const planner = await t.actor(PLANNER, 'lezen');

    expect(planner.soort).toBe(PLANNER);
    expect(await rolenVan(planner.userId)).toStrictEqual([PLANNER]);
    const sterkte = await sterktes(planner.userId);
    expect(sterkte.length).toBeGreaterThan(0);
    expect(
      sterkte.every((waarde) => waarde === 'password'),
      `sessies: ${sterkte.join(', ')}`,
    ).toBe(true);
  });

  test('suitecontract/AC-17: A(suitetest_beheer) en B(suitetest_beheer) zijn twee verschillende accounts met rol suitetest_beheer en een mfa-sessie', async () => {
    const a = await t.A(BEHEER);
    const b = await t.B(BEHEER);

    expect(a.userId).not.toBe(b.userId);
    for (const actor of [a, b]) {
      expect(await rolenVan(actor.userId), actor.soort).toStrictEqual([BEHEER]);
      expect(await sterktes(actor.userId), actor.soort).toContain('mfa');
    }
    expect(a.soort).toBe(`${BEHEER}Mfa`);
    expect((await t.A(BEHEER)).userId, 'A blijft hetzelfde account').toBe(a.userId);
    expect((await t.B(BEHEER)).userId, 'B blijft hetzelfde account').toBe(b.userId);
  });

  test('suitecontract/AC-17: A(suitetest_planner) is een gewone password-actor met rol suitetest_planner, niet de user-soort', async () => {
    const a = await t.A(PLANNER);

    expect(await rolenVan(a.userId)).toStrictEqual([PLANNER]);
    expect(await sterktes(a.userId)).not.toContain('mfa');
  });

  test('suitecontract/AC-17: actor(suitetest_beheerZonderMfa) heeft rol suitetest_beheer en alleen een password-sessie', async () => {
    const zonderMfa = await t.actor(`${BEHEER}ZonderMfa`, 'lezen');

    expect(await rolenVan(zonderMfa.userId)).toStrictEqual([BEHEER]);
    const sterkte = await sterktes(zonderMfa.userId);
    expect(sterkte.length).toBeGreaterThan(0);
    expect(
      sterkte.every((waarde) => waarde === 'password'),
      `sessies: ${sterkte.join(', ')}`,
    ).toBe(true);
  });

  test('suitecontract/AC-17: A(baas) en B(baas), een rol buiten het register, gooien met de rolnaam', async () => {
    await expect((async () => t.A('baas'))()).rejects.toThrow('baas');
    await expect((async () => t.B('baas'))()).rejects.toThrow('baas');
  });

  test('suitecontract/AC-17: een soort buiten actorSoorten (baasMfa) gooit in actor en stuurAls met de melding uit ontwerp 7', async () => {
    const melding = "onbekende actorsoort 'baasMfa' (niet in actorSoorten van het rollenregister)";
    const route = routes.at(0);
    expect(route, 'het routeregister heeft een route').toBeDefined();
    if (route === undefined) throw new Error('het routeregister is leeg');

    await expect((async () => t.actor('baasMfa', 'lezen'))()).rejects.toThrow(melding);
    await expect((async () => t.stuurAls('baasMfa', route, { sample: { params: {}, invoer: {} } }))()).rejects.toThrow(
      melding,
    );
  });

  test('suitecontract/AC-17: na cleanupTestRoles staan de testrollen niet meer in app.roles en heeft geen account ze nog', async () => {
    const planner = await t.actor(PLANNER, 'lezen');
    expect(await rolenVan(planner.userId)).toStrictEqual([PLANNER]);

    try {
      const { rows: voor } = await migrator.query<{ name: string }>('select name from app.roles where name = any($1)', [
        TESTROLLEN,
      ]);
      expect(voor.map((rij) => rij.name).sort()).toStrictEqual([BEHEER, PLANNER]);
    } finally {
      await cleanupTestRoles(migrator, TESTROLLEN);
    }

    const { rows: na } = await migrator.query<{ name: string }>('select name from app.roles where name = any($1)', [
      TESTROLLEN,
    ]);
    expect(na).toStrictEqual([]);
    const { rows: dragers } = await migrator.query<{ user_id: string }>(
      'select user_id from public.user_roles where role = any($1)',
      [TESTROLLEN],
    );
    expect(dragers).toStrictEqual([]);
  });
});
