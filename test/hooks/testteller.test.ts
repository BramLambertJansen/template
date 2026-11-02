// Leerpunt #424: testgevallen en skips tellen via de AST, niet via regexen over de bron (R-CODE-01).
import { describe, expect, test } from 'vitest';
import { testChangeRisk } from '../../rails/hooks/lib/functional-ui.mjs';

const FILE = 'src/core/web/ui/knop.test.ts';
const lines = (...regels: string[]) => `${regels.join('\n')}\n`;

const LOS_A = "test('a', () => { expect(1).toBe(1); });";
const LOS_B = "test('b', () => { expect(2).toBe(2); });";

describe('testteller: test.each-tabellen', () => {
  test('testteller: tabelrij met commentaar met ) erbij is geen verwijdering (#423)', () => {
    const before = lines(
      'test.each([',
      "  ['onderhoud', true],",
      "])('rol %s', (rol, verwacht) => { expect(rol.length > 0).toBe(verwacht); });",
    );
    const after = lines(
      'test.each([',
      "  ['onderhoud', true],",
      '  // vrijgegeven voor (ADR 0064 punt 2).',
      "  ['werkstraat', true],",
      "])('rol %s', (rol, verwacht) => { expect(rol.length > 0).toBe(verwacht); });",
    );
    expect(testChangeRisk(before, after, FILE)).toBeNull();
  });

  test('testteller: tabelrij met ) in een string erbij is geen verwijdering', () => {
    const before = lines("test.each([['a', 1]])('waarde %s', (s, n) => { expect(s).toBeTruthy(); });");
    const after = lines("test.each([['a', 1], ['b)', 2]])('waarde %s', (s, n) => { expect(s).toBeTruthy(); });");
    expect(testChangeRisk(before, after, FILE)).toBeNull();
  });

  test('testteller: ) in een tabelstring verbergt geen verwijderd los geval', () => {
    const tabel = "test.each([['a)', 1]])('waarde %s', (s, n) => { expect(s).toBeTruthy(); });";
    expect(testChangeRisk(lines(tabel, LOS_A, LOS_B), lines(tabel, LOS_A), FILE)).toBe('removed');
  });

  test('testteller: ) uit de tabel halen compenseert geen verwijderd los geval (fout negatief)', () => {
    const before = lines("test.each([['a)', 1]])('waarde %s', (s, n) => { expect(s).toBeTruthy(); });", LOS_A);
    const after = lines("test.each([['a', 1]])('waarde %s', (s, n) => { expect(s).toBeTruthy(); });");
    expect(testChangeRisk(before, after, FILE)).toBe('removed');
  });

  test('testteller: tagged template test.each telt als geval', () => {
    const tabel = lines(
      'test.each`',
      '  a    | b',
      '  ${1} | ${2}',
      "`('som $a + $b', ({ a, b }) => { expect(a + b).toBe(3); });",
    );
    expect(testChangeRisk(tabel + LOS_B, lines(LOS_B), FILE)).toBe('removed');
  });

  test('testteller: test.for en test.each met tabel tellen elk als één geval', () => {
    const forGeval = "test.for([[1, 2]])('som %i', ([a, b]) => { expect(a + b).toBe(3); });";
    expect(testChangeRisk(lines(forGeval, LOS_B), lines(LOS_B), FILE)).toBe('removed');
    const extraRij = lines("test.for([[1, 2], [2, 1]])('som %i', ([a, b]) => { expect(a + b).toBe(3); });", LOS_B);
    expect(testChangeRisk(lines(forGeval, LOS_B), extraRij, FILE)).toBeNull();
  });
});

describe('testteller: commentaar en strings tellen niet', () => {
  test('testteller: geval vervangen door commentaar is een verwijdering', () => {
    expect(testChangeRisk(lines(LOS_A, LOS_B), lines("// test('a', …) verplaatst", LOS_B), FILE)).toBe('removed');
  });

  test('testteller: geval vervangen door blokcommentaar is een verwijdering', () => {
    expect(testChangeRisk(lines(LOS_A, LOS_B), lines(`/* ${LOS_A} */`, LOS_B), FILE)).toBe('removed');
  });

  test('testteller: geval vervangen door een string is een verwijdering', () => {
    const after = lines(`const notitie = "test('a', () => {})";`, 'void notitie;', LOS_B);
    expect(testChangeRisk(lines(LOS_A, LOS_B), after, FILE)).toBe('removed');
  });

  test('testteller: geval vervangen door een template-literal is een verwijdering', () => {
    const after = lines("const notitie = `it('a', () => {}) ${1}`;", 'void notitie;', LOS_B);
    expect(testChangeRisk(lines(LOS_A, LOS_B), after, FILE)).toBe('removed');
  });

  test('testteller: .skip( in commentaar erbij is geen skip', () => {
    expect(testChangeRisk(lines(LOS_A), lines('// gebruik hier nooit test.skip( of xit(', LOS_A), FILE)).toBeNull();
  });

  test('testteller: .skip( en skip( in een string erbij is geen skip', () => {
    const after = lines("const uitleg = 'zet nooit .skip( of skip( neer';", 'void uitleg;', LOS_A);
    expect(testChangeRisk(lines(LOS_A), after, FILE)).toBeNull();
  });

  test.each(['x.test.tsx', 'x.test.mts', 'x.test.cts', 'x.test.js', 'x.test.jsx', 'x.test.mjs', 'x.test.cjs'])(
    'testteller: commentaar telt niet als geval in %s',
    (bestand) => {
      expect(testChangeRisk(lines(LOS_A, LOS_B), lines(`// ${LOS_A}`, LOS_B), `test/${bestand}`)).toBe('removed');
    },
  );
});

