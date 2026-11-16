import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { migratieOordeel } from '../../scripts/kit/check-migrations.mjs';
import { ROOT } from './template-repo-kit';

// Spec template-repo (docs/template/specs/template-repo.md) AC-8: check-migrations leest de URL van de template alleen als
// die echt nodig is (een app, een oudere toegevoegde migratie, geen lokale template-ref), en dan uit
// `git show origin/main:.claude/gates.json`, niet uit de werkmap (die komt van de PR). De CLI draait hier echt tegen een
// fixture-repo; `https://github.com/…` wordt met een git-config naar een lokale repo omgeleid (geen netwerk).
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const BASIS = '20261009000000_baseline.sql';
const NOTES = '20261010120000_notes.sql';
const TUSSEN = '20261009120000_tussen.sql';
const ECHT = 'main/echt';
const LOKAAL = 'werk/lokaal';

const inhoud = (naam: string) => `-- ${naam}\ncreate table t_${naam.slice(0, 14)} ();\n`;

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.test', ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function schrijf(root: string, bestand: string, tekst: string): void {
  mkdirSync(path.dirname(path.join(root, bestand)), { recursive: true });
  writeFileSync(path.join(root, bestand), tekst);
}

function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'template-repo-migrations-'));
  dirs.push(dir);
  return dir;
}

interface Opzet {
  /** `.claude/gates.json` op origin/main (de vertrouwde bron). */
  main: unknown;
  /** `.claude/gates.json` in de werkmap van de PR-branch. */
  werk: unknown;
}

// Een app-repo: main (= refs/remotes/origin/main) met twee migraties, daarna de branch `werk` met een eigen gates.json en een
// oudere migratie (TUSSEN) die ongewijzigd ook in de template staat. Geen refs/remotes/template/main: die moet opgehaald worden.
function appRepo({ main, werk }: Opzet): { root: string; template: string } {
  const root = tempDir();
  git(root, 'init', '-q', '-b', 'main');
  for (const naam of [BASIS, NOTES]) schrijf(root, `db/migrations/${naam}`, inhoud(naam));
  schrijf(root, '.claude/gates.json', JSON.stringify(main));
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'baseline');
  git(root, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  git(root, 'switch', '-q', '-c', 'werk');
  schrijf(root, '.claude/gates.json', JSON.stringify(werk));
  schrijf(root, `db/migrations/${TUSSEN}`, inhoud(TUSSEN));
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'werk: oudere migratie uit de template');
  // De template: main met dezelfde migratie, byte voor byte.
  const template = tempDir();
  git(template, 'init', '-q', '-b', 'main');
  schrijf(template, `db/migrations/${TUSSEN}`, inhoud(TUSSEN));
  git(template, 'add', '-A');
  git(template, 'commit', '-q', '-m', 'template');
  return { root, template };
}

interface Uitslag {
  status: number | null;
  stdout: string;
  stderr: string;
}

