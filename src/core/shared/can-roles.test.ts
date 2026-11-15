import { describe, expect, test } from 'vitest';
import { type CanActor, definePermissions, type SessionStrength } from './can.ts';
import { defineRoles } from './roles.ts';
import { unsafeCast } from './unsafe-cast.ts';

// Spec rollenregister (ST-16): can() met een eigen register, zonder core te wijzigen. Testregister van de spec: planner (geen
// beheer), eigenaar (beheer) en toezicht (beheer). Testtabel: eigenaar heeft accounts:read en accounts:manage, toezicht
// me:read, planner me:read. Beheerrol: elke toegestane permissie eist een MFA-sessie (framework §6, ADR 0040).
const roles = defineRoles({ planner: { beheer: false }, eigenaar: { beheer: true }, toezicht: { beheer: true } });
const permissions = definePermissions(roles, {
  'me:read': { roles: ['planner', 'toezicht'] },
  'accounts:read': { roles: ['eigenaar'] },
  'accounts:manage': { roles: ['eigenaar'] },
});

const actor = (role: (typeof roles.names)[number], sessionStrength: SessionStrength): CanActor => ({
  role,
  sessionStrength,
});
const FORBIDDEN = { ok: false, code: 'FORBIDDEN' } as const;
const MFA_REQUIRED = { ok: false, code: 'MFA_REQUIRED' } as const;
const OK = { ok: true } as const;

// Per permissie de toegestane rollen, letterlijk; 'app.use' hoort bij elke rol in het register (core, ADR 0040).
const allowed: Record<string, readonly string[]> = {
  'app.use': ['user', 'admin', 'planner', 'eigenaar', 'toezicht'],
  'me:read': ['planner', 'toezicht'],
  'accounts:read': ['eigenaar'],
  'accounts:manage': ['eigenaar'],
};
const BEHEER = ['admin', 'eigenaar', 'toezicht'];

describe('definePermissions(roles, tabel)', () => {
  test('rollenregister/AC-2: de tabel kent het register en bevat de permissies van core en van de app', () => {
    expect(permissions.roles).toBe(roles);
    expect([...permissions.names].sort()).toStrictEqual(Object.keys(allowed).sort());
  });

  test('rollenregister/AC-2: planner (geen beheer): app.use en me:read slagen met een password-sessie, de rest FORBIDDEN', () => {
    expect(permissions.check(actor('planner', 'password'), 'app.use')).toStrictEqual(OK);
    expect(permissions.check(actor('planner', 'password'), 'me:read')).toStrictEqual(OK);
    expect(permissions.check(actor('planner', 'password'), 'accounts:read')).toStrictEqual(FORBIDDEN);
    expect(permissions.check(actor('planner', 'password'), 'accounts:manage')).toStrictEqual(FORBIDDEN);
  });

  test.each(
    Object.entries(allowed).flatMap(([permission, roleNames]) =>
      roles.names.flatMap((role) =>
        (['password', 'mfa'] as const).map((sessionStrength) => ({
          permission,
          role,
          sessionStrength,
          expected: !roleNames.includes(role)
            ? FORBIDDEN
            : BEHEER.includes(role) && sessionStrength === 'password'
              ? MFA_REQUIRED
              : OK,
        })),
      ),
    ),
  )(
    'rollenregister/AC-2: $permission voor $role ($sessionStrength): $expected.code',
    ({ permission, role, sessionStrength, expected }) => {
      const name = permissions.names.find((candidate) => candidate === permission);
      if (name === undefined) throw new Error(`onbekende permissie ${permission}`);

      expect(permissions.check(actor(role, sessionStrength), name)).toStrictEqual(expected);
    },
  );

  test('rollenregister/AC-3: eigenaar met een password-sessie: elke toegestane permissie is MFA_REQUIRED, ook app.use', () => {
    const password = actor('eigenaar', 'password');

    expect(permissions.check(password, 'accounts:read')).toStrictEqual(MFA_REQUIRED);
    expect(permissions.check(password, 'accounts:manage')).toStrictEqual(MFA_REQUIRED);
    expect(permissions.check(password, 'app.use')).toStrictEqual(MFA_REQUIRED);
    // Niet toegestaan blijft FORBIDDEN, ook voor een beheerrol zonder MFA (de rol gaat voor de sessiesterkte).
    expect(permissions.check(password, 'me:read')).toStrictEqual(FORBIDDEN);
  });

  test('rollenregister/AC-3: eigenaar met een mfa-sessie mag accounts:read en accounts:manage', () => {
    expect(permissions.check(actor('eigenaar', 'mfa'), 'accounts:read')).toStrictEqual(OK);
    expect(permissions.check(actor('eigenaar', 'mfa'), 'accounts:manage')).toStrictEqual(OK);
  });

  test('rollenregister/AC-6: toezicht (beheer, zonder accounts:read): me:read met MFA, accounts:read FORBIDDEN', () => {
    expect(permissions.check(actor('toezicht', 'mfa'), 'me:read')).toStrictEqual(OK);
    expect(permissions.check(actor('toezicht', 'password'), 'me:read')).toStrictEqual(MFA_REQUIRED);
    expect(permissions.check(actor('toezicht', 'mfa'), 'accounts:read')).toStrictEqual(FORBIDDEN);
  });

  test('rollenregister/AC-12: een rol buiten het register is FORBIDDEN op elke permissie, ook app.use', () => {
    const unknown = unsafeCast<CanActor>(
      { role: 'spook', sessionStrength: 'mfa' },
      'test: een rol die alleen in de database staat',
    );

    expect(permissions.names.map((name) => permissions.check(unknown, name))).toStrictEqual(
      permissions.names.map(() => FORBIDDEN),
    );
  });

  test('rollenregister/AC-12: zonder actor blijft UNAUTHENTICATED gelden', () => {
    expect(permissions.check(null, 'app.use')).toStrictEqual({ ok: false, code: 'UNAUTHENTICATED' });
  });
});

