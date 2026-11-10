import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

// Spec lijstpagina, "Lijstquery-helpers" (leerpunt #662): lijstpagina/AC-22.
// Dat de verhuizing naar de gedeelde helpers het gedrag van de accountslijst niet verandert, dekken de bestaande tests
// (accounts-cursor.test.ts en de integratietests); deze test pint alleen dat de route de gedeelde helpers importeert.
const BRON = readFileSync(new URL('./accounts.ts', import.meta.url), 'utf8');

test('accounts.ts importeert decodeListCursor en containsPattern uit de gedeelde lijstquery-helpers (lijstpagina/AC-22)', () => {
  expect(BRON).toMatch(/^import \{[^}]*\bdecodeListCursor\b[^}]*\} from '#core\/api\/route\/list-query\.ts';$/m);
  expect(BRON).toMatch(/^import \{[^}]*\bcontainsPattern\b[^}]*\} from '#core\/api\/route\/list-query\.ts';$/m);
  expect(BRON).toContain("import { containsPattern, decodeListCursor } from '#core/api/route/list-query.ts';");
});
