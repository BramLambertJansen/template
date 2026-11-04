import { describe, expect, test } from 'vitest';
import { MAX_ID_LENGTH, MAX_TIMESTAMP_LENGTH } from '#core/shared/limits.ts';
import { MAX_NAME_LENGTH } from '../limits.ts';
import { ACCOUNT_SORTS, accountsSearch } from './accounts.ts';

// Spec lijstpagina, cursorbudget (leerpunt #444): accounts declareert per sortering de maximale lengte van elk sleuteldeel.
// Met het slechtste teken (U+0001, 6 JSON-bytes per eenheid) op die maximale lengte moet de cursor door de eigen invoer heen.
const DECLARED: Record<(typeof ACCOUNT_SORTS)[number], readonly number[]> = {
  nieuwste: [MAX_TIMESTAMP_LENGTH, MAX_ID_LENGTH],
  oudste: [MAX_TIMESTAMP_LENGTH, MAX_ID_LENGTH],
  'naam-az': [2 * MAX_NAME_LENGTH, MAX_ID_LENGTH],
  'naam-za': [2 * MAX_NAME_LENGTH, MAX_ID_LENGTH],
};

describe('accountsSearch: slechtste cursor per sortering (lijstpagina/AC-13)', () => {
  test.each(ACCOUNT_SORTS)('%s: de cursor met maximale delen wordt door de api weer geaccepteerd', (sort) => {
    const parts = DECLARED[sort].map((length) => '\u0001'.repeat(length));

    const cursor = accountsSearch.encodeCursor(sort, parts);

    expect(accountsSearch.api.safeParse({ sort, cursor }).success).toBe(true);
  });

  test.each(ACCOUNT_SORTS)('%s: één deel te weinig geeft een AssertionError (lijstpagina/AC-15)', (sort) => {
    const parts = DECLARED[sort].slice(1).map((length) => 'a'.repeat(length));

    expect(() => accountsSearch.encodeCursor(sort, parts)).toThrow(expect.objectContaining({ name: 'AssertionError' }));
  });
});
