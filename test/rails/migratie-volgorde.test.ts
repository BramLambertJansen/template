import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';

// template-update PR 2, AC-7, niveau 1 (docs/template/specs/template-update.md): het hulpscript scripts/kit/migratie-volgorde.mjs
// zegt welke toegevoegde migraties ouder zijn dan een bestaande en onder welke nieuwe naam ze in de tweede bouw van
// `check:snapshot` komen. Fixture-repo's, geen mocks; de vorm volgt test/rails/check-migrations-volgorde.test.ts.
//
// Ontwerpkeuze (de developer volgt hem): het script exporteert `volgordeHernoemingen(root, base, templateRef)` met dezelfde
// parameters als `migratieFouten` en geeft een lijst `{ van, naar }` terug: bestandsnamen zonder map (`<14 cijfers>_<naam>.sql`),
// niet de paden. De CLI-ingang (`import.meta.main`) drukt per element `<van> <naar>` af, en niets als de lijst leeg is.
//
// Importvorm: het script bestaat nog niet. Een statische import laat het hele bestand en `tsc` op de import falen; daarom laadt
// `hernoemingen()` de module pas in de test, met een niet-letterlijk pad (zoals test/rails/check-roadmap.test.ts), en valideert
// het resultaat met type-guards in plaats van casts. Ontbreekt de module of de export, dan faalt elke test op een assertie.
const REPO = path.resolve(import.meta.dirname, '../..');
const MODULE = ['../../scripts/kit', 'migratie-volgorde.mjs'].join('/');
const SCRIPT = path.join(REPO, 'scripts/kit/migratie-volgorde.mjs');

const BASIS = '20261009000000_baseline.sql';
const NOTES = '20261010120000_notes.sql';
const VROEG = '20261008000000_vroeg.sql';
const TUSSEN = '20261009120000_tussen.sql';
const LATER = '20261011000000_later.sql';
const LATER2 = '20261012000000_later2.sql';
const TEMPLATE_REF = 'refs/remotes/template/main';
const GATES_APP = '{ "paden": {} }\n';
const GATES_TEMPLATE = '{ "onderhoud": { "repository": "voorbeeld/template" } }\n';

interface Hernoeming {
  van: string;
  naar: string;
}

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function alsHernoeming(item: unknown): Hernoeming {
  if (
    typeof item === 'object' &&
    item !== null &&
    'van' in item &&
    typeof item.van === 'string' &&
    'naar' in item &&
    typeof item.naar === 'string'
  )
    return { van: item.van, naar: item.naar };
  throw new Error(`geen { van, naar }: ${JSON.stringify(item)}`);
}

async function hernoemingen(root: string, base: string, templateRef: string = TEMPLATE_REF): Promise<Hernoeming[]> {
  const geladen: unknown = await import(/* @vite-ignore */ MODULE).catch(() => undefined);
  expect(geladen, 'scripts/kit/migratie-volgorde.mjs bestaat').toBeTypeOf('object');
  const functie: unknown =
    typeof geladen === 'object' && geladen !== null ? Reflect.get(geladen, 'volgordeHernoemingen') : undefined;
  expect(functie, 'migratie-volgorde.mjs exporteert volgordeHernoemingen').toBeTypeOf('function');
  if (typeof functie !== 'function') return [];
  const lijst: unknown = Reflect.apply(functie, undefined, [root, base, templateRef]);
  expect(Array.isArray(lijst), 'volgordeHernoemingen geeft een lijst').toBe(true);
  return Array.isArray(lijst) ? lijst.map(alsHernoeming) : [];
}

function git(root: string, ...args: string[]): void {
  execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.test', ...args], {
    cwd: root,
    stdio: 'ignore',
  });
}

function inhoud(naam: string): string {
  return `-- ${naam}\ncreate table t_${naam.slice(0, 14)} ();\n`;
}

