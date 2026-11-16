import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import * as checkCore from '../../scripts/kit/check-core.mjs';
import { exported, probeer, ROOT } from '../rails/template-repo-kit';
import { expectAbsent } from '../support/absence';

// Spec template-repo (docs/template/specs/template-repo.md) AC-7: check-core haalt de template op van
// `https://github.com/<template.repository>.git`, uit de `gates.json` die het script zelf leest, en blijft in de template
// (onderhoud gelijk aan REPO) uit. `templateUrl` is de pure functie; de CLI draait hier echt, in een kopie van de scripts met
// een eigen gates.json en een git-config die `https://github.com/…` naar een lokale repo omleidt (geen netwerk).
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const FORK = 'acme/vork';
const ANDER = 'acme/andere';

describe('template-repo/AC-7: templateUrl(gatesJson)', () => {
  const templateUrl = (gates: string) => probeer(() => exported(checkCore, 'templateUrl')(gates));

  test('template-repo/AC-7: geeft https://github.com/<template.repository>.git', () => {
    expect(templateUrl(JSON.stringify({ template: { repository: FORK } }))).toStrictEqual({
      waarde: `https://github.com/${FORK}.git`,
    });
  });

  test('template-repo/AC-7: een fork krijgt zijn eigen URL, ook naast een onderhoud-regel', () => {
    const gates = JSON.stringify({
      onderhoud: { repository: 'acme/sjabloon' },
      template: { repository: 'acme/sjabloon' },
    });

    expect(templateUrl(gates)).toStrictEqual({ waarde: 'https://github.com/acme/sjabloon.git' });
  });

  test('template-repo/AC-7: onderhoud alleen is geen bron voor de URL', () => {
    expect(templateUrl(JSON.stringify({ onderhoud: { repository: FORK } })).fout).toMatch(/template/);
  });

  test.each([
    { naam: 'zonder template', gates: '{}' },
    { naam: 'template als tekst', gates: JSON.stringify({ template: FORK }) },
    { naam: 'template zonder repository', gates: JSON.stringify({ template: {} }) },
    { naam: 'repository zonder owner', gates: JSON.stringify({ template: { repository: 'vork' } }) },
    { naam: 'repository geen tekst', gates: JSON.stringify({ template: { repository: 3 } }) },
    { naam: 'template met extra sleutel', gates: JSON.stringify({ template: { repository: FORK, x: 1 } }) },
    { naam: 'geen JSON', gates: '{ kapot' },
  ])('template-repo/AC-7: $naam gooit', ({ gates }) => {
    const uitkomst = templateUrl(gates);

    expect(uitkomst.fout, 'templateUrl hoort te gooien').toEqual(expect.any(String));
    expect(uitkomst).not.toHaveProperty('waarde');
  });
});

describe('template-repo/AC-7: isTemplateRepo blijft op onderhoud', () => {
  const isTemplateRepo = (gates: unknown, repository: string) =>
    exported(checkCore, 'isTemplateRepo')(JSON.stringify(gates), repository);

  test('template-repo/AC-7: onderhoud gelijk aan REPO → uit, ook zonder geldige template-sleutel', () => {
    expect(isTemplateRepo({ onderhoud: { repository: 'acme/sjabloon' } }, 'acme/sjabloon')).toBe(true);
    expect(isTemplateRepo({ onderhoud: { repository: 'acme/sjabloon' }, template: 'kapot' }, 'acme/sjabloon')).toBe(
      true,
    );
  });

  test('template-repo/AC-7: een app met template maar zonder onderhoud is geen template (de check blijft aan)', () => {
    expect(isTemplateRepo({ template: { repository: 'acme/sjabloon' } }, 'acme/sjabloon')).toBe(false);
  });
});

// De CLI ---------------------------------------------------------------------------------------------------------------

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.test', ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

interface Opzet {
  gates: unknown;
  /** De repo's waarvan `https://github.com/<repo>.git` naar de lokale template-repo wijst. */
  omgeleid?: string[];
}

interface Uitslag {
  status: number | null;
  stdout: string;
  stderr: string;
}

