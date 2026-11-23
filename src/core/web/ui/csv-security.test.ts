import { expect, test } from 'vitest';
import { toCsv, type CsvColumn } from './csv.ts';

const BOM = '﻿';
const single: readonly CsvColumn<string>[] = [{ header: 'Waarde', value: (row) => row }];

function cellOf(value: string): string {
  return toCsv([value], single).slice(`${BOM}Waarde\r\n`.length);
}

function headerOf(header: string): string {
  return toCsv([], [{ header, value: () => '' }]).slice(BOM.length);
}

// AC-3: elk van de zes aanvalstekens als eerste teken, gecombineerd met quoteplichtige tekens.
test.each([
  ['=a"b', `"'=a""b"`],
  ['=a\nb', `"'=a\nb"`],
  ['=a\r\nb', `"'=a\r\nb"`],
  ['+a;b', `"'+a;b"`],
  ['+a"b', `"'+a""b"`],
  ['-a;b', `"'-a;b"`],
  ['-a\nb', `"'-a\nb"`],
  ['@a;b', `"'@a;b"`],
  ['@a"b"', `"'@a""b"""`],
  ['\ta;b', `"'\ta;b"`],
  ['\ta\nb', `"'\ta\nb"`],
  ['\r\nx', `"'\r\nx"`],
])('csv-export/AC-3: aanvalsteken eerst met quote-teken in cel %j wordt %j', (value, expected) => {
  expect(cellOf(value)).toBe(expected);
});

test.each([
  ['=', "'="],
  ['+', "'+"],
  ['-', "'-"],
  ['@', "'@"],
  ['\t', "'\t"],
  ['==1', "'==1"],
  ['--1', "'--1"],
  ['=-@+', "'=-@+"],
  ['-1,5', "'-1,5"],
  ["+=cmd|' /C calc'!A0", "'+=cmd|' /C calc'!A0"],
  ['=HYPERLINK("http://x";"y")', `"'=HYPERLINK(""http://x"";""y"")"`],
])('csv-export/AC-3: enkel aanvalsteken of dubbel teken %j wordt %j (precies een apostrof)', (value, expected) => {
  expect(cellOf(value)).toBe(expected);
});

// AC-3: alleen het eerste teken telt.
test.each([
  ['a\n=1', '"a\n=1"'],
  ['a\r\n=1', '"a\r\n=1"'],
  ['a;=1', '"a;=1"'],
  ['a;+1', '"a;+1"'],
  ['a\t=1', 'a\t=1'],
  ['x-1', 'x-1'],
  ['x@y.nl', 'x@y.nl'],
  ['1+1', '1+1'],
  ['"=1', '"""=1"'],
  ["'=1", "'=1"],
  ["'-5", "'-5"],
  ['\n=1', '"\n=1"'],
  ['\n-1', '"\n-1"'],
])('csv-export/AC-3: alleen het eerste teken telt, cel %j wordt %j', (value, expected) => {
  expect(cellOf(value)).toBe(expected);
});

// AC-3: de spec noemt alleen zes tekens; andere (witruimte- en unicode-)varianten blijven ongewijzigd.
test.each([
  ['  =1', '  =1'],
  [' =1', ' =1'],
  ['​=1', '​=1'],
  ['﻿=1', '﻿=1'],
  ['\u000b=1', '\u000b=1'],
  ['\u000c=1', '\u000c=1'],
  ['＝1', '＝1'],
  ['＋1', '＋1'],
  ['−1', '−1'],
  ['–1', '–1'],
  ['＠x', '＠x'],
])('csv-export/AC-3: niet-genoemd eerste teken %j blijft ongewijzigd (%j)', (value, expected) => {
  expect(cellOf(value)).toBe(expected);
});

// AC-3: koppen volgen dezelfde regels als cellen.
test.each([
  ['=Kop', "'=Kop"],
  ['+Kop', "'+Kop"],
  ['-Kop', "'-Kop"],
  ['@Kop', "'@Kop"],
  ['\tKop', "'\tKop"],
  ['=a;b', `"'=a;b"`],
  ['@a"b', `"'@a""b"`],
  ['+a\nb', `"'+a\nb"`],
  ['Zeg "hoi"', '"Zeg ""hoi"""'],
  ['a;b', '"a;b"'],
  ['a=1', 'a=1'],
  [' =Kop', ' =Kop'],
])('csv-export/AC-3: kop %j wordt %j', (header, expected) => {
  expect(headerOf(header)).toBe(expected);
});

