import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as prettier from 'prettier';
import ts from 'typescript';
import { afterAll, describe, expect, test } from 'vitest';
import { pasToe, plan } from '../../scripts/kit/new-resource.mjs';

// suitecontract/AC-4 (docs/template/specs/suite-volgt-contract.md, ontwerp 2): pnpm new:resource drukt naast de declaratie voor
// test/security/resources.ts ook de regels af die <naam>:read en <naam>:write met de rollen uit --rollen aan PERMISSIE_ORACLE
// (test/security/fixtures.ts) toevoegen. Zonder die regels is security/AC-4 ("de oracle heeft precies de sleutels van
// permissions.names") rood. Het script schrijft fixtures.ts niet; zonder fixtures.ts in de kopie drukt het er niets voor af.

const FIXTURES = 'test/security/fixtures.ts';
const RESOURCES = 'test/security/resources.ts';
const PERMISSIES = 'src/shared/permissions.ts';

const NODIG = [
  '.prettierrc.json',
  'db/ids.json',
  'db/migrations',
  PERMISSIES,
  'src/shared/permissions.test.ts',
  'src/shared/contracts/index.ts',
  'src/shared/limits.ts',
  'src/api/app.ts',
  'src/web/copy/ui.ts',
  'src/web/lib/nav.ts',
  'src/web/routes.test.tsx',
];

const tijdelijkeMappen: string[] = [];

afterAll(() => {
  for (const map of tijdelijkeMappen) rmSync(map, { recursive: true, force: true });
});

// Een kopie met de gewone bestanden, plus de bestanden van de securitysuite die de test erbij vraagt.
function kopie(naam: string, extra: readonly string[]): string {
  const root = mkdtempSync(path.join(tmpdir(), 'new-resource-oracle-'));
  tijdelijkeMappen.push(root);
  for (const pad of [...NODIG, ...extra]) cpSync(pad, path.join(root, pad), { recursive: true });
  mkdirSync(path.join(root, 'docs/specs'), { recursive: true });
  writeFileSync(
    path.join(root, `docs/specs/${naam}.md`),
    `---\nstatus: goedgekeurd\nnamespace: ${naam}\n---\n\n# ${naam}\n`,
  );
  return root;
}

