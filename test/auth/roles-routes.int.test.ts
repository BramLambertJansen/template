import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { z } from 'zod';
import { beginTestDb, createPool, createWithUser, type TestDb, type TestUser } from '../../src/core/api/db/testing.ts';
import { createApp } from '../../src/core/api/http/create-app.ts';
import { createRouteKit } from '../../src/core/api/route/kit.ts';
import { defineAuditActions } from '../../src/core/shared/audit.ts';
import { definePermissions } from '../../src/core/shared/can.ts';
import { createContracts } from '../../src/core/shared/contract.ts';
import { UserId } from '../../src/core/shared/ids.ts';
import { defineRoles } from '../../src/core/shared/roles.ts';
import { required } from './harness.ts';
import {
  addAccount,
  cleanupTestRoles,
  migratorPool,
  reasonOf,
  registerTestRoles,
  uniqueId,
} from './role-register-harness.ts';

// Spec rollenregister (ST-16): een app voegt rollen toe zonder core te wijzigen. Routes via de testkit (`asUser`), echte
// createApp en withUser, tegen de echte database (`pnpm test:db`). Testregister: planner (geen beheer), eigenaar (beheer),
// toezicht (beheer). Testtabel: eigenaar heeft accounts:read en accounts:manage, toezicht en planner me:read.
// De rollen zijn gecommit (de testkit ziet ze alleen zo) en worden opgeruimd in beforeAll en afterAll (idempotent); `spook`
// staat wel in app.roles maar niet in het register (AC-12).
const GHOST = 'spook';
const migrator = migratorPool();
const pool = createPool(required('MIGRATOR_DATABASE_URL'));
const apiPool = createPool(required('DATABASE_URL'));
const withApiUser = createWithUser(apiPool);

beforeAll(async () => {
  await cleanupTestRoles(migrator, ['planner', 'eigenaar', 'toezicht', GHOST]);
  await registerTestRoles(migrator);
  await migrator.query('select app.register_role($1, false)', [GHOST]);
});
afterAll(async () => {
  try {
    await cleanupTestRoles(migrator, ['planner', 'eigenaar', 'toezicht', GHOST]);
  } finally {
    await Promise.all([migrator.end(), pool.end(), apiPool.end()]);
  }
});

// Het register en de routes van de app in het klein; `plannerBeheer` zet de vlag van planner in de code (AC-16).
function kit(plannerBeheer: boolean) {
  const register = defineRoles({
    planner: { beheer: plannerBeheer },
    eigenaar: { beheer: true },
    toezicht: { beheer: true },
  });
  const permissions = definePermissions(register, {
    'me:read': { roles: ['planner', 'toezicht'] },
    'accounts:read': { roles: ['eigenaar'] },
    'accounts:manage': { roles: ['eigenaar'] },
  });
  const { defineContract } = createContracts(permissions);
  const { defineRoute } = createRouteKit({ permissions, audit: defineAuditActions({}) });
  const input = z.object({}).strict();
  const output = z.object({ ok: z.literal(true) }).strict();
  const handler = () => Promise.resolve({ ok: true as const });
  const routes = [
    defineRoute(
      defineContract({ method: 'GET', path: '/roles/app-use', input, output, permission: 'app.use' }),
      handler,
    ),
    defineRoute(
      defineContract({ method: 'GET', path: '/roles/me-read', input, output, permission: 'me:read' }),
      handler,
    ),
    defineRoute(
      defineContract({ method: 'GET', path: '/roles/accounts-read', input, output, permission: 'accounts:read' }),
      handler,
    ),
    defineRoute(
      defineContract({ method: 'GET', path: '/roles/accounts-manage', input, output, permission: 'accounts:manage' }),
      handler,
    ),
  ];
  return { register, routes };
}

const PATHS = {
  'app.use': '/roles/app-use',
  'me:read': '/roles/me-read',
  'accounts:read': '/roles/accounts-read',
  'accounts:manage': '/roles/accounts-manage',
} as const;

type Outcome = readonly [number, string];

async function call(user: TestUser, path: string, plannerBeheer = false): Promise<Outcome> {
  const { register, routes } = kit(plannerBeheer);
  const app = createApp({
    appOrigin: 'http://localhost:5173',
    roles: register,
    auth: user.auth,
    withUser: db.withUser,
    routes,
  });
  const response = await app.fetch(
    new Request(`http://localhost/api${path}`, { method: 'GET', headers: { 'sec-fetch-site': 'same-origin' } }),
  );
  const body = z
    .object({ code: z.string().optional() })
    .loose()
    .parse(await response.json());
  return [response.status, body.code ?? 'OK'];
}

let db: TestDb;
beforeEach(async () => {
  db = await beginTestDb(pool);
});
afterEach(async () => {
  await db.rollback();
});

