import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { authGateway } from '../../src/core/api/auth/index.ts';
import { createDevLogin, devAuthSteps } from '../../src/core/api/dev/login-as.ts';
import { ensureAccount } from '../../src/core/api/dev/ensure-account.ts';
import { SEED_ADMIN_TOTP_SLEUTEL, SEED_DEMO_WACHTWOORD } from '../../src/core/api/dev/seed-accounts.ts';
import { createApp } from '../../src/core/api/http/create-app.ts';
import { defineRoles } from '../../src/core/shared/roles.ts';
import { roles } from '../../src/shared/roles.ts';
import { APP_ORIGIN, Browser, createTestApp } from './harness.ts';
import { addAccount, cleanupTestRoles, migratorPool, registerTestRoles, uniqueId } from './role-register-harness.ts';

// Het register van de app tegen de database (spec rollenregister, ST-16): AC-13 (het register in de code en de rijen in
// app.roles lopen niet uiteen), AC-12 (de FK) en AC-15 (seed en dev-login met een rol van de app). Echte database en Better
// Auth (`pnpm test:db`). De testrollen planner, eigenaar en toezicht worden gecommit en opgeruimd in beforeAll en afterAll.
const migrator = migratorPool();
const { auth, pool } = createTestApp();
const testRoles = defineRoles({ planner: { beheer: false }, eigenaar: { beheer: true }, toezicht: { beheer: true } });

beforeAll(async () => {
  await cleanupTestRoles(migrator);
});
afterAll(async () => {
  try {
    await cleanupTestRoles(migrator);
  } finally {
    await Promise.all([migrator.end(), pool.end(), auth.closePool()]);
  }
});

interface RoleRow {
  readonly name: string;
  readonly beheer: boolean;
}

async function rowsInDatabase(): Promise<RoleRow[]> {
  const { rows } = await migrator.query<RoleRow>('select name, beheer from app.roles');
  return rows;
}

describe('het register in de code en app.roles', () => {
  test('rollenregister/AC-13: elke rol in het register staat in app.roles en andersom', async () => {
    const inDatabase = (await rowsInDatabase()).map((row) => row.name).sort();
    const inRegister = [...roles.names].sort();

    expect({
      alleenInRegister: inRegister.filter((name) => !inDatabase.includes(name)),
      alleenInRijen: inDatabase.filter((name) => !inRegister.includes(name)),
    }).toStrictEqual({ alleenInRegister: [], alleenInRijen: [] });
  });

  test('rollenregister/AC-13: de beheervlag van elke rol is gelijk in het register en in app.roles', async () => {
    const rows = await rowsInDatabase();
    const differing = rows.filter((row) => roles.names.includes(row.name) && roles.isBeheer(row.name) !== row.beheer);

    expect(differing.map((row) => row.name)).toStrictEqual([]);
  });

  test('rollenregister/AC-13: user en admin zijn de basisrijen met de vaste vlaggen', async () => {
    const rows = (await rowsInDatabase()).filter((row) => row.name === 'user' || row.name === 'admin');

    expect(rows.map((row) => `${row.name}:${String(row.beheer)}`).sort()).toStrictEqual(['admin:true', 'user:false']);
  });
});

describe('de FK van user_roles naar app.roles (AC-12)', () => {
  test('rollenregister/AC-12: een rol toekennen die niet in app.roles staat geeft 23503, ook als app_migrator', async () => {
    const id = uniqueId('roles-fk');
    await addAccount(migrator, id);

    await expect(migrator.query('select app.assign_role($1, $2)', [id, 'baas'])).rejects.toMatchObject({
      code: '23503',
    });
    const { rows } = await migrator.query('select 1 from public.user_roles where user_id = $1', [id]);
    expect(rows).toHaveLength(0);
  });

  test('rollenregister/AC-12: een rol met dragers weghalen geeft 23503 en de drager houdt zijn rol', async () => {
    await registerTestRoles(migrator);
    try {
      const id = uniqueId('roles-fk-carrier');
      await addAccount(migrator, id, { role: 'planner' });

      await expect(migrator.query("select app.unregister_role('planner')")).rejects.toMatchObject({ code: '23503' });
      const { rows } = await migrator.query<{ role: string }>('select role from public.user_roles where user_id = $1', [
        id,
      ]);
      expect(rows[0]?.role).toBe('planner');
    } finally {
      await cleanupTestRoles(migrator);
    }
  });
});

