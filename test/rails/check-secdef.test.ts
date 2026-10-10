import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from 'vitest';
import { secdefFouten, secdefRegels } from '../../scripts/kit/check-secdef.mjs';

// check:secdef (AGENTS.md, framework §6): per overtreding een fixture in fixtures/secdef die faalt, plus een goede die groen is;
// de echte migraties zijn groen, en zonder hun `owner to app_definer` faalt de check (hij ziet de functies dus echt).
const FIXTURES = 'test/rails/fixtures/secdef';

function fixture(naam: string): string[] {
  return secdefRegels([{ naam, sql: readFileSync(path.join(FIXTURES, naam), 'utf8') }]);
}

test('goed: search_path leeg, namen met schema, eigenaar app_definer (ook een SQL-standaard-body)', () => {
  expect(fixture('goed.sql')).toStrictEqual([]);
});

test.each([
  [
    'geen-search-path.sql',
    ["db/migrations/geen-search-path.sql:2: app.is_owner is security definer zonder `set search_path = ''`"],
  ],
  [
    'verkeerde-search-path.sql',
    [
      "db/migrations/verkeerde-search-path.sql:2: app.a is security definer met search_path public; gebruik `set search_path = ''`",
      "db/migrations/verkeerde-search-path.sql:5: app.b is security definer met search_path pg_catalog, public; gebruik `set search_path = ''`",
      "db/migrations/verkeerde-search-path.sql:8: app.c is security definer met search_path from current; gebruik `set search_path = ''`",
      "db/migrations/verkeerde-search-path.sql:12: app.d is security definer zonder `set search_path = ''`",
    ],
  ],
  [
    'ongekwalificeerde-naam.sql',
    ['db/migrations/ongekwalificeerde-naam.sql:2: is_owner heeft geen schema; schrijf <schema>.is_owner'],
  ],
  [
    'ongekwalificeerde-tabel.sql',
    [
      'db/migrations/ongekwalificeerde-tabel.sql:2: app.is_admin noemt user_roles zonder schema; schrijf <schema>.user_roles (bijv. public.user_roles)',
      'db/migrations/ongekwalificeerde-tabel.sql:7: app.set_role noemt user_roles zonder schema; schrijf <schema>.user_roles (bijv. public.user_roles)',
      'db/migrations/ongekwalificeerde-tabel.sql:7: app.set_role noemt "Roles" zonder schema; schrijf <schema>."Roles" (bijv. public.user_roles)',
    ],
  ],
  [
    'ongekwalificeerde-functie.sql',
    [
      'db/migrations/ongekwalificeerde-functie.sql:2: app.is_admin roept current_user_id() aan zonder schema; schrijf <schema>.current_user_id() (bijv. app.current_user_id() of pg_catalog.now())',
      'db/migrations/ongekwalificeerde-functie.sql:2: app.is_admin roept now() aan zonder schema; schrijf <schema>.now() (bijv. app.current_user_id() of pg_catalog.now())',
      'db/migrations/ongekwalificeerde-functie.sql:6: app.oud roept now() aan zonder schema; schrijf <schema>.now() (bijv. app.current_user_id() of pg_catalog.now())',
    ],
  ],
  [
    'geen-eigenaar.sql',
    [
      'db/migrations/geen-eigenaar.sql:2: app.is_owner is security definer zonder eigenaar app_definer; zet `alter function app.is_owner(…) owner to app_definer` in dezelfde migratie',
    ],
  ],
  [
    'verkeerde-eigenaar.sql',
    [
      'db/migrations/verkeerde-eigenaar.sql:2: app.is_owner is security definer met eigenaar app_migrator; de eigenaar is app_definer',
    ],
  ],
])('%s faalt', (naam, fouten) => {
  expect(fixture(naam)).toStrictEqual(fouten);
});

test('elke fixture behalve goed.sql faalt (een nieuwe fixture zonder test valt op)', () => {
  const bestanden = readdirSync(FIXTURES).filter((naam) => naam.endsWith('.sql'));

  expect(bestanden.filter((naam) => (naam === 'goed.sql') === fixture(naam).length > 0)).toStrictEqual([]);
});

const CREATE = `create function app.f() returns boolean
  language sql stable security definer set search_path = ''
  as $$ select true $$;
alter function app.f() owner to app_definer;
`;

test('create or replace in een latere migratie houdt de eigenaar; een latere andere eigenaar faalt', () => {
  const replace =
    "create or replace function app.f() returns boolean\n  language sql security definer set search_path = ''\n  as $$ select false $$;\n";

  expect(
    secdefRegels([
      { naam: '1.sql', sql: CREATE },
      { naam: '2.sql', sql: replace },
    ]),
  ).toStrictEqual([]);
  expect(
    secdefRegels([
      { naam: '1.sql', sql: CREATE },
      { naam: '2.sql', sql: 'alter function app.f() owner to app_migrator;\n' },
    ]),
  ).toStrictEqual([
    'db/migrations/2.sql:1: app.f is security definer met eigenaar app_migrator; de eigenaar is app_definer',
  ]);
});

test('security definer zetten via alter function faalt', () => {
  expect(
    secdefRegels([
      { naam: '1.sql', sql: CREATE },
      { naam: '2.sql', sql: 'alter function app.f() security definer;\n' },
    ]),
  ).toStrictEqual([
    'db/migrations/2.sql:1: app.f wordt security definer via alter; zet het in create function, met de search_path',
  ]);
});

test('de migraties in db/migrations zijn groen, en zonder `owner to app_definer` niet', () => {
  expect(secdefFouten()).toStrictEqual([]);

  const dir = 'db/migrations';
  const zonderEigenaar = readdirSync(dir)
    .filter((naam) => naam.endsWith('.sql'))
    .sort()
    .map((naam) => ({
      naam,
      sql: readFileSync(path.join(dir, naam), 'utf8').replace(/^alter function .* owner to app_definer;$/gm, ''),
    }));

  expect(secdefRegels(zonderEigenaar).map((fout) => fout.split(' is ')[0])).toStrictEqual([
    'db/migrations/20261009194039_user_roles.sql:18: app.is_mfa_admin',
    'db/migrations/20261009194039_user_roles.sql:26: app.assign_role',
    'db/migrations/20261009194039_user_roles.sql:41: app.user_roles_keep_one_admin',
    'db/migrations/20261009195546_assign_role_actor.sql:4: app.assign_role',
  ]);
});
