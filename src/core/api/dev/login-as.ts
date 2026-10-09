import type { AuthGateway } from '../auth/auth.ts';
import type { DevLogin } from '../http/create-app.ts';
import { SEED_ACCOUNTS, SEED_ADMIN_TOTP_SLEUTEL, SEED_DEMO_WACHTWOORD } from './seed-accounts.ts';
import { totpCode } from './totp.ts';

// Dev-login (spec accountbeheer, ADR 0014): logt echt in via Better Auth als het seed-account van de rol, voor de admin met
// de TOTP-code uit het vaste lokale geheim. Alleen voor APP_ENV=local; server.ts geeft hem elders niet aan createApp.

function cookiePairs(setCookie: readonly string[]): string {
  return setCookie.map((line) => line.split(';', 1)[0] ?? '').join('; ');
}

export function createDevLogin(auth: AuthGateway, authOrigin: string): DevLogin {
  async function post(path: string, body: unknown, incoming: Headers, cookies: readonly string[]): Promise<string[]> {
    const headers = new Headers(incoming);
    headers.delete('content-length');
    headers.set('content-type', 'application/json');
    headers.set('origin', authOrigin);
    if (cookies.length === 0) headers.delete('cookie');
    else headers.set('cookie', cookiePairs(cookies));
    const response = await auth.handler(
      new Request(`${authOrigin}/api/auth${path}`, { method: 'POST', headers, body: JSON.stringify(body) }),
    );
    if (!response.ok) throw new Error(`dev-login: ${path} gaf ${String(response.status)} (draait de seed?)`);
    return response.headers.getSetCookie();
  }

  return async (role, incoming) => {
    const account = SEED_ACCOUNTS.find((candidate) => candidate.role === role);
    if (account === undefined) throw new Error(`dev-login: geen seed-account voor ${role}`);
    const signedIn = await post(
      '/sign-in/email',
      { email: account.email, password: SEED_DEMO_WACHTWOORD },
      incoming,
      [],
    );
    if (role !== 'admin') return signedIn;
    const verified = await post(
      '/two-factor/verify-totp',
      { code: totpCode(SEED_ADMIN_TOTP_SLEUTEL) },
      incoming,
      signedIn,
    );
    return [...signedIn, ...verified];
  };
}
