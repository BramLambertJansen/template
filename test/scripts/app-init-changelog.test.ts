import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { planAppInit } from '../../scripts/kit/app-init.mjs';
import { TEMPLATE_VERSION } from '../../src/core/shared/template-version.ts';

// Spec release-versie (docs/template/specs/release-versie.md), AC-4 en AC-5: app:init schrijft CHANGELOG.md van de app
// opnieuw met de templateversie en -commit, laat docs/template-changelog.md ongemoeid, en stopt met een melding die het
// bestand noemt als src/core/shared/template-version.ts ontbreekt. Het script importeert de versie uit het bronbestand
// naast zichzelf; planAppInit leest in de app-map geen versiebestand en geen wijzigingenlijst van de template, en werkt
// daardoor ook op de invoer van een oudere template.
const ROOT = path.join(import.meta.dirname, '../..');
const VERSION_FILE = 'src/core/shared/template-version.ts';
const TEMPLATE_CHANGELOG = '# Wijzigingen van de template\n\n## [Unreleased]\n\n## [0.1.0] - 2026-11-15\n\n- Basis.\n';
const FILES: Readonly<Record<string, string>> = {
  'package.json': '{\n  "name": "app-template",\n  "type": "module"\n}\n',
  'README.md':
    '# App-template\n\nFundering voor apps.\n\n## Nieuwe app starten\n\nSetup.\n\n## Lokaal draaien\n\nStart.\n',
  'CHANGELOG.md': '# Changelog\n\nDe wijzigingen van de template staan in docs/template-changelog.md.\n',
  'docs/template-changelog.md': TEMPLATE_CHANGELOG,
  'src/shared/app.ts': "export const APP_NAME = 'App-template';\n",
  'src/web/index.html': '<!doctype html><html lang="nl"><head><title>App-template</title></head></html>\n',
  // GEWIJZIGD (spec template-repo, AC-9): `app:init` leest `template.repository` uit gates.json en stopt zonder.
  '.claude/gates.json': '{\n  "template": { "repository": "BramLambertJansen/template" }\n}\n',
};
// De modules die het script als CLI nodig heeft, zonder het versiebestand.
const MODULES = ['scripts/kit/app-init.mjs', 'scripts/kit/codeowners.mjs', 'rails/hooks/lib/padtabel.mjs'];
const options = { slug: 'urenregistratie', name: 'Urenregistratie', sha: 'abc1234' };
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function copy(files: Readonly<Record<string, string>> = FILES): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'app-init-changelog-'));
  dirs.push(dir);
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), content);
  }
  return dir;
}

function changelogOf(plan: { pad: string; inhoud: string }[]): string {
  const found = plan.find((change) => change.pad === 'CHANGELOG.md');
  if (found === undefined) throw new Error('CHANGELOG.md niet in het plan');
  return found.inhoud;
}

function git(cwd: string, args: string[]): string {
  return execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.test', ...args], {
    cwd,
    encoding: 'utf8',
  }).trim();
}

// Een gekoppelde app-repo vlak voor app:init: de template-invoer, het script zelf en de ref template/main.
function repo(modules: readonly string[]): string {
  const dir = copy();
  for (const file of modules) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    cpSync(path.join(ROOT, file), path.join(dir, file));
  }
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'template']);
  git(dir, ['update-ref', 'refs/remotes/template/main', 'HEAD']);
  return dir;
}

function cli(dir: string) {
  return spawnSync(process.execPath, ['scripts/kit/app-init.mjs', 'urenregistratie', 'Urenregistratie'], {
    cwd: dir,
    encoding: 'utf8',
    timeout: 30_000,
  });
}

test('release-versie/AC-4: het plan schrijft CHANGELOG.md opnieuw met [Unreleased] en de startregel met versie en SHA', () => {
  const plan = planAppInit(copy(), options);

  expect(changelogOf(plan)).toBe(
    `# Changelog\n\n## [Unreleased]\n\n- Gestart vanaf template v${TEMPLATE_VERSION} (abc1234).\n`,
  );
});

test('release-versie/AC-4: de regels van de template verdwijnen uit CHANGELOG.md van de app', () => {
  const oud = '# Changelog\n\n## [Unreleased]\n\n- Template-regel.\n\n## [0.0.9] - 2026-01-01\n\n- Oude regel.\n';
  const changelog = changelogOf(planAppInit(copy({ ...FILES, 'CHANGELOG.md': oud }), options));

  expect(changelog).not.toContain('Template-regel');
  expect(changelog).not.toContain('Oude regel');
  expect(changelog.split('\n').filter((line) => line.startsWith('- '))).toStrictEqual([
    `- Gestart vanaf template v${TEMPLATE_VERSION} (abc1234).`,
  ]);
});

test('release-versie/AC-4: docs/template-changelog.md staat niet in het plan', () => {
  const paden = planAppInit(copy(), options).map((change) => change.pad);

  expect(paden).toStrictEqual(['package.json', 'README.md', 'CHANGELOG.md', 'src/shared/app.ts', 'src/web/index.html']);
  expect(paden).not.toContain('docs/template-changelog.md');
});

test('release-versie/AC-4: de versie komt uit het bronbestand naast het script, niet uit de app-map', () => {
  const dir = copy({ ...FILES, [VERSION_FILE]: "export const TEMPLATE_VERSION = '9.9.9';\n" });

  const changelog = changelogOf(planAppInit(dir, options));

  expect(changelog).toContain(`template v${TEMPLATE_VERSION} (abc1234)`);
  expect(changelog).not.toContain('9.9.9');
});

test('release-versie/AC-5: de invoer van een oudere template (zonder versiebestand en zonder template-changelog) werkt', () => {
  const oud: Record<string, string> = {
    ...FILES,
    'CHANGELOG.md': '# Changelog\n\nUitleg.\n\n## [Unreleased]\n\n### Gewijzigd\n\n- Een regel van de oude template.\n',
  };
  delete oud['docs/template-changelog.md'];
  const dir = copy(oud);

  const plan = planAppInit(dir, options);

  expect(plan.map((change) => change.pad)).toContain('CHANGELOG.md');
  expect(changelogOf(plan)).toContain(`- Gestart vanaf template v${TEMPLATE_VERSION} (abc1234).`);
  expect(changelogOf(plan)).not.toContain('oude template');
});

test('release-versie/AC-4: als CLI schrijft app:init de startregel en blijft docs/template-changelog.md gelijk', () => {
  const dir = repo([...MODULES, VERSION_FILE]);
  const sha = git(dir, ['rev-parse', '--short', 'template/main']);

  const result = cli(dir);

  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  expect(readFileSync(path.join(dir, 'CHANGELOG.md'), 'utf8')).toBe(
    `# Changelog\n\n## [Unreleased]\n\n- Gestart vanaf template v${TEMPLATE_VERSION} (${sha}).\n`,
  );
  expect(readFileSync(path.join(dir, 'docs/template-changelog.md'), 'utf8')).toBe(TEMPLATE_CHANGELOG);
  expect(git(dir, ['status', '--porcelain', '--', 'docs'])).toBe('');
  expect(readFileSync(path.join(dir, 'package.json'), 'utf8')).toContain('"name": "urenregistratie"');
});

test('release-versie/AC-4: zonder src/core/shared/template-version.ts stopt de CLI met een melding die het bestand noemt', () => {
  const dir = repo(MODULES);

  const result = cli(dir);

  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(1);
  expect(result.stderr).toContain(VERSION_FILE);
  expect(result.stdout).toBe('');
  expect(git(dir, ['status', '--porcelain'])).toBe('');
});
