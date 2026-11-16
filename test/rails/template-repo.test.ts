import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import * as functionalUi from '../../rails/hooks/lib/functional-ui.mjs';
import * as rolhek from '../../rails/hooks/lib/rolhek.mjs';
import { docsViolations } from '../../scripts/kit/check-docs.mjs';
import { expectAbsent } from '../support/absence';
import {
  appGates,
  echteGates,
  echteTemplateRepository,
  exported,
  gatesMet,
  probeer,
  prop,
  ROOT,
  templateRepositoryVan,
} from './template-repo-kit';

// Spec template-repo (docs/template/specs/template-repo.md): welke repository de template is, staat op één plek in
// `.claude/gates.json` (`template.repository`). Hier AC-1 (templateVan en loadConfig), AC-2 (check-docs), AC-6 (de vervallen
// functionalUiReason) en AC-10 (geen letterlijke template-repo meer in rails/ en scripts/). De rest staat in
// test/hooks/template-repo-rolhek.test.ts (AC-3 t/m AC-5), test/scripts/template-repo-check-core.test.ts (AC-7),
// test/rails/template-repo-check-migrations.test.ts (AC-8) en test/scripts/template-repo-app-init.test.ts (AC-9).
const { loadConfig } = rolhek;

// AC-1 ---------------------------------------------------------------------------------------------------------------

describe('template-repo/AC-1: templateVan', () => {
  test('template-repo/AC-1: ontbrekend geeft undefined', () => {
    expect(probeer(() => exported(rolhek, 'templateVan')(undefined))).toStrictEqual({ waarde: undefined });
  });

  test('template-repo/AC-1: { repository: "a/b" } geeft { repository: "a/b" }', () => {
    expect(probeer(() => exported(rolhek, 'templateVan')({ repository: 'a/b' }))).toStrictEqual({
      waarde: { repository: 'a/b' },
    });
  });

  test.each([
    { naam: 'owner met streepje en repo met punt', repository: 'Bram-L/app.template' },
    { naam: 'owner met underscore', repository: 'bram_l/template' },
  ])('template-repo/AC-1: $naam is geldig (zelfde reguliere expressie als onderhoud)', ({ repository }) => {
    expect(probeer(() => exported(rolhek, 'templateVan')({ repository }))).toStrictEqual({ waarde: { repository } });
  });

  test.each([
    { naam: 'extra sleutel', waarde: { repository: 'a/b', extra: true } },
    { naam: 'geen tekst (getal)', waarde: { repository: 1 } },
    { naam: 'geen tekst (null)', waarde: { repository: null } },
    { naam: 'zonder owner', waarde: { repository: 'template' } },
    { naam: 'met extra segment', waarde: { repository: 'a/b/c' } },
    { naam: 'met spatie', waarde: { repository: 'a b/c' } },
    { naam: 'leeg', waarde: { repository: '' } },
    { naam: 'een leeg object', waarde: {} },
    { naam: 'een andere sleutel dan repository', waarde: { naam: 'a/b' } },
    { naam: 'een tekst in plaats van een object', waarde: 'a/b' },
    { naam: 'een lijst', waarde: ['a/b'] },
    { naam: 'null', waarde: null },
  ])('template-repo/AC-1: $naam gooit', ({ waarde }) => {
    const uitkomst = probeer(() => exported(rolhek, 'templateVan')(waarde));
    expect(uitkomst.fout, 'templateVan hoort te gooien').toMatch(
      /template is geen \{ "repository": "<owner>\/<repo>" \}/,
    );
  });
});

describe('template-repo/AC-1: loadConfig zet config.template', () => {
  test('template-repo/AC-1: met template.repository is config.template { repository }', () => {
    const config = loadConfig(appGates('acme/vork'));

    expect(prop(config, 'template')).toStrictEqual({ repository: 'acme/vork' });
  });

  test('template-repo/AC-1: de template (met onderhoud en template) heeft beide', () => {
    const config = loadConfig(
      gatesMet({ template: { repository: 'acme/vork' }, onderhoud: { repository: 'acme/vork' } }),
    );

    expect(prop(config, 'template')).toStrictEqual({ repository: 'acme/vork' });
    expect(config.onderhoud).toStrictEqual({ repository: 'acme/vork' });
  });

  test('template-repo/AC-1: zonder template is config.template undefined', () => {
    expect(prop(loadConfig(appGates(undefined)), 'template')).toBeUndefined();
  });

  test.each([
    { naam: 'een tekst', template: 'acme/vork' },
    { naam: 'een extra sleutel', template: { repository: 'acme/vork', extra: 1 } },
    { naam: 'geen owner/repo', template: { repository: 'vork' } },
  ])('template-repo/AC-1: een ongeldige template ($naam) laat loadConfig gooien', ({ template }) => {
    const uitkomst = probeer(() =>
      loadConfig(appGates(undefined).replace(/\}$/, `,"template":${JSON.stringify(template)}}`)),
    );

    expect(uitkomst.fout, 'loadConfig hoort te gooien').toMatch(/template is geen \{ "repository"/);
  });

  test('template-repo/AC-1: de echte .claude/gates.json laadt met een template.repository', () => {
    expect(prop(loadConfig(echteGates()), 'template')).toStrictEqual({ repository: echteTemplateRepository() });
  });
});

