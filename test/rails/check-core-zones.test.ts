import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { coreFouten } from '../../scripts/kit/check-core.mjs';

// templateregime/AC-8 (docs/specs/templateregime.md, ADR 0089): check-core bewaakt `src/core` en `docs/template` elk als zone. Een
// app-PR die `docs/template/` buiten een vertrouwde template-merge wijzigt, faalt met de zone in de melding. Ingang blijft
// `coreFouten(root, refs)`. De gevallen voor `src/core` staan in check-core.test.ts; hier dezelfde gevallen voor `docs/template`
// en de combinatie van beide zones. Opzet als check-core.test.ts: `tmpl` speelt template/main, `main` de main van de app, `werk` de PR.
const REFS = { base: 'main', head: 'werk', template: 'tmpl' };
const CORE = 'src/core';
const DOCS = 'docs/template';
const DOCS_BESTAND = `${DOCS}/adr/0001-voorbeeld.md`;
const CORE_BESTAND = `${CORE}/a.ts`;

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
  const root = mkdtempSync(path.join(tmpdir(), 'check-core-zones-'));
  git(root, 'init', '-q', '-b', 'tmpl');
  schrijf(root, CORE_BESTAND, 'export const a = 1;\n');
  schrijf(root, DOCS_BESTAND, '# Voorbeeld\n');
  schrijf(root, 'src/web/app.ts', 'export const app = 1;\n');
  commit(root, 'template');
  git(root, 'switch', '-q', '-c', 'main');
  git(root, 'switch', '-q', '-c', 'werk');
  return root;
}

// De template schuift door met een wijziging in docs/template (en optioneel ook in src/core).
function templateUpdate(root: string, metCore = false): void {
  git(root, 'switch', '-q', 'tmpl');
  schrijf(root, DOCS_BESTAND, '# Voorbeeld, bijgewerkt\n');
  if (metCore) schrijf(root, CORE_BESTAND, 'export const a = 2;\n');
  commit(root, 'template: update');
  git(root, 'switch', '-q', 'werk');
}

