import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { coreFouten } from '../../scripts/kit/check-core.mjs';

// Procedure "Een template-update binnenhalen" (docs/nieuwe-app.md, spec template-update), herstelstap voor `src/core/` en
// `docs/template/`: wijkt een app daar af van de template, dan zet de procedure ze terug TIJDENS de conflictoplossing, vóór de
// merge-commit (of met `git commit --amend` op de merge-commit). Een losse herstelcommit NA de merge is een gewone commit met
// één ouder die de zones wijzigt, en die weigert check-core (`buiten een template-merge`).
// Opzet: een echte templaterepo en een app-kloon met remote `template`; de app wijkt op main af in beide zones (conflict
// met de template), de template schuift door. `main` is de base van de PR, `template/main` de template, de branch de PR.
const REFS = { base: 'main', head: 'chore/template-update', template: 'template/main' };
const CORE = 'src/core/a.ts';
const DOCS = 'docs/template/adr/0001-voorbeeld.md';
const ZONES = 'src/core docs/template'.split(' ');

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function gitRuw(root: string, ...args: string[]) {
  return spawnSync(
    'git',
    ['-c', 'user.name=Test', '-c', 'user.email=test@example.test', '-c', 'commit.gpgsign=false', ...args],
    { cwd: root, encoding: 'utf8' },
  );
}

