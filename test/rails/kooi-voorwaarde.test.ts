import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, test } from 'vitest';

// Statische toets van drie AC's die tot #824 in de baseline stonden (leerpunt #828): kooi/AC-6 (bestaande fragmenten via
// de kooi) en tests-naar-vermogen/AC-3 en AC-4 (de voorwaarde `kooi` in het testbestand zelf). Via de AST van TypeScript,
// niet met regex over de bron (R-CODE-01), zoals test/rails/contract-sjabloon-cursor-keys.test.ts.
const ROOT = path.resolve(import.meta.dirname, '../..');
const DIT_BESTAND = 'test/rails/kooi-voorwaarde.test.ts';
const ONTBREEKT = "vermogen('kooi').ontbreekt";
const MELDING = "vermogen('kooi').melding";

function bron(tekst: string, naam = 'fixture.test.ts'): ts.SourceFile {
  return ts.createSourceFile(naam, tekst, ts.ScriptTarget.Latest, true);
}

function lees(bestand: string): ts.SourceFile {
  return bron(readFileSync(path.join(ROOT, bestand), 'utf8'), bestand);
}

function testbestanden(): string[] {
  const uit = execFileSync('git', ['ls-files', '-z', '--', '*.test.ts', '*.test.tsx'], { cwd: ROOT, encoding: 'utf8' });
  return uit.split('\0').filter((bestand) => bestand !== '' && bestand !== DIT_BESTAND);
}

function knopen(wortelKnoop: ts.Node): ts.Node[] {
  const uit: ts.Node[] = [];
  const bezoek = (knoop: ts.Node): void => {
    uit.push(knoop);
    ts.forEachChild(knoop, bezoek);
  };
  bezoek(wortelKnoop);
  return uit;
}

function aanroepen(wortelKnoop: ts.Node): ts.CallExpression[] {
  return knopen(wortelKnoop).filter(ts.isCallExpression);
}

/** De naam links in een aanroepketen: `test` voor `test.skipIf(a).each(b)(c)`. */
function wortel(expressie: ts.Expression): string | undefined {
  let deel = expressie;
  while (ts.isPropertyAccessExpression(deel) || ts.isCallExpression(deel)) deel = deel.expression;
  return ts.isIdentifier(deel) ? deel.text : undefined;
}

/** De naam van de aangeroepen functie of methode: `skip` voor `ctx.skip(…)`, `inKooi` voor `inKooi(…)`. */
function aangeroepen(aanroep: ts.CallExpression): string | undefined {
  const callee = aanroep.expression;
  if (ts.isIdentifier(callee)) return callee.text;
  return ts.isPropertyAccessExpression(callee) ? callee.name.text : undefined;
}

// Vorm a en c: `<ontvanger>.skip(vermogen('kooi').ontbreekt, vermogen('kooi').melding)`; vorm b: `.skipIf(vermogen('kooi').ontbreekt)`.
function isVoorwaarde(knoop: ts.Node): boolean {
  if (!ts.isCallExpression(knoop) || !ts.isPropertyAccessExpression(knoop.expression)) return false;
  const argumenten = knoop.arguments.map((argument) => argument.getText().replace(/\s+/g, ''));
  if (knoop.expression.name.text === 'skip') {
    return argumenten.length === 2 && argumenten[0] === ONTBREEKT && argumenten[1] === MELDING;
  }
  return knoop.expression.name.text === 'skipIf' && argumenten.length === 1 && argumenten[0] === ONTBREEKT;
}

function heeftVoorwaarde(knoop: ts.Node, voor = Number.POSITIVE_INFINITY): boolean {
  return knopen(knoop).some((deel) => isVoorwaarde(deel) && deel.getStart() < voor);
}

type Functie = ts.ArrowFunction | ts.FunctionExpression | ts.FunctionDeclaration;

function isFunctie(knoop: ts.Node): knoop is Functie {
  return ts.isArrowFunction(knoop) || ts.isFunctionExpression(knoop) || ts.isFunctionDeclaration(knoop);
}

/** De aanroep waarvan deze functie de callback is, als die aanroep met `naam` begint (`test`, `it`, `describe`). */
function callbackVan(functie: Functie, namen: readonly string[]): ts.CallExpression | undefined {
  const ouder = functie.parent;
  if (!ts.isCallExpression(ouder) || !ouder.arguments.some((argument) => argument === functie)) return undefined;
  const naam = wortel(ouder.expression);
  return naam !== undefined && namen.includes(naam) ? ouder : undefined;
}

