import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { MAX_PAGE_SIZE } from './limits.ts';
import { defineListSearch } from './list-search.ts';
import { unsafeCast } from './unsafe-cast.ts';

// Spec suite-volgt-contract, ontwerp 1 (#656): defineListSearch krijgt een optionele `pageSize`. Met pageSize krijgt het API-schema
// het veld `limit` (1 t/m pageSize, standaard pageSize); zonder blijft het schema zoals het was (geen `limit`).
const PAGE_SIZE = 10;
const basis = {
  sorts: ['nieuwste', 'oudste'],
  filters: {},
  cursorKeys: { nieuwste: [48, 200], oudste: [48, 200] },
} as const;

const metPageSize = defineListSearch({ ...basis, pageSize: PAGE_SIZE });
const zonderPageSize = defineListSearch(basis);

// `ListSearch.pageSize` bestaat nog niet in het type: lezen via de sleutels, zodat dit bestand compileert en op een assertie faalt.
const pageSizeVan = (zoek: object): unknown => Object.entries(zoek).find(([naam]) => naam === 'pageSize')?.[1];

describe('suitecontract/AC-1: limit in het API-schema', () => {
  test.each([
    ['het getal 1', 1],
    ['de tekst "1" uit een querystring', '1'],
    ['een getal in het midden', 5],
    ['de tekst "5"', '5'],
    ['precies pageSize', PAGE_SIZE],
    ['pageSize als tekst', String(PAGE_SIZE)],
  ])('suitecontract/AC-1: limit als %s wordt geaccepteerd en als getal teruggegeven', (_, limit) => {
    const result = metPageSize.api.safeParse({ limit });

    expect(result.success).toBe(true);
    expect(result.data).toStrictEqual({ sort: 'nieuwste', limit: Number(limit) });
  });

  test('suitecontract/AC-1: zonder limit is het gelijk aan pageSize', () => {
    const result = metPageSize.api.safeParse({});

    expect(result.success).toBe(true);
    expect(result.data).toStrictEqual({ sort: 'nieuwste', limit: PAGE_SIZE });
  });

  test.each([
    ['0', 0],
    ['pageSize + 1', PAGE_SIZE + 1],
    ['pageSize + 1 als tekst', String(PAGE_SIZE + 1)],
    ['1.5', 1.5],
    ['de tekst "1.5"', '1.5'],
    ['de tekst "abc"', 'abc'],
    ['een negatief getal', -1],
  ])('suitecontract/AC-1: limit %s geeft een ZodError', (_, limit) => {
    expect(() => metPageSize.api.parse({ limit })).toThrow(z.ZodError);
  });

  test('suitecontract/AC-1: het API-schema heeft limit als veld en blijft strict voor andere onbekende velden', () => {
    expect(Object.hasOwn(metPageSize.api.shape, 'limit')).toBe(true);
    expect(metPageSize.api.safeParse({ limit: 1, onbekend: 'x' }).success).toBe(false);
  });

  test('suitecontract/AC-1: limit werkt samen met q, sort, cursor en filters', () => {
    const met = defineListSearch({ ...basis, filters: { rol: ['user', 'admin'] }, pageSize: PAGE_SIZE });

    expect(
      met.api.safeParse({ q: ' ada ', rol: 'admin', sort: 'oudste', cursor: 'abc', limit: '3' }).data,
    ).toStrictEqual({
      q: 'ada',
      rol: 'admin',
      sort: 'oudste',
      cursor: 'abc',
      limit: 3,
    });
  });

  test('suitecontract/AC-1: pageSize is de standaardwaarde, ook als pageSize 1 is (limit kan dan alleen 1 zijn)', () => {
    const een = defineListSearch({ ...basis, pageSize: 1 });

    expect(een.api.safeParse({}).data).toStrictEqual({ sort: 'nieuwste', limit: 1 });
    expect(een.api.safeParse({ limit: 2 }).success).toBe(false);
  });

  test('suitecontract/AC-1: pageSize mag precies MAX_PAGE_SIZE zijn', () => {
    const max = defineListSearch({ ...basis, pageSize: MAX_PAGE_SIZE });

    expect(max.api.safeParse({ limit: MAX_PAGE_SIZE }).success).toBe(true);
    expect(max.api.safeParse({ limit: MAX_PAGE_SIZE + 1 }).success).toBe(false);
  });
});

