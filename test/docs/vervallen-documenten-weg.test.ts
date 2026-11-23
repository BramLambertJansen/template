import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { docsViolations } from '../../scripts/kit/check-docs.mjs';

// docs/template/specs/vervallen-documenten-weg.md, PR 1 (AC-1 t/m AC-5 en AC-7): vervallen template-documenten zijn weg,
// hun levende AC's wonen in een levende spec, en niets verwijst nog naar het verwijderde document. AC-6 (de check) is PR 2.
// De greps sluiten dit bestand zelf uit (pathspec): het bevat de zoekpatronen.

const REPO = path.resolve(import.meta.dirname, '../..');
const ZICHZELF = ':!test/docs/vervallen-documenten-weg.test.ts';
const UITZONDERINGEN = [
  ':!docs/template-changelog.md',
  ':!docs/template/specs/vervallen-documenten-weg.md',
  ZICHZELF,
];

function lees(pad: string): string {
  return readFileSync(path.join(REPO, pad), 'utf8');
}

/** `git grep --untracked`: ook een nieuw, nog niet toegevoegd bestand telt mee. Exit 1 is geen treffer. */
function gitGrep(args: string[], paden: string[]): string[] {
  try {
    const uit = execFileSync('git', ['grep', '--untracked', '-n', '-I', ...args, '--', ...paden], {
      cwd: REPO,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    return uit.split('\n').filter((regel) => regel !== '');
  } catch (error) {
    if (typeof error === 'object' && error !== null && Reflect.get(error, 'status') === 1) return [];
    throw error;
  }
}

/** Een lege lijst, of de treffers als leesbare mislukking. */
function treffers(lijst: string[]): string[] {
  return lijst.slice(0, 40);
}

const SPECS = [
  'adr-herzien-markering',
  'agent-merge-bytegrens',
  'agent-merge-niet-kritiek',
  'agent-token',
  'document-status-lokaal',
  'rolhek-effect',
  'rolhek-vooraf-krimp',
  'spec-en-bouw-in-een-pr',
  'specplicht',
];
const NAMESPACES = [
  'adr-herzien',
  'agent-merge-bytegrens',
  'agent-merge-niet-kritiek',
  'agent-token',
  'document-status-lokaal',
  'rolhek-effect',
  'rolhek-vooraf-krimp',
  'spec-en-bouw',
  'specplicht',
];
const ADR_0066 = 'docs/template/adr/0066-schrijfgrens-op-effect.md';

// De verhuistabel (Werking): doel-id en de testbestanden die het nu bewijzen of noemen.
const HOOKS = 'test/hooks';
const VERHUIZING: [string, string[]][] = [
  ['rolhek-vooraf/AC-1', [`${HOOKS}/rolhek-padcorpus-vooraf.test.ts`, `${HOOKS}/rolhek-padcorpus.ts`]],
  ['rolhek-vooraf/AC-2', [`${HOOKS}/rolhek-gh-allowlist.test.ts`, `${HOOKS}/rolhek-zelfladend.test.ts`]],
  ['rolhek-vooraf/AC-3', [`${HOOKS}/rolhek-zelfladend.test.ts`, `${HOOKS}/shell-glob-klasse-bash.test.ts`]],
  ['rolhek-vooraf/AC-4', [`${HOOKS}/rolhek-gh-allowlist.test.ts`]],
  ['rolhek-vooraf/AC-5', [`${HOOKS}/laden-commondir.test.ts`]],
  ['rolhek-vooraf/AC-6', [`${HOOKS}/rolhek-verse-main.test.ts`, `${HOOKS}/werkstraat.test.ts`]],
  ['sandbox-plaatshouders/AC-1', [`${HOOKS}/sandbox-plaatshouders.test.ts`]],
  ['sandbox-plaatshouders/AC-2', [`${HOOKS}/sandbox-plaatshouders.test.ts`]],
  ['sandbox-plaatshouders/AC-3', [`${HOOKS}/sandbox-plaatshouders.test.ts`]],
  ['sandbox-plaatshouders/AC-4', [`${HOOKS}/sandbox-plaatshouders.test.ts`]],
  ['sandbox-plaatshouders/AC-5', [`${HOOKS}/sandbox-plaatshouders.test.ts`]],
  ['agent-samenvoegen/AC-8', ['test/scripts/pr-merge.test.ts']],
  ['agent-samenvoegen/AC-9', [`${HOOKS}/rolhek-pr-merge.test.ts`]],
  ['agent-samenvoegen/AC-10', ['test/scripts/pr-merge-omvang-steekproef.test.ts']],
  ['agent-samenvoegen/AC-11', ['test/docs/geen-externe-review-docs.test.ts']],
  [
    'gebouwd-zonder-nummer/AC-13',
    ['test/rails/spec-en-bouw.test.ts', `${HOOKS}/rolhek-beslisroute.test.ts`, 'test/rails/check-roadmap-bewijsvorm.test.ts'],
  ],
  ['gebouwd-zonder-nummer/AC-14', ['test/rails/spec-en-bouw.test.ts']],
];
const DOELSPECS = ['rolhek-vooraf', 'sandbox-plaatshouders', 'agent-samenvoegen', 'gebouwd-zonder-nummer'];

function specPad(naam: string): string {
  return `docs/template/specs/${naam}.md`;
}

function escape(tekst: string): string {
  return tekst.replaceAll(/[.*+?^${}()|[\]\\/]/g, String.raw`\$&`);
}

/** Het doel-id als heel woord: niet vastgeplakt aan een letter, cijfer of koppelteken (AC-1 is dus geen AC-10). */
function heelWoord(id: string): RegExp {
  return new RegExp(`(?<![A-Za-z0-9-])${escape(id)}(?![A-Za-z0-9])`);
}

// --- AC-1 -----------------------------------------------------------------------------------------------------------------------

describe('vervallen-documenten-weg/AC-1 verhuizing', () => {
  test.each(VERHUIZING.map(([id]) => id))('vervallen-documenten-weg/AC-1: %s staat als AC-regel in zijn doelspec', (id) => {
    const [naam = ''] = id.split('/');
    expect(existsSync(path.join(REPO, specPad(naam))), `${specPad(naam)} bestaat`).toBe(true);
    const regels = lees(specPad(naam)).split('\n');
    expect(
      regels.some((regel) => regel.startsWith(`- **${id}**`)),
      `AC-regel "- **${id}**" in ${specPad(naam)}`,
    ).toBe(true);
  });

  test.each(VERHUIZING.flatMap(([id, bestanden]) => bestanden.map((bestand): [string, string] => [id, bestand])))(
    'vervallen-documenten-weg/AC-1: %s staat als heel woord in %s',
    (id, bestand) => {
      expect(existsSync(path.join(REPO, bestand)), `${bestand} bestaat`).toBe(true);
      expect(heelWoord(id).test(lees(bestand)), `${id} in ${bestand}`).toBe(true);
    },
  );

  test('vervallen-documenten-weg/AC-1: geen verwijzing meer naar de vier oude namespaces in test, rails en scripts', () => {
    const uit = gitGrep(
      [
        '-F',
        '-e',
        'rolhek-vooraf-krimp/AC',
        '-e',
        'rolhek-effect/AC',
        '-e',
        'agent-merge-niet-kritiek/AC',
        '-e',
        'spec-en-bouw/AC',
      ],
      ['test', 'rails', 'scripts', ZICHZELF],
    );
    expect(treffers(uit)).toEqual([]);
  });
});

// --- AC-2 -----------------------------------------------------------------------------------------------------------------------

function statusVan(naam: string): string {
  const kop = /^---\n([\s\S]*?)\n---/.exec(lees(specPad(naam)));
  const regel = (kop?.[1] ?? '').split('\n').find((r) => r.startsWith('status:'));
  return (regel ?? '').slice('status:'.length).trim();
}

function baselineSleutels(): string[] {
  const json: unknown = JSON.parse(lees('.kit/baseline.json'));
  if (typeof json !== 'object' || json === null || Array.isArray(json)) throw new Error('.kit/baseline.json is geen object');
  return Object.values(json).flatMap((lijst) => (Array.isArray(lijst) ? lijst.map(String) : []));
}

describe('vervallen-documenten-weg/AC-2 status', () => {
  // GEWIJZIGD (gebouwd-zonder-nummer/AC-27, ADR 0104): alle `status: gebouwd` zijn omgezet naar `goedgekeurd`; "gebouwd" volgt uit de AC-dekking.
  test.each(['rolhek-vooraf', 'sandbox-plaatshouders'])('vervallen-documenten-weg/AC-2: %s heeft status goedgekeurd', (naam) => {
    expect(statusVan(naam)).toMatch(/^goedgekeurd\b/);
  });

  test.each(['agent-samenvoegen', 'gebouwd-zonder-nummer'])(
    'vervallen-documenten-weg/AC-2: %s heeft geen AC-regel met (nog niet gebouwd) direct achter het id',
    (naam) => {
      const regels = lees(specPad(naam))
        .split('\n')
        .filter((regel) => /^- \*\*[^*]+\*\*\s*\(nog niet gebouwd\)/.test(regel));
      expect(regels).toEqual([]);
    },
  );

  test('vervallen-documenten-weg/AC-2: docsViolations geeft geen docs:ac: voor de vier doelspecs, en de baseline heeft er geen', async () => {
    const sleutels = (await docsViolations(REPO)).map(({ key }) => key);
    for (const naam of DOELSPECS) {
      const voorvoegsel = `docs:ac:${naam}:`;
      expect(
        sleutels.filter((sleutel) => sleutel.startsWith(voorvoegsel)),
        `docsViolations voor ${naam}`,
      ).toEqual([]);
      expect(
        baselineSleutels().filter((sleutel) => sleutel.startsWith(voorvoegsel)),
        `baseline voor ${naam}`,
      ).toEqual([]);
    }
  });
});

// --- AC-3 -----------------------------------------------------------------------------------------------------------------------

describe('vervallen-documenten-weg/AC-3 verwijderen', () => {
  test.each([...SPECS.map(specPad), ADR_0066])('vervallen-documenten-weg/AC-3: %s bestaat niet', (pad) => {
    expect([pad].filter((bestand) => existsSync(path.join(REPO, bestand)))).toEqual([]);
  });

  test('vervallen-documenten-weg/AC-3: geen document in docs/template met status vervallen of vervangen door', () => {
    const uit = gitGrep(['-i', '-e', '^status: vervallen', '-e', '^status: vervangen door'], ['docs/template']);
    expect(treffers(uit)).toEqual([]);
  });
});

// --- AC-4 -----------------------------------------------------------------------------------------------------------------------

/** Per verwijderde spec het pad, per namespace de AC-verwijzing, en de ADR-bestandsnaam. */
const ZOEKPATRONEN = [...SPECS.map((naam) => `specs/${naam}.md`), ...NAMESPACES.map((ns) => `${ns}/AC-`), '0066-schrijfgrens'];

/**
 * `spec <naam>` (naam eventueel tussen backticks, niet gevolgd door letter, cijfer of `-`), met de vraag of de vermelding
 * historie is: op een regel die met `Herzien:` begint, of op een vervolgregel daarvan (tot de volgende lege regel).
 */
function vermeldingen(tekst: string): { naam: string; historie: boolean }[] {
  const patroon = new RegExp(`(?<![A-Za-z0-9])spec\\s+\`?(${SPECS.map(escape).join('|')})\`?(?![A-Za-z0-9-])`, 'gi');
  const regels = tekst.split('\n');
  const inHerzien: boolean[] = [];
  let open = false;
  for (const regel of regels) {
    if (regel.trim() === '') open = false;
    else if (regel.startsWith('Herzien:')) open = true;
    inHerzien.push(open);
  }
  return [...tekst.matchAll(patroon)].map((m) => ({
    naam: m[1] ?? '',
    historie: inHerzien[tekst.slice(0, m.index).split('\n').length - 1] ?? false,
  }));
}

describe('vervallen-documenten-weg/AC-4 verwijzingen', () => {
  test('vervallen-documenten-weg/AC-4 (a): geen pad, namespace-AC of ADR-bestandsnaam van een verwijderd document in de repo', () => {
    const args = ZOEKPATRONEN.flatMap((patroon) => ['-e', patroon]);
    expect(treffers(gitGrep(['-F', ...args], ['.', ...UITZONDERINGEN]))).toEqual([]);
  });

  test('vervallen-documenten-weg/AC-4 (b): een vermelding "spec <naam>" van een verwijderde spec staat alleen in een Herzien:-regel', () => {
    const kandidaten = new Set<string>();
    for (const naam of SPECS) {
      for (const regel of gitGrep(['-l', '-i', '-F', '-e', naam], ['.', ...UITZONDERINGEN])) kandidaten.add(regel);
    }
    const fouten: string[] = [];
    for (const bestand of [...kandidaten].sort()) {
      // `-n` is meegegeven aan gitGrep, maar `-l` laat het regelnummer weg: de regel is alleen het pad.
      for (const { naam, historie } of vermeldingen(lees(bestand))) {
        if (!historie) fouten.push(`${bestand}: spec ${naam} buiten een Herzien:-regel`);
      }
    }
    expect(treffers(fouten)).toEqual([]);
  });

  test('vervallen-documenten-weg/AC-4 (b): de vermeldingsregel herkent de vormen uit de spec (zelftest)', () => {
    expect(vermeldingen('zie spec agent-token (vervallen)')).toEqual([{ naam: 'agent-token', historie: false }]);
    expect(vermeldingen('Herzien: 2026-11-17: zie spec agent-token')).toEqual([{ naam: 'agent-token', historie: true }]);
    expect(vermeldingen('Herzien: 2026-11-17: zie\nspec agent-token\n\nspec specplicht')).toEqual([
      { naam: 'agent-token', historie: true },
      { naam: 'specplicht', historie: false },
    ]);
    expect(vermeldingen('Herzien: a\nHerzien: zie spec `specplicht` en meer')).toEqual([{ naam: 'specplicht', historie: true }]);
    expect(vermeldingen('zie Spec Agent-Token')).toHaveLength(1);
    expect(vermeldingen('zie spec agent-token-extra')).toEqual([]);
    expect(vermeldingen('zie spec specplichtig')).toEqual([]);
    expect(vermeldingen('zie spec agent-samenvoegen')).toEqual([]);
  });
});

// --- AC-5 -----------------------------------------------------------------------------------------------------------------------

describe('vervallen-documenten-weg/AC-5 meldingen', () => {
  test('vervallen-documenten-weg/AC-5: zelfladend.mjs bevat precies zes keer (spec rolhek-vooraf AC-3)', () => {
    const tekst = lees('rails/hooks/lib/zelfladend.mjs');
    expect(tekst.split('(spec rolhek-vooraf AC-3)').length - 1).toBe(6);
  });
});

// --- AC-7 -----------------------------------------------------------------------------------------------------------------------

describe('vervallen-documenten-weg/AC-7 groen', () => {
  test('vervallen-documenten-weg/AC-7: docsViolations op de repo geeft geen sleutel buiten de baseline', async () => {
    const bekend = new Set(baselineSleutels());
    const sleutels = (await docsViolations(REPO)).map(({ key }) => key);
    expect(sleutels.filter((sleutel) => !bekend.has(sleutel))).toEqual([]);
  });

  test('vervallen-documenten-weg/AC-7: geen baselinesleutel noemt een verwijderde spec of ADR 0066', () => {
    const slecht = baselineSleutels().filter(
      (sleutel) =>
        sleutel.includes('0066-schrijfgrens') ||
        SPECS.some((naam) => sleutel.includes(`specs/${naam}.md`) || sleutel.startsWith(`docs:ac:${naam}:`)) ||
        NAMESPACES.some((ns) => sleutel.startsWith(`docs:ac:${ns}:`)),
    );
    expect(slecht).toEqual([]);
  });
});
