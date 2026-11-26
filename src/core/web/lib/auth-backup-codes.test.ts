import { describe, expect, test } from 'vitest';
import { unsafeCast } from '../../shared/unsafe-cast.ts';
import { authErrorCode } from './auth.ts';

// Stappen voor herstelcodes (spec accountbeheer-uitbreiding, alinea Herstelcodes, ADR 0113). De stappen bestaan nog niet in
// het type `Step`; de test leest ze als dat type, zodat hij compileert en op de assertie faalt.
type Step = Parameters<typeof authErrorCode>[0];
const verifyBackupCode = unsafeCast<Step>('verifyBackupCode', 'stap bestaat pas na de bouw van accounts/AC-17');
const generateBackupCodes = unsafeCast<Step>('generateBackupCodes', 'stap bestaat pas na de bouw van accounts/AC-18');

describe('authErrorCode: herstelcode bij inloggen (stap verifyBackupCode)', () => {
  test('accounts/AC-17: zonder lopende inlogpoging (INVALID_TWO_FACTOR_COOKIE) is het UNAUTHENTICATED: terug naar inloggen', () => {
    expect(authErrorCode(verifyBackupCode, { status: 401, code: 'INVALID_TWO_FACTOR_COOKIE' })).toBe('UNAUTHENTICATED');
  });

  test('accounts/AC-17: elke andere fout is INVALID_BACKUP_CODE, ook een ontbrekende of onbekende code', () => {
    expect(authErrorCode(verifyBackupCode, { status: 401, code: 'INVALID_BACKUP_CODE' })).toBe('INVALID_BACKUP_CODE');
    expect(authErrorCode(verifyBackupCode, { status: 400, code: 'VALIDATION' })).toBe('INVALID_BACKUP_CODE');
    expect(authErrorCode(verifyBackupCode, { status: 403, code: 'ACCOUNT_BLOCKED' })).toBe('INVALID_BACKUP_CODE');
    expect(authErrorCode(verifyBackupCode, { status: 401 })).toBe('INVALID_BACKUP_CODE');
  });

  test('accounts/AC-17: te veel pogingen blijft RATE_LIMITED en een serverfout INTERNAL_ERROR', () => {
    expect(authErrorCode(verifyBackupCode, { status: 429 })).toBe('RATE_LIMITED');
    expect(authErrorCode(verifyBackupCode, { status: 500 })).toBe('INTERNAL_ERROR');
  });
});

describe('authErrorCode: nieuwe herstelcodes maken (stap generateBackupCodes)', () => {
  test('accounts/AC-18: een fout wachtwoord is WRONG_PASSWORD', () => {
    expect(authErrorCode(generateBackupCodes, { status: 400, code: 'INVALID_PASSWORD' })).toBe('WRONG_PASSWORD');
  });

  test('accounts/AC-21: MFA_REQUIRED blijft MFA_REQUIRED', () => {
    expect(authErrorCode(generateBackupCodes, { status: 403, code: 'MFA_REQUIRED' })).toBe('MFA_REQUIRED');
  });

  test('accounts/AC-18: te veel pogingen blijft RATE_LIMITED', () => {
    expect(authErrorCode(generateBackupCodes, { status: 429 })).toBe('RATE_LIMITED');
  });
});