function schrijf(root: string, naam: string, sql: string): void {
  writeFileSync(path.join(root, 'db/migrations', naam), sql);
}

function versie(naam: string): number {
  return Number(naam.slice(0, 14));
}

function migratieNamen(root: string): string[] {
  return readdirSync(path.join(root, 'db/migrations')).toSorted();
}

function hoogsteVersie(root: string): number {
  return Math.max(
    ...migratieNamen(root)
      .filter((naam) => naam.endsWith('.sql'))
      .map(versie),
  );
}

// Een repo op `main` met de gegeven migraties in één eerste commit; `app` bepaalt of `onderhoud.repository` ontbreekt.
function repo(app: boolean, bestaand: readonly string[] = [BASIS, NOTES]): string {
  const root = mkdtempSync(path.join(tmpdir(), 'migratie-volgorde-'));
  dirs.push(root);
  mkdirSync(path.join(root, 'db/migrations'), { recursive: true });
  mkdirSync(path.join(root, '.claude'), { recursive: true });
  writeFileSync(path.join(root, '.claude/gates.json'), app ? GATES_APP : GATES_TEMPLATE);
  writeFileSync(path.join(root, 'db/migrations/.gitkeep'), '');
  git(root, 'init', '-q', '-b', 'main');
  for (const naam of bestaand) schrijf(root, naam, inhoud(naam));
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'baseline');
  return root;
}

function werkRepo(app: boolean, bestaand?: readonly string[]): string {
  const root = repo(app, bestaand);
  git(root, 'switch', '-q', '-c', 'werk');
  return root;
}

// Elke migratie in een eigen commit, in de gegeven volgorde, op de huidige branch.
function voegToe(root: string, namen: readonly string[]): void {
  for (const naam of namen) {
    schrijf(root, naam, inhoud(naam));
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', `voeg ${naam} toe`);
  }
}

// De template-ref (een tweede ref in dezelfde repo) bevat main plus de gegeven bestanden; daarna terug op `terug`.
function zetTemplate(root: string, bestanden: Readonly<Record<string, string>>, terug = 'werk'): void {
  git(root, 'switch', '-q', '-c', 'sjabloon', 'main');
  for (const [naam, sql] of Object.entries(bestanden)) schrijf(root, naam, sql);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '--allow-empty', '-m', 'template');
  git(root, 'update-ref', TEMPLATE_REF, 'HEAD');
  git(root, 'switch', '-q', terug);
}

// Op main: een zijtak voegt de migraties toe (of alleen een ander bestand) en wordt met een echte merge-commit gemerged.
function mergeZijtak(root: string, namen: readonly string[]): void {
  git(root, 'switch', '-q', '-c', 'zijtak');
  if (namen.length === 0) writeFileSync(path.join(root, 'notities.md'), 'tekst\n');
  for (const naam of namen) schrijf(root, naam, inhoud(naam));
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'zijtak');
  git(root, 'switch', '-q', 'main');
  git(root, 'merge', '-q', '--no-ff', '-m', 'merge zijtak', 'zijtak');
}

// De hernoeming van `naam`: precies één, met een geldige nieuwe naam die alleen in de versie verschilt en later is dan alle
// migraties in de werkmap (bestaande en toegevoegde).
function hernoemingVan(lijst: readonly Hernoeming[], naam: string, hoogste: number): Hernoeming {
  const gevonden = lijst.filter(({ van }) => van === naam);
  expect(gevonden).toHaveLength(1);
  const { van, naar } = gevonden[0] ?? { van: '', naar: '' };
  expect(naar).toMatch(/^\d{14}_[a-z0-9_]+\.sql$/);
  expect(naar.slice(15)).toBe(van.slice(15));
  expect(versie(naar)).toBeGreaterThan(hoogste);
  return { van, naar };
}

// Geen oudere toegevoegde migratie ---------------------------------------------------------------------------------------