// AC-2 ---------------------------------------------------------------------------------------------------------------

// Een minimale repo met precies deze gates.json; de meldingen worden op sleutel gezocht (`docs:gates:template…`).
function repoMet(gates: Record<string, unknown>): string {
  const root = mkdtempSync(path.join(tmpdir(), 'template-repo-docs-'));
  const basis: Record<string, unknown> = {
    gates: ['scripts/**'],
    voorReview: ['scripts/**'],
    jsonGates: { 'package.json': ['scripts'] },
  };
  const files: Record<string, string> = {
    'package.json': JSON.stringify({ scripts: {} }),
    '.github/CODEOWNERS': '/scripts/ @eigenaar\n/package.json @eigenaar\n',
    '.claude/settings.json': JSON.stringify({ permissions: { ask: ['Edit(scripts/**)'] } }),
    '.claude/gates.json': JSON.stringify({ ...basis, ...gates }),
  };
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '-A'], { cwd: root });
  return root;
}

async function templateMeldingen(gates: Record<string, unknown>): Promise<{ key: string; message: string }[]> {
  const lijst = await docsViolations(repoMet(gates));
  return lijst.filter(({ key }) => key.startsWith('docs:gates:template')).map(({ key, message }) => ({ key, message }));
}

const TEMPLATE_ONTBREEKT = { key: 'docs:gates:template', message: '.claude/gates.json: template ontbreekt' };
const TEMPLATE_VORM = {
  key: 'docs:gates:template',
  message: '.claude/gates.json: template is geen { "repository": "<owner>/<repo>" }',
};

describe('template-repo/AC-2: check-docs toetst template in .claude/gates.json', () => {
  test('template-repo/AC-2: zonder template is rood (template ontbreekt)', async () => {
    expect(await templateMeldingen({})).toStrictEqual([TEMPLATE_ONTBREEKT]);
  });

  test('template-repo/AC-2: ook met alleen onderhoud (de template zonder sleutel) is rood (template ontbreekt)', async () => {
    expect(await templateMeldingen({ onderhoud: { repository: 'acme/vork' } })).toContainEqual(TEMPLATE_ONTBREEKT);
  });

  test.each([
    { naam: 'een tekst', template: 'acme/vork' },
    { naam: 'een lijst', template: ['acme/vork'] },
    { naam: 'null', template: null },
    { naam: 'een leeg object', template: {} },
    { naam: 'repository geen tekst', template: { repository: 1 } },
    { naam: 'repository zonder owner', template: { repository: 'vork' } },
    { naam: 'repository met extra segment', template: { repository: 'a/b/c' } },
    { naam: 'repository met spatie', template: { repository: 'a b/c' } },
    { naam: 'repository leeg', template: { repository: '' } },
    { naam: 'extra sleutels', template: { repository: 'acme/vork', extra: true } },
  ])('template-repo/AC-2: template als $naam is rood (verkeerde vorm)', async ({ template }) => {
    expect(await templateMeldingen({ template })).toContainEqual(TEMPLATE_VORM);
  });

  test('template-repo/AC-2: onderhoud.repository anders dan template.repository is rood', async () => {
    expect(
      await templateMeldingen({ template: { repository: 'acme/twee' }, onderhoud: { repository: 'acme/een' } }),
    ).toStrictEqual([
      {
        key: 'docs:gates:template-onderhoud',
        message: '.claude/gates.json: onderhoud.repository (acme/een) verschilt van template.repository (acme/twee)',
      },
    ]);
  });

  test('template-repo/AC-2: onderhoud gelijk aan template is groen (de template)', async () => {
    expect(
      await templateMeldingen({ template: { repository: 'acme/vork' }, onderhoud: { repository: 'acme/vork' } }),
    ).toStrictEqual([]);
  });

  test('template-repo/AC-2: alleen template, zonder onderhoud, is groen (een app)', async () => {
    expect(await templateMeldingen({ template: { repository: 'acme/vork' } })).toStrictEqual([]);
  });

  test('template-repo/AC-2: de echte .claude/gates.json is groen en heeft precies { repository } als template', async () => {
    const template = prop(JSON.parse(echteGates()), 'template');
    expect(template).toStrictEqual({ repository: echteTemplateRepository() });

    const lijst = (await docsViolations(ROOT)).filter(({ key }) => key.startsWith('docs:gates:template'));
    expect(lijst).toStrictEqual([]);
  });

  test('template-repo/AC-2: in de echte gates.json is onderhoud, als hij er is, gelijk aan template.repository', () => {
    const ruw: unknown = JSON.parse(echteGates());
    const onderhoud = prop(prop(ruw, 'onderhoud'), 'repository');

    expect(onderhoud === undefined || onderhoud === templateRepositoryVan(echteGates())).toBe(true);
    expect(templateRepositoryVan(echteGates())).toEqual(expect.any(String));
  });
});

