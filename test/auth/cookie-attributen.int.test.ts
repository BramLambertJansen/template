import pg from 'pg';
import { afterAll, describe, expect, test } from 'vitest';
import { z } from 'zod';
import { inviteUser } from '../../src/core/api/auth/index.ts';
import { Browser, createTestApp, latestMailTo, required, tokenFrom, uniqueEmail } from './harness.ts';

// R-AUTH-02 (framework §6, ADR 0041): de sessiecookie heeft de prefix __Host-, HttpOnly, Secure, SameSite=Lax, Path=/ en
// geen Domain, en cookieCache staat uit. Draait via `pnpm test:db` tegen de echte database (als auth_service) en Mailpit.
const PASSWORD = 'ab-'.repeat(6);
const SESSION_COOKIE = '__Host-auth.session_token';
const { auth, app, pool } = createTestApp();
const db = new pg.Pool({ connectionString: required('AUTH_DATABASE_URL'), max: 2 });
afterAll(async () => {
  await Promise.all([db.end(), pool.end()]);
});

async function activatedAccount(): Promise<string> {
  const email = uniqueEmail('cookie');
  await inviteUser(auth, { name: 'Cookie', email });
  const token = tokenFrom((await latestMailTo(email)).text);
  const reset = await new Browser(app).post('/api/auth/reset-password', { token, newPassword: PASSWORD });
  expect(reset.status).toBe(200);
  return email;
}

async function signIn(email: string): Promise<{ browser: Browser; setCookies: string[] }> {
  const browser = new Browser(app);
  const response = await browser.post('/api/auth/sign-in/email', { email, password: PASSWORD });
  expect(response.status).toBe(200);
  return { browser, setCookies: response.headers.getSetCookie() };
}

// `name=value; Attr; Attr=waarde` naar de naam en de attributen (naam in kleine letters, waarde leeg zonder `=`).
function parseSetCookie(line: string): { name: string; attributes: Map<string, string> } {
  const [pair = '', ...rest] = line.split(';');
  const attributes = new Map<string, string>();
  for (const part of rest) {
    const [key = '', ...value] = part.trim().split('=');
    attributes.set(key.toLowerCase(), value.join('='));
  }
  return { name: pair.slice(0, pair.indexOf('=')), attributes };
}

async function currentSession(browser: Browser): Promise<unknown> {
  const response = await browser.get('/api/auth/get-session');
  expect(response.status).toBe(200);
  return z.unknown().parse(await response.json());
}

describe('sessiecookie-attributen (R-AUTH-02)', () => {
  test('de Set-Cookie van een echte login heeft __Host-, HttpOnly, Secure, SameSite=Lax, Path=/ en geen Domain', async () => {
    const { setCookies } = await signIn(await activatedAccount());
    const session = setCookies.map(parseSetCookie).find((cookie) => cookie.name === SESSION_COOKIE);

    expect(session).toBeDefined();
    const attributes = session?.attributes ?? new Map<string, string>();
    expect(attributes.has('httponly')).toBe(true);
    expect(attributes.has('secure')).toBe(true);
    expect(attributes.get('samesite')?.toLowerCase()).toBe('lax');
    expect(attributes.get('path')).toBe('/');
    expect(attributes.has('domain')).toBe(false);
  });

  test('elke cookie van de login draagt de __Host-prefix en geen enkele zet een Domain', async () => {
    const { setCookies } = await signIn(await activatedAccount());
    const parsed = setCookies.map(parseSetCookie);

    expect(parsed.length).toBeGreaterThan(0);
    for (const cookie of parsed) {
      expect(cookie.name.startsWith('__Host-')).toBe(true);
      expect(cookie.attributes.has('secure')).toBe(true);
      expect(cookie.attributes.get('path')).toBe('/');
      expect(cookie.attributes.has('domain')).toBe(false);
    }
  });
});

describe('cookieCache staat uit (R-AUTH-02)', () => {
  test('een login zet geen session_data-cookie', async () => {
    const { setCookies } = await signIn(await activatedAccount());

    expect(setCookies.map((line) => parseSetCookie(line).name)).not.toContain('__Host-auth.session_data');
  });

  test('een sessierij die uit de database verdwijnt, maakt de volgende get-session meteen ongeldig', async () => {
    const { browser } = await signIn(await activatedAccount());
    const token = browser.cookies.get(SESSION_COOKIE)?.split('.')[0] ?? '';
    expect(await currentSession(browser)).not.toBeNull();

    expect((await db.query('delete from session where token = $1', [token])).rowCount).toBe(1);

    expect(await currentSession(browser)).toBeNull();
    expect(browser.cookies.has('__Host-auth.session_data')).toBe(false);
  });
});