// De dev-login van een app met eigen rollen. De seed-accounts zijn hier van de test; user en admin bestaan in elke app.
const seedAccounts = {
  user: { email: 'gebruiker@template.test', name: 'Lokale Gebruiker' },
  admin: { email: 'admin@template.test', name: 'Lokale Beheerder' },
  planner: { email: 'planner-roles@template.test', name: 'Planner Roles' },
  eigenaar: { email: 'eigenaar-roles@template.test', name: 'Eigenaar Roles' },
  toezicht: { email: 'toezicht-roles@template.test', name: 'Toezicht Roles' },
};
const gateway = authGateway(auth);
const devApp = createApp({
  appOrigin: APP_ORIGIN,
  roles: testRoles,
  auth: gateway,
  devLogin: createDevLogin(devAuthSteps(auth), { roles: testRoles, seedAccounts }),
});

describe('seed en dev-login met een rol van de app (AC-15)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('rollenregister/AC-15: een rol in het register zonder rij in app.roles faalt in de seed (23503) en de dev-login geeft 500 INTERNAL_ERROR', async () => {
    // Zoals de seed: het account aanmaken en dan de rol toekennen; de rol is nog niet geregistreerd.
    const { userId } = await ensureAccount(auth, {
      email: 'ongeseed-roles@template.test',
      name: 'Ongeseed',
      password: SEED_DEMO_WACHTWOORD,
    });
    await expect(migrator.query('select app.assign_role($1, $2)', [userId, 'planner'])).rejects.toMatchObject({
      code: '23503',
    });

    // Het seed-account van de rol is er daardoor niet: de dev-login kan er niet mee inloggen (een adres dat nooit bestaat,
    // ook niet uit een eerdere run van de volgende test).
    const unseeded = createApp({
      appOrigin: APP_ORIGIN,
      roles: testRoles,
      auth: gateway,
      devLogin: createDevLogin(devAuthSteps(auth), {
        roles: testRoles,
        seedAccounts: { ...seedAccounts, planner: { email: 'nooit-geseed-roles@template.test', name: 'Nooit' } },
      }),
    });
    const response = await new Browser(unseeded).post('/api/dev/login-as', { rol: 'planner' });

    expect([response.status, await response.json()]).toMatchObject([500, { code: 'INTERNAL_ERROR' }]);
  });

  test('rollenregister/AC-15: een onbekende rol is 400 VALIDATION', async () => {
    const response = await new Browser(devApp).post('/api/dev/login-as', { rol: 'baas' });

    expect([response.status, await response.json()]).toMatchObject([400, { code: 'VALIDATION' }]);
  });

  test('rollenregister/AC-15: na registreren en seeden geeft de dev-login een mfa-sessie voor elke beheerrol en een password-sessie voor de rest', async () => {
    await registerTestRoles(migrator);
    try {
      for (const role of ['planner', 'eigenaar', 'toezicht'] as const) {
        const account = seedAccounts[role];
        const { userId } = await ensureAccount(auth, {
          email: account.email,
          name: account.name,
          password: SEED_DEMO_WACHTWOORD,
          ...(testRoles.isBeheer(role) ? { totpSecret: SEED_ADMIN_TOTP_SLEUTEL } : {}),
        });
        await migrator.query('select app.assign_role($1, $2)', [userId, role]);
      }
      const seen: string[] = [];

      for (const role of ['planner', 'eigenaar', 'toezicht'] as const) {
        const browser = new Browser(devApp);
        const response = await browser.post('/api/dev/login-as', { rol: role });
        const cookie = [...browser.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
        const { session } = await gateway.getSession(new Headers({ cookie }));
        seen.push(`${String(response.status)} ${role} ${session?.sessionStrength ?? '-'}`);
      }

      expect(seen).toStrictEqual(['204 planner password', '204 eigenaar mfa', '204 toezicht mfa']);
    } finally {
      await cleanupTestRoles(migrator);
    }
  });
});
