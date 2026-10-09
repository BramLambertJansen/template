import { expect, test } from 'vitest';
import { errors } from './errors.ts';

test('de app-codes uit de spec accountbeheer staan in het register', () => {
  for (const code of [
    'INVALID_CREDENTIALS',
    'INVALID_TOTP',
    'INVITATION_INVALID',
    'ALREADY_ACTIVE',
    'LAST_ADMIN',
    'MFA_REQUIRED',
  ]) {
    expect(errors.is(code)).toBe(true);
  }
});
