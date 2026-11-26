import { describe, expect, test } from 'vitest';
import { backupCodeInput } from './auth.ts';

// Randgeval (spec accountbeheer-uitbreiding): herstelcode met spaties of kleine letters: spaties weg; hoofdlettergevoelig.
describe('backupCodeInput', () => {
  test('spaties om de code weg, hoofdletters en kleine letters blijven zoals ingevoerd', () => {
    expect(backupCodeInput.parse({ code: ' abcDE-12345 ' })).toStrictEqual({ code: 'abcDE-12345' });
  });

  test('spaties in de code weg', () => {
    expect(backupCodeInput.parse({ code: 'abcDE - 12345' })).toStrictEqual({ code: 'abcDE-12345' });
  });

  test('alleen spaties: Vul een herstelcode in.', () => {
    expect(backupCodeInput.safeParse({ code: '   ' }).error?.issues[0]?.message).toBe('Vul een herstelcode in.');
  });
});