function git(root: string, ...args: string[]): string {
  const result = gitRuw(root, ...args);
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} faalde: ${result.stderr}`);
  return result.stdout.trim();
}

function schrijf(root: string, pad: string, inhoud: string): void {
  mkdirSync(path.dirname(path.join(root, pad)), { recursive: true });
  writeFileSync(path.join(root, pad), inhoud);
}

function commit(root: string, bericht: string): void {
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', bericht);
}

/** De app op de branch van de update: main wijkt af in beide zones, template/main schuift door met dezelfde bestanden. */
function opzet(): string {
  const basis = mkdtempSync(path.join(tmpdir(), 'update-herstel-'));
  dirs.push(basis);
  const sjabloon = path.join(basis, 'template');
  mkdirSync(sjabloon);
  git(sjabloon, 'init', '-q', '-b', 'main');
  schrijf(sjabloon, CORE, 'export const a = 1;\n');
  schrijf(sjabloon, DOCS, '# Voorbeeld\n');
  schrijf(sjabloon, 'src/web/app.ts', 'export const app = 1;\n');
  commit(sjabloon, 'template v1');
  const app = path.join(basis, 'app');
  execFileSync('git', ['clone', '-q', sjabloon, app]);
  git(app, 'remote', 'add', 'template', sjabloon);
  schrijf(app, CORE, 'export const a = "eigen";\n');
  schrijf(app, DOCS, '# Voorbeeld, eigen versie\n');
  schrijf(app, 'src/web/app.ts', 'export const app = 2;\n');
  commit(app, 'app: eigen wijzigingen');
  schrijf(sjabloon, CORE, 'export const a = 2;\n');
  schrijf(sjabloon, 'src/core/b.ts', 'export const b = 1;\n');
  schrijf(sjabloon, DOCS, '# Voorbeeld, bijgewerkt\n');
  commit(sjabloon, 'template v2');
  git(app, 'fetch', '-q', 'template');
  git(app, 'switch', '-q', '-c', 'chore/template-update', 'main');
  return app;
}

/** Stap 2 van de procedure: `git merge template/main`; de zones botsen, dus de merge staat open met conflicten. */
function mergeMetConflict(app: string): void {
  const merge = gitRuw(app, 'merge', 'template/main');
  expect(merge.status, 'de merge hoort te stoppen op conflicten in beide zones').not.toBe(0);
  expect(git(app, 'diff', '--name-only', '--diff-filter=U').split('\n').sort()).toStrictEqual([DOCS, CORE]);
}

/** De herstelstap van stap 3: de zones uit `template/main`. */
function zetZonesTerug(app: string): void {
  git(app, 'checkout', 'template/main', '--', ...ZONES);
}

/** Een merge-commit waarin de app zijn eigen zones behoudt: de toestand waarin de herstelstap nog moet volgen. */
function mergeMetEigenZones(app: string): void {
  mergeMetConflict(app);
  git(app, 'checkout', '--ours', '--', ...ZONES);
  git(app, 'add', '--', ...ZONES);
  git(app, 'commit', '-q', '--no-edit');
}

function ouders(app: string): string[] {
  return git(app, 'rev-list', '--parents', '-n', '1', 'HEAD').split(' ').slice(1);
}

function zoneGelijk(app: string, zone: string): boolean {
  return git(app, 'rev-parse', `HEAD:${zone}`) === git(app, 'rev-parse', `template/main:${zone}`);
}

describe('update-herstel/check-core: zones terugzetten bij een template-update', () => {
  test('update-herstel/AC-1: terugzetten tijdens de conflictoplossing, vóór de merge-commit, is groen', () => {
    const app = opzet();
    mergeMetConflict(app);
    zetZonesTerug(app);
    git(app, 'commit', '-q', '--no-edit');

    expect(ouders(app), 'een echte merge-commit met twee ouders').toHaveLength(2);
    expect(zoneGelijk(app, 'src/core') && zoneGelijk(app, 'docs/template')).toBe(true);
    expect(coreFouten(app, REFS)).toStrictEqual([]);
  });

  test('update-herstel/AC-1: terugzetten met git commit --amend op de merge-commit is groen', () => {
    const app = opzet();
    mergeMetEigenZones(app);
    zetZonesTerug(app);
    git(app, 'commit', '-q', '--amend', '--no-edit');

    expect(ouders(app), 'het amenden laat de merge twee ouders houden').toHaveLength(2);
    expect(zoneGelijk(app, 'src/core') && zoneGelijk(app, 'docs/template')).toBe(true);
    expect(coreFouten(app, REFS)).toStrictEqual([]);
  });

  test('update-herstel/AC-1: de eigen wijzigingen van de app buiten de zones blijven na het terugzetten staan', () => {
    const app = opzet();
    mergeMetConflict(app);
    zetZonesTerug(app);
    git(app, 'commit', '-q', '--no-edit');

    expect(git(app, 'show', 'HEAD:src/web/app.ts')).toBe('export const app = 2;');
    expect(git(app, 'show', 'HEAD:src/core/b.ts')).toBe('export const b = 1;');
  });

  test('update-herstel/AC-2: een losse herstelcommit na de merge is rood, op de herstelcommit zelf (beide zones)', () => {
    const app = opzet();
    mergeMetEigenZones(app);
    zetZonesTerug(app);
    git(app, 'commit', '-q', '-m', 'fix: core en docs/template terugzetten');

    expect(ouders(app), 'de herstelcommit is een gewone commit met één ouder').toHaveLength(1);
    const kort = git(app, 'rev-parse', '--short=12', 'HEAD');
    const fouten = coreFouten(app, REFS).filter((fout) => fout.startsWith(kort));

    expect(fouten).toHaveLength(2);
    expect(fouten.some((fout) => fout.includes('wijzigt src/core/ buiten een template-merge'))).toBe(true);
    expect(fouten.some((fout) => fout.includes('wijzigt docs/template/ buiten een template-merge'))).toBe(true);
  });

  test('update-herstel/AC-2: ook de merge-commit met eigen zones is zonder herstel rood (de reden voor de herstelstap)', () => {
    const app = opzet();
    mergeMetEigenZones(app);

    const fouten = coreFouten(app, REFS);

    // Alleen src/core: daar voegt de merge b.ts van de template toe aan de eigen versie. docs/template blijft in de merge gelijk
    // aan de eerste ouder en wordt door check-core niet als "eigen wijziging in de merge" gezien.
    expect(fouten.some((fout) => fout.includes('de merge wijzigt src/core/ zelf'))).toBe(true);
  });
});
