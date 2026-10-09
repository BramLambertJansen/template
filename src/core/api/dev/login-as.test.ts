import { describe, expect, test } from 'vitest';
import type { AuthGateway } from '../auth/auth.ts';
import { createDevLogin } from './login-as.ts';
import { SEED_ADMIN_TOTP_SLEUTEL, SEED_DEMO_WACHTWOORD } from './seed-accounts.ts';
import { totpCode } from './totp.ts';

// De dev-login gaat door de echte Better Auth-handler; hier nagebootst om de volgorde, de cookies en de TOTP-code te zien.
function fakeAuth(status = 200) {
  const calls: { path: string; body: unknown; cookie: string | null; origin: string | null }[] = [];
  const auth: AuthGateway = {
    handler: async (request) => {
      const path = new URL(request.url).pathname;
      calls.push({
        path,
        body: await request.json(),
        cookie: request.headers.get('cookie'),
        origin: request.headers.get('origin'),
      });
      const cookie = path.endsWith('/sign-in/email') ? '__Host-auth.two_factor=tf1' : '__Host-auth.session_token=s1';
      return new Response(null, { status, headers: { 'set-cookie': `${cookie}; Path=/; Secure; HttpOnly` } });
    },
    getSession: () => Promise.resolve({ session: null, setCookie: [] }),
  };
  return { auth, calls };
}

describe('createDevLogin', () => {
  test('user: inloggen met het seed-account en het demo-wachtwoord; de cookies gaan naar de browser', async () => {
    const { auth, calls } = fakeAuth();
    const cookies = await createDevLogin(auth, 'http://localhost:5173')('user', new Headers({ cookie: 'oud=1' }));

    expect(calls).toStrictEqual([
      {
        path: '/api/auth/sign-in/email',
        body: { email: 'gebruiker@template.test', password: SEED_DEMO_WACHTWOORD },
        cookie: null,
        origin: 'http://localhost:5173',
      },
    ]);
    expect(cookies).toStrictEqual(['__Host-auth.two_factor=tf1; Path=/; Secure; HttpOnly']);
  });

  test('admin: daarna de TOTP-stap met de code uit het vaste lokale geheim en het cookie van stap één', async () => {
    const { auth, calls } = fakeAuth();
    const cookies = await createDevLogin(auth, 'http://localhost:5173')('admin', new Headers());

    expect(calls.map((call) => call.path)).toStrictEqual([
      '/api/auth/sign-in/email',
      '/api/auth/two-factor/verify-totp',
    ]);
    expect(calls[1]?.cookie).toBe('__Host-auth.two_factor=tf1');
    expect(calls[1]?.body).toStrictEqual({ code: totpCode(SEED_ADMIN_TOTP_SLEUTEL) });
    expect(cookies).toHaveLength(2);
  });

  test('een geweigerde stap faalt hard (bijv. zonder seed)', async () => {
    const { auth } = fakeAuth(401);

    await expect(createDevLogin(auth, 'http://localhost:5173')('user', new Headers())).rejects.toThrow(
      'draait de seed?',
    );
  });
});

describe('totpCode', () => {
  test('RFC 6238-testvector (SHA-1): T=59 s geeft 287082', () => {
    expect(totpCode('12345678901234567890', 59_000)).toBe('287082');
  });
});