describe('suitecontract/AC-1: het webschema en ListSearch.pageSize', () => {
  test('suitecontract/AC-1: het webschema kent geen limit: het veld valt weg, het komt nooit in de URL', () => {
    const result = metPageSize.web.safeParse({ limit: 5, q: 'ada' });

    expect(result.success).toBe(true);
    expect(result.data).toStrictEqual({ q: 'ada' });
  });

  test('suitecontract/AC-1: het webschema zonder limit geeft hetzelfde resultaat als zonder pageSize', () => {
    expect(metPageSize.web.safeParse({ sort: 'oudste', q: 'ada' }).data).toStrictEqual(
      zonderPageSize.web.safeParse({ sort: 'oudste', q: 'ada' }).data,
    );
    expect(metPageSize.web.safeParse({}).data).toStrictEqual({});
  });

  test('suitecontract/AC-1: ListSearch.pageSize geeft de waarde uit de config terug', () => {
    expect(pageSizeVan(metPageSize)).toBe(PAGE_SIZE);
  });
});

describe('suitecontract/AC-1: zonder pageSize blijft alles zoals nu', () => {
  test('suitecontract/AC-1: limit is een onbekend veld (fout)', () => {
    expect(() => zonderPageSize.api.parse({ limit: 1 })).toThrow(z.ZodError);
    expect(zonderPageSize.api.safeParse({ limit: '1' }).success).toBe(false);
  });

  test('suitecontract/AC-1: het API-schema heeft geen limit en geen standaardwaarde ervoor', () => {
    expect(Object.hasOwn(zonderPageSize.api.shape, 'limit')).toBe(false);
    expect(zonderPageSize.api.safeParse({}).data).toStrictEqual({ sort: 'nieuwste' });
  });

  test('suitecontract/AC-1: ListSearch.pageSize is undefined', () => {
    expect(pageSizeVan(zonderPageSize)).toBeUndefined();
  });
});

describe('suitecontract/AC-2: ongeldige pageSize of een filter met de naam limit', () => {
  test.each([
    ['0', 0],
    ['een negatief getal', -1],
    ['een kommagetal', 1.5],
    ['MAX_PAGE_SIZE + 1', MAX_PAGE_SIZE + 1],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
  ])('suitecontract/AC-2: pageSize %s gooit bij het laden met een melding die pageSize noemt', (_, pageSize) => {
    expect(() => defineListSearch({ ...basis, pageSize })).toThrow(/defineListSearch: .*pageSize/);
  });

  test('suitecontract/AC-2: een pageSize die geen getal is (tekst) gooit met een melding die pageSize noemt', () => {
    const tekst = unsafeCast<number>('25', 'bewijst dat een tekst geen geldige pageSize is');

    expect(() => defineListSearch({ ...basis, pageSize: tekst })).toThrow(/defineListSearch: .*pageSize/);
  });

  test('suitecontract/AC-2: de melding bij een te grote pageSize noemt de grens MAX_PAGE_SIZE', () => {
    expect(() => defineListSearch({ ...basis, pageSize: MAX_PAGE_SIZE + 1 })).toThrow(/MAX_PAGE_SIZE/);
  });

  test('suitecontract/AC-2: een filter met de naam limit gooit, met pageSize', () => {
    expect(() => defineListSearch({ ...basis, filters: { limit: ['a', 'b'] }, pageSize: PAGE_SIZE })).toThrow(
      /defineListSearch: .*limit/,
    );
  });

  test('suitecontract/AC-2: een filter met de naam limit gooit ook zonder pageSize (gereserveerde naam)', () => {
    expect(() => defineListSearch({ ...basis, filters: { limit: ['a', 'b'] } })).toThrow(/defineListSearch: .*limit/);
  });

  test.each(['q', 'sort', 'cursor'])('suitecontract/AC-2: de bestaande gereserveerde naam %s blijft gooien', (naam) => {
    expect(() => defineListSearch({ ...basis, filters: { [naam]: ['a', 'b'] } })).toThrow(/defineListSearch/);
  });

  test('suitecontract/AC-2: geldige randen (1 en MAX_PAGE_SIZE) gooien niet', () => {
    expect(() => defineListSearch({ ...basis, pageSize: 1 })).not.toThrow();
    expect(() => defineListSearch({ ...basis, pageSize: MAX_PAGE_SIZE })).not.toThrow();
  });
});