async function isMfaAdmin(user: TestUser): Promise<unknown> {
  return db.withUser(user.actor, async (tx) => {
    const { rows } = await tx.execute<{ ok: boolean }>(sql`select app.is_mfa_admin() as ok`);
    return rows[0]?.ok;
  });
}

describe('routes met een rollenregister van de app', () => {
  test('rollenregister/AC-2: planner (asUser): app.use en me:read slagen, de rest is 403 FORBIDDEN', async () => {
    const planner = await db.asUser('planner');

    expect([
      await call(planner, PATHS['app.use']),
      await call(planner, PATHS['me:read']),
      await call(planner, PATHS['accounts:read']),
      await call(planner, PATHS['accounts:manage']),
    ]).toStrictEqual([
      [200, 'OK'],
      [200, 'OK'],
      [403, 'FORBIDDEN'],
      [403, 'FORBIDDEN'],
    ]);
  });

  test('rollenregister/AC-2: een beheerrol zonder de permissie (toezicht met mfa) is FORBIDDEN op accounts:read en accounts:manage', async () => {
    const toezicht = await db.asUser('toezicht');

    expect([
      await call(toezicht, PATHS['me:read']),
      await call(toezicht, PATHS['accounts:read']),
      await call(toezicht, PATHS['accounts:manage']),
    ]).toStrictEqual([
      [200, 'OK'],
      [403, 'FORBIDDEN'],
      [403, 'FORBIDDEN'],
    ]);
  });

  test('rollenregister/AC-2: eigenaar met mfa (de standaardsterkte voor een beheerrol): accounts:read en accounts:manage slagen, me:read is FORBIDDEN', async () => {
    const eigenaar = await db.asUser('eigenaar');

    expect(eigenaar.actor.sessionStrength).toBe('mfa');
    expect([
      await call(eigenaar, PATHS['accounts:read']),
      await call(eigenaar, PATHS['accounts:manage']),
      await call(eigenaar, PATHS['me:read']),
    ]).toStrictEqual([
      [200, 'OK'],
      [200, 'OK'],
      [403, 'FORBIDDEN'],
    ]);
  });

  test('rollenregister/AC-2: planner is standaard een password-sessie (geen beheer, geen mfa nodig)', async () => {
    const planner = await db.asUser('planner');

    expect(planner.actor.sessionStrength).toBe('password');
  });

  test('rollenregister/AC-3: eigenaar met een password-sessie: elke toegestane route is 403 MFA_REQUIRED, ook app.use', async () => {
    const eigenaar = await db.asUser('eigenaar', { sessionStrength: 'password' });

    expect([
      await call(eigenaar, PATHS['app.use']),
      await call(eigenaar, PATHS['accounts:read']),
      await call(eigenaar, PATHS['accounts:manage']),
      await call(eigenaar, PATHS['me:read']),
    ]).toStrictEqual([
      [403, 'MFA_REQUIRED'],
      [403, 'MFA_REQUIRED'],
      [403, 'MFA_REQUIRED'],
      [403, 'FORBIDDEN'],
    ]);
  });

  test('rollenregister/AC-3: app.is_mfa_admin() is false met password en true met mfa voor eigenaar', async () => {
    const withPassword = await db.asUser('eigenaar', { sessionStrength: 'password' });
    const withMfa = await db.asUser('eigenaar', { sessionStrength: 'mfa' });

    expect([await isMfaAdmin(withPassword), await isMfaAdmin(withMfa)]).toStrictEqual([false, true]);
  });

  test('rollenregister/AC-3: planner is nooit is_mfa_admin, ook niet met mfa', async () => {
    const planner = await db.asUser('planner', { sessionStrength: 'mfa' });
    const beheer = await db.asUser('toezicht', { sessionStrength: 'mfa' });

    expect([await isMfaAdmin(planner), await isMfaAdmin(beheer)]).toStrictEqual([false, true]);
  });

  test('rollenregister/AC-12: een rol in app.roles die niet in het register staat is 403 FORBIDDEN op elke route, ook app.use', async () => {
    const ghostPassword = await db.asUser(GHOST, { sessionStrength: 'password' });
    const ghostMfa = await db.asUser(GHOST, { sessionStrength: 'mfa' });
    const outcomes: Outcome[] = [];

    for (const user of [ghostPassword, ghostMfa]) {
      for (const path of Object.values(PATHS)) outcomes.push(await call(user, path));
    }

    expect(outcomes).toStrictEqual(Array.from({ length: 8 }, () => [403, 'FORBIDDEN']));
  });

  test('rollenregister/AC-12: een gebruiker zonder rij in user_roles is nog steeds 403 FORBIDDEN', async () => {
    const nobody = await db.asUser(null);

    expect(await call(nobody, PATHS['app.use'])).toStrictEqual([403, 'FORBIDDEN']);
  });
});