test('csv-export/AC-3: kop en cellen in meerdere kolommen en rijen worden elk afzonderlijk geneutraliseerd', () => {
  type Row = readonly [string, string, string];
  const columns: readonly CsvColumn<Row>[] = [
    { header: '=A', value: (row) => row[0] },
    { header: 'B', value: (row) => row[1] },
    { header: '@C', value: (row) => row[2] },
  ];
  const rows: readonly Row[] = [
    ['=1', 'ok', '-2'],
    ['', '', ''],
    ['a', '+b;c', '\t'],
  ];
  expect(toCsv(rows, columns)).toBe(`${BOM}'=A;B;'@C\r\n'=1;ok;'-2\r\n;;\r\na;"'+b;c";'\t`);
});

test('csv-export/AC-3: lege waarden blijven leeg, ook meerdere naast elkaar en zonder quotes', () => {
  expect(cellOf('')).toBe('');
  const two: readonly CsvColumn<string>[] = [
    { header: 'A', value: () => '' },
    { header: 'B', value: () => '' },
  ];
  expect(toCsv(['x'], two)).toBe(`${BOM}A;B\r\n;`);
});

test('csv-export/AC-3: neutralisatie verandert de invoerrijen niet en is deterministisch', () => {
  const rows = ['=1', '+2'];
  const copy = [...rows];
  const first = toCsv(rows, single);
  expect(toCsv(rows, single)).toBe(first);
  expect(rows).toStrictEqual(copy);
});

test('csv-export/AC-3: zeer lange gevaarlijke waarde krijgt precies een apostrof en blijft verder volledig', () => {
  const long = '='.concat('a'.repeat(200_000));
  const cell = cellOf(long);
  expect(cell).toBe(`'${long}`);
  expect(cell.length).toBe(long.length + 1);
});

test('csv-export/AC-2: zeer lange waarde met quotes en puntkomma wordt volledig en correct gequote', () => {
  const long = 'a;"'.repeat(50_000);
  const cell = cellOf(long);
  expect(cell).toBe(`"${'a;""'.repeat(50_000)}"`);
  const neutral = cellOf(`=${long}`);
  expect(neutral).toBe(`"'=${'a;""'.repeat(50_000)}"`);
});

test('csv-export/AC-2: een waarde van alleen een quote of alleen regeleinden wordt gequote', () => {
  expect(cellOf('"')).toBe('""""');
  expect(cellOf('\n')).toBe('"\n"');
  expect(cellOf('\r\n')).toBe(`"'\r\n"`); // CR is eerste teken: AC-3 gaat voor
  expect(cellOf(';')).toBe('";"');
});

test('csv-export/AC-4: een kop die na trimmen leeg is gooit, ook bij alleen tab, regeleinde of spaties', () => {
  for (const header of ['', ' ', '\t', '\n', '\r\n', ' \t ']) {
    expect(() => toCsv([], [{ header, value: () => '' }])).toThrow();
  }
  expect(() =>
    toCsv(
      ['x'],
      [
        { header: 'Ok', value: () => 'x' },
        { header: ' ', value: () => 'y' },
      ],
    ),
  ).toThrow();
});

test('csv-export/AC-4: een gevaarlijke kop zonder rijen geeft BOM en geneutraliseerde koprij', () => {
  expect(toCsv([], [{ header: '=1', value: () => '' }])).toBe(`${BOM}'=1`);
});

test('csv-export/AC-5: unicode in een gevaarlijke cel blijft ongewijzigd achter de apostrof', () => {
  const csv = toCsv(['=é€😀'], single);
  expect(csv).toBe(`${BOM}Waarde\r\n'=é€😀`);
  const bytes = new TextEncoder().encode(csv);
  expect([...bytes.slice(0, 3)]).toStrictEqual([0xef, 0xbb, 0xbf]);
});
