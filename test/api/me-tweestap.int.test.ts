import pg from 'pg';
import { afterAll, describe, expect, test } from 'vitest';
import { inviteUser } from '../../src/core/api/auth/index.ts';
import { Browser, createTestApp, latestMailTo, required, freshTotp, tokenFrom, uniqueEmail } from '../auth/harness.ts';

// Spec accountbeheer-uitbreiding, accounts/AC-27: GET /api/me geeft `tweestap` (twoFactorEnabled van de sessiegebruiker),
// ook voor een user zonder beheerrol. Tegen de echte database, via `pnpm test:db`.
const PASSWORD = 'ab-'.repeat(6);
const { auth, app, pool } = createTestApp();
const migrator = new pg.Pool({ connectionString: required('MIGRATOR_DATABASE_URL'), max: 1 });
afterAll(async () => {
  await Promise.all([pool.end(), migrator.end()]);
});

async function signedIn(role: 'user' | 'admin'): Promise<Browser> {
  const email = uniqueEmail(role);
  const { userId } = await inviteUser(auth, { name: 'Iemand', email });
  await migrator.query('select app.assign_role($1, $2)', [userId, role]);
  const token = tokenFrom((await latestMailTo(email)).text);
  const browser = new Browser(app);
  await browser.post('/api/auth/reset-password', { token, newPassword: PASSWORD });
  await browser.post('/api/auth/sign-in/email', { email, password: PASSWORD });
  return browser;
}

async function enableTotp(browser: Browser): Promise<void> {
  const enable = await browser.post('/api/auth/two-factor/enable', { password: PASSWORD });
  const payload: unknown = await enable.json();
  const totpURI =
    typeof payload === 'object' && payload !== null && 'totpURI' in payload && typeof payload.totpURI === 'string'
      ? payload.totpURI
      : '';
  const verify = await browser.post('/api/auth/two-factor/verify-totp', { code: freshTotp(totpURI) });
  expect(verify.status).toBe(200);
}

async function tweestap(browser: Browser): Promise<unknown> {
  const response = await browser.get('/api/me');
  expect(response.status).toBe(200);
  const payload: unknown = await response.json();
  return typeof payload === 'object' && payload !== null && 'tweestap' in payload ? payload.tweestap : undefined;
}

describe('GET /api/me: tweestap', () => {
  test('accounts/AC-27: een user zonder TOTP krijgt tweestap false', async () => {
    expect(await tweestap(await signedIn('user'))).toBe(false);
  });

  test('accounts/AC-27: een user met TOTP krijgt tweestap true, ook zonder beheerrol', async () => {
    const browser = await signedIn('user');
    await enableTotp(browser);

    expect(await tweestap(browser)).toBe(true);
  });

  test('accounts/AC-27: een admin met TOTP krijgt tweestap true', async () => {
    const browser = await signedIn('admin');
    await enableTotp(browser);

    expect(await tweestap(browser)).toBe(true);
  });
});