describe('templateregime/AC-8 docs/template als zone', () => {
  test('templateregime/AC-8 een app-wijziging buiten beide zones is groen, en een app-wijziging in docs/template faalt met de zone in de melding', () => {
    const root = repo();
    schrijf(root, 'src/web/app.ts', 'export const app = 2;\n');
    commit(root, 'app');
    expect(coreFouten(root, REFS)).toStrictEqual([]);

    schrijf(root, DOCS_BESTAND, '# Voorbeeld, door de app gewijzigd\n');
    commit(root, 'template-document aanpassen');

    const fouten = coreFouten(root, REFS);
    expect(fouten).toHaveLength(1);
    expect(fouten[0]).toContain('docs/template/');
    expect(fouten[0]).toContain('buiten een template-merge');
  });

  test('templateregime/AC-8 een nieuw bestand in docs/template faalt ook', () => {
    const root = repo();
    schrijf(root, `${DOCS}/specs/0002-nieuw.md`, '# Nieuw\n');
    commit(root, 'template-document toevoegen');

    const fouten = coreFouten(root, REFS);
    expect(fouten).toHaveLength(1);
    expect(fouten[0]).toContain('docs/template/');
  });

  test('templateregime/AC-8 docs/template verwijderen faalt', () => {
    const root = repo();
    git(root, 'rm', '-q', '-r', DOCS);
    commit(root, 'template-documenten weg');

    const fouten = coreFouten(root, REFS);
    expect(fouten).toHaveLength(1);
    expect(fouten[0]).toContain('docs/template/');
  });

  test('templateregime/AC-8 een zuivere template-merge die docs/template wijzigt is groen', () => {
    const root = repo();
    templateUpdate(root);
    git(root, 'merge', '-q', '--no-edit', '--no-ff', 'tmpl');

    expect(coreFouten(root, REFS)).toStrictEqual([]);
  });

  test('templateregime/AC-8 een template-merge met een eigen wijziging in docs/template in de merge zelf faalt', () => {
    const root = repo();
    templateUpdate(root);
    git(root, 'merge', '-q', '--no-commit', '--no-ff', 'tmpl');
    schrijf(root, DOCS_BESTAND, '# Voorbeeld, eigen wijziging in de merge\n');
    commit(root, 'merge template met eigen wijziging');

    const fouten = coreFouten(root, REFS);
    expect(fouten).toHaveLength(1);
    expect(fouten[0]).toContain('de merge wijzigt docs/template/ zelf');
  });

  test('templateregime/AC-8 een template-merge plus een losse commit in docs/template faalt op die commit', () => {
    const root = repo();
    templateUpdate(root);
    git(root, 'merge', '-q', '--no-edit', 'tmpl');
    schrijf(root, DOCS_BESTAND, '# Voorbeeld, na de merge\n');
    commit(root, 'template-document na de merge');

    const fouten = coreFouten(root, REFS);
    expect(fouten).toHaveLength(1);
    expect(fouten[0]).toContain('docs/template/');
    expect(fouten[0]).toContain('buiten een template-merge');
  });

  test('templateregime/AC-8 een merge van een andere branch die docs/template wijzigt faalt', () => {
    const root = repo();
    git(root, 'switch', '-q', '-c', 'ander', 'main');
    schrijf(root, DOCS_BESTAND, '# Voorbeeld, op een andere branch\n');
    commit(root, 'template-document op een andere branch');
    git(root, 'switch', '-q', 'werk');
    schrijf(root, 'src/web/app.ts', 'export const app = 3;\n');
    commit(root, 'app');
    git(root, 'merge', '-q', '--no-edit', 'ander');

    const fouten = coreFouten(root, REFS);
    expect(
      fouten.some((fout) => fout.includes('niet in template/main of main staat') && fout.includes('docs/template/')),
    ).toBe(true);
  });

  test('templateregime/AC-8 een merge van main die een eerdere template-merge meebrengt is groen', () => {
    const root = repo();
    schrijf(root, 'src/web/app.ts', 'export const app = 4;\n');
    commit(root, 'app');
    templateUpdate(root);
    git(root, 'switch', '-q', 'main');
    git(root, 'merge', '-q', '--no-edit', 'tmpl');
    git(root, 'switch', '-q', 'werk');
    git(root, 'merge', '-q', '--no-edit', 'main');

    expect(coreFouten(root, REFS)).toStrictEqual([]);
  });

  test('templateregime/AC-8 een octopus-merge die docs/template wijzigt faalt', () => {
    const root = repo();
    templateUpdate(root);
    git(root, 'switch', '-q', '-c', 'derde', 'main');
    schrijf(root, 'src/web/derde.ts', 'export const d = 1;\n');
    commit(root, 'derde');
    git(root, 'switch', '-q', 'werk');
    schrijf(root, 'src/web/app.ts', 'export const app = 6;\n');
    commit(root, 'app');
    git(root, 'merge', '-q', '--no-edit', 'tmpl', 'derde');

    const fouten = coreFouten(root, REFS);
    expect(fouten.some((fout) => fout.includes('buiten een template-merge') && fout.includes('docs/template/'))).toBe(
      true,
    );
  });
});

describe('templateregime/AC-8 beide zones naast elkaar', () => {
  test('templateregime/AC-8 een zuivere template-merge die beide zones wijzigt is groen', () => {
    const root = repo();
    templateUpdate(root, true);
    git(root, 'merge', '-q', '--no-edit', '--no-ff', 'tmpl');

    expect(coreFouten(root, REFS)).toStrictEqual([]);
  });

  test('templateregime/AC-8 een commit die beide zones wijzigt noemt beide zones, een commit in één zone alleen die zone', () => {
    const root = repo();
    schrijf(root, CORE_BESTAND, 'export const a = 9;\n');
    commit(root, 'alleen core');
    const alleenCore = coreFouten(root, REFS).join('\n');

    schrijf(root, DOCS_BESTAND, '# Voorbeeld, alleen docs\n');
    commit(root, 'alleen docs');
    const beide = coreFouten(root, REFS).join('\n');

    expect(alleenCore).toContain('src/core/');
    expect(alleenCore).not.toContain('docs/template');
    expect(beide).toContain('src/core/');
    expect(beide).toContain('docs/template/');
  });

  test('templateregime/AC-8 een merge die in docs/template een eigen wijziging maakt terwijl src/core zuiver uit de template komt, faalt alleen op docs/template', () => {
    const root = repo();
    templateUpdate(root, true);
    git(root, 'merge', '-q', '--no-commit', '--no-ff', 'tmpl');
    schrijf(root, DOCS_BESTAND, '# Voorbeeld, eigen wijziging in de merge\n');
    commit(root, 'merge template met eigen wijziging in docs/template');

    const fouten = coreFouten(root, REFS);
    expect(fouten).toHaveLength(1);
    expect(fouten[0]).toContain('de merge wijzigt docs/template/ zelf');
    expect(fouten[0]).not.toContain('src/core');
  });
});
