import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { unsafeCast } from '../../src/core/shared/unsafe-cast.ts';

// template-release/AC-10 (docs/template/specs/template-release.md): `check:docs-drift` waarschuwt in de template, niet in een
// app, als een PR een pad buiten docs/ en test/ wijzigt (geen testbestand, niet gegenereerd) zonder bestand onder
// docs/template-changelog.d/. Nooit een blokkade. De optie is `driftWaarschuwing(paden, { template })`, standaard app-gedrag.
// De module wordt getypeerd geladen: de tweede parameter bestaat nog niet, een aanroep ermee is dan geen typefout maar een
// mislukte assertie.
interface DriftModule {
  driftWaarschuwing: (paden: readonly string[], opties?: { template?: boolean }) => string | null;
  driftVanRepo: (root?: string, base?: string) => string | null;
}
const drift = unsafeCast<DriftModule>(
  await import('../../scripts/kit/check-docs-drift.mjs'),
  'dynamische import; de vorm staat in DriftModule',
);
const SCRIPT = path.join(import.meta.dirname, '../../scripts/kit/check-docs-drift.mjs');

const FRAGMENT =
  'geen changelogfragment in docs/template-changelog.d/; voeg er een toe als een app of gebruiker deze wijziging merkt';
const SRC = ['src/api/routes/notes.ts'];
const SRC_WAARSCHUWING = drift.driftWaarschuwing(SRC);
const TEMPLATE = { template: true };

describe('template-release/AC-10: driftWaarschuwing met { template: true }', () => {
  test('template-release/AC-10: een pad buiten docs/ en test/ zonder fragment geeft de fragmentwaarschuwing', () => {
    expect(drift.driftWaarschuwing(['package.json'], TEMPLATE)).toBe(FRAGMENT);
    expect(drift.driftWaarschuwing(['scripts/kit/template-status.mjs'], TEMPLATE)).toBe(FRAGMENT);
    expect(drift.driftWaarschuwing(['.github/workflows/ci.yml', 'docs/nieuwe-app.md'], TEMPLATE)).toBe(FRAGMENT);
  });

  test('template-release/AC-10: een pad onder docs/template-changelog.d/ dat meewijzigt dempt de waarschuwing', () => {
    expect(drift.driftWaarschuwing(['package.json', 'docs/template-changelog.d/chore-iets.md'], TEMPLATE)).toBeNull();
  });

  test('template-release/AC-10: alleen docs/ of alleen test/ geeft geen fragmentwaarschuwing', () => {
    expect(drift.driftWaarschuwing(['docs/nieuwe-app.md'], TEMPLATE)).toBeNull();
    expect(drift.driftWaarschuwing(['test/scripts/template-status.test.ts'], TEMPLATE)).toBeNull();
    expect(drift.driftWaarschuwing(['docs/nieuwe-app.md', 'test/rails/x.test.ts'], TEMPLATE)).toBeNull();
  });

  test('template-release/AC-10: een testbestand buiten test/ en een gegenereerd bestand tellen niet', () => {
    expect(drift.driftWaarschuwing(['src/core/shared/cursor.test.ts'], TEMPLATE)).toBeNull();
    expect(drift.driftWaarschuwing(['e2e/login.spec.ts'], TEMPLATE)).toBeNull();
    expect(drift.driftWaarschuwing(['src/web/routeTree.gen.ts'], TEMPLATE)).toBeNull();
  });

  test('template-release/AC-10: zonder de optie is het app-gedrag, ook voor een pad dat in de template zou waarschuwen', () => {
    expect(drift.driftWaarschuwing(['package.json'])).toBeNull();
    expect(drift.driftWaarschuwing(['package.json'], { template: false })).toBeNull();
    expect(drift.driftWaarschuwing(['src/api/routes/notes.ts', 'docs/template-changelog.md'])).toBeNull();
  });

  test('template-release/AC-10: de waarschuwing over src/ zonder docs blijft zoals in release-versie/AC-10', () => {
    expect(SRC_WAARSCHUWING).toContain('src/ wijzigt (1 bestand)');
    expect(drift.driftWaarschuwing(SRC, { template: false })).toBe(SRC_WAARSCHUWING);
  });

  test('template-release/AC-10: beide waarschuwingen komen in één string, eerst die over src/, gescheiden door "; "', () => {
    expect(drift.driftWaarschuwing(SRC, TEMPLATE)).toBe(`${SRC_WAARSCHUWING ?? ''}; ${FRAGMENT}`);
  });

  test('template-release/AC-10: de wijzigingenlijst dempt de waarschuwing over src/ maar niet die over het fragment', () => {
    expect(drift.driftWaarschuwing([...SRC, 'docs/template-changelog.md'], TEMPLATE)).toBe(FRAGMENT);
  });

  test('template-release/AC-10: een fragment dempt de waarschuwing over src/ en die over het fragment', () => {
    expect(drift.driftWaarschuwing([...SRC, 'docs/template-changelog.d/een.md'], TEMPLATE)).toBeNull();
  });
});

// --- driftVanRepo en de CLI op fixture-repo's --------------------------------------------------------------------------------

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const GATES_TEMPLATE = JSON.stringify({
  onderhoud: { repository: 'acme/sjabloon' },
  template: { repository: 'acme/sjabloon' },
});
const GATES_APP = JSON.stringify({ template: { repository: 'acme/sjabloon' } });
const GATES_KAPOT = JSON.stringify({ onderhoud: 'kapot' });
const GATES_GEEN_JSON = '{ dit is geen json';