// AC-6 ---------------------------------------------------------------------------------------------------------------

describe('template-repo/AC-6: functional-ui.mjs verliest de dode functionalUiReason', () => {
  const BRON = readFileSync(path.join(ROOT, 'rails/hooks/lib/functional-ui.mjs'), 'utf8');

  test.each(['functionalUiReason', 'invalidUiPath', 'isUiSource'])(
    'template-repo/AC-6: %s bestaat niet meer (geen export en geen functie in de bron)',
    (naam) => {
      expect(Reflect.get(functionalUi, naam)).toBeUndefined();
      expectAbsent(BRON, new RegExp(`\\b${naam}\\b`), {
        recognizes: [`function ${naam}(change) {`, `export function ${naam}({ changes }) {`, `${naam}(pad)`],
        allows: ['isCoreUiSource', 'isUiTest', 'isFunctionalUiSpec', 'testChangeRisk'],
      });
    },
  );

  test('template-repo/AC-6: de overige exports zijn ongewijzigd', () => {
    expect(Object.keys(functionalUi).toSorted()).toStrictEqual([
      'isCoreUiSource',
      'isFunctionalUiSpec',
      'isUiTest',
      'testChangeRisk',
    ]);
  });

  test('template-repo/AC-6: de overige exports gedragen zich ongewijzigd', () => {
    expect(functionalUi.isFunctionalUiSpec('---\nsjabloon: mini\nscope: functionele-ui\n---\n\n# Titel\n')).toBe(true);
    expect(functionalUi.isFunctionalUiSpec('---\nsjabloon: mini\n---\n\nscope: functionele-ui\n')).toBe(false);
    expect(functionalUi.isCoreUiSource('src/core/web/ui/toast.tsx')).toBe(true);
    expect(functionalUi.isCoreUiSource('src/core/web/ui/toast.test.tsx')).toBe(false);
    expect(functionalUi.isCoreUiSource('src/web/features/toast.tsx')).toBe(false);
    expect(functionalUi.isUiTest('src/core/web/ui/toast.test.tsx')).toBe(true);
    expect(functionalUi.isUiTest('src/core/web/ui/toast.tsx')).toBe(false);
    expect(functionalUi.testChangeRisk("test('a', () => {});\n", '', 'test/a.test.ts')).toBe('removed');
    expect(functionalUi.testChangeRisk("test('a', () => {});\n", "test.skip('a', () => {});\n", 'test/a.test.ts')).toBe(
      'skip',
    );
  });

  test('template-repo/AC-6: functional-ui.mjs importeert TEMPLATE_REPOSITORY niet meer', () => {
    expect(BRON).not.toContain('TEMPLATE_REPOSITORY');
  });
});

// AC-10 --------------------------------------------------------------------------------------------------------------

// `git grep --untracked`: ook een nieuw, nog niet toegevoegd bestand telt mee. Exit 1 = geen treffer.
function gitGrep(args: string[], paden: string[]): string[] {
  try {
    const uit = execFileSync('git', ['grep', '--untracked', '-n', '-I', ...args, '--', ...paden], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    return uit.split('\n').filter((regel) => regel !== '');
  } catch (error) {
    if (typeof error === 'object' && error !== null && Reflect.get(error, 'status') === 1) return [];
    throw error;
  }
}

describe('template-repo/AC-10: geen letterlijke template-repo meer in rails/ en scripts/', () => {
  test.each(['TEMPLATE_REPOSITORY', 'TEMPLATE_URL'])(
    'template-repo/AC-10: %s komt niet meer voor in rails/ en scripts/',
    (naam) => {
      expect(gitGrep(['-w', '-F', '-e', naam], ['rails', 'scripts'])).toStrictEqual([]);
    },
  );

  test('template-repo/AC-10: de waarde van template.repository (uit .claude/gates.json) staat niet in rails/ en scripts/kit/', () => {
    const repository = echteTemplateRepository();

    expect(gitGrep(['-i', '-F', '-e', repository], ['rails', 'scripts/kit'])).toStrictEqual([]);
  });

  test('template-repo/AC-10: ook de github-URL van de template staat niet letterlijk in rails/ en scripts/kit/', () => {
    const repository = echteTemplateRepository();

    expect(gitGrep(['-i', '-F', '-e', `github.com/${repository}`], ['rails', 'scripts/kit'])).toStrictEqual([]);
  });
});
