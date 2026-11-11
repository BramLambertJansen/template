import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { AssertionError } from '../../shared/assert.ts';
import { MAX_ID_LENGTH, MAX_SEARCH_LENGTH, MAX_TIMESTAMP_LENGTH } from '../../shared/limits.ts';
import { defineListSearch } from '../../shared/list-search.ts';
import { AppError } from '../errors.ts';
import { containsPattern, decodeListCursor } from './list-query.ts';

// Spec lijstpagina, "Lijstquery-helpers" (leerpunt #662): lijstpagina/AC-17 (containsPattern), AC-19 en AC-20 (decodeListCursor).

describe('containsPattern (lijstpagina/AC-17)', () => {
  test('gewone tekst komt tussen twee procenttekens', () => {
    expect(containsPattern('abc')).toBe('%abc%');
  });

  test('%, _ en \\ krijgen een \\ ervoor en zoeken dus letterlijk', () => {
    expect(containsPattern('50%_a\\b')).toBe('%50\\%\\_a\\\\b%');
  });

  test('lege invoer geeft %%', () => {
    expect(containsPattern('')).toBe('%%');
  });

  test('MAX_SEARCH_LENGTH keer \\ wordt 2 * MAX_SEARCH_LENGTH + 2 tekens: % en % om alleen \\\\-paren', () => {
    const pattern = containsPattern('\\'.repeat(MAX_SEARCH_LENGTH));

    expect(pattern).toHaveLength(2 * MAX_SEARCH_LENGTH + 2);
    expect(pattern).toBe(`%${'\\\\'.repeat(MAX_SEARCH_LENGTH)}%`);
  });

  test('MAX_SEARCH_LENGTH keer a blijft ongewijzigd tussen twee procenttekens', () => {
    const q = 'a'.repeat(MAX_SEARCH_LENGTH);

    expect(containsPattern(q)).toBe(`%${q}%`);
  });

  test('de lengte is 2 + q.length + het aantal ge-escapete tekens', () => {
    const q = '%_\\x_%';

    expect(containsPattern(q)).toHaveLength(2 + q.length + 5);
  });
});

// Eén sortering met twee sleuteldelen (tijdstip, id) en één met twee delen voor de naam.
const search = defineListSearch({
  sorts: ['nieuwste', 'naam-az'],
  filters: {},
  cursorKeys: {
    nieuwste: [MAX_TIMESTAMP_LENGTH, MAX_ID_LENGTH],
    'naam-az': [2 * 100, MAX_ID_LENGTH],
  },
});

const TIME = '2026-01-02T03:04:05.123456+00:00';
const ID = 'id-1';
const parts = [z.iso.datetime({ offset: true }), z.string()] as const;

// De geparste input van de route: `{ sort, cursor }`, zoals de handler hem uit `input` haalt.
function inputFor(sort: 'nieuwste' | 'naam-az', cursor?: string) {
  return { sort, cursor };
}

function thrownBy(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  return undefined;
}

function expectValidation(error: unknown): void {
  expect(error).toBeInstanceOf(AppError);
  if (!(error instanceof AppError)) return;
  expect(error.code).toBe('VALIDATION');
  expect(error.cause).toBeUndefined();
}

describe('decodeListCursor: geldige invoer (lijstpagina/AC-19)', () => {
  test('zonder cursor is de uitkomst null', () => {
    expect(decodeListCursor(search, inputFor('nieuwste'), parts)).toBeNull();
  });

  test('een cursor uit search.encodeCursor geeft precies de sleuteldelen, zonder de sorteernaam', () => {
    const cursor = search.encodeCursor('nieuwste', [TIME, ID]);

    expect(decodeListCursor(search, inputFor('nieuwste', cursor), parts)).toStrictEqual([TIME, ID]);
  });

  test('werkt ook voor een andere sortering met eigen delen', () => {
    const cursor = search.encodeCursor('naam-az', ['zoë', ID]);

    expect(decodeListCursor(search, inputFor('naam-az', cursor), [z.string(), z.string()])).toStrictEqual(['zoë', ID]);
  });
});

describe('decodeListCursor: ongeldige cursor is VALIDATION zonder cause (lijstpagina/AC-19)', () => {
  const invalid: [string, string][] = [
    ['een cursor van een andere sortering', search.encodeCursor('naam-az', ['abc', ID])],
    ['geen base64url', '***niet base64url***'],
    ['geen JSON', Buffer.from('dit is geen json').toString('base64url')],
    ['een sleuteldeel van het verkeerde type', search.encodeCursor('nieuwste', ['geen-datum', ID])],
    ['een sleuteldeel dat geen string is', Buffer.from(JSON.stringify(['nieuwste', TIME, 5])).toString('base64url')],
    ['te weinig delen', Buffer.from(JSON.stringify(['nieuwste', TIME])).toString('base64url')],
    ['te veel delen', Buffer.from(JSON.stringify(['nieuwste', TIME, ID, 'extra'])).toString('base64url')],
    ['een cursor zonder sorteernaam', Buffer.from(JSON.stringify([TIME, ID])).toString('base64url')],
  ];

  test.each(invalid)('%s', (_, cursor) => {
    expectValidation(thrownBy(() => decodeListCursor(search, inputFor('nieuwste', cursor), parts)));
  });
});

describe('decodeListCursor: bugs komen zichtbaar naar buiten (lijstpagina/AC-20)', () => {
  test('parts met een andere lengte dan cursorKeys[sort] geeft een AssertionError, geen AppError', () => {
    const cursor = search.encodeCursor('nieuwste', [TIME, ID]);
    const error = thrownBy(() => decodeListCursor(search, inputFor('nieuwste', cursor), [z.string()] as const));

    expect(error).toBeInstanceOf(AssertionError);
    expect(error).not.toBeInstanceOf(AppError);
  });

  test('te veel parts geeft ook een AssertionError', () => {
    const cursor = search.encodeCursor('nieuwste', [TIME, ID]);
    const error = thrownBy(() =>
      decodeListCursor(search, inputFor('nieuwste', cursor), [z.string(), z.string(), z.string()] as const),
    );

    expect(error).toBeInstanceOf(AssertionError);
    expect(error).not.toBeInstanceOf(AppError);
  });

  test('de assert gaat vóór het decoderen: ook een ongeldige cursor geeft dan een AssertionError', () => {
    const error = thrownBy(() => decodeListCursor(search, inputFor('nieuwste', '***'), [z.string()] as const));

    expect(error).toBeInstanceOf(AssertionError);
    expect(error).not.toBeInstanceOf(AppError);
  });

  test('een sleutelschema dat een gewone Error gooit, geeft diezelfde Error terug en geen VALIDATION', () => {
    const bug = new Error('bug in het sleutelschema');
    const broken = z.string().transform((): string => {
      throw bug;
    });
    const cursor = search.encodeCursor('nieuwste', [TIME, ID]);
    const error = thrownBy(() => decodeListCursor(search, inputFor('nieuwste', cursor), [broken, z.string()] as const));

    expect(error).toBe(bug);
    expect(error).not.toBeInstanceOf(AppError);
  });
});
