import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { migratieFouten } from '../../scripts/kit/check-migrations.mjs';
import { volgordeHernoemingen } from '../../scripts/kit/migratie-volgorde.mjs';

// Leerpunt #809: bij een rerun van een oudere push op main staat HEAD op die oudere commit terwijl de opgehaalde base
// (origin/main) al verder is. De selectie van toegevoegde migraties moet voor hetzelfde main-pushevent stabiel zijn.
// Fixture-repo's met git, geen mocks; de vorm volgt migratie-volgorde.test.ts en check-migrations-volgorde.test.ts.
const BASIS = '20261009000000_baseline.sql';
const NOTES = '20261010120000_notes.sql';
const TUSSEN = '20261009120000_tussen.sql';
const LATER = '20261011000000_later.sql';
const TEMPLATE_REF = 'refs/remotes/template/main';
const GATES_TEMPLATE = '{ "onderhoud": { "repository": "voorbeeld/template" } }\n';

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function git(root: string, ...args: string[]): void {
  execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.test', ...args], {
    cwd: root,
    stdio: 'ignore',
  });
}

function inhoud(naam: string): string {
  return `-- ${naam}\ncreate table t_${naam.slice(0, 14)} ();\n`;
}

function commitMigratie(root: string, naam: string): void {
  writeFileSync(path.join(root, 'db/migrations', naam), inhoud(naam));
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', `voeg ${naam} toe`);
}

function leegeCommit(root: string): void {
  git(root, 'commit', '-q', '--allow-empty', '-m', 'leeg');
}

// Template-repo (gates.json met onderhoud.repository) op `main` met de bestaande migraties in één eerste commit.
function repo(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'migratie-volgorde-rerun-'));
  dirs.push(root);
  mkdirSync(path.join(root, 'db/migrations'), { recursive: true });
  mkdirSync(path.join(root, '.claude'), { recursive: true });
  writeFileSync(path.join(root, '.claude/gates.json'), GATES_TEMPLATE);
  writeFileSync(path.join(root, 'db/migrations/.gitkeep'), '');
  git(root, 'init', '-q', '-b', 'main');
  for (const naam of [BASIS, NOTES]) writeFileSync(path.join(root, 'db/migrations', naam), inhoud(naam));
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'baseline');
  return root;
}

// Main met een oudere migratie (tweede commit) en een lege derde commit; `main` wijst naar de derde.
// Het rerun-scenario checkt de tweede commit uit (detached), het referentiescenario laat HEAD op de base staan.
function mainMetOudereMigratie(): string {
  const root = repo();
  commitMigratie(root, TUSSEN);
  leegeCommit(root);
  return root;
}

function naarTweedeCommit(root: string): void {
  git(root, 'checkout', '-q', '--detach', 'main~1');
}

test('leerpunt #809: volgordeHernoemingen geeft bij een rerun (HEAD ouder dan base) dezelfde hernoeming als bij base == HEAD', () => {
  const referentieRoot = mainMetOudereMigratie();
  naarTweedeCommit(referentieRoot);
  git(referentieRoot, 'update-ref', 'refs/heads/basis-gelijk', 'HEAD');
  const verwacht = volgordeHernoemingen(referentieRoot, 'basis-gelijk');
  expect(verwacht).toHaveLength(1);

  const rerunRoot = mainMetOudereMigratie();
  naarTweedeCommit(rerunRoot);

  expect(volgordeHernoemingen(rerunRoot, 'main')).toStrictEqual(verwacht);
});

test('leerpunt #809: migratieFouten geeft bij een rerun (HEAD ouder dan base) dezelfde volgordefout als bij base == HEAD', () => {
  const referentieRoot = mainMetOudereMigratie();
  naarTweedeCommit(referentieRoot);
  git(referentieRoot, 'update-ref', 'refs/heads/basis-gelijk', 'HEAD');
  const verwacht = migratieFouten(referentieRoot, 'basis-gelijk', TEMPLATE_REF);
  expect(verwacht).toHaveLength(1);
  expect(verwacht[0]).toContain('hernoemen kan op main niet meer');

  const rerunRoot = mainMetOudereMigratie();
  naarTweedeCommit(rerunRoot);

  expect(migratieFouten(rerunRoot, 'main', TEMPLATE_REF)).toStrictEqual(verwacht);
});

test('leerpunt #809: een PR-branch met een latere migratie, terwijl main verder is, geeft geen hernoeming en geen fout', () => {
  const root = repo();
  git(root, 'switch', '-q', '-c', 'werk');
  commitMigratie(root, LATER);
  git(root, 'switch', '-q', 'main');
  leegeCommit(root);
  git(root, 'switch', '-q', 'werk');

  expect(volgordeHernoemingen(root, 'main')).toStrictEqual([]);
  expect(migratieFouten(root, 'main', TEMPLATE_REF)).toStrictEqual([]);
});

test('leerpunt #809: een PR-branch met een eigen oudere migratie, terwijl main verder is, geeft de PR-melding, niet de main-melding', () => {
  const root = repo();
  git(root, 'switch', '-q', '-c', 'werk');
  commitMigratie(root, TUSSEN);
  git(root, 'switch', '-q', 'main');
  leegeCommit(root);
  git(root, 'switch', '-q', 'werk');

  const fouten = migratieFouten(root, 'main', TEMPLATE_REF);

  expect(fouten).toHaveLength(1);
  expect(fouten[0]).toContain('hernoem het bestand');
  expect(fouten[0]).not.toContain('hernoemen kan op main niet meer');
  expect(volgordeHernoemingen(root, 'main')).toHaveLength(1);
});

// Eigenaarbesluit 2026-11-24 (spec template-update, AC-8): een branch zonder eigen commits die alleen achter main ligt, telt
// als main en krijgt hetzelfde oordeel als main over die commit.
test('template-update/AC-8: leerpunt #809: een branch zonder eigen commits achter main krijgt het oordeel van main over die commit', () => {
  const referentieRoot = mainMetOudereMigratie();
  naarTweedeCommit(referentieRoot);
  git(referentieRoot, 'update-ref', 'refs/heads/basis-gelijk', 'HEAD');
  const verwacht = migratieFouten(referentieRoot, 'basis-gelijk', TEMPLATE_REF);
  expect(verwacht).toHaveLength(1);

  const root = mainMetOudereMigratie();
  git(root, 'switch', '-q', '-c', 'achter', 'main~1');

  expect(migratieFouten(root, 'main', TEMPLATE_REF)).toStrictEqual(verwacht);
  expect(volgordeHernoemingen(root, 'main')).toHaveLength(1);
});

test('template-update/AC-8: leerpunt #809: een eerste commit zonder ouder blijft groen als de base verder staat', () => {
  const root = repo();
  leegeCommit(root);
  git(root, 'checkout', '-q', '--detach', 'main~1');

  expect(migratieFouten(root, 'main', TEMPLATE_REF)).toStrictEqual([]);
  expect(volgordeHernoemingen(root, 'main')).toStrictEqual([]);
});