test('template-update/AC-7: zonder toegevoegde migratie is er niets te hernoemen', async () => {
  const root = werkRepo(true);

  expect(await hernoemingen(root, 'main')).toStrictEqual([]);
});

test('template-update/AC-7: alleen latere toegevoegde migraties worden niet hernoemd', async () => {
  const root = werkRepo(true);
  voegToe(root, [LATER, LATER2]);

  expect(await hernoemingen(root, 'main')).toStrictEqual([]);
});

// Ontwerpkeuze: zonder migraties op het afsplitspunt is elke versie later (zoals in `check:migrations`), dus geen hernoeming.
test('template-update/AC-7: zonder migraties op het afsplitspunt is er niets te hernoemen', async () => {
  const root = werkRepo(false, []);
  voegToe(root, [TUSSEN]);

  expect(await hernoemingen(root, 'main')).toStrictEqual([]);
});

// Oudere toegevoegde migraties -------------------------------------------------------------------------------------------

test('template-update/AC-7: één oudere toegevoegde migratie krijgt een versie later dan alle andere en dezelfde naam erna', async () => {
  const root = werkRepo(false);
  voegToe(root, [TUSSEN]);

  const lijst = await hernoemingen(root, 'main');

  expect(lijst).toHaveLength(1);
  const { naar } = hernoemingVan(lijst, TUSSEN, hoogsteVersie(root));
  expect(naar.slice(0, 14)).not.toBe(TUSSEN.slice(0, 14));
});

// Ontwerpkeuze: "oorspronkelijke onderlinge volgorde" is de versievolgorde (zoals dbmate ze toepast), niet de volgorde van de
// commits: hier is TUSSEN eerst toegevoegd, maar VROEG heeft de oudere versie en blijft dus voor TUSSEN.
test('template-update/AC-7: twee oudere toegevoegde migraties worden beide hernoemd, in hun onderlinge volgorde', async () => {
  const root = werkRepo(false);
  voegToe(root, [TUSSEN, VROEG]);

  const lijst = await hernoemingen(root, 'main');

  expect(lijst).toHaveLength(2);
  const vroeg = hernoemingVan(lijst, VROEG, hoogsteVersie(root));
  const tussen = hernoemingVan(lijst, TUSSEN, hoogsteVersie(root));
  expect(versie(vroeg.naar)).toBeLessThan(versie(tussen.naar));
});

// Productie heeft de bestaande migraties al en past daarna ALLE nieuwe toe op versievolgorde. Een latere toegevoegde migratie
// kan van een oudere toegevoegde afhangen (de template maakt een tabel en wijzigt haar in een volgende migratie), dus beide
// krijgen een nieuwe naam en de oudere blijft vóór de latere.
test('template-update/AC-7: bij een oudere en een latere toegevoegde migratie worden beide hernoemd, de oudere vóór de latere', async () => {
  const root = werkRepo(false);
  voegToe(root, [TUSSEN, LATER]);

  const lijst = await hernoemingen(root, 'main');

  expect(lijst).toHaveLength(2);
  const tussen = hernoemingVan(lijst, TUSSEN, hoogsteVersie(root));
  const later = hernoemingVan(lijst, LATER, hoogsteVersie(root));
  expect(versie(tussen.naar)).toBeLessThan(versie(later.naar));
});

// Ontwerpkeuze: de uitzondering voor een templatemigratie in `check:migrations` laat deze migratie door; juist daarom moet de
// volgorde bewezen worden, dus ze staat wel in de lijst. De template-ref wordt voor de selectie niet gelezen.
test('template-update/AC-7: in een app staat een oudere migratie die ongewijzigd in de template-ref staat wel in de lijst', async () => {
  const root = werkRepo(true);
  voegToe(root, [TUSSEN]);
  zetTemplate(root, { [TUSSEN]: inhoud(TUSSEN) });

  const lijst = await hernoemingen(root, 'main', TEMPLATE_REF);

  expect(lijst).toHaveLength(1);
  hernoemingVan(lijst, TUSSEN, hoogsteVersie(root));
});