/** De naam van een hulpfunctie: `function draai()` of `const draai = () => …`. */
function helpernaam(functie: Functie): ts.Identifier | undefined {
  if (ts.isFunctionDeclaration(functie)) return functie.name;
  const ouder = functie.parent;
  return ts.isVariableDeclaration(ouder) && ts.isIdentifier(ouder.name) ? ouder.name : undefined;
}

/** Een beforeEach met de voorwaarde in een omsluitend describe-blok (ook een buitenste). */
function describeGedekt(testAanroep: ts.CallExpression): boolean {
  for (let knoop: ts.Node = testAanroep.parent; !ts.isSourceFile(knoop); knoop = knoop.parent) {
    if (!isFunctie(knoop) || callbackVan(knoop, ['describe']) === undefined || knoop.body === undefined) continue;
    const opdrachten = ts.isBlock(knoop.body) ? knoop.body.statements : [];
    const gedekt = opdrachten.some(
      (opdracht) =>
        ts.isExpressionStatement(opdracht) &&
        ts.isCallExpression(opdracht.expression) &&
        wortel(opdracht.expression.expression) === 'beforeEach' &&
        heeftVoorwaarde(opdracht.expression),
    );
    if (gedekt) return true;
  }
  return false;
}

// Per plek: de voorwaarde staat vóór de plek in een omsluitende functie (de test, of een hulpfunctie: vorm c), in de
// aanroepketen van de test (`test.skipIf(…)`: vorm b) of in een beforeEach van een omsluitend describe. Een plek in een
// hulpfunctie met een naam is gedekt als elke verwijzing naar die naam elders in het bestand gedekt is (ook `.map(draai)`).
// Grenzen: namen worden per bestand vergeleken, niet per scope; diepte van hulpfuncties hooguit drie; elk omsluitend
// describe telt (de spec noemt het kleinste); een skip in een geneste closure vóór de plek telt mee; een beforeEach op het
// hoogste niveau of `describe.skipIf(…)` telt niet (vals rood, de veilige kant).
function gedekt(plek: ts.Node, diepte = 0): boolean {
  for (let knoop: ts.Node = plek.parent; !ts.isSourceFile(knoop); knoop = knoop.parent) {
    if (!isFunctie(knoop)) continue;
    // Een describe-callback is geen test: wat daar draait (body, beforeAll) wordt nooit overgeslagen, en een skip in een
    // buurtest daarbinnen dekt het niet.
    if (callbackVan(knoop, ['describe']) !== undefined) return false;
    if (heeftVoorwaarde(knoop, plek.getStart())) return true;
    const testAanroep = callbackVan(knoop, ['test', 'it']);
    if (testAanroep !== undefined) return heeftVoorwaarde(testAanroep.expression) || describeGedekt(testAanroep);
    const naam = helpernaam(knoop);
    if (naam !== undefined) return diepte < 3 && verwijzingenGedekt(naam, diepte + 1);
  }
  return false;
}

function verwijzingenGedekt(naam: ts.Identifier, diepte: number): boolean {
  const verwijzingen = knopen(naam.getSourceFile()).filter(
    (knoop) => ts.isIdentifier(knoop) && knoop.text === naam.text && knoop !== naam,
  );
  return verwijzingen.length > 0 && verwijzingen.every((verwijzing) => gedekt(verwijzing, diepte));
}

/** De regelnummers van elke aanroep van inKooi zonder voorwaarde. */
function ongedekt(bestand: ts.SourceFile): number[] {
  return aanroepen(bestand)
    .filter((aanroep) => aangeroepen(aanroep) === 'inKooi')
    .filter((aanroep) => !gedekt(aanroep))
    .map((aanroep) => bestand.getLineAndCharacterOfPosition(aanroep.getStart()).line + 1);
}

const SKIP_NAMEN = ['skip', 'skipIf', 'runIf', 'todo'];

function skipAanroepen(bestand: ts.SourceFile): ts.CallExpression[] {
  return aanroepen(bestand).filter((aanroep) => SKIP_NAMEN.includes(aangeroepen(aanroep) ?? ''));
}

