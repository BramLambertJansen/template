import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { type AbsenceExamples, expectAbsent } from '../support/absence';

// Statische toets van drie AC's die tot #824 in de baseline stonden (leerpunt #828): kooi/AC-6 (bestaande fragmenten via
// de kooi) en tests-naar-vermogen/AC-3 en AC-4 (de voorwaarde `kooi` in het testbestand zelf). Gelezen als tekst, zoals
// test/rails/kooi-gate-fast.test.ts. Patronen staan in strings, zodat de testteller ze niet als skip telt.
const ROOT = path.resolve(import.meta.dirname, '../..');
const DIT_BESTAND = 'test/rails/kooi-voorwaarde.test.ts';

function lees(bestand: string): string {
  return readFileSync(path.join(ROOT, bestand), 'utf8');
}

function testbestanden(): string[] {
  const uit = execFileSync('git', ['ls-files', '-z', '--', '*.test.ts', '*.test.tsx'], { cwd: ROOT, encoding: 'utf8' });
  return uit.split('\0').filter((bestand) => bestand !== '' && bestand !== DIT_BESTAND);
}

// Vorm a en c: `<ontvanger>.skip(vermogen('kooi').ontbreekt, vermogen('kooi').melding)`; vorm b: `.skipIf(vermogen('kooi').ontbreekt)`.
const VORM_SKIP = String.raw`\b\w+\??\.skip\(vermogen\('kooi'\)\.ontbreekt, vermogen\('kooi'\)\.melding\)`;
const VORM_SKIPIF = String.raw`\.skipIf\(vermogen\('kooi'\)\.ontbreekt\)`;
const VOORWAARDE = new RegExp(`${VORM_SKIP}|${VORM_SKIPIF}`);
const VOORWAARDE_VOORBEELDEN: AbsenceExamples = {
  recognizes: [
    "ctx.skip(vermogen('kooi').ontbreekt, vermogen('kooi').melding);",
    "test.skipIf(vermogen('kooi').ontbreekt).each(['a'])(",
  ],
  allows: ["ctx.skip(!kooiWerkt, 'geen kooi');", "env: { PATH: '/nergens', TMPDIR: tmpdir() }"],
};