// De vlag `beheer` staat in het register, niet in de tabel: wijzigt hij, dan wijzigt de MFA-eis met hem mee.
describe('de beheervlag bepaalt de MFA-eis', () => {
  const table = { 'notes:read': { roles: ['eigenaar'] } } as const;
  const withBeheer = definePermissions(defineRoles({ eigenaar: { beheer: true } }), table);
  const withoutBeheer = definePermissions(defineRoles({ eigenaar: { beheer: false } }), table);

  test('rollenregister/AC-16: krijgt een rol beheer, dan geven toegestane permissies voor een password-sessie MFA_REQUIRED', () => {
    expect(withoutBeheer.check(actor('eigenaar', 'password'), 'notes:read')).toStrictEqual(OK);
    expect(withBeheer.check(actor('eigenaar', 'password'), 'notes:read')).toStrictEqual(MFA_REQUIRED);
    expect(withBeheer.check(actor('eigenaar', 'password'), 'app.use')).toStrictEqual(MFA_REQUIRED);
  });

  test('rollenregister/AC-16: verliest een rol beheer, dan houdt een mfa-sessie alleen de permissies van de rol', () => {
    expect(withBeheer.check(actor('eigenaar', 'mfa'), 'notes:read')).toStrictEqual(OK);
    expect(withoutBeheer.check(actor('eigenaar', 'mfa'), 'notes:read')).toStrictEqual(OK);
    // Een mfa-sessie geeft geen extra permissies: niet in de tabel blijft FORBIDDEN, met of zonder beheer.
    expect(
      definePermissions(defineRoles({ eigenaar: { beheer: false } }), { 'x:y': { roles: [] } }).check(
        actor('eigenaar', 'mfa'),
        'x:y',
      ),
    ).toStrictEqual(FORBIDDEN);
  });

  test('rollenregister/AC-16: admin blijft beheer en user niet, ook in een register zonder extra rollen', () => {
    const base = definePermissions(defineRoles({}), { 'notes:read': { roles: ['user', 'admin'] } });

    expect(base.check({ role: 'admin', sessionStrength: 'password' }, 'notes:read')).toStrictEqual(MFA_REQUIRED);
    expect(base.check({ role: 'user', sessionStrength: 'password' }, 'notes:read')).toStrictEqual(OK);
  });

  test('rollenregister/AC-2: een app kan app.use niet herdefiniëren, ook niet met een register', () => {
    expect(() => definePermissions(roles, { 'app.use': { roles: ['planner'] } })).toThrow('bestaat al in core');
  });
});
