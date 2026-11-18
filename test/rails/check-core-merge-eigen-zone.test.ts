import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { coreFouten } from '../../scripts/kit/check-core.mjs';

// check-core: een template-merge waarin de app voor een zone haar EIGEN versie houdt (de zone blijft gelijk aan de
// eerste ouder en wijkt af van de template) is rood. Elk scenario draait voor beide zones.
// De branch `tmpl` speelt template/main, `main` de main van de app en `werk` de PR-branch.
const REFS = { base: 'main', head: 'werk', template: 'tmpl' };
const ZONES = [
  ['src/core', 'src/core/a.ts', 'core'],
  ['docs/template', 'docs/template/a.md', 'templatedocumentatie'],
] as const;

function oudereMelding(zone: string, naam: string): RegExp {
  return new RegExp(
    `^[0-9a-f]{12}: de merge kiest een oudere ${naam} \\(${zone}/\\) dan een reeds geïmporteerde templateversie$`,
  );
}

function git(root: string, ...args: string[]): void {
  execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.test', ...args], {
    cwd: root,
    stdio: 'ignore',
  });
}

function schrijf(root: string, pad: string, inhoud: string): void {
  mkdirSync(path.dirname(path.join(root, pad)), { recursive: true });
  writeFileSync(path.join(root, pad), inhoud);
}

function commit(root: string, bericht: string): void {
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', bericht);
}

function repo(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'check-core-eigen-'));
  git(root, 'init', '-q', '-b', 'tmpl');
  schrijf(root, 'src/core/a.ts', 'export const a = 1;\n');
  schrijf(root, 'docs/template/a.md', 'versie 1\n');
  schrijf(root, 'src/web/app.ts', 'export const app = 1;\n');
  commit(root, 'template');
  git(root, 'switch', '-q', '-c', 'main');
  return root;
}

// De template schuift door met een wijziging in het zonebestand.
function templateUpdate(root: string, bestand: string): void {
  git(root, 'switch', '-q', 'tmpl');
  schrijf(root, bestand, 'template: versie 2\n');
  commit(root, 'template: zone-update');
}

// De app houdt in de merge haar eigen zone: `-s ours` neemt de hele tree van de eerste ouder.
function mergeEigenZone(root: string): void {
  git(root, 'merge', '-q', '--no-edit', '--no-ff', '-s', 'ours', 'tmpl');
}

test.each(ZONES)(
  '(a) %s: de app had al een afwijking en houdt die in een template-merge: check-core meldt een fout',
  (zone, bestand, naam) => {
    const root = repo();
    // Voor de merge staat de afwijking al op main (bijvoorbeeld een eerdere, eigenaar-gemergede wijziging).
    schrijf(root, bestand, 'app: eigen versie\n');
    commit(root, 'eigen afwijking op main');
    git(root, 'switch', '-q', '-c', 'werk');
    schrijf(root, 'src/web/app.ts', 'export const app = 2;\n');
    commit(root, 'app');
    templateUpdate(root, bestand);
    git(root, 'switch', '-q', 'werk');
    mergeEigenZone(root);

    const fouten = coreFouten(root, REFS);
    expect(fouten).toHaveLength(1);
    expect(fouten[0]).toMatch(oudereMelding(zone, naam));
  },
);

test.each(ZONES)(
  '(b) %s: de app had geen afwijking en kiest in de merge de oude stand terwijl de template vooruit liep: check-core meldt een fout',
  (zone, bestand, naam) => {
    const root = repo();
    git(root, 'switch', '-q', '-c', 'werk');
    schrijf(root, 'src/web/app.ts', 'export const app = 2;\n');
    commit(root, 'app');
    templateUpdate(root, bestand);
    git(root, 'switch', '-q', 'werk');
    mergeEigenZone(root);

    const fouten = coreFouten(root, REFS);
    expect(fouten).toHaveLength(1);
    expect(fouten[0]).toMatch(oudereMelding(zone, naam));
  },
);
