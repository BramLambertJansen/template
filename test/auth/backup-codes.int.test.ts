import { afterAll, describe, expect, test } from 'vitest';
import { z } from 'zod';
import { createAccountTestApp, json, PASSWORD } from '../api/account-harness.ts';
import { Browser, freshTotp } from './harness.ts';

// Spec accountbeheer-uitbreiding, alinea "Herstelcodes" (ADR 0113): inloggen met een herstelcode en nieuwe codes maken.
// Echte database en Better Auth (`pnpm test:db`), niets gemockt. Elke browser heeft een eigen IP voor de rate limit van
// Better Auth (3 per 10 s per IP en pad op /two-factor/*); een test houdt zich per browser en pad aan dat maximum.
const t = createAccountTestApp();
afterAll(async () => {
  await t.close();
});

const SESSION_COOKIE = '__Host-auth.session_token';
const HISTORICAL = new Date('2000-01-01T00:00:00.000Z');
const CODE_SHAPE = /^[A-Za-z0-9]{5}-[A-Za-z0-9]{5}$/;

const enableBody = z.object({ totpURI: z.string(), backupCodes: z.array(z.string()) });
const codesBody = z.object({ backupCodes: z.array(z.string()) });
const errorBody = z.object({ code: z.string() });

// TOTP inschrijven en bevestigen: de browser heeft daarna een mfa-sessie; geeft geheim en de 10 herstelcodes terug.
async function enrol(browser: Browser): Promise<{ uri: string; codes: string[] }> {
  const enable = await browser.post('/api/auth/two-factor/enable', { password: PASSWORD });
  const { totpURI, backupCodes } = enableBody.parse(await enable.json());
  const verify = await browser.post('/api/auth/two-factor/verify-totp', { code: freshTotp(totpURI) });
  expect(verify.status).toBe(200);
  return { uri: totpURI, codes: backupCodes };
}

// Een nieuwe browser tot aan de TOTP-stap: wachtwoord goed, nog geen sessie.
async function challenge(email: string): Promise<Browser> {
  const browser = new Browser(t.app);
  const signIn = await browser.post('/api/auth/sign-in/email', { email, password: PASSWORD });
  expect(await signIn.json()).toMatchObject({ twoFactorRedirect: true });
  return browser;
}

const verifyCode = (browser: Browser, code: string, extra: Record<string, unknown> = {}) =>
  browser.post('/api/auth/two-factor/verify-backup-code', { code, ...extra });

async function outcome(response: Response): Promise<[number, string]> {
  return [response.status, errorBody.parse(await json(response)).code];
}

async function sessionStrength(browser: Browser): Promise<string | undefined> {
  const body = z
    .object({ session: z.object({ sessionStrength: z.string() }) })
    .nullable()
    .parse(await (await browser.get('/api/auth/get-session')).json());
  return body?.session.sessionStrength;
}

async function sessionCount(userId: string): Promise<number> {
  const { rows } = await t.authDb.query<{ count: string }>('select count(*) from session where "userId" = $1', [
    userId,
  ]);
  return Number(rows[0]?.count ?? 0);
}

async function lastLogin(userId: string): Promise<Date | null> {
  const { rows } = await t.authDb.query<{ last_login_at: Date | null }>(
    'select last_login_at from "user" where id = $1',
    [userId],
  );
  return rows[0]?.last_login_at ?? null;
}

describe('herstelcodes: inschrijven en inloggen', () => {
  test('accounts/AC-17: enable geeft 10 herstelcodes van de vorm xxxxx-xxxxx, allemaal verschillend', async () => {
    const { browser } = await t.account('admin');

    const { codes } = await enrol(browser);

    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    expect(codes.filter((code) => CODE_SHAPE.test(code))).toHaveLength(10);
  });

  test('accounts/AC-17: met een herstelcode in plaats van TOTP: sessie met sterkte mfa; dezelfde code daarna INVALID_BACKUP_CODE', async () => {
    const { browser, email, userId } = await t.account('admin');
    const { codes } = await enrol(browser);
    const [first = ''] = codes;
    const login = await challenge(email);

    const accepted = await verifyCode(login, first);

    expect(accepted.status).toBe(200);
    expect(login.cookies.has(SESSION_COOKIE)).toBe(true);
    expect(await sessionStrength(login)).toBe('mfa');
    expect((await login.get('/api/me')).status).toBe(200);
    const sessionsBefore = await sessionCount(userId);
    const again = await challenge(email);

    const rejected = await verifyCode(again, first);

    expect(await outcome(rejected)).toStrictEqual([401, 'INVALID_BACKUP_CODE']);
    expect(again.cookies.has(SESSION_COOKIE)).toBe(false);
    expect(await sessionCount(userId)).toBe(sessionsBefore);
  });

  test('accounts/AC-17: een andere herstelcode werkt nog nadat de eerste is gebruikt (elke code werkt één keer, de rest blijft)', async () => {
    const { browser, email } = await t.account('admin');
    const { codes } = await enrol(browser);
    const [first = '', second = ''] = codes;
    expect((await verifyCode(await challenge(email), first)).status).toBe(200);
    const login = await challenge(email);

    expect((await verifyCode(login, second)).status).toBe(200);
    expect(await sessionStrength(login)).toBe('mfa');
  });

  test('accounts/AC-17: een foute herstelcode geeft INVALID_BACKUP_CODE en geen sessie', async () => {
    const { browser, email } = await t.account('admin');
    await enrol(browser);
    const login = await challenge(email);

    const rejected = await verifyCode(login, 'AAAAA-BBBBB');

    expect(await outcome(rejected)).toStrictEqual([401, 'INVALID_BACKUP_CODE']);
    expect(login.cookies.has(SESSION_COOKIE)).toBe(false);
    expect(await sessionStrength(login)).toBeUndefined();
  });

  test('accounts/AC-17: /two-factor/view-backup-codes blijft dicht (404), ook met een mfa-sessie', async () => {
    const { browser } = await t.account('admin');
    await enrol(browser);

    const response = await browser.post('/api/auth/two-factor/view-backup-codes', {});

    expect(response.status).toBe(404);
  });
});