describe('tests-naar-vermogen/AC-3: de voorwaarde staat in het testbestand zelf', () => {
  const skip = `ctx.skip(${ONTBREEKT}, ${MELDING});`;

  test('tests-naar-vermogen/AC-3: de voorwaarde herkent de drie vormen en niets anders', () => {
    const goed = [
      skip,
      `test.skipIf(${ONTBREEKT}).each(['a'])('x', () => {});`,
      `TestRunner.getCurrentTest()?.context.skip(${ONTBREEKT}, ${MELDING});`,
    ];
    const fout = [
      "ctx.skip(!kooiWerkt, 'geen kooi');",
      "test.skipIf(!bwrap).each(['a'])('x', () => {});",
      'ctx.skip(true);',
    ];
    expect(goed.filter((tekst) => !heeftVoorwaarde(bron(tekst)))).toEqual([]);
    expect(fout.filter((tekst) => heeftVoorwaarde(bron(tekst)))).toEqual([]);
  });

  test('tests-naar-vermogen/AC-3: de toets per aanroep vindt een kooitest zonder voorwaarde (R-PRINC-04)', () => {
    const vormC = `TestRunner.getCurrentTest()?.context.skip(${ONTBREEKT}, ${MELDING});`;
    const goed = [
      `test('a', (ctx) => {\n  ${skip}\n  inKooi('x', o);\n});`,
      `describe('d', () => {\n  beforeEach((ctx) => {\n    ${skip}\n  });\n  test('a', () => {\n    inKooi('x', o);\n  });\n});`,
      `function draai() {\n  return inKooi('x', o);\n}\ntest('a', (ctx) => {\n  ${skip}\n  draai();\n});`,
      `test.skipIf(${ONTBREEKT}).each([1])('a', () => {\n  inKooi('x', o);\n});`,
      `function draai() {\n  ${vormC}\n  return inKooi('x', o);\n}\ntest('a', () => {\n  draai();\n});`,
      `test('a', (ctx) => {\n  ${skip}\n  const draai = () => inKooi('x', o);\n  draai();\n});`,
      `describe('d', () => {\n  beforeEach((ctx) => {\n    ${skip}\n  });\n  describe('e', () => {\n    test('a', () => {\n      inKooi('x', o);\n    });\n  });\n});`,
      `test('a', (ctx) => {\n  ${skip}\n  kit.inKooi('x', o);\n});`,
    ];
    const fout = [
      `test('a', () => {\n  inKooi('x', o);\n});`,
      `test('a', (ctx) => {\n  ${skip}\n});\ntest('b', () => {\n  inKooi('x', o);\n});`,
      `function draai() {\n  return inKooi('x', o);\n}\ntest('a', (ctx) => {\n  ${skip}\n  draai();\n});\ntest('b', () => {\n  draai();\n});`,
      `function draai() {\n  return inKooi('x', o);\n}`,
      `describe('d', () => {\n  beforeEach(() => {\n    reset();\n  });\n  test('a', (ctx) => {\n    ${skip}\n  });\n  test('b', () => {\n    inKooi('x', o);\n  });\n});`,
      `const draai = () => inKooi('x', o);\ntest('a', (ctx) => {\n  ${skip}\n});\ntest('b', () => {\n  [1].map(draai);\n});`,
      `test('a', (ctx) => {\n  inKooi('x', o);\n  ${skip}\n});`,
      `describe('d', () => {\n  test('a', (ctx) => {\n    ${skip}\n  });\n  beforeAll(() => {\n    inKooi('x', o);\n  });\n});`,
      `describe('d', () => {\n  test('a', (ctx) => {\n    ${skip}\n  });\n  const r = inKooi('x', o);\n});`,
      `test('a', () => {\n  kit.inKooi('x', o);\n});`,
    ];
    expect(goed.map((tekst) => ongedekt(bron(tekst)))).toEqual(goed.map(() => []));
    expect(fout.filter((tekst) => ongedekt(bron(tekst)).length === 0)).toEqual([]);
  });

  test('tests-naar-vermogen/AC-3: elke aanroep van inKooi in een testbestand heeft de voorwaarde', () => {
    const bestanden = testbestanden().map((bestand) => lees(bestand));
    const totaal = bestanden.flatMap((bestand) =>
      aanroepen(bestand).filter((aanroep) => aangeroepen(aanroep) === 'inKooi'),
    );
    expect(totaal.length, 'aanroepen van inKooi in testbestanden').toBeGreaterThanOrEqual(5);
    const zonder = bestanden.flatMap((bestand) =>
      ongedekt(bestand).map((regel) => `${bestand.fileName}:${String(regel)}`),
    );
    expect(zonder).toEqual([]);
  });

  test('tests-naar-vermogen/AC-3: een skip die de kooi noemt, haalt zijn waarden alleen uit vermogen(kooi)', () => {
    const afwijkend = testbestanden().flatMap((bestand) =>
      skipAanroepen(lees(bestand))
        .filter((aanroep) => aanroep.arguments.some((argument) => /kooi/i.test(argument.getText())))
        .filter((aanroep) => !isVoorwaarde(aanroep))
        .map((aanroep) => `${bestand}: ${aanroep.getText()}`),
    );
    expect(afwijkend).toEqual([]);
  });

  test('tests-naar-vermogen/AC-3: geen skip in een gedeelde helper onder test/setup/', () => {
    const herkend = [
      'ctx.skip(true);',
      "test.skipIf(a)('x', () => {});",
      'TestRunner.getCurrentTest()?.context.skip(true);',
      "describe.runIf(a)('x', () => {});",
    ];
    expect(herkend.filter((tekst) => skipAanroepen(bron(tekst)).length === 0)).toEqual([]);
    const helpers = execFileSync('git', ['ls-files', '-z', '--', 'test/setup'], { cwd: ROOT, encoding: 'utf8' })
      .split('\0')
      .filter((bestand) => /\.(ts|mjs)$/.test(bestand) && !/\.test\.ts$/.test(bestand));
    expect(helpers).toContain('test/setup/vermogen.ts');
    const gevonden = helpers.flatMap((bestand) =>
      skipAanroepen(lees(bestand)).map((aanroep) => `${bestand}: ${aanroep.getText()}`),
    );
    expect(gevonden).toEqual([]);
  });
});

