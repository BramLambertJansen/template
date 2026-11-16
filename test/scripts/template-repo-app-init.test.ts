import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { AppInitError, planAppInit } from '../../scripts/kit/app-init.mjs';
import { ROOT } from '../rails/template-repo-kit';

// Spec template-repo (docs/template/specs/template-repo.md) AC-9: `app:init` leest `template.repository` uit de gates.json van
// de verse kopie, haalt de onderhoud-regel weg als die precies bij die repo hoort, schrijft de herkomstregel van de README met
// die waarde en stopt zonder sleutel. De repo's hier zijn verzonnen; er staat geen letterlijke template in deze test.
const TEMPLATE = 'acme/sjabloon';
const FORK = 'acme/vork-van-sjabloon';
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const FILES: Readonly<Record<string, string>> = {
  'package.json': '{\n  "name": "app-template",\n  "type": "module"\n}\n',
  'README.md':
    '# App-template\n\nFundering voor apps.\n\n## Nieuwe app starten\n\nSetup.\n\n## Lokaal draaien\n\nStart.\n',
  'CHANGELOG.md': '# Changelog\n\n## [Unreleased]\n\n- Template.\n\n## [0.1.0]\n\n- Basis.\n',
  'src/shared/app.ts': "export const APP_NAME = 'App-template';\n",
  'src/web/index.html': '<!doctype html><html lang="nl"><head><title>App-template</title></head></html>\n',
  '.github/CODEOWNERS': '/AGENTS.md                @bramlambertjansen\n',
};

const onderhoudRegel = (repository: string) => `  "onderhoud": { "repository": "${repository}" },\n`;
const templateRegel = (repository: string) => `  "template": { "repository": "${repository}" },\n`;

/**
 * Een gates.json in de vorm van de echte: de template-regel op een eigen plek, niet grenzend aan de onderhoud-regel.
 * `null` laat de regel weg.
 */
function gatesTekst(opties: { template: string | null; onderhoud: string | null }): string {
  return [
    '{\n',
    '  "$comment": "Voorbeeld",\n',
    opties.template === null ? '' : templateRegel(opties.template),
    '  "paden": {\n    "AGENTS.md": { "besluit": "eigenaar" },\n    "src/**": { "besluit": "agent" }\n  },\n',
    opties.onderhoud === null ? '' : onderhoudRegel(opties.onderhoud),
    '  "merge": "niet-kritiek",\n',
    '  "goedkeurders": ["bramlambertjansen"]\n',
    '}\n',
  ].join('');
}

function kopie(gates: string | null): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'template-repo-app-init-'));
  dirs.push(dir);
  const files = gates === null ? FILES : { ...FILES, '.claude/gates.json': gates };
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), content);
  }
  return dir;
}

const options = { slug: 'urenregistratie', name: 'Urenregistratie', sha: 'abc1234' };

function changed(plan: { pad: string; inhoud: string }[], file: string): string {
  const found = plan.find((change) => change.pad === file);
  if (found === undefined) throw new Error(`${file} niet in het plan`);
  return found.inhoud;
}

/** Het plan, of een mislukte assertie met de melding als planAppInit gooit (een test op een plan hoort daar niet op te crashen). */
function planVan(dir: string, opties: Parameters<typeof planAppInit>[1]): { pad: string; inhoud: string }[] {
  try {
    return planAppInit(dir, opties);
  } catch (error) {
    expect(error instanceof Error ? error.message : String(error), 'planAppInit gooit').toBe('');
    return [];
  }
}

const herkomst = (repository: string) => `Gebouwd op [${repository}](https://github.com/${repository}).`;

