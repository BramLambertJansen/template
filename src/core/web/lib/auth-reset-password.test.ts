import { describe, expect, test } from 'vitest';
import { unsafeCast } from '../../shared/unsafe-cast.ts';
import { authErrorCode } from './auth.ts';

// Stap resetPassword (spec accountbeheer-uitbreiding, "Raakt ook": zelfde aanroep als setPassword, andere foutcode). De stap
// bestaat nog niet in het type `Step`; de test leest hem als dat type, zodat hij compileert en op de assertie faalt.
type Step = Parameters<typeof authErrorCode>[0];
const resetPassword = unsafeCast<Step>('resetPassword', 'stap bestaat pas na de bouw van accounts/AC-16');

describe('authErrorCode: nieuw wachtwoord via een resetlink (stap resetPassword)', () => {
  test('accounts/AC-16: een te kort of te lang wachtwoord is VALIDATION', () => {
    expect(authErrorCode(resetPassword, { status: 400, code: 'PASSWORD_TOO_SHORT' })).toBe('VALIDATION');
    expect(authErrorCode(resetPassword, { status: 400, code: 'PASSWORD_TOO_LONG' })).toBe('VALIDATION');
  });

  test('accounts/AC-16: elke andere 4xx (verlopen, gebruikt of onbekend token) is RESET_LINK_INVALID', () => {
    expect(authErrorCode(resetPassword, { status: 400, code: 'INVALID_TOKEN' })).toBe('RESET_LINK_INVALID');
    expect(authErrorCode(resetPassword, { status: 400 })).toBe('RESET_LINK_INVALID');
    expect(authErrorCode(resetPassword, { status: 403, code: 'ACCOUNT_BLOCKED' })).toBe('RESET_LINK_INVALID');
  });

  test('accounts/AC-16: te veel pogingen blijft RATE_LIMITED en een serverfout INTERNAL_ERROR', () => {
    expect(authErrorCode(resetPassword, { status: 429 })).toBe('RATE_LIMITED');
    expect(authErrorCode(resetPassword, { status: 500 })).toBe('INTERNAL_ERROR');
  });

  test('accounts/AC-16: setPassword blijft INVITATION_INVALID voor een ongeldig token', () => {
    expect(authErrorCode('setPassword', { status: 400, code: 'INVALID_TOKEN' })).toBe('INVITATION_INVALID');
    expect(authErrorCode('setPassword', { status: 400, code: 'PASSWORD_TOO_SHORT' })).toBe('VALIDATION');
  });
});