test('template-update/AC-7: in een app met een onleesbare template-ref staat een oudere migratie ook in de lijst', async () => {
  const root = werkRepo(true);
  voegToe(root, [TUSSEN]);

  const lijst = await hernoemingen(root, 'main', 'refs/remotes/template/bestaat-niet');

  expect(lijst).toHaveLength(1);
  hernoemingVan(lijst, TUSSEN, hoogsteVersie(root));
});

// Op main -------------------------------------------------------------------------------------------------------------

// Ontwerpkeuze: staat HEAD op de base, dan is "bestaand" de eerste ouder van HEAD (zoals in `check:migrations`).
test('template-update/AC-7: op main is een merge die een oudere migratie toevoegde te hernoemen, vergeleken met de eerste ouder', async () => {
  const root = repo(false);
  mergeZijtak(root, [TUSSEN]);

  const lijst = await hernoemingen(root, 'main');

  expect(lijst).toHaveLength(1);
  hernoemingVan(lijst, TUSSEN, hoogsteVersie(root));
});

test.each([
  { geval: 'een latere migratie', namen: [LATER] },
  { geval: 'geen migratie', namen: [] },
])('template-update/AC-7: op main is een merge met $geval niet te hernoemen', async ({ namen }) => {
  const root = repo(false);
  mergeZijtak(root, namen);

  expect(await hernoemingen(root, 'main')).toStrictEqual([]);
});

test('template-update/AC-7: op main is een eerste commit zonder ouder niet te hernoemen', async () => {
  const root = repo(false);

  expect(await hernoemingen(root, 'main')).toStrictEqual([]);
});

// De werkmap ----------------------------------------------------------------------------------------------------------

test('template-update/AC-7: de werkmap blijft zoals ze was: de bestanden in db/migrations heten na de aanroep hetzelfde', async () => {
  const root = werkRepo(false);
  voegToe(root, [TUSSEN, VROEG, LATER]);
  const voor = migratieNamen(root);

  const lijst = await hernoemingen(root, 'main');

  expect(lijst).toHaveLength(3);
  expect(migratieNamen(root)).toStrictEqual(voor);
  expect(execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' })).toBe('');
});

// De CLI-ingang -------------------------------------------------------------------------------------------------------

// Ontwerpkeuze: de CLI leest origin/main en de huidige map (zoals `check:migrations`); de fixture zet origin/main op main.
function cli(root: string): { status: number | null; stdout: string; stderr: string } {
  git(root, 'update-ref', 'refs/remotes/origin/main', 'main');
  const result = spawnSync('node', [SCRIPT], { cwd: root, encoding: 'utf8', timeout: 20_000 });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

test('template-update/AC-7: de CLI drukt, zodra er een oudere is, per toegevoegde migratie één regel "<naam> <nieuwe naam>" af', () => {
  const root = werkRepo(false);
  voegToe(root, [TUSSEN, VROEG, LATER]);

  const uitkomst = cli(root);

  expect(uitkomst.status).toBe(0);
  const regels = uitkomst.stdout.trimEnd().split('\n');
  expect(regels).toHaveLength(3);
  expect(regels.map((regel) => regel.split(' ')[0])).toStrictEqual([VROEG, TUSSEN, LATER]);
  for (const regel of regels) expect(regel).toMatch(/^\d{14}_[a-z0-9_]+\.sql \d{14}_[a-z0-9_]+\.sql$/);
});

test('template-update/AC-7: de CLI drukt niets af als er geen oudere toegevoegde migratie is', () => {
  const root = werkRepo(false);
  voegToe(root, [LATER]);

  const uitkomst = cli(root);

  expect(uitkomst.status).toBe(0);
  expect(uitkomst.stdout).toBe('');
});