describe('template-repo/AC-9: planAppInit volgt template.repository', () => {
  test('template-repo/AC-9: de template-regel blijft, de onderhoud-regel met dezelfde repo gaat weg, de rest is byte voor byte gelijk', () => {
    const gates = gatesTekst({ template: TEMPLATE, onderhoud: TEMPLATE });
    const plan = planVan(kopie(gates), options);
    const na = changed(plan, '.claude/gates.json');

    expect(na).toBe(gates.replace(onderhoudRegel(TEMPLATE), ''));
    expect(na).toContain(templateRegel(TEMPLATE));
    expect(JSON.parse(na)).toMatchObject({ template: { repository: TEMPLATE } });
    expect(JSON.parse(na)).not.toHaveProperty('onderhoud');
  });

  test('template-repo/AC-9: de README-regel noemt template.repository', () => {
    const plan = planVan(kopie(gatesTekst({ template: TEMPLATE, onderhoud: TEMPLATE })), options);

    expect(changed(plan, 'README.md').split('\n').slice(0, 3)).toStrictEqual([
      '# Urenregistratie',
      '',
      herkomst(TEMPLATE),
    ]);
  });

  test('template-repo/AC-9: met een andere repo in template (een fork) volgt alles die repo', () => {
    const gates = gatesTekst({ template: FORK, onderhoud: FORK });
    const plan = planVan(kopie(gates), options);
    const na = changed(plan, '.claude/gates.json');

    expect(na).toBe(gates.replace(onderhoudRegel(FORK), ''));
    expect(na).toContain(templateRegel(FORK));
    expect(changed(plan, 'README.md')).toContain(herkomst(FORK));
    expect(changed(plan, 'README.md')).not.toContain(TEMPLATE);
    expect(plan.map((change) => change.inhoud).join('\n')).not.toContain(TEMPLATE);
  });

  test('template-repo/AC-9: een app (alleen template, geen onderhoud) laat gates.json ongemoeid en noemt template.repository in de README', () => {
    const plan = planVan(kopie(gatesTekst({ template: FORK, onderhoud: null })), options);

    expect(plan.map((change) => change.pad)).not.toContain('.claude/gates.json');
    expect(changed(plan, 'README.md')).toContain(herkomst(FORK));
  });

  test('template-repo/AC-9: met --owner blijft de template-regel staan en volgt goedkeurders de handle', () => {
    const plan = planVan(kopie(gatesTekst({ template: FORK, onderhoud: FORK })), {
      ...options,
      owner: 'acme/beheer',
    });
    const na = changed(plan, '.claude/gates.json');

    expect(na).toContain(templateRegel(FORK));
    expect(JSON.parse(na)).toMatchObject({ template: { repository: FORK }, goedkeurders: ['acme/beheer'] });
    expect(JSON.parse(na)).not.toHaveProperty('onderhoud');
  });

  test('template-repo/AC-9: zonder template stopt het met .claude/gates.json: template.repository ontbreekt', () => {
    const dir = kopie(gatesTekst({ template: null, onderhoud: TEMPLATE }));

    expect(() => planAppInit(dir, options)).toThrow(AppInitError);
    expect(() => planAppInit(dir, options)).toThrow('.claude/gates.json: template.repository ontbreekt');
  });

  test('template-repo/AC-9: zonder template én zonder onderhoud stopt het ook, met en zonder --owner', () => {
    const dir = kopie(gatesTekst({ template: null, onderhoud: null }));

    expect(() => planAppInit(dir, options)).toThrow('.claude/gates.json: template.repository ontbreekt');
    expect(() => planAppInit(dir, { ...options, owner: 'acme/beheer' })).toThrow(
      '.claude/gates.json: template.repository ontbreekt',
    );
  });

  test('template-repo/AC-9: een template in een verkeerde vorm stopt het ook', () => {
    const gates = gatesTekst({ template: null, onderhoud: null }).replace(
      '  "paden"',
      '  "template": { "repository": "geen-owner" },\n  "paden"',
    );

    expect(() => planAppInit(kopie(gates), options)).toThrow(/template/);
  });

  test('template-repo/AC-9: een onderhoud-regel voor een andere repo dan template.repository geeft de bestaande fout', () => {
    const dir = kopie(gatesTekst({ template: TEMPLATE, onderhoud: FORK }));

    expect(() => planAppInit(dir, options)).toThrow(/onderhoud-regel/);
  });

  test('template-repo/AC-9: stopt vóór er iets in het plan staat: er verandert niets op schijf', () => {
    const gates = gatesTekst({ template: null, onderhoud: TEMPLATE });
    const dir = kopie(gates);

    expect(() => planAppInit(dir, options)).toThrow();
    expect(readFileSync(path.join(dir, 'package.json'), 'utf8')).toContain('"name": "app-template"');
    expect(readFileSync(path.join(dir, '.claude/gates.json'), 'utf8')).toBe(gates);
  });
});

describe('template-repo/AC-9: de app:init-CLI', () => {
  // Een kopie met de echte scripts (app-init importeert codeowners, padtabel, rolhek en de templateversie) en een remote
  // `template/main`, zodat het script bij de gates.json uitkomt.
  function cli(gates: string, args: string[] = []) {
    const dir = kopie(gates);
    for (const map of ['scripts/kit', 'rails/hooks/lib', 'src/core/shared']) {
      mkdirSync(path.dirname(path.join(dir, map)), { recursive: true });
      cpSync(path.join(ROOT, map), path.join(dir, map), { recursive: true });
    }
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
    execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'add', '-A'], { cwd: dir });
    execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-q', '-m', 'x'], {
      cwd: dir,
    });
    execFileSync('git', ['update-ref', 'refs/remotes/template/main', 'HEAD'], { cwd: dir });
    const result = spawnSync(
      process.execPath,
      ['scripts/kit/app-init.mjs', 'urenregistratie', 'Urenregistratie', ...args],
      {
        cwd: dir,
        encoding: 'utf8',
      },
    );
    return { dir, status: result.status, stdout: result.stdout, stderr: result.stderr };
  }

  test('template-repo/AC-9: zonder template stopt de CLI met de melding en schrijft niets', () => {
    const gates = gatesTekst({ template: null, onderhoud: TEMPLATE });
    const uitslag = cli(gates);

    expect(uitslag.stderr).toContain('✗ app:init: .claude/gates.json: template.repository ontbreekt');
    expect(uitslag.status).toBe(1);
    expect(readFileSync(path.join(uitslag.dir, '.claude/gates.json'), 'utf8')).toBe(gates);
    expect(readFileSync(path.join(uitslag.dir, 'package.json'), 'utf8')).toContain('"name": "app-template"');
  });

  test('template-repo/AC-9: de CLI schrijft voor een fork de herkomstregel en laat template staan', () => {
    const gates = gatesTekst({ template: FORK, onderhoud: FORK });
    const uitslag = cli(gates);

    expect(uitslag.stderr).toBe('');
    expect(uitslag.status).toBe(0);
    expect(readFileSync(path.join(uitslag.dir, 'README.md'), 'utf8')).toContain(herkomst(FORK));
    expect(readFileSync(path.join(uitslag.dir, '.claude/gates.json'), 'utf8')).toBe(
      gates.replace(onderhoudRegel(FORK), ''),
    );
  });
});
