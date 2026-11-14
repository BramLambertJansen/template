import { describe, expect, test } from 'vitest';
import * as can from '#core/shared/can.ts';
import { roles } from './roles.ts';

// Het register van de app (spec rollenregister, ST-16): src/shared/roles.ts. Het standaardregister is wat de template
// meelevert; een app voegt rollen toe met defineRoles. De database moet hetzelfde register hebben: test/auth/roles-register.int.test.ts.
describe('het register van de app', () => {
  test('rollenregister/AC-1: het standaardregister heeft user (geen beheer) en admin (beheer)', () => {
    const beheer = roles.names.filter((name) => roles.isBeheer(name));

    expect(roles.names).toContain('user');
    expect(roles.names).toContain('admin');
    expect(beheer).toContain('admin');
    expect(beheer).not.toContain('user');
  });

  test('rollenregister/AC-1: ROLES en Role zijn uit core verdwenen; het register van de app is de enige bron', () => {
    expect(Object.keys(can)).not.toContain('ROLES');
  });

  test('rollenregister/AC-6: een rol die het register niet kent, is geen beheerder', () => {
    expect(roles.isBeheer('admin')).toBe(true);
    expect(roles.isBeheer('baas')).not.toBe(true);
  });

  test('rollenregister/AC-6: parse geeft null voor een rol die het register niet kent en de rol voor een bekende', () => {
    expect(roles.parse('admin')).toBe('admin');
    expect(roles.parse('baas')).toBeNull();
  });
});