function bron(pad: string, tekst: string): ts.SourceFile {
  return ts.createSourceFile(pad, tekst, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function bezoek(wortel: ts.Node, doe: (node: ts.Node) => void): void {
  doe(wortel);
  ts.forEachChild(wortel, (kind) => {
    bezoek(kind, doe);
  });
}

// `{ … } as const satisfies Record<…>` en vergelijkbare omhulsels weg: de letterlijke objectwaarde eronder.
function uitgepakt(uitdrukking: ts.Expression): ts.Expression {
  let huidig = uitdrukking;
  while (ts.isSatisfiesExpression(huidig) || ts.isAsExpression(huidig) || ts.isParenthesizedExpression(huidig)) {
    huidig = huidig.expression;
  }
  return huidig;
}

function sleutelVan(eigenschap: ts.ObjectLiteralElementLike): string {
  const naam = eigenschap.name;
  if (naam === undefined) return '';
  return ts.isStringLiteralLike(naam) || ts.isIdentifier(naam) ? naam.text : naam.getText();
}

function teksten(uitdrukking: ts.Expression): string[] {
  const array = uitgepakt(uitdrukking);
  if (!ts.isArrayLiteralExpression(array)) return [];
  return array.elements.filter(ts.isStringLiteralLike).map((element) => element.text);
}

// PERMISSIE_ORACLE als sleutel → rollen.
function oracleVan(tekst: string): Map<string, string[]> {
  const uit = new Map<string, string[]>();
  bezoek(bron(FIXTURES, tekst), (node) => {
    if (!ts.isVariableDeclaration(node) || node.name.getText() !== 'PERMISSIE_ORACLE') return;
    if (node.initializer === undefined) return;
    const letterlijk = uitgepakt(node.initializer);
    if (!ts.isObjectLiteralExpression(letterlijk)) return;
    for (const eigenschap of letterlijk.properties) {
      if (ts.isPropertyAssignment(eigenschap)) uit.set(sleutelVan(eigenschap), teksten(eigenschap.initializer));
    }
  });
  return uit;
}

// permissions.names: 'app.use' van core plus de sleutels van de tabel in definePermissions(roles, { … }).
function permissieNamen(tekst: string): string[] {
  const namen = ['app.use'];
  bezoek(bron(PERMISSIES, tekst), (node) => {
    if (!ts.isCallExpression(node) || node.expression.getText() !== 'definePermissions') return;
    const tabel = node.arguments[1];
    if (tabel === undefined || !ts.isObjectLiteralExpression(tabel)) return;
    namen.push(...tabel.properties.map(sleutelVan));
  });
  return namen;
}

const sorteer = (lijst: Iterable<string>): string[] => [...lijst].sort();

// De sleutels die maar aan één kant staan. In de repo zelf is dat leeg (security/AC-4 bewaakt dat in test:db); in de kopie van
// check:new-resource staat al een gegenereerde resource in permissions.ts waarvan de afgedrukte oracle-regel niet is toegepast.
// De tests hieronder vergelijken daarom het verschil vóór en ná de generator, niet de volledige lijsten.
function verschil(oracle: Iterable<string>, tabel: readonly string[]): string[] {
  const links = new Set(oracle);
  const rechts = new Set(tabel);
  return sorteer([...[...links].filter((s) => !rechts.has(s)), ...[...rechts].filter((s) => !links.has(s))]);
}
const basisVerschil = (uit: Uitkomst): string[] =>
  verschil(oracleVan(uit.origineel).keys(), permissieNamen(readFileSync(PERMISSIES, 'utf8')));

interface Uitkomst {
  readonly root: string;
  readonly origineel: string;
  readonly hunks: { readonly pad: string; readonly zoek: string; readonly vervang: string }[];
  readonly bestanden: string[];
  readonly gates: string[];
  readonly permissies: string;
  readonly na: string;
}

async function bereken(naam: string, rollen: string[], extra: readonly string[] = [FIXTURES]): Promise<Uitkomst> {
  const root = kopie(naam, extra);
  const p = await plan(root, naam, { rollen, nu: new Date('2000-01-01T00:00:00Z') });
  const hunks = p.declaratie.filter(({ pad }) => pad === FIXTURES);
  const origineel = extra.includes(FIXTURES) ? readFileSync(path.join(root, FIXTURES), 'utf8') : '';
  let na = origineel;
  for (const hunk of hunks) na = pasToe(na, hunk);
  return {
    root,
    origineel,
    hunks,
    bestanden: p.bestanden.map(({ pad }) => pad),
    gates: p.gates.map(({ pad }) => pad),
    permissies: p.bestanden.find(({ pad }) => pad === PERMISSIES)?.inhoud ?? '',
    na,
  };
}

describe('suitecontract/AC-4: de oracle-regel in het plan', () => {
  test('suitecontract/AC-4: het plan bevat precies één wijziging voor test/security/fixtures.ts', async () => {
    const uit = await bereken('invoices', ['user']);

    expect(uit.hunks.map(({ pad }) => pad)).toStrictEqual([FIXTURES]);
  });

  test('suitecontract/AC-4: de zoektekst staat precies één keer in het huidige fixtures.ts (uniek toepasbare Edit)', async () => {
    const uit = await bereken('invoices', ['user']);

    expect(uit.hunks).toHaveLength(1);
    for (const { zoek } of uit.hunks) {
      expect(zoek.trim()).not.toBe('');
      expect(uit.origineel.split(zoek)).toHaveLength(2);
    }
    expect(uit.na).not.toBe(uit.origineel);
  });

  test('suitecontract/AC-4: na het toepassen staan <naam>:read en <naam>:write met de rollen uit --rollen in PERMISSIE_ORACLE', async () => {
    const uit = await bereken('invoices', ['user']);
    const oracle = oracleVan(uit.na);

    expect(oracle.get('invoices:read')).toStrictEqual(['user']);
    expect(oracle.get('invoices:write')).toStrictEqual(['user']);
  });

  test.each([
    { rollen: ['admin'], verwacht: ['admin'] },
    { rollen: ['user', 'admin'], verwacht: ['admin', 'user'] },
    { rollen: ['admin', 'user'], verwacht: ['admin', 'user'] },
  ])(
    'suitecontract/AC-4: --rollen $rollen geeft de rollen $verwacht in de oracle (volgorde onbelangrijk)',
    async ({ rollen, verwacht }) => {
      const uit = await bereken('mixed-notes', rollen);
      const oracle = oracleVan(uit.na);

      expect(sorteer(oracle.get('mixed-notes:read') ?? [])).toStrictEqual(sorteer(verwacht));
      expect(sorteer(oracle.get('mixed-notes:write') ?? [])).toStrictEqual(sorteer(verwacht));
    },
  );

  test('suitecontract/AC-4: de bestaande oracle-regels blijven staan', async () => {
    const uit = await bereken('invoices', ['user']);
    const voor = oracleVan(uit.origineel);
    const na = oracleVan(uit.na);

    expect(voor.size).toBeGreaterThan(0);
    for (const [sleutel, rollen] of voor) expect(na.get(sleutel)).toStrictEqual(rollen);
  });

  test('suitecontract/AC-4: het resultaat is opgemaakt volgens Prettier (pnpm format:check blijft groen)', async () => {
    const uit = await bereken('invoices', ['user']);
    const filepath = path.join(uit.root, FIXTURES);
    const config = await prettier.resolveConfig(filepath);

    expect(uit.na).not.toBe(uit.origineel);
    expect(await prettier.check(uit.na, { ...config, filepath })).toBe(true);
  });
});

describe('suitecontract/AC-4: de sleutels van de oracle zijn gelijk aan die van de permissietabel', () => {
  test('suitecontract/AC-4: na de oracle-regel en het schrijven van permissions.ts zijn de sleutels gelijk', async () => {
    const uit = await bereken('invoices', ['user']);

    expect(permissieNamen(uit.permissies)).toContain('invoices:read');
    expect(permissieNamen(uit.permissies)).toContain('invoices:write');
    expect(verschil(oracleVan(uit.na).keys(), permissieNamen(uit.permissies))).toStrictEqual(basisVerschil(uit));
  });

  test('suitecontract/AC-4: de vergelijking bewijst iets: zonder de oracle-regel verschillen de sleutels (rood in security/AC-4)', async () => {
    const uit = await bereken('invoices', ['user']);

    expect(verschil(oracleVan(uit.origineel).keys(), permissieNamen(uit.permissies))).toStrictEqual(
      sorteer([...basisVerschil(uit), 'invoices:read', 'invoices:write']),
    );
  });

  test('suitecontract/AC-4: ook voor een naam met een streepje (work-items) zijn de sleutels gelijk', async () => {
    const uit = await bereken('work-items', ['user', 'admin']);

    expect(oracleVan(uit.na).has('work-items:read')).toBe(true);
    expect(oracleVan(uit.na).has('work-items:write')).toBe(true);
    expect(verschil(oracleVan(uit.na).keys(), permissieNamen(uit.permissies))).toStrictEqual(basisVerschil(uit));
  });
});

describe('suitecontract/AC-4: het script schrijft fixtures.ts niet', () => {
  test('suitecontract/AC-4: fixtures.ts is geen geschreven bestand en geen gate-wijziging; de kopie is ongewijzigd', async () => {
    const uit = await bereken('invoices', ['user']);

    expect(uit.bestanden).not.toContain(FIXTURES);
    expect(uit.gates).not.toContain(FIXTURES);
    expect(readFileSync(path.join(uit.root, FIXTURES), 'utf8')).toBe(uit.origineel);
  });

  test('suitecontract/AC-4: zonder fixtures.ts in de kopie bevat het plan er geen wijziging voor', async () => {
    const uit = await bereken('invoices', ['user'], []);

    expect(uit.hunks).toStrictEqual([]);
  });

  test('suitecontract/AC-4: met fixtures.ts maar zonder resources.ts krijgt alleen fixtures.ts een wijziging', async () => {
    const root = kopie('invoices', [FIXTURES]);
    const p = await plan(root, 'invoices', { rollen: ['user'], nu: new Date('2000-01-01T00:00:00Z') });

    expect(p.declaratie.map(({ pad }) => pad)).toStrictEqual([FIXTURES]);
  });

  test('suitecontract/AC-4: met beide bestanden blijven de twee wijzigingen voor resources.ts en komt er een voor fixtures.ts bij', async () => {
    const root = kopie('invoices', [FIXTURES, RESOURCES]);
    const p = await plan(root, 'invoices', { rollen: ['user'], nu: new Date('2000-01-01T00:00:00Z') });

    expect(sorteer(p.declaratie.map(({ pad }) => pad))).toStrictEqual([FIXTURES, RESOURCES, RESOURCES]);
  });
});

describe('suitecontract/AC-4: de uitvoer van pnpm new:resource --dry-run', () => {
  const script = path.resolve('scripts/kit/new-resource.mjs');

  test('suitecontract/AC-4: drukt de wijziging voor test/security/fixtures.ts af met beide permissies en de rollen', () => {
    const root = kopie('invoices', [FIXTURES, RESOURCES]);

    const uitvoer = execFileSync(process.execPath, [script, 'invoices', '--rollen', 'user,admin', '--dry-run'], {
      cwd: root,
      encoding: 'utf8',
    });

    expect(uitvoer).toContain(`--- ${FIXTURES}`);
    expect(uitvoer).toContain("'invoices:read'");
    expect(uitvoer).toContain("'invoices:write'");
    expect(readFileSync(path.join(root, FIXTURES), 'utf8')).toBe(readFileSync(FIXTURES, 'utf8'));
  });
});