// Een app-repo met een kopie van scripts/kit en rails/hooks/lib (de guard draait de scripts van main), een eigen gates.json en
// de refs die guard.yml zet (refs/guard/base en refs/guard/head, hier gelijk). De "template" is een bare kloon met branch main.
function draaiCheckCore({ gates, omgeleid = [] }: Opzet, repo = 'acme/app'): Uitslag {
  const root = mkdtempSync(path.join(tmpdir(), 'template-repo-check-core-'));
  dirs.push(root);
  for (const map of ['scripts/kit', 'rails/hooks/lib']) {
    mkdirSync(path.dirname(path.join(root, map)), { recursive: true });
    cpSync(path.join(ROOT, map), path.join(root, map), { recursive: true });
  }
  mkdirSync(path.join(root, '.claude'), { recursive: true });
  writeFileSync(path.join(root, '.claude/gates.json'), JSON.stringify(gates));
  mkdirSync(path.join(root, 'src/core'), { recursive: true });
  writeFileSync(path.join(root, 'src/core/a.ts'), 'export const a = 1;\n');
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'template');
  git(root, 'update-ref', 'refs/guard/base', 'HEAD');
  git(root, 'update-ref', 'refs/guard/head', 'HEAD');
  const bare = `${root}-sjabloon.git`;
  dirs.push(bare);
  git(root, 'clone', '-q', '--bare', root, bare);
  const omleidingen: [string, string][] = [
    ...omgeleid.map((naam): [string, string] => [`https://github.com/${naam}.git`, bare]),
    // Al het andere op github.com bestaat niet: geen netwerk, een duidelijke fout.
    ['https://github.com/', 'file:///bestaat-niet-template-repo-test/'],
  ];
  const env: Record<string, string> = {
    ...Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === 'string')),
    REPO: repo,
    GIT_TERMINAL_PROMPT: '0',
    GIT_CONFIG_COUNT: String(omleidingen.length),
  };
  omleidingen.forEach(([van, naar], index) => {
    env[`GIT_CONFIG_KEY_${String(index)}`] = `url.${naar}.insteadOf`;
    env[`GIT_CONFIG_VALUE_${String(index)}`] = van;
  });
  delete env['GITHUB_STEP_SUMMARY'];
  const result = spawnSync(process.execPath, ['scripts/kit/check-core.mjs'], {
    cwd: root,
    encoding: 'utf8',
    env,
    timeout: 60_000,
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

const ONTBREEKT = '✗ check-core: template.repository ontbreekt of is ongeldig in .claude/gates.json';
const ANNOTATIE = '::error title=check-core::template.repository ontbreekt of is ongeldig';

describe('template-repo/AC-7: de check-core-CLI', () => {
  test('template-repo/AC-7: een app haalt de template op van de URL uit template.repository en is groen', () => {
    const uitslag = draaiCheckCore({ gates: { template: { repository: FORK } }, omgeleid: [FORK] });

    expect(uitslag.stdout).toContain('✓ check-core');
    expect(uitslag.status).toBe(0);
  });

  test('template-repo/AC-7: een andere template.repository is een andere URL (een niet bereikbare is rood)', () => {
    const uitslag = draaiCheckCore({ gates: { template: { repository: ANDER } }, omgeleid: [FORK] });

    expect(uitslag.stdout).toContain(`https://github.com/${ANDER}.git is niet op te halen`);
    expect(uitslag.status).toBe(1);
  });

  test.each([
    { naam: 'zonder template', gates: { paden: {} } },
    {
      naam: 'met alleen een onderhoud-regel voor een andere repo',
      gates: { onderhoud: { repository: 'acme/sjabloon' } },
    },
    { naam: 'met template als tekst', gates: { template: FORK } },
    { naam: 'met template zonder owner/repo', gates: { template: { repository: 'vork' } } },
    { naam: 'met een extra sleutel in template', gates: { template: { repository: FORK, extra: true } } },
  ])('template-repo/AC-7: een app $naam is rood met melding en annotatie, zonder iets op te halen', ({ gates }) => {
    const uitslag = draaiCheckCore({ gates, omgeleid: [FORK] });

    expect(uitslag.stdout).toContain(ONTBREEKT);
    expect(uitslag.stdout).toContain(ANNOTATIE);
    expect(uitslag.stdout).not.toContain('niet op te halen');
    expect(uitslag.status).toBe(1);
  });

  test('template-repo/AC-7: in de template (onderhoud gelijk aan REPO) blijft hij uit, ook zonder template-sleutel', () => {
    const uitslag = draaiCheckCore({ gates: { onderhoud: { repository: 'acme/sjabloon' } } }, 'acme/sjabloon');

    expect(uitslag.stdout).toMatch(/check-core: uit in de template/);
    expect(uitslag.stdout).not.toContain('✗');
    expect(uitslag.status).toBe(0);
  });

  test('template-repo/AC-7: in de template blijft hij uit, ook met een ongeldige template-sleutel', () => {
    const uitslag = draaiCheckCore(
      { gates: { onderhoud: { repository: 'acme/sjabloon' }, template: 'kapot' } },
      'acme/sjabloon',
    );

    expect(uitslag.stdout).toMatch(/check-core: uit in de template/);
    expect(uitslag.status).toBe(0);
  });

  test('template-repo/AC-7: een app met template maar zonder onderhoud staat niet uit (REPO gelijk aan template.repository)', () => {
    const uitslag = draaiCheckCore({ gates: { template: { repository: FORK } }, omgeleid: [FORK] }, FORK);

    expectAbsent(uitslag.stdout, /uit in de template/, {
      recognizes: ['check-core: uit in de template zelf (onderhoud.repository, ADR 0040)', 'uit in de template'],
      allows: ['✓ check-core: src/core/ en docs/template/ alleen gewijzigd via template-merges'],
    });
    expect(uitslag.stdout).toContain('✓ check-core');
    expect(uitslag.status).toBe(0);
  });
});
