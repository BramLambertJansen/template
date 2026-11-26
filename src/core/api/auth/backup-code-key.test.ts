import { describe, expect, test } from 'vitest';
import { backupCodeKey, totpKey } from './one-time-use.ts';

// De claimsleutel van een herstelcode (ADR 0113 punt 4, spec accountbeheer-uitbreiding): alleen de vorm van de plugin,
// letterlijk (geen trimmen, hoofdlettergevoelig), nooit de code zelf in de sleutel.
describe('backupCodeKey', () => {
  test('accounts/AC-25: een code van de vorm xxxxx-xxxxx geeft een eigen prefix met een sha256-hash', () => {
    const key = backupCodeKey('u1', 'aB3dE-fG6hJ');

    expect(key).toMatch(/^backup-code:[0-9a-f]{64}$/);
    expect(key).not.toContain('aB3dE');
    expect(key).toBe(backupCodeKey('u1', 'aB3dE-fG6hJ'));
  });

  test('accounts/AC-25: per gebruiker en per code een andere sleutel; hoofdletters tellen', () => {
    const key = backupCodeKey('u1', 'aB3dE-fG6hJ');

    expect(backupCodeKey('u2', 'aB3dE-fG6hJ')).not.toBe(key);
    expect(backupCodeKey('u1', 'AB3DE-FG6HJ')).not.toBe(key);
  });

  test('accounts/AC-25: geen sleutel voor een andere vorm (dan weigert de plugin zelf)', () => {
    for (const code of [' aB3dE-fG6hJ', 'aB3dEfG6hJ', 'aB3dE-fG6h', 'aB3dE_fG6hJ', '123456', 42, undefined]) {
      expect(backupCodeKey('u1', code)).toBeNull();
    }
  });

  test('een TOTP-code en een herstelcode delen nooit een sleutel', () => {
    expect(totpKey('u1', '123456')).toMatch(/^totp:/);
  });
});
