// VERSLAG TESTER (verwijderen na de bouw):
//
// Per AC (testnaam begint met `template-update/AC-n:`; AC-6 en AC-7 geen test):
// - AC-1: later dan alle bestaande groen; tussen bestaande versies en eerder dan alle (template-fixture) rood, met precies één
//   regel met naam, nieuwste bestaande versie (20261010120000) en het woord "tijdstempel"; dezelfde melding in een app met
//   leesbare template-ref die het bestand niet heeft; geen migraties op het afsplitspunt groen; een migratie ouder dan wat main
//   ná het afsplitsen kreeg maar later dan het afsplitspunt groen.
// - AC-2: twee later toegevoegde migraties in beide volgorden groen; dezelfde versie: exact de bestaande melding "versie ...
//   komt meer dan één keer voor" (en niets extra).
// - AC-3 (app-fixture, template-ref `refs/remotes/template/main` in dezelfde fixture-repo): oudere migratie met gelijke inhoud
//   groen; andere inhoud rood (één regel met naam en nieuwste versie); twee oudere waarvan één in de template: alleen de andere
//   genoemd; template-ref ontbreekt met oudere migratie rood met `git fetch`; ref ontbreekt zonder oudere migratie groen.
// - AC-4 (template-fixture): oudere migratie rood ook als de template-ref hetzelfde bestand heeft.
// - AC-5: gewijzigd, verwijderd, foute naam, dubbele versie (elk naast een geldige nieuwe migratie, exact één melding) en
//   onleesbare origin/main (exacte bestaande melding).
// - AC-8 (HEAD == base `main`, merge met --no-ff): oudere migratie toegevoegd rood (één regel met naam en "nieuwe migratie");
//   latere groen; niets toegevoegd groen; één commit zonder ouder groen.
//
// Ontwerpkeuzes voor de developer (ook als commentaar boven de tests):
// - `migratieFouten(root, base, templateRef)`; de test roept hem aan via `unsafeCast` omdat de JSDoc nu twee parameters heeft.
// - Strikt later dan de nieuwste versie op het afsplitspunt; één meldingsregel per migratie (naam, nieuwste versie, "tijdstempel").
// - Bestanden zonder geldige versie in de naam leveren alleen de bestaande naamfout, geen volgordemelding.
// - Zelfherkenning aan `onderhoud.repository` in `.claude/gates.json` (de fixture commit dat bestand; niet-template = `{ "paden": {} }`).
// - Template-uitzondering per migratie: gelijke bestandsnaam en gelijke inhoud in `templateRef`; leesbaarheid van de ref alleen
//   toetsen als er een oudere toegevoegde migratie is; onleesbaar = melding met `git fetch` (de test zet een ref die niet bestaat;
//   het ophalen zelf hoort in de CLI-ingang, niet in de functie, anders haalt een test het netwerk op).
// - AC-8: bij HEAD == base is "bestaand" de eerste ouder van HEAD; zonder ouder geen vergelijking.
//
// Gedraaid (tsc -b --noEmit, eslint: schoon; vitest: 24 tests, 8 rood, 16 groen).
// Rood op een assertie (verwachte regel ontbreekt, nu geen melding): AC-1 (3 gevallen: tussen, eerder dan alle, app), AC-3
// (andere inhoud, twee oudere, ref niet te lezen), AC-4, AC-8 (oudere migratie toegevoegd).
// Groen en terecht: AC-1/2 groene gevallen, AC-2 dubbele versie (bestaande regel), AC-3 gelijke inhoud en ref niet gelezen
// zonder oudere migratie (die tellen als regressie voor de nieuwe code), AC-5 (bestaande regels, nu al groen), AC-8 groene gevallen.
//
// Onduidelijk in de spec:
// - AC-8 noemt geen uitzondering voor een templatemigratie. Een app-PR met een oudere templatemigratie is groen door AC-3, maar
//   de merge-commit op main voegt die dan toe aan de eerste ouder: AC-8 maakt main rood. Ik heb dat niet getest (AC-8-fixtures
//   zijn template-fixtures); de architect moet beslissen of AC-8 de uitzondering van AC-3 ook kent.
// - De precieze plek van het ophalen van de template-ref (functie of CLI) en de tekst van het commando staan niet vast; ik toets
//   alleen op `git fetch`.
// - AC-8 bij een gewone (niet-merge) commit op main: wel of niet vergelijken met de eerste ouder is niet gespecificeerd; niet getest.
//
// Aangemaakte bestanden: test/rails/check-migrations-volgorde.test.ts (dit bestand).
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { migratieFouten } from '../../scripts/kit/check-migrations.mjs';
import { unsafeCast } from '../../src/core/shared/unsafe-cast.ts';