describe('herstelcodes: nieuwe codes maken', () => {
  test('accounts/AC-18: nieuwe codes met wachtwoord en mfa-sessie: de oude werken niet meer, de nieuwe wel', async () => {
    const { browser, email } = await t.account('admin');
    const { codes: oldCodes } = await enrol(browser);

    const generated = await browser.post('/api/auth/two-factor/generate-backup-codes', { password: PASSWORD });

    expect(generated.status).toBe(200);
    const { backupCodes: newCodes } = codesBody.parse(await generated.json());
    expect(newCodes).toHaveLength(10);
    expect(newCodes.filter((code) => oldCodes.includes(code))).toStrictEqual([]);
    const withOld = await challenge(email);
    expect(await outcome(await verifyCode(withOld, oldCodes[0] ?? ''))).toStrictEqual([401, 'INVALID_BACKUP_CODE']);
    expect(withOld.cookies.has(SESSION_COOKIE)).toBe(false);
    const withNew = await challenge(email);
    expect((await verifyCode(withNew, newCodes[0] ?? '')).status).toBe(200);
    expect(await sessionStrength(withNew)).toBe('mfa');
  });

  test('accounts/AC-18: een fout wachtwoord maakt geen nieuwe codes en de oude blijven geldig', async () => {
    const { browser, email } = await t.account('admin');
    const { codes } = await enrol(browser);

    const generated = await browser.post('/api/auth/two-factor/generate-backup-codes', { password: 'xy-'.repeat(6) });

    expect(generated.status).toBeGreaterThanOrEqual(400);
    expect(generated.status).toBeLessThan(500);
    const login = await challenge(email);
    expect((await verifyCode(login, codes[0] ?? '')).status).toBe(200);
  });

  test('accounts/AC-21: met een sessie van sterkte password: MFA_REQUIRED en de oude codes blijven geldig', async () => {
    const { browser, email, userId } = await t.account('admin');
    const { codes } = await enrol(browser);
    const token = browser.cookies.get(SESSION_COOKIE)?.split('.')[0] ?? '';
    await t.authDb.query(`update session set session_strength = 'password' where "userId" = $1 and token = $2`, [
      userId,
      token,
    ]);

    const generated = await browser.post('/api/auth/two-factor/generate-backup-codes', { password: PASSWORD });

    expect(await outcome(generated)).toStrictEqual([403, 'MFA_REQUIRED']);
    const login = await challenge(email);
    expect((await verifyCode(login, codes[0] ?? '')).status).toBe(200);
    expect(await sessionStrength(login)).toBe('mfa');
  });

  test('accounts/AC-21: zonder sessie geen nieuwe codes', async () => {
    const response = await new Browser(t.app).post('/api/auth/two-factor/generate-backup-codes', {
      password: PASSWORD,
    });

    expect(response.status).toBeGreaterThanOrEqual(401);
    expect(response.status).toBeLessThan(500);
    expect(response.status).not.toBe(404);
  });
});