function draaiCli(root: string, omleiding: { repo: string; naar: string } | null): Uitslag {
  const gericht: [string, string][] =
    omleiding === null ? [] : [[`https://github.com/${omleiding.repo}.git`, omleiding.naar]];
  // Al het andere op github.com bestaat niet: geen netwerk, een duidelijke fout.
  const omleidingen: [string, string][] = [...gericht, ['https://github.com/', 'file:///bestaat-niet-template-repo-test/']];
  const env: Record<string, string> = {
    ...Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === 'string')),
    GIT_TERMINAL_PROMPT: '0',
    GIT_CONFIG_COUNT: String(omleidingen.length),
  };
  omleidingen.forEach(([van, naar], index) => {
    env[`GIT_CONFIG_KEY_${String(index)}`] = `url.${naar}.insteadOf`;
    env[`GIT_CONFIG_VALUE_${String(index)}`] = van;
  });
  const result = spawnSync(process.execPath, [path.join(ROOT, 'scripts/kit/check-migrations.mjs')], {
    cwd: root,
    encoding: 'utf8',
    env,
    timeout: 60_000,
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

const GROEN = '✓ check:migrations';
const ONTBREEKT = 'template.repository ontbreekt of is ongeldig in origin/main:.claude/gates.json';
const metTemplate = (repository: string) => ({ template: { repository } });

describe('template-repo/AC-8: check-migrations leest de template-URL uit origin/main:.claude/gates.json', () => {
  test('template-repo/AC-8: app, oudere toegevoegde migratie, geen lokale template-ref → de URL komt uit origin/main, ook als de werkmap een andere template.repository heeft', () => {
    const { root, template } = appRepo({ main: metTemplate(ECHT), werk: metTemplate(LOKAAL) });
    const uitslag = draaiCli(root, { repo: ECHT, naar: template });

    expect(uitslag.stderr).toBe('');
    expect(uitslag.stdout).toContain(GROEN);
    expect(uitslag.status).toBe(0);
  });

  test('template-repo/AC-8: een PR die de sleutel uit de werkmap haalt, verandert de bron niet', () => {
    const { root, template } = appRepo({ main: metTemplate(ECHT), werk: { paden: {} } });
    const uitslag = draaiCli(root, { repo: ECHT, naar: template });

    expect(uitslag.stdout).toContain(GROEN);
    expect(uitslag.status).toBe(0);
  });

  test('template-repo/AC-8: de werkmap alleen is geen bron: de URL van de werkmap wordt niet gebruikt', () => {
    // Alleen de werkmap-repo is omgeleid; origin/main wijst naar een repo die niet bestaat, dus de fetch moet falen.
    const { root, template } = appRepo({ main: metTemplate(ECHT), werk: metTemplate(LOKAAL) });
    const uitslag = draaiCli(root, { repo: LOKAAL, naar: template });

    expect(uitslag.stderr).toContain(`https://github.com/${ECHT}.git is niet op te halen`);
    expect(uitslag.status).toBe(1);
  });

  test.each([
    { naam: 'zonder template', main: { paden: {} } },
    { naam: 'met alleen onderhoud', main: { onderhoud: { repository: ECHT } } },
    { naam: 'met template als tekst', main: { template: ECHT } },
    { naam: 'met template zonder owner/repo', main: { template: { repository: 'echt' } } },
    { naam: 'met een extra sleutel in template', main: { template: { repository: ECHT, x: 1 } } },
  ])(
    'template-repo/AC-8: origin/main $naam → rood met de melding, ook als de werkmap een geldige sleutel heeft',
    ({ main }) => {
      const { root, template } = appRepo({ main, werk: metTemplate(ECHT) });
      const uitslag = draaiCli(root, { repo: ECHT, naar: template });

      expect(uitslag.stderr).toContain(ONTBREEKT);
      expect(uitslag.stdout).not.toContain(GROEN);
      expect(uitslag.status).toBe(1);
    },
  );

  test('template-repo/AC-8: origin/main zonder .claude/gates.json → rood met de melding', () => {
    const { root, template } = appRepo({ main: {}, werk: metTemplate(ECHT) });
    git(root, 'switch', '-q', 'main');
    git(root, 'rm', '-q', '.claude/gates.json');
    git(root, 'commit', '-q', '-m', 'gates weg');
    git(root, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
    git(root, 'switch', '-q', 'werk');
    const uitslag = draaiCli(root, { repo: ECHT, naar: template });

    expect(uitslag.stderr).toContain(ONTBREEKT);
    expect(uitslag.status).toBe(1);
  });
});

describe('template-repo/AC-8: de uitzondering voor de template blijft op onderhoud', () => {
  // Een werkmap met alleen `template` (geen onderhoud) is een app: een oudere toegevoegde migratie zonder lokale
  // template-ref is dan "de template is nodig en ontbreekt".
  test('template-repo/AC-8: een app met template maar zonder onderhoud is geen template: templateOntbreekt', () => {
    const { root } = appRepo({ main: metTemplate(ECHT), werk: metTemplate(ECHT) });
    const oordeel = migratieOordeel(root, 'origin/main', 'refs/remotes/template/main');

    expect(oordeel.templateOntbreekt).toBe(true);
    expect(oordeel.fouten.join('\n')).toContain(TUSSEN);
  });

  test('template-repo/AC-8: met onderhoud (de template zelf) is geen template-ref nodig, ook met een template-sleutel', () => {
    const gates = { onderhoud: { repository: ECHT }, template: { repository: ECHT } };
    const { root } = appRepo({ main: gates, werk: gates });
    const oordeel = migratieOordeel(root, 'origin/main', 'refs/remotes/template/main');

    expect(oordeel.templateOntbreekt).toBe(false);
  });

  test('template-repo/AC-8: de template zelf (onderhoud aanwezig) haalt niets op en leest origin/main:gates.json niet', () => {
    // Zelfs zonder template-sleutel op origin/main: onderhoud in de werkmap bepaalt de uitzondering, er is niets op te halen.
    const gates = { onderhoud: { repository: ECHT } };
    const { root } = appRepo({ main: gates, werk: gates });
    const uitslag = draaiCli(root, null);

    expect(uitslag.stderr).not.toContain('template.repository');
    expect(uitslag.stderr).not.toContain('niet op te halen');
  });
});