describe('de beheervlag verandert mee met het register', () => {
  test('rollenregister/AC-16: krijgt planner beheer, dan is een password-sessie 403 MFA_REQUIRED en een mfa-sessie 200, ook voor de database', async () => {
    await migrator.query("select app.register_role('planner', true)");
    try {
      const password = await db.asUser('planner', { sessionStrength: 'password' });
      const mfa = await db.asUser('planner', { sessionStrength: 'mfa' });

      expect([
        await call(password, PATHS['app.use'], true),
        await call(password, PATHS['me:read'], true),
        await call(mfa, PATHS['me:read'], true),
      ]).toStrictEqual([
        [403, 'MFA_REQUIRED'],
        [403, 'MFA_REQUIRED'],
        [200, 'OK'],
      ]);
      expect([await isMfaAdmin(password), await isMfaAdmin(mfa)]).toStrictEqual([false, true]);
    } finally {
      await migrator.query("select app.register_role('planner', false)");
    }
  });

  test('rollenregister/AC-16: verliest eigenaar beheer, dan houdt een mfa-sessie alleen de permissies van de rol en weigert de database accountbeheer', async () => {
    await migrator.query("select app.register_role('eigenaar', false)");
    try {
      const eigenaar = await db.asUser('eigenaar', { sessionStrength: 'mfa' });
      const assign = db.withUser(eigenaar.actor, async (tx) => {
        await tx.execute(sql`select app.assign_role(${eigenaar.actor.userId}, 'user')`);
      });

      expect(await isMfaAdmin(eigenaar)).toBe(false);
      await expect(assign).rejects.toMatchObject({ code: 'FORBIDDEN' });
    } finally {
      await migrator.query("select app.register_role('eigenaar', true)");
    }
  });
});

// AC-4 en AC-5 met de echte withUser en gecommitte accounts: set_account_blocked eist een account met wachtwoord, en de
// testkit kan er geen aanmaken. De vorm per functie staat in db/tests/roles.sql.
describe('accountbeheer is voor beheerrollen met mfa (database)', () => {
  const eig = UserId.parse(uniqueId('roles-eig'));
  const pl = UserId.parse(uniqueId('roles-pl'));
  const tgt = UserId.parse(uniqueId('roles-tgt'));
  beforeAll(async () => {
    await addAccount(migrator, eig, { role: 'eigenaar' });
    await addAccount(migrator, pl, { role: 'planner' });
    await addAccount(migrator, tgt, { role: 'user' });
  });

  test('rollenregister/AC-4: eigenaar met mfa: assign_role en set_account_blocked slagen en app.audit_log is leesbaar', async () => {
    const blocked = await withApiUser({ userId: eig, sessionStrength: 'mfa' }, async (tx) => {
      await tx.execute(sql`select app.assign_role(${tgt}, 'user')`);
      await tx.execute(sql`select app.set_account_blocked(${tgt}, true)`);
      const { rows } = await tx.execute<{ n: number }>(
        sql`select count(*)::integer as n from app.audit_log where action = 'core.account.block' and target_id = ${tgt} and actor_id = ${eig}`,
      );
      await tx.execute(sql`select app.set_account_blocked(${tgt}, false)`);
      return rows[0]?.n;
    });

    expect(blocked).toBe(1);
  });

  test('rollenregister/AC-5: planner met mfa: de drie accountfuncties geven FORBIDDEN (42501), app.accounts en app.audit_log blijven leeg', async () => {
    const actor = { userId: pl, sessionStrength: 'mfa' } as const;
    const attempts = [
      sql`select app.assign_role(${tgt}, 'user')`,
      sql`select app.set_account_blocked(${tgt}, true)`,
      sql`select app.set_account_deactivated(${tgt}, true)`,
    ].map((statement) => withApiUser(actor, async (tx) => tx.execute(statement)));

    const results = await Promise.allSettled(attempts);

    expect(results.map(reasonOf)).toMatchObject([{ code: 'FORBIDDEN' }, { code: 'FORBIDDEN' }, { code: 'FORBIDDEN' }]);
    const counts = await withApiUser(actor, async (tx) => {
      const accounts = await tx.execute<{ n: number }>(sql`select count(*)::integer as n from app.accounts`);
      const audit = await tx.execute<{ n: number }>(sql`select count(*)::integer as n from app.audit_log`);
      return [accounts.rows[0]?.n, audit.rows[0]?.n];
    });
    expect(counts).toStrictEqual([0, 0]);
  });

  test('rollenregister/AC-5: het doelaccount is na de geweigerde functies niet geblokkeerd of gedeactiveerd', async () => {
    const { rows } = await migrator.query<{ untouched: boolean }>(
      'select blocked_at is null and deactivated_at is null as untouched from better_auth."user" where id = $1',
      [tgt],
    );

    expect(rows[0]?.untouched).toBe(true);
  });
});