describe('testteller: skips', () => {
  test('testteller: test( naar test.skip( is een skip', () => {
    expect(testChangeRisk(lines(LOS_A), lines(LOS_A.replace('test(', 'test.skip(')), FILE)).toBe('skip');
  });

  test('testteller: test.skip.each erbij is een skip', () => {
    const after = lines(LOS_A, "test.skip.each([[1]])('later %i', (n) => { expect(n).toBe(1); });");
    expect(testChangeRisk(lines(LOS_A), after, FILE)).toBe('skip');
  });

  test('testteller: describe.skip erbij is een skip', () => {
    const after = lines("describe.skip('groep', () => {", `  ${LOS_A}`, '});');
    expect(testChangeRisk(lines("describe('groep', () => {", `  ${LOS_A}`, '});'), after, FILE)).toBe('skip');
  });

  test('testteller: ctx.skip() erbij is een skip', () => {
    const after = lines("test('a', (ctx) => { ctx.skip(); expect(1).toBe(1); });");
    expect(testChangeRisk(lines("test('a', (ctx) => { expect(1).toBe(1); });"), after, FILE)).toBe('skip');
  });

  test('testteller: xit erbij is een skip', () => {
    expect(testChangeRisk(lines(LOS_A), lines(LOS_A, "xit('c', () => {});"), FILE)).toBe('skip');
  });

  test('testteller: skip gaat voor verwijdering', () => {
    expect(testChangeRisk(lines(LOS_A, LOS_B), lines(LOS_A.replace('test(', 'test.skip(')), FILE)).toBe('skip');
  });
});

describe('testteller: modifiers', () => {
  test.each(['test.only', 'test.concurrent', 'test.sequential', 'test.fails', 'it.only'])(
    'testteller: %s telt als geval',
    (aanroep) => {
      const geval = `${aanroep}('a', () => { expect(1).toBe(1); });`;
      expect(testChangeRisk(lines(geval, LOS_B), lines(LOS_B), FILE)).toBe('removed');
    },
  );

  test('testteller: test.skipIf en test.runIf tellen als geval', () => {
    const skipIf = "test.skipIf(process.platform === 'win32')('a', () => { expect(1).toBe(1); });";
    const runIf = "test.runIf(process.platform !== 'win32')('a', () => { expect(1).toBe(1); });";
    expect(testChangeRisk(lines(skipIf, LOS_B), lines(LOS_B), FILE)).toBe('removed');
    expect(testChangeRisk(lines(runIf, LOS_B), lines(LOS_B), FILE)).toBe('removed');
  });

  test('testteller: test.todo telt niet als geval', () => {
    expect(testChangeRisk(lines(LOS_A, "test.todo('later');"), lines(LOS_A, LOS_B), FILE)).toBeNull();
    expect(testChangeRisk(lines(LOS_A, LOS_B), lines(LOS_A, "test.todo('later');"), FILE)).toBe('skip');
  });
});

describe('testteller: parser en overige bestanden', () => {
  test('testteller: .tsx met JSX parseert en telt goed', () => {
    const file = 'src/core/web/ui/knop.test.tsx';
    const render = 'const vorm = <Knop label="test(a) en .skip(" onClick={() => undefined}>Opslaan</Knop>;';
    const before = lines(render, "test('a', () => { expect(vorm).toBeTruthy(); });", LOS_B);
    expect(testChangeRisk(before, lines(render, LOS_B), file)).toBe('removed');
    expect(testChangeRisk(lines(LOS_B), lines(render, LOS_B), file)).toBeNull();
  });

  test('testteller: pgTAP-bestand houdt het huidige gedrag (skip erbij is een skip)', () => {
    const before = lines('select plan(1);', "select ok(true, 'leesrecht');", 'select * from finish();');
    const after = lines(
      'select plan(2);',
      "select ok(true, 'leesrecht');",
      'select skip(1);',
      'select * from finish();',
    );
    expect(testChangeRisk(before, after, 'db/tests/x.sql')).toBe('skip');
  });

  test('testteller: gelijk aantal gevallen met gewijzigde inhoud is geen risico', () => {
    const after = lines(
      "test('a hernoemd', () => { expect(3).toBe(3); });",
      "it('b', () => { expect([2]).toEqual([2]); });",
    );
    expect(testChangeRisk(lines(LOS_A, LOS_B), after, FILE)).toBeNull();
  });
});
