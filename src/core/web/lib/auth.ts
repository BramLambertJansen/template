import { twoFactorClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import { ApiError } from './api-client.ts';

// Enige plek met better-auth/react (framework §2, ADR 0013): inloggen, TOTP, wachtwoord instellen en wijzigen, uitloggen. Fouten van
// Better Auth worden foutcodes uit het register (ApiError), zodat Form en AsyncView dezelfde teksten tonen als bij de API.
// Same-origin met cookie; de CSRF-controle (ADR 0007) ziet de headers die de browser zelf stuurt.

interface AuthFailure {
  readonly status: number;
  readonly code?: string | undefined;
}

type Step = 'signIn' | 'verifyTotp' | 'enableTotp' | 'setPassword' | 'signOut' | 'changePassword';

// Per stap: welke foutcode een 4xx betekent. Inloggen geeft altijd dezelfde melding (geen onderscheid tussen onbekend
// e-mailadres en fout wachtwoord); een uitnodigingslink geeft één melding voor verlopen, gebruikt of onbekend.
export function authErrorCode(step: Step, failure: AuthFailure): string {
  if (failure.status === 429) return 'RATE_LIMITED';
  if (failure.status >= 500) return 'INTERNAL_ERROR';
  // Geweigerd vóór Better Auth (andere origin, ADR 0007): nooit vermommen als "wachtwoord klopt niet".
  if (failure.code === 'CSRF_REJECTED') return 'CSRF_REJECTED';
  if (step === 'verifyTotp') return failure.code === 'INVALID_TWO_FACTOR_COOKIE' ? 'UNAUTHENTICATED' : 'INVALID_TOTP';
  if (step === 'setPassword') return failure.code === 'PASSWORD_TOO_SHORT' ? 'VALIDATION' : 'INVITATION_INVALID';
  if (step === 'signIn' || step === 'enableTotp') return 'INVALID_CREDENTIALS';
  if (step === 'changePassword') return changePasswordCode(failure);
  return 'INTERNAL_ERROR';
}

// Spec eigen-account: fout huidig wachtwoord, ongeldig nieuw wachtwoord, MFA-eis van de before-hook, verlopen sessie.
// Een Map, geen object: Betterleaks (generic-password) leest `INVALID_PASSWORD: '…'` als een geheim.
const CHANGE_PASSWORD_CODES: ReadonlyMap<string, string> = new Map([
  ['INVALID_PASSWORD', 'WRONG_PASSWORD'],
  ['PASSWORD_TOO_SHORT', 'VALIDATION'],
  ['PASSWORD_TOO_LONG', 'VALIDATION'],
  ['VALIDATION', 'VALIDATION'],
  ['MFA_REQUIRED', 'MFA_REQUIRED'],
]);

function changePasswordCode(failure: AuthFailure): string {
  if (failure.status === 401) return 'UNAUTHENTICATED';
  return CHANGE_PASSWORD_CODES.get(failure.code ?? '') ?? 'INTERNAL_ERROR';
}

function fail(step: Step, failure: AuthFailure): never {
  throw new ApiError(authErrorCode(step, failure), failure.status);
}

export type SignInResult = 'totp' | 'signed-in';

export function createAuthApi(baseURL: string) {
  const client = createAuthClient({ baseURL, basePath: '/api/auth', plugins: [twoFactorClient()] });

  return {
    // 'totp': de admin heeft TOTP en moet eerst de code geven (nog geen sessie). 'signed-in': sessie met sterkte password.
    async signIn(email: string, password: string): Promise<SignInResult> {
      const { data, error } = await client.signIn.email({ email, password });
      if (error !== null) fail('signIn', error);
      return 'twoFactorRedirect' in data && data.twoFactorRedirect === true ? 'totp' : 'signed-in';
    },
    async verifyTotp(code: string): Promise<void> {
      const { error } = await client.twoFactor.verifyTotp({ code });
      if (error !== null) fail('verifyTotp', error);
    },
    // TOTP inschrijven (spec: admin zonder TOTP). Actief pas na verifyTotp met een code uit de app.
    async enableTotp(password: string): Promise<{ totpURI: string }> {
      const { data, error } = await client.twoFactor.enable({ password });
      if (error !== null) fail('enableTotp', error);
      // De server heeft alleen TOTP (geen e-mail-OTP); een ander antwoord is een fout in de configuratie.
      if (data.method !== 'totp') throw new ApiError('INTERNAL_ERROR', 500);
      return { totpURI: data.totpURI };
    },
    async setPassword(token: string, newPassword: string): Promise<void> {
      const { error } = await client.resetPassword({ token, newPassword });
      if (error !== null) fail('setPassword', error);
    },
    // Spec eigen-account: andere sessies intrekken is verplicht (de server weigert anders met VALIDATION).
    async changePassword(currentPassword: string, newPassword: string): Promise<void> {
      const { error } = await client.changePassword({ currentPassword, newPassword, revokeOtherSessions: true });
      if (error !== null) fail('changePassword', error);
    },
    async signOut(): Promise<void> {
      const { error } = await client.signOut();
      if (error !== null) fail('signOut', error);
    },
  };
}

export type AuthApi = ReturnType<typeof createAuthApi>;