function schrijf(root: string, bestanden: Record<string, string>) {
  for (const [file, content] of Object.entries(bestanden)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
}

function git(root: string, ...args: string[]): void {
  execFileSync('git', args, { cwd: root, stdio: 'ignore' });
}

/**
 * Een repo met `origin/main` op de basiscommit en een tweede commit met de gewijzigde bestanden. `gates` is de tekst van
 * `.claude/gates.json` in beide commits; zonder staat er geen.
 */
function repo(opzet: { gates?: string; wijzig: Record<string, string>; zonderBasis?: boolean }): string {
  const root = mkdtempSync(path.join(tmpdir(), 'check-docs-drift-fragment-'));
  dirs.push(root);
  git(root, 'init', '-q', '-b', 'main');
  schrijf(root, {
    'package.json': '{}\n',
    'src/api/routes/notes.ts': '// begin\n',
    ...(opzet.gates === undefined ? {} : { '.claude/gates.json': opzet.gates }),
  });
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'basis');
  if (opzet.zonderBasis !== true) git(root, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  git(root, 'checkout', '-q', '-b', 'werk');
  schrijf(root, opzet.wijzig);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'wijziging');
  return root;
}

const PACKAGE = { 'package.json': '{ "scripts": {} }\n' };
const NOTES = { 'src/api/routes/notes.ts': '// gewijzigd\n' };

describe('template-release/AC-10: driftVanRepo herkent de template aan onderhoud in .claude/gates.json', () => {
  test('template-release/AC-10: met onderhoud.repository geeft een wijziging buiten docs/ en test/ de fragmentwaarschuwing', () => {
    expect(drift.driftVanRepo(repo({ gates: GATES_TEMPLATE, wijzig: PACKAGE }))).toBe(FRAGMENT);
  });

  test('template-release/AC-10: met een fragment in de wijziging is het stil', () => {
    const root = repo({ gates: GATES_TEMPLATE, wijzig: { ...PACKAGE, 'docs/template-changelog.d/een.md': 'x\n' } });

    expect(drift.driftVanRepo(root)).toBeNull();
  });

  test('template-release/AC-10: dezelfde wijziging in een repo zonder onderhoud (een app) is stil', () => {
    expect(drift.driftVanRepo(repo({ gates: GATES_APP, wijzig: PACKAGE }))).toBeNull();
  });

  test('template-release/AC-10: met "onderhoud": "kapot" is het stil, geen fout en geen waarschuwing', () => {
    expect(drift.driftVanRepo(repo({ gates: GATES_KAPOT, wijzig: PACKAGE }))).toBeNull();
  });

  test('template-release/AC-10: een gates.json die geen JSON is telt stil als een app, ook met een wijziging in src/', () => {
    const geenJson = repo({ gates: GATES_GEEN_JSON, wijzig: PACKAGE });
    const metSrc = repo({ gates: GATES_GEEN_JSON, wijzig: NOTES });

    expect(drift.driftVanRepo(geenJson)).toBeNull();
    expect(drift.driftVanRepo(metSrc)).toBe(SRC_WAARSCHUWING);
  });

  test('template-release/AC-10: zonder .claude/gates.json telt de repo als een app', () => {
    expect(drift.driftVanRepo(repo({ wijzig: PACKAGE }))).toBeNull();
    expect(drift.driftVanRepo(repo({ wijzig: NOTES }))).toBe(SRC_WAARSCHUWING);
  });

  test('template-release/AC-10: in de template geeft een wijziging in src/ zonder docs beide waarschuwingen', () => {
    expect(drift.driftVanRepo(repo({ gates: GATES_TEMPLATE, wijzig: NOTES }))).toBe(
      `${SRC_WAARSCHUWING ?? ''}; ${FRAGMENT}`,
    );
  });

  test('template-release/AC-10: een onleesbare origin/main blijft de bestaande waarschuwing, ook in de template', () => {
    const root = repo({ gates: GATES_TEMPLATE, wijzig: PACKAGE, zonderBasis: true });

    expect(drift.driftVanRepo(root)).toContain('origin/main is niet te lezen');
  });
});

describe('template-release/AC-10: de CLI eindigt altijd met exit 0', () => {
  function cli(root: string): { status: number | null; uit: string } {
    const env = { ...process.env };
    Reflect.deleteProperty(env, 'GITHUB_ACTIONS');
    const resultaat = spawnSync('node', [SCRIPT], { cwd: root, env, encoding: 'utf8' });
    return { status: resultaat.status, uit: `${resultaat.stdout}${resultaat.stderr}` };
  }

  test('template-release/AC-10: in de template meldt de CLI de fragmentwaarschuwing en blijft exit 0', () => {
    const uit = cli(repo({ gates: GATES_TEMPLATE, wijzig: PACKAGE }));

    expect(uit.status, uit.uit).toBe(0);
    expect(uit.uit).toContain(FRAGMENT);
  });

  test('template-release/AC-10: met een ongeldige gates.json meldt de CLI geen fragment en blijft exit 0', () => {
    const uit = cli(repo({ gates: GATES_KAPOT, wijzig: PACKAGE }));

    expect(uit.status, uit.uit).toBe(0);
    expect(uit.uit).not.toContain(FRAGMENT);
    expect(uit.uit).toContain('check:docs-drift');
  });
});
