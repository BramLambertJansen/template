import { describe, expect, test } from 'vitest';
import { ROLE_NAME_MAX_LENGTH } from './limits.ts';
import { defineRoles } from './roles.ts';
import { unsafeCast } from './unsafe-cast.ts';

// Spec rollenregister (ST-16): het register van rollen. Core voegt `user` en `admin` (beheer) toe, de app levert de rest.
// Zonder database; de database bewaakt het register in db/tests/roles.sql en test/auth/roles-register.int.test.ts.
type Extra = Parameters<typeof defineRoles>[0];

const roles = defineRoles({ planner: { beheer: false }, eigenaar: { beheer: true } });

function withExtra(name: string, beheer: boolean): Extra {
  return unsafeCast<Extra>({ [name]: { beheer } }, 'test: een rol die het type zelf al zou weigeren');
}

describe('defineRoles: het register', () => {
  test('rollenregister/AC-14: user en admin zitten er altijd in, naast de rollen van de app', () => {
    expect([...roles.names].sort()).toStrictEqual(['admin', 'eigenaar', 'planner', 'user']);
    expect([...defineRoles({}).names].sort()).toStrictEqual(['admin', 'user']);
  });

  test('rollenregister/AC-14: admin is beheer en user niet; de app kiest het voor haar eigen rollen', () => {
    expect(roles.names.filter((name) => roles.isBeheer(name)).sort()).toStrictEqual(['admin', 'eigenaar']);
  });

  test('rollenregister/AC-14: user of admin als extra rol gooit, met elke beheervlag', () => {
    for (const name of ['user', 'admin']) {
      expect(() => defineRoles(withExtra(name, true))).toThrow();
      expect(() => defineRoles(withExtra(name, false))).toThrow();
    }
  });

  test('rollenregister/AC-14: een naam buiten ^[a-z][a-z0-9_]*$ gooit', () => {
    expect(defineRoles(withExtra('a_1', false)).names).toContain('a_1');
    for (const name of ['Baas', '1baas', 'baas-2', 'baas 2', 'baas.2', '_baas', '', 'bàas', 'baas\n']) {
      expect(() => defineRoles(withExtra(name, false)), JSON.stringify(name)).toThrow();
    }
  });

  test('rollenregister/AC-14: precies ROLE_NAME_MAX_LENGTH tekens mag, één meer gooit', () => {
    const atLimit = 'a'.repeat(ROLE_NAME_MAX_LENGTH);
    const overLimit = 'a'.repeat(ROLE_NAME_MAX_LENGTH + 1);

    expect(defineRoles(withExtra(atLimit, false)).names).toContain(atLimit);
    expect(() => defineRoles(withExtra(overLimit, false))).toThrow();
  });

  test('rollenregister/AC-14: ROLE_NAME_MAX_LENGTH is 32 (R-CODE-07)', () => {
    expect(ROLE_NAME_MAX_LENGTH).toBe(32);
  });

  // Geen globale registratie of singleton (R-LAAG-02): twee registers beïnvloeden elkaar niet. De tekst van de migratie en
  // ROLE_NAME_MAX_LENGTH houdt test/auth/role-name-limit.test.ts gelijk (die leest bestanden, dus in een Node-project).
  test('rollenregister/AC-14: twee registers zijn onafhankelijk van elkaar (geen globale registratie, R-LAAG-02)', () => {
    const first = defineRoles({ planner: { beheer: true } });
    const second = defineRoles({ planner: { beheer: false } });

    expect([first.isBeheer('planner'), second.isBeheer('planner')]).toStrictEqual([true, false]);
    expect(defineRoles({}).names).not.toContain('planner');
  });
});

describe('het register kent geen onbekende rol', () => {
  const unknown = [
    'baas',
    '',
    'Admin',
    'constructor',
    'toString',
    '__proto__',
    'hasOwnProperty',
    null,
    undefined,
    1,
    {},
  ];

  test('rollenregister/AC-6: een onbekende naam is geen beheerder', () => {
    expect(roles.isBeheer('eigenaar')).toBe(true);
    expect(unknown.filter((value) => roles.isBeheer(value))).toStrictEqual([]);
  });

  test('rollenregister/AC-6: parse geeft null voor een onbekende naam', () => {
    expect(roles.parse('planner')).toBe('planner');
    expect(unknown.filter((value) => roles.parse(value) !== null)).toStrictEqual([]);
  });

  test('rollenregister/AC-6: parse geeft elke bekende rol onveranderd terug', () => {
    expect(roles.names.map((name) => roles.parse(name))).toStrictEqual([...roles.names]);
  });
});