// template-update PR 1 (docs/template/specs/template-update.md): `check:migrations` weigert een toegevoegde migratie die niet
// later is dan alle migraties op het afsplitspunt, met een uitzondering voor een ongewijzigde templatemigratie in een app,
// en controleert op main achteraf de laatste merge tegen de eerste ouder. Fixture-repo's, geen mocks.
type MetTemplateRef = (root: string, base: string, templateRef: string) => string[];
const fouten = unsafeCast<MetTemplateRef>(
  migratieFouten,
  'test: de derde parameter templateRef komt met de implementatie; de JSDoc kent nu twee',
);

const BASIS = '20261009000000_baseline.sql';
const NOTES = '20261010120000_notes.sql';
const NIEUWSTE = '20261010120000';
const VROEG = '20261008000000_vroeg.sql';
const TUSSEN = '20261009120000_tussen.sql';
const LATER = '20261011000000_later.sql';
const LATER2 = '20261012000000_later2.sql';
const TEMPLATE_REF = 'refs/remotes/template/main';
const GATES_APP = '{ "paden": {} }\n';
const GATES_TEMPLATE = '{ "onderhoud": { "repository": "voorbeeld/template" } }\n';

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

// Een repo op `main` met de gegeven migraties in één eerste commit; `app` bepaalt of `onderhoud.repository` ontbreekt.
function repo(app: boolean, bestaand: readonly string[] = [BASIS, NOTES]): string {
  const root = mkdtempSync(path.join(tmpdir(), 'check-migrations-volgorde-'));
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

// De template-ref (een tweede ref in dezelfde repo) bevat de basis plus de gegeven bestanden; terug op `werk`.
function zetTemplate(root: string, bestanden: Readonly<Record<string, string>>): void {
  git(root, 'switch', '-q', '-c', 'sjabloon', 'main');
  for (const [naam, sql] of Object.entries(bestanden)) schrijf(root, naam, sql);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '--allow-empty', '-m', 'template');
  git(root, 'update-ref', TEMPLATE_REF, 'HEAD');
  git(root, 'switch', '-q', 'werk');
}

