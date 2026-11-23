import { expect, test } from 'vitest';
import { toCsv, type CsvColumn } from './csv.ts';

interface Person {
  readonly name: string;
  readonly roleLabel: string;
}

const BOM = '﻿';
const columns: readonly CsvColumn<Person>[] = [
  { header: 'Naam', value: (row) => row.name },
  { header: 'Rol', value: (row) => row.roleLabel },
];
const single: readonly CsvColumn<string>[] = [{ header: 'Waarde', value: (row) => row }];

function cellOf(value: string): string {
  return toCsv([value], single).slice(`${BOM}Waarde\r\n`.length);
}

test('csv-export/AC-1: BOM, koppen in volgorde, puntkomma, CRLF en geen afsluitende CRLF', () => {
  const rows: readonly Person[] = [
    { name: 'Anna de Vries', roleLabel: 'Gebruiker' },
    { name: 'Bert Jansen', roleLabel: 'Beheerder' },
  ];
  expect(toCsv(rows, columns)).toBe(`${BOM}Naam;Rol\r\nAnna de Vries;Gebruiker\r\nBert Jansen;Beheerder`);
});

test.each([
  ['a;b', '"a;b"'],
  ['Zeg "hoi"', '"Zeg ""hoi"""'],
  ['regel1\nregel2', '"regel1\nregel2"'],
  ['a\r\nb', '"a\r\nb"'],
  ['Anna de Vries', 'Anna de Vries'],
])('csv-export/AC-2: cel %j wordt %j', (value, expected) => {
  expect(cellOf(value)).toBe(expected);
});

test.each([
  ['=SOM(A1)', "'=SOM(A1)"],
  ['+31 6', "'+31 6"],
  ['-5', "'-5"],
  ['@x', "'@x"],
  ['\tx', "'\tx"],
  ['\rx', `"'\rx"`],
  ['=a;b', `"'=a;b"`],
  [' =1', ' =1'],
  ['a=1', 'a=1'],
  ["'x", "'x"],
  ['', ''],
])('csv-export/AC-3: cel %j wordt %j', (value, expected) => {
  expect(cellOf(value)).toBe(expected);
});

test('csv-export/AC-3: koppen volgen dezelfde regels als cellen', () => {
  const header: readonly CsvColumn<string>[] = [
    { header: '=Kop', value: (row) => row },
    { header: 'a;b', value: (row) => row },
  ];
  expect(toCsv([], header)).toBe(`${BOM}'=Kop;"a;b"`);
});

test('csv-export/AC-4: nul rijen geeft alleen BOM en koprij', () => {
  expect(toCsv([], columns)).toBe(`${BOM}Naam;Rol`);
});

test('csv-export/AC-4: nul kolommen of een lege kop gooit; dubbele koppen mogen', () => {
  expect(() => toCsv([], [])).toThrow();
  expect(() => toCsv([], [{ header: '  ', value: () => '' }])).toThrow();
  const twice: readonly CsvColumn<string>[] = [
    { header: 'Naam', value: (row) => row },
    { header: 'Naam', value: (row) => row },
  ];
  expect(toCsv(['x'], twice)).toBe(`${BOM}Naam;Naam\r\nx;x`);
});

test('csv-export/AC-5: UTF-8 begint met EF BB BF en bevat é, ë, € en emoji ongewijzigd', () => {
  const text = 'é ë € 😀';
  const csv = toCsv([text], single);
  const bytes = new TextEncoder().encode(csv);
  expect([...bytes.slice(0, 3)]).toStrictEqual([0xef, 0xbb, 0xbf]);
  expect(new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes)).toBe(csv);
  expect(csv).toBe(`${BOM}Waarde\r\n${text}`);
});
