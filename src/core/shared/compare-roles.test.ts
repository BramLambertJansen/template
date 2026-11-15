import { describe, expect, test } from 'vitest';
import { compareRoles, defineRoles } from './roles.ts';

// compareRoles (spec rollenregister, AC-13): het register van de code tegenover de rijen van app.roles, per richting. Tegen de
// echte database: test/auth/roles-register.int.test.ts.
const roles = defineRoles({ planner: { beheer: false }, eigenaar: { beheer: true } });
const rows = [
  { name: 'user', beheer: false },
  { name: 'admin', beheer: true },
  { name: 'planner', beheer: false },
  { name: 'eigenaar', beheer: true },
];
const EQUAL = { onlyInRegister: [], onlyInRows: [], beheerDiffers: [] };

describe('compareRoles', () => {
  test('rollenregister/AC-13: gelijk register en rijen: geen verschil', () => {
    expect(compareRoles(roles, rows)).toStrictEqual(EQUAL);
  });

  test('rollenregister/AC-13: een rol alleen in het register', () => {
    expect(
      compareRoles(
        roles,
        rows.filter((row) => row.name !== 'planner'),
      ),
    ).toStrictEqual({
      ...EQUAL,
      onlyInRegister: ['planner'],
    });
  });

  test('rollenregister/AC-13: een rol alleen in de rijen', () => {
    expect(compareRoles(roles, [...rows, { name: 'spook', beheer: true }])).toStrictEqual({
      ...EQUAL,
      onlyInRows: ['spook'],
    });
  });

  test('rollenregister/AC-13: een andere beheervlag, in beide richtingen', () => {
    const flipped = rows.map((row) =>
      row.name === 'user' || row.name === 'admin' ? row : { ...row, beheer: !row.beheer },
    );

    expect(compareRoles(roles, flipped)).toStrictEqual({ ...EQUAL, beheerDiffers: ['eigenaar', 'planner'] });
  });
});