// main loopt door nadat `werk` afsplitste.
function mainVooruit(root: string, namen: readonly string[]): void {
  git(root, 'switch', '-q', 'main');
  voegToe(root, namen);
  git(root, 'switch', '-q', 'werk');
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

// De melding noemt per migratie één regel: naam, de nieuwste bestaande versie en het herstel (tijdstempel vernieuwen).
function eenRegelMet(uitkomst: readonly string[], naam: string): string {
  const regels = uitkomst.filter((regel) => regel.includes(naam));
  expect(regels).toHaveLength(1);
  return regels[0] ?? '';
}

// AC-1 ---------------------------------------------------------------------------------------------------------------

test('template-update/AC-1: een toegevoegde migratie later dan alle bestaande is groen', () => {
  const root = werkRepo(true);
  voegToe(root, [LATER]);

  expect(fouten(root, 'main', TEMPLATE_REF)).toStrictEqual([]);
});

// Ontwerpkeuze: "later" is strikt later dan de nieuwste versie op het afsplitspunt; de melding is één regel per migratie.
test.each([
  ['tussen bestaande versies', TUSSEN],
  ['eerder dan alle bestaande', VROEG],
])('template-update/AC-1: een toegevoegde migratie %s is rood met naam, nieuwste versie en tijdstempel', (_, naam) => {
  const root = werkRepo(false);
  voegToe(root, [naam]);

  const regel = eenRegelMet(fouten(root, 'main', TEMPLATE_REF), naam);
  expect(regel).toContain(NIEUWSTE);
  expect(regel).toMatch(/tijdstempel/i);
});

// Ontwerpkeuze: in een app met een leesbare template-ref die het bestand niet heeft, is de melding dezelfde als in de template.
test('template-update/AC-1: ook in een app is een eigen oudere migratie rood met naam, nieuwste versie en tijdstempel', () => {
  const root = werkRepo(true);
  voegToe(root, [TUSSEN]);
  zetTemplate(root, {});

  const regel = eenRegelMet(fouten(root, 'main', TEMPLATE_REF), TUSSEN);
  expect(regel).toContain(NIEUWSTE);
  expect(regel).toMatch(/tijdstempel/i);
});

// Ontwerpkeuze: zonder migraties op het afsplitspunt is elke versie later.
test('template-update/AC-1: zonder migraties op het afsplitspunt is elke toegevoegde migratie groen', () => {
  const root = werkRepo(true, []);
  voegToe(root, [TUSSEN]);

  expect(fouten(root, 'main', TEMPLATE_REF)).toStrictEqual([]);
});

// Ontwerpkeuze: vergeleken wordt met het afsplitspunt, niet met de huidige main; een latere migratie die main erbij kreeg telt niet.
test('template-update/AC-1: een migratie die ouder is dan wat main erna kreeg, maar later dan het afsplitspunt, is groen', () => {
  const root = werkRepo(true);
  mainVooruit(root, [LATER2]);
  voegToe(root, [LATER]);

  expect(fouten(root, 'main', TEMPLATE_REF)).toStrictEqual([]);
});

// AC-2 ---------------------------------------------------------------------------------------------------------------

test.each([
  ['de eerste voor de tweede', [LATER, LATER2]],
  ['de tweede voor de eerste', [LATER2, LATER]],
])('template-update/AC-2: twee later toegevoegde migraties (%s) zijn groen', (_, namen) => {
  const root = werkRepo(true);
  voegToe(root, namen);

  expect(fouten(root, 'main', TEMPLATE_REF)).toStrictEqual([]);
});

// Ontwerpkeuze: de nieuwe regel meldt hier niets extra; alleen de bestaande dubbele-versieregel (precies één melding).
test('template-update/AC-2: twee toegevoegde migraties met dezelfde versie zijn rood door de dubbele-versieregel', () => {
  const root = werkRepo(true);
  voegToe(root, ['20261011000000_een.sql', '20261011000000_twee.sql']);

  expect(fouten(root, 'main', TEMPLATE_REF)).toStrictEqual(['versie 20261011000000 komt meer dan één keer voor']);
});

// AC-3 ---------------------------------------------------------------------------------------------------------------

// Ontwerpkeuze: de herkenning is op bestandsnaam plus gelijke inhoud van de gecommitte migratie in de template-ref.
test('template-update/AC-3: in een app is een oudere migratie met dezelfde inhoud in de template-ref groen', () => {
  const root = werkRepo(true);
  voegToe(root, [TUSSEN]);
  zetTemplate(root, { [TUSSEN]: inhoud(TUSSEN) });

  expect(fouten(root, 'main', TEMPLATE_REF)).toStrictEqual([]);
});

test('template-update/AC-3: in een app is een oudere migratie met andere inhoud in de template-ref rood met de naam', () => {
  const root = werkRepo(true);
  voegToe(root, [TUSSEN]);
  zetTemplate(root, { [TUSSEN]: 'create table anders ();\n' });

  const uitkomst = fouten(root, 'main', TEMPLATE_REF);
  expect(uitkomst.length).toBeGreaterThan(0);
  expect(eenRegelMet(uitkomst, TUSSEN)).toContain(NIEUWSTE);
});

// Ontwerpkeuze: de uitzondering geldt per migratie; alleen wat niet in de template staat wordt genoemd.
test('template-update/AC-3: bij twee oudere migraties, waarvan één in de template, wordt alleen de andere genoemd', () => {
  const root = werkRepo(true);
  voegToe(root, [TUSSEN, VROEG]);
  zetTemplate(root, { [TUSSEN]: inhoud(TUSSEN) });

  const uitkomst = fouten(root, 'main', TEMPLATE_REF);
  expect(uitkomst.join('\n')).toContain(VROEG);
  expect(uitkomst.join('\n')).not.toContain(TUSSEN);
});

// Ontwerpkeuze: een niet-leesbare template-ref (hier een ref die niet bestaat) is een fout met het commando `git fetch ...`.
test('template-update/AC-3: een oudere migratie terwijl de template-ref niet te lezen is, is rood met de reden en het commando', () => {
  const root = werkRepo(true);
  voegToe(root, [TUSSEN]);

  const uitkomst = fouten(root, 'main', TEMPLATE_REF);
  expect(uitkomst.length).toBeGreaterThan(0);
  expect(uitkomst.join('\n')).toMatch(/git fetch/);
});

// Ontwerpkeuze: zonder oudere toegevoegde migratie wordt de template-ref niet gelezen (en dus ook niet opgehaald).
test('template-update/AC-3: zonder oudere toegevoegde migratie slaagt de check ook als de template-ref niet bestaat', () => {
  const root = werkRepo(true);
  voegToe(root, [LATER]);

  expect(fouten(root, 'main', 'refs/remotes/template/bestaat-niet')).toStrictEqual([]);
});

// AC-4 ---------------------------------------------------------------------------------------------------------------

// Ontwerpkeuze: de template herkent zichzelf aan `onderhoud.repository` in `.claude/gates.json` van de repo zelf.
test('template-update/AC-4: in de template is een oudere migratie rood, ook als de template-ref hetzelfde bestand bevat', () => {
  const root = werkRepo(false);
  voegToe(root, [TUSSEN]);
  zetTemplate(root, { [TUSSEN]: inhoud(TUSSEN) });

  const regel = eenRegelMet(fouten(root, 'main', TEMPLATE_REF), TUSSEN);
  expect(regel).toContain(NIEUWSTE);
});

// AC-5 ---------------------------------------------------------------------------------------------------------------

// Ontwerpkeuze: elk geval combineert één geldige nieuwe migratie (LATER) met precies één overtreding; een bestand zonder
// versie in de naam telt niet mee voor de volgorderegel en levert geen extra melding.
test.each([
  [
    'een gewijzigde migratie',
    (root: string) => {
      schrijf(root, BASIS, 'create table a (id int);\n');
    },
    [`db/migrations/${BASIS}: gewijzigd`],
  ],
  [
    'een verwijderde migratie',
    (root: string) => {
      rmSync(path.join(root, 'db/migrations', BASIS));
    },
    [`db/migrations/${BASIS}: verwijderd`],
  ],
  [
    'een foute naam',
    (root: string) => {
      voegToe(root, ['notes.sql']);
    },
    ['db/migrations/notes.sql: naam is niet <14 cijfers>_<naam>.sql (dbmate new <naam>)'],
  ],
  [
    'een dubbele versie',
    (root: string) => {
      voegToe(root, ['20261013000000_een.sql', '20261013000000_twee.sql']);
    },
    ['versie 20261013000000 komt meer dan één keer voor'],
  ],
])('template-update/AC-5: de bestaande regel blijft naast de nieuwe: %s', (_, wijzig, verwacht) => {
  const root = werkRepo(true);
  voegToe(root, [LATER]);
  wijzig(root);

  expect(fouten(root, 'main', TEMPLATE_REF).map((regel) => regel.split(';')[0])).toStrictEqual(verwacht);
});

test('template-update/AC-5: zonder leesbare origin/main faalt de check nog steeds met dezelfde melding', () => {
  const root = werkRepo(true);
  voegToe(root, [LATER]);

  expect(fouten(root, 'origin/main', TEMPLATE_REF)).toStrictEqual([
    'origin/main is niet te lezen; haal hem op (git fetch origin main) of gebruik in CI fetch-depth: 0',
  ]);
});

// AC-8 ---------------------------------------------------------------------------------------------------------------

// Ontwerpkeuze: staat HEAD op de base, dan is "bestaand" de eerste ouder van HEAD en "toegevoegd" het verschil tussen die ouder
// en HEAD. De fixtures gebruiken de template (geen uitzondering, geen template-ref nodig); de melding is één regel met naam en
// de aanwijzing voor een nieuwe migratie.
test('template-update/AC-8: op main is een merge die een oudere migratie toevoegde rood met naam en nieuwe migratie', () => {
  const root = repo(false);
  mergeZijtak(root, [TUSSEN]);

  const regel = eenRegelMet(fouten(root, 'main', TEMPLATE_REF), TUSSEN);
  expect(regel).toMatch(/nieuwe migratie/i);
});

test('template-update/AC-8: op main is een merge die een latere migratie toevoegde groen', () => {
  const root = repo(false);
  mergeZijtak(root, [LATER]);

  expect(fouten(root, 'main', TEMPLATE_REF)).toStrictEqual([]);
});

test('template-update/AC-8: op main is een merge die geen migratie toevoegde groen', () => {
  const root = repo(false);
  mergeZijtak(root, []);

  expect(fouten(root, 'main', TEMPLATE_REF)).toStrictEqual([]);
});

test('template-update/AC-8: een eerste commit zonder ouder is groen', () => {
  const root = repo(false);

  expect(fouten(root, 'main', TEMPLATE_REF)).toStrictEqual([]);
});