function tmpdirEigenschappen(knoop: ts.Node): ts.PropertyAssignment[] {
  return knopen(knoop).filter(
    (deel): deel is ts.PropertyAssignment =>
      ts.isPropertyAssignment(deel) && deel.name.getText() === 'TMPDIR' && deel.initializer.getText() === 'tmpdir()',
  );
}

describe('tests-naar-vermogen/AC-4: de voorwaarde in de kooibestanden en TMPDIR in de twee uitzonderingen', () => {
  // De andere vijf bestanden uit de AC zijn verwijderd (ADR 0091, ADR 0089) en staan in de spec als vervallen.
  const MET_VOORWAARDE = [
    'test/hooks/rolhek-gh-allowlist.test.ts',
    'test/docs/start-nieuwe-app.test.ts',
    'test/rails/ci-scan.test.ts',
    'test/scripts/runner-trusted-base.test.ts',
    'test/scripts/kooi.test.ts',
  ];

  test.each(MET_VOORWAARDE)('tests-naar-vermogen/AC-4: %s zet de voorwaarde kooi', (bestand) => {
    expect(heeftVoorwaarde(lees(bestand))).toBe(true);
  });

  test('tests-naar-vermogen/AC-4: cloud-setup geeft het kindproces TMPDIR mee, zonder voorwaarde', () => {
    const bestand = lees('test/scripts/cloud-setup.test.ts');
    expect(tmpdirEigenschappen(bestand).length).toBeGreaterThan(0);
    expect(heeftVoorwaarde(bestand)).toBe(false);
  });

  test('tests-naar-vermogen/AC-4: de kooitest "zonder bubblewrap" geeft TMPDIR mee, zonder voorwaarde', () => {
    const testen = aanroepen(lees('test/scripts/kooi.test.ts')).filter((aanroep) => {
      const naam = aanroep.arguments[0];
      return (
        wortel(aanroep.expression) === 'test' &&
        naam !== undefined &&
        ts.isStringLiteral(naam) &&
        naam.text.startsWith('zonder bubblewrap')
      );
    });
    expect(testen).toHaveLength(1);
    const [kooitest] = testen;
    expect(kooitest === undefined ? 0 : tmpdirEigenschappen(kooitest).length).toBeGreaterThan(0);
    expect(kooitest === undefined ? true : heeftVoorwaarde(kooitest)).toBe(false);
  });
});

const SHELL = /^(\/bin\/|\/usr\/bin\/)?(ba|da|z)?sh$/;
const OPTIE_C = /^-[a-z]*c[a-z]*$/;
const SPAWN = ['spawn', 'spawnSync', 'execFile', 'execFileSync'];