describe('herstelcodes: dezelfde regels als TOTP bij inloggen', () => {
  test('accounts/AC-20: trustDevice of disableSession aanwezig en niet false: VALIDATION, geen sessie, geen trust-device-cookie; de code is daarna nog bruikbaar', async () => {
    const { browser, email, userId } = await t.account('admin');
    const { codes } = await enrol(browser);
    const [code = ''] = codes;
    const login = await challenge(email);
    const sessionsBefore = await sessionCount(userId);

    const trust = await verifyCode(login, code, { trustDevice: true });
    const disable = await verifyCode(login, code, { disableSession: true });

    expect(await Promise.all([outcome(trust), outcome(disable)])).toStrictEqual([
      [400, 'VALIDATION'],
      [400, 'VALIDATION'],
    ]);
    expect(login.cookies.has(SESSION_COOKIE)).toBe(false);
    expect([...login.cookies.keys()].filter((name) => /trust/i.test(name))).toStrictEqual([]);
    expect(await sessionCount(userId)).toBe(sessionsBefore);
    expect((await verifyCode(login, code, { trustDevice: false, disableSession: false })).status).toBe(200);
    expect(await sessionStrength(login)).toBe('mfa');
  });

  test('accounts/AC-20: met een volledige sessie wordt verify-backup-code geweigerd met VALIDATION', async () => {
    const { browser } = await t.account('admin');
    const { codes } = await enrol(browser);

    const response = await verifyCode(browser, codes[0] ?? '');

    expect(await outcome(response)).toStrictEqual([400, 'VALIDATION']);
    expect([...browser.cookies.keys()].filter((name) => /trust/i.test(name))).toStrictEqual([]);
  });

  test('accounts/AC-25: twee gelijktijdige verzoeken met dezelfde geldige code: precies één sessie, de ander INVALID_BACKUP_CODE', async () => {
    const { browser, email } = await t.account('admin');
    const { codes } = await enrol(browser);
    const [code = ''] = codes;
    const [one, two] = await Promise.all([challenge(email), challenge(email)]);

    const responses = await Promise.all([verifyCode(one, code), verifyCode(two, code)]);

    expect(responses.map((response) => response.status).sort((a, b) => a - b)).toStrictEqual([200, 401]);
    const failed = responses.findIndex((response) => response.status === 401);
    expect(await outcome(responses[failed] ?? responses[0])).toStrictEqual([401, 'INVALID_BACKUP_CODE']);
    const strengths = await Promise.all([sessionStrength(one), sessionStrength(two)]);
    expect(strengths.filter((strength) => strength === 'mfa')).toHaveLength(1);
    expect(strengths.filter((strength) => strength === undefined)).toHaveLength(1);
  });

  test('accounts/AC-26: inloggen met een herstelcode werkt last_login_at bij, zoals na TOTP', async () => {
    const { browser, email, userId } = await t.account('admin');
    const { codes } = await enrol(browser);
    await t.authDb.query('update "user" set last_login_at = $2 where id = $1', [userId, HISTORICAL]);
    const login = await challenge(email);
    expect(await lastLogin(userId)).toEqual(HISTORICAL);

    expect((await verifyCode(login, codes[0] ?? '')).status).toBe(200);

    expect((await lastLogin(userId))?.getTime()).toBeGreaterThan(HISTORICAL.getTime());
  });

  test('accounts/AC-26: session_version na de wachtwoordstap verhoogd: UNAUTHENTICATED, geen sessie en last_login_at ongewijzigd', async () => {
    const { browser, email, userId } = await t.account('admin');
    const { codes } = await enrol(browser);
    await t.authDb.query('update "user" set last_login_at = $2 where id = $1', [userId, HISTORICAL]);
    const login = await challenge(email);
    const sessionsBefore = await sessionCount(userId);
    await t.migrator.query('update better_auth."user" set session_version = session_version + 1 where id = $1', [
      userId,
    ]);

    const response = await verifyCode(login, codes[0] ?? '');

    expect(await outcome(response)).toStrictEqual([401, 'UNAUTHENTICATED']);
    expect(login.cookies.has(SESSION_COOKIE)).toBe(false);
    expect(await sessionCount(userId)).toBe(sessionsBefore);
    expect(await lastLogin(userId)).toEqual(HISTORICAL);
  });

  test('accounts/AC-26: account na de wachtwoordstap gedeactiveerd: ACCOUNT_DEACTIVATED, geen sessie en last_login_at ongewijzigd', async () => {
    const { browser, email, userId } = await t.account('admin');
    const { codes } = await enrol(browser);
    await t.authDb.query('update "user" set last_login_at = $2 where id = $1', [userId, HISTORICAL]);
    const login = await challenge(email);
    const sessionsBefore = await sessionCount(userId);
    await t.migrator.query('update better_auth."user" set deactivated_at = now() where id = $1', [userId]);

    const response = await verifyCode(login, codes[0] ?? '');

    expect(await outcome(response)).toStrictEqual([403, 'ACCOUNT_DEACTIVATED']);
    expect(login.cookies.has(SESSION_COOKIE)).toBe(false);
    expect(await sessionCount(userId)).toBe(sessionsBefore);
    expect(await lastLogin(userId)).toEqual(HISTORICAL);
  });
});