// Per aanroep van inKooi: de voorwaarde staat in de test zelf (ook op de regel `test.skipIf(…)`), of in een beforeEach van
// het describe-blok vóór die test. Staat de aanroep in een functie op het hoogste niveau, dan geldt dat voor elke aanroep
// van die functie. De kop van een describe loopt tot zijn eerste test, zodat een skip in een buurtest niet meetelt.
// Een tekstbenadering met bekende grenzen: blokgrenzen leest hij niet (een eerder, al gesloten describe telt mee), een
// arrow-functie op het hoogste niveau, een keten van hulpfuncties of een functie als waarde herkent hij niet als helper,
// en een skip in commentaar telt mee. Geen van die vormen staat nu in de tests; komt er een, dan hoort er een fixture bij.
const TEST_START = /^[ \t]*(?:test|it)[.(]/gm;
const DESCRIBE_START = /^[ \t]*describe[.(]/gm;
const FUNCTIE_START = /^(?:export )?(?:async )?function (\w+)\(/gm;

function laatsteVoor(tekst: string, patroon: RegExp, positie: number): RegExpExecArray | undefined {
  let laatste: RegExpExecArray | undefined;
  for (const match of tekst.matchAll(patroon)) {
    if (match.index >= positie) break;
    laatste = match;
  }
  return laatste;
}

function gedektInTest(tekst: string, positie: number): boolean {
  const start = laatsteVoor(tekst, TEST_START, positie);
  if (start === undefined) return false;
  if (VOORWAARDE.test(tekst.slice(start.index, positie))) return true;
  const blok = laatsteVoor(tekst, DESCRIBE_START, start.index);
  if (blok === undefined) return false;
  const eersteTest = [...tekst.matchAll(TEST_START)].find((match) => match.index > blok.index);
  const kop = tekst.slice(blok.index, eersteTest?.index ?? start.index);
  return kop.includes('beforeEach(') && VOORWAARDE.test(kop);
}

function gedekt(tekst: string, positie: number): boolean {
  const test = laatsteVoor(tekst, TEST_START, positie);
  const functie = laatsteVoor(tekst, FUNCTIE_START, positie);
  if (functie === undefined || (test !== undefined && test.index > functie.index)) return gedektInTest(tekst, positie);
  const naam = functie[1] ?? '';
  const aanroepen = [...tekst.matchAll(new RegExp(String.raw`\b${naam}\(`, 'g'))]
    .map((match) => match.index)
    .filter((index) => index > functie.index + functie[0].length || index < functie.index);
  return aanroepen.length > 0 && aanroepen.every((index) => gedektInTest(tekst, index));
}

/** De regelnummers van elke aanroep van inKooi zonder voorwaarde. */
function ongedekt(tekst: string): number[] {
  return [...tekst.matchAll(/\binKooi\(/g)]
    .filter((match) => !gedekt(tekst, match.index))
    .map((match) => tekst.slice(0, match.index).split('\n').length);
}

describe('tests-naar-vermogen/AC-3: de voorwaarde staat in het testbestand zelf', () => {
  test('tests-naar-vermogen/AC-3: het patroon herkent de drie vormen en niets anders', () => {
    const goed = [
      "ctx.skip(vermogen('kooi').ontbreekt, vermogen('kooi').melding);",
      "test.skipIf(vermogen('kooi').ontbreekt).each(['a'])(",
      "TestRunner.getCurrentTest()?.context.skip(vermogen('kooi').ontbreekt, vermogen('kooi').melding);",
    ];
    const fout = ["ctx.skip(!kooiWerkt, 'geen kooi');", "test.skipIf(!bwrap).each(['a'])(", 'ctx.skip(true);'];
    for (const regel of goed) expect(regel, regel).toMatch(VOORWAARDE);
    expect(fout.filter((regel) => VOORWAARDE.test(regel))).toEqual([]);
  });

  test('tests-naar-vermogen/AC-3: de toets per aanroep vindt een kooitest zonder voorwaarde (R-PRINC-04)', () => {
    const skip = "ctx.skip(vermogen('kooi').ontbreekt, vermogen('kooi').melding);";
    const goed = [
      `test('a', (ctx) => {\n  ${skip}\n  inKooi('x', o);\n});`,
      `describe('d', () => {\n  beforeEach((ctx) => {\n    ${skip}\n  });\n  test('a', () => {\n    inKooi('x', o);\n  });\n});`,
      `function draai() {\n  return inKooi('x', o);\n}\ntest('a', (ctx) => {\n  ${skip}\n  draai();\n});`,
      `test.skipIf(vermogen('kooi').ontbreekt).each([1])('a', () => {\n  inKooi('x', o);\n});`,
    ];
    const fout = [
      `test('a', () => {\n  inKooi('x', o);\n});`,
      `test('a', (ctx) => {\n  ${skip}\n});\ntest('b', () => {\n  inKooi('x', o);\n});`,
      `function draai() {\n  return inKooi('x', o);\n}\ntest('a', (ctx) => {\n  ${skip}\n  draai();\n});\ntest('b', () => {\n  draai();\n});`,
      `function draai() {\n  return inKooi('x', o);\n}`,
      `describe('d', () => {\n  beforeEach(() => {\n    reset();\n  });\n  test('a', (ctx) => {\n    ${skip}\n  });\n  test('b', () => {\n    inKooi('x', o);\n  });\n});`,
    ];
    expect(goed.map(ongedekt)).toEqual(goed.map(() => []));
    expect(fout.filter((tekst) => ongedekt(tekst).length === 0)).toEqual([]);
  });

  test('tests-naar-vermogen/AC-3: elke aanroep van inKooi in een testbestand heeft de voorwaarde in zijn test', () => {
    const aanroepen = testbestanden().reduce(
      (som, bestand) => som + [...lees(bestand).matchAll(/\binKooi\(/g)].length,
      0,
    );
    expect(aanroepen, 'aanroepen van inKooi in testbestanden').toBeGreaterThanOrEqual(5);
    const zonder = testbestanden().flatMap((bestand) =>
      ongedekt(lees(bestand)).map((regel) => `${bestand}:${String(regel)}`),
    );
    expect(zonder).toEqual([]);
  });

  test('tests-naar-vermogen/AC-3: een skip die de kooi noemt, haalt zijn waarden alleen uit vermogen(kooi)', () => {
    const skipRegel = /\.(skip|skipIf|runIf)\(/;
    const afwijkend = testbestanden().flatMap((bestand) =>
      lees(bestand)
        .split('\n')
        .filter((regel) => skipRegel.test(regel) && /kooi/i.test(regel) && !VOORWAARDE.test(regel))
        .map((regel) => `${bestand}: ${regel.trim()}`),
    );
    expect(afwijkend).toEqual([]);
  });

  test('tests-naar-vermogen/AC-3: geen skip in een gedeelde helper onder test/setup/', () => {
    const helpers = execFileSync('git', ['ls-files', '-z', '--', 'test/setup'], { cwd: ROOT, encoding: 'utf8' })
      .split('\0')
      .filter((bestand) => /\.(ts|mjs)$/.test(bestand) && !/\.test\.ts$/.test(bestand));
    expect(helpers).toContain('test/setup/vermogen.ts');
    for (const bestand of helpers) {
      expectAbsent(lees(bestand), new RegExp(String.raw`\.(skip|skipIf|runIf|todo)\(`), {
        recognizes: [
          "ctx.skip(vermogen('kooi').ontbreekt, 'x')",
          'test.skipIf(ontbreekt)',
          'TestRunner.getCurrentTest()?.context.skip(true)',
          'describe.runIf(kooi)',
        ],
        allows: ['de overgeslagen tests', 'skipIf (vorm b)', 'const skips = 0;'],
      });
    }
  });
});

describe('tests-naar-vermogen/AC-4: de voorwaarde in de kooibestanden en TMPDIR in de twee uitzonderingen', () => {
  // De andere vijf bestanden uit de AC zijn verwijderd met de effectcheck (ADR 0091) en staan in de spec als vervallen.
  const MET_VOORWAARDE = [
    'test/hooks/rolhek-gh-allowlist.test.ts',
    'test/docs/start-nieuwe-app.test.ts',
    'test/rails/ci-scan.test.ts',
    'test/scripts/runner-trusted-base.test.ts',
    'test/scripts/kooi.test.ts',
  ];

  test.each(MET_VOORWAARDE)('tests-naar-vermogen/AC-4: %s zet de voorwaarde kooi', (bestand) => {
    expect(lees(bestand)).toMatch(VOORWAARDE);
  });

  test('tests-naar-vermogen/AC-4: cloud-setup geeft het kindproces TMPDIR mee, zonder voorwaarde', () => {
    const tekst = lees('test/scripts/cloud-setup.test.ts');
    expect(tekst).toContain('TMPDIR: tmpdir()');
    expectAbsent(tekst, VOORWAARDE, VOORWAARDE_VOORBEELDEN);
  });

  test('tests-naar-vermogen/AC-4: de kooitest "zonder bubblewrap" geeft TMPDIR mee, zonder voorwaarde', () => {
    const tekst = lees('test/scripts/kooi.test.ts');
    const begin = tekst.indexOf("test('zonder bubblewrap");
    expect(begin).toBeGreaterThan(-1);
    const blok = tekst.slice(begin, tekst.indexOf('\n  });', begin));
    expect(blok).toContain('TMPDIR: tmpdir()');
    expectAbsent(blok, VOORWAARDE, VOORWAARDE_VOORBEELDEN);
  });
});

describe('kooi/AC-6: bestaande fragmenten draaien via inKooi, zonder shell', () => {
  // Een shell met een optie met `c` (`-c`, `-ec`, `-eu -c`), zoals de lintregel van kooi/AC-5; een script als bestand
  // (`spawnSync('bash', ['scripts/runner.sh'])`) is geen fragment.
  const SHELL_AANROEP = new RegExp(
    String.raw`\b(spawn|spawnSync|execFile|execFileSync)\(\s*['"\x60](/bin/|/usr/bin/)?(ba|da|z)?sh['"\x60],\s*\[[^\]]*['"\x60]-[a-z]*c[a-z]*['"\x60]`,
  );
  const SHELL_VOORBEELDEN: AbsenceExamples = {
    recognizes: [
      "spawnSync('sh', ['-c', x])",
      'execFileSync("bash", ["-eu", "-c", x])',
      "spawn('/bin/sh', ['-ec', x])",
    ],
    allows: [
      "spawnSync('git', ['init'])",
      'inKooi(snippet, { werkmap })',
      "spawnSync(process.execPath, ['x'])",
      "spawnSync('bash', ['scripts/runner.sh', 'ui'])",
    ],
  };

  test('kooi/AC-6: het sh -c-fragment uit compose.yaml in runner-trusted-base draait via inKooi', () => {
    const tekst = lees('test/scripts/runner-trusted-base.test.ts');
    expect(tekst).toMatch(/const snippet = COMPOSE\.slice\(/);
    expect(tekst).toContain('inKooi(snippet');
    expectAbsent(tekst, SHELL_AANROEP, SHELL_VOORBEELDEN);
  });

  test('kooi/AC-6: het bash -eu -c-fragment uit ci.yml in ci-scan draait via inKooi', () => {
    const tekst = lees('test/rails/ci-scan.test.ts');
    expect(tekst).toContain('inKooi(`set -eu\\n${runBlock()}`');
    expectAbsent(tekst, SHELL_AANROEP, SHELL_VOORBEELDEN);
  });

  test('kooi/AC-6: statusregel zoekt git op PATH zonder shell', () => {
    const tekst = lees('test/hooks/statusregel.test.ts');
    expect(tekst).toContain("opPad('git')");
    expectAbsent(tekst, SHELL_AANROEP, SHELL_VOORBEELDEN);
    expectAbsent(tekst, /\bshell:(?!\s*false\b)/, {
      recognizes: ['shell: true', "shell: '/bin/bash'"],
      allows: ['shell: false'],
    });
  });
});
