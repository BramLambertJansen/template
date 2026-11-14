import { describe, expect, test } from 'vitest';
import { defineRoles } from '../../shared/roles.ts';
import { createDevLogin, type DevAuthSteps } from './login-as.ts';
import { SEED_ADMIN_TOTP_SLEUTEL, SEED_DEMO_WACHTWOORD } from './seed-accounts.ts';
import { totpCode } from './totp.ts';

// createDevLogin(steps, { roles, seedAccounts }) (spec rollenregister, AC-15): het seed-account komt uit de tabel van de app,
// en elke beheerrol krijgt na het wachtwoord de TOTP-stap met dezelfde sleutel (MFA-sessie); een andere rol niet.
// Tegen de echte Better Auth: test/auth/dev-login.int.test.ts.
const roles = defineRoles({ planner: { beheer: false }, eigenaar: { beheer: true }, toezicht: { beheer: true } });
const seedAccounts = {
  user: { email: 'gebruiker@template.test', name: 'Lokale Gebruiker' },
  admin: { email: 'admin@template.test', name: 'Lokale Beheerder' },
  planner: { email: 'planner@template.test', name: 'Lokale Planner' },
  eigenaar: { email: 'eigenaar@template.test', name: 'Lokale Eigenaar' },
  toezicht: { email: 'toezicht@template.test', name: 'Lokaal Toezicht' },
};

function fakeSteps(fail = false) {
  const calls: { step: string; body: unknown; cookie: string | null }[] = [];
  const steps: DevAuthSteps = {
    signIn: (email, password, headers) => {
      calls.push({ step: 'signIn', body: { email, password }, cookie: headers.get('cookie') });
      if (fail) return Promise.reject(new Error('dev-login: /sign-in/email mislukte (draait de seed?)'));
      return Promise.resolve(['__Host-auth.two_factor=tf1; Path=/; Secure; HttpOnly']);
    },
    verifyTotp: (code, headers) => {
      calls.push({ step: 'verifyTotp', body: { code }, cookie: headers.get('cookie') });
      return Promise.resolve(['__Host-auth.session_token=s1; Path=/; Secure; HttpOnly']);
    },
  };
  return { steps, calls };
}

describe('createDevLogin met een rollenregister', () => {
  test('rollenregister/AC-15: planner (geen beheer): alleen het wachtwoord van het seed-account van die rol, geen TOTP-stap', async () => {
    const { steps, calls } = fakeSteps();
    const cookies = await createDevLogin(steps, { roles, seedAccounts })('planner', new Headers({ cookie: 'oud=1' }));

    expect(calls).toStrictEqual([
      { step: 'signIn', body: { email: 'planner@template.test', password: SEED_DEMO_WACHTWOORD }, cookie: null },
    ]);
    expect(cookies).toStrictEqual(['__Host-auth.two_factor=tf1; Path=/; Secure; HttpOnly']);
  });

  test.each(['admin', 'eigenaar', 'toezicht'] as const)(
    'rollenregister/AC-15: beheerrol %s: daarna de TOTP-stap met de ene sleutel voor elke beheerrol, de cookies naar de browser',
    async (role) => {
      const { steps, calls } = fakeSteps();
      const cookies = await createDevLogin(steps, { roles, seedAccounts })(role, new Headers());

      expect(calls.map((call) => call.step)).toStrictEqual(['signIn', 'verifyTotp']);
      expect(calls[0]?.body).toStrictEqual({ email: seedAccounts[role].email, password: SEED_DEMO_WACHTWOORD });
      expect(calls[1]?.cookie).toBe('__Host-auth.two_factor=tf1');
      expect(calls[1]?.body).toStrictEqual({ code: totpCode(SEED_ADMIN_TOTP_SLEUTEL) });
      expect(cookies).toHaveLength(2);
    },
  );

  test('rollenregister/AC-15: user: alleen het wachtwoord, ook al staat de rol in een register met beheerrollen', async () => {
    const { steps, calls } = fakeSteps();
    await createDevLogin(steps, { roles, seedAccounts })('user', new Headers());

    expect(calls.map((call) => call.step)).toStrictEqual(['signIn']);
  });

  test('rollenregister/AC-15: een rol waarvan het seed-account niet bestaat (seed niet gedraaid) faalt hard', async () => {
    const { steps } = fakeSteps(true);

    await expect(createDevLogin(steps, { roles, seedAccounts })('planner', new Headers())).rejects.toThrow(
      'draait de seed?',
    );
  });

  test('rollenregister/AC-15: een beheerrol die al bij het wachtwoord faalt, vraagt geen TOTP-code', async () => {
    const { steps, calls } = fakeSteps(true);

    await expect(createDevLogin(steps, { roles, seedAccounts })('eigenaar', new Headers())).rejects.toThrow();
    expect(calls.map((call) => call.step)).toStrictEqual(['signIn']);
  });
});