/** Een shell met een optie met `c` als commando (`sh -c`, `bash -eu -c`), zoals de lintregel van kooi/AC-5, of `shell:` anders dan `false`. */
function shellAanroepen(bestand: ts.SourceFile): string[] {
  const viaArgumenten = aanroepen(bestand).filter((aanroep) => {
    const [commando, argumenten] = aanroep.arguments;
    if (!SPAWN.includes(aangeroepen(aanroep) ?? '') || commando === undefined || !ts.isStringLiteralLike(commando))
      return false;
    if (!SHELL.test(commando.text) || argumenten === undefined || !ts.isArrayLiteralExpression(argumenten))
      return false;
    return argumenten.elements.some((element) => ts.isStringLiteralLike(element) && OPTIE_C.test(element.text));
  });
  const viaOptie = knopen(bestand).filter(
    (knoop) =>
      ts.isPropertyAssignment(knoop) &&
      knoop.name.getText() === 'shell' &&
      knoop.initializer.kind !== ts.SyntaxKind.FalseKeyword,
  );
  return [...viaArgumenten, ...viaOptie].map((knoop) => knoop.getText());
}

function inKooiArgument(bestand: ts.SourceFile): ts.Expression[] {
  return aanroepen(bestand)
    .filter((aanroep) => aangeroepen(aanroep) === 'inKooi')
    .flatMap((aanroep) => (aanroep.arguments[0] === undefined ? [] : [aanroep.arguments[0]]));
}

describe('kooi/AC-6: bestaande fragmenten draaien via inKooi, zonder shell', () => {
  test('kooi/AC-6: de shelltoets herkent sh -c en shell: true, niet een script als bestand (R-PRINC-04)', () => {
    const herkend = [
      "spawnSync('sh', ['-c', x]);",
      'execFileSync("bash", ["-eu", "-c", x]);',
      "spawn('/bin/sh', ['-ec', x]);",
      'f({ shell: true });',
      "f({ shell: '/bin/bash' });",
    ];
    const toegestaan = [
      "spawnSync('git', ['init']);",
      "spawnSync('bash', ['scripts/runner.sh', 'ui']);",
      'f({ shell: false });',
    ];
    expect(herkend.filter((tekst) => shellAanroepen(bron(tekst)).length === 0)).toEqual([]);
    expect(toegestaan.flatMap((tekst) => shellAanroepen(bron(tekst)))).toEqual([]);
  });

  test('kooi/AC-6: het sh -c-fragment uit compose.yaml in runner-trusted-base draait via inKooi', () => {
    const bestand = lees('test/scripts/runner-trusted-base.test.ts');
    const snippet = knopen(bestand).find(
      (knoop): knoop is ts.VariableDeclaration => ts.isVariableDeclaration(knoop) && knoop.name.getText() === 'snippet',
    );
    expect(snippet?.initializer?.getText()).toMatch(/^COMPOSE\.slice\(/);
    expect(inKooiArgument(bestand).map((argument) => argument.getText())).toContain('snippet');
    expect(shellAanroepen(bestand)).toEqual([]);
  });

  test('kooi/AC-6: het bash -eu -c-fragment uit ci.yml in ci-scan draait via inKooi', () => {
    const bestand = lees('test/rails/ci-scan.test.ts');
    // `bash -eu -c` in ci.yml: de kooi draait het fragment met `set -eu` ervoor, en dan het run-blok zelf.
    const metRunBlock = inKooiArgument(bestand).filter((argument) => {
      if (!ts.isTemplateExpression(argument) || argument.head.text !== 'set -eu\n') return false;
      const [eerste] = argument.templateSpans;
      return (
        eerste !== undefined && ts.isCallExpression(eerste.expression) && aangeroepen(eerste.expression) === 'runBlock'
      );
    });
    expect(metRunBlock).toHaveLength(1);
    expect(shellAanroepen(bestand)).toEqual([]);
  });

  test('kooi/AC-6: statusregel zoekt git op PATH zonder shell', () => {
    const bestand = lees('test/hooks/statusregel.test.ts');
    const opPad = aanroepen(bestand).filter((aanroep) => aangeroepen(aanroep) === 'opPad');
    expect(opPad.map((aanroep) => aanroep.arguments.map((argument) => argument.getText()))).toContainEqual(["'git'"]);
    expect(shellAanroepen(bestand)).toEqual([]);
  });
});
