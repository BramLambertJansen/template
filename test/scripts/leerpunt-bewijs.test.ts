import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  bewijsPlan,
  graphqlData,
  leesLeerpuntSectie,
  leesVitest,
  metExit,
  runOordeel,
  typeUitslag,
} from '../../scripts/kit/leerpunt.mjs';
import {
  diffPaden,
  leesGesloten,
  opdracht,
  TYPE_CONFIG,
  typeConfig,
  zonderToken,
} from '../../scripts/kit/leerpunt-bewijs.mjs';

// Bewijsjob voor een PR die een leerpunt sluit (ADR 0078 punt 1 en 2, spec leerlus-bewijs AC-1 t/m AC-4).
const sectie = (...regels: string[]) =>
  ['## Samenvatting', '', 'tekst', '', '## Leerpunt', '', ...regels, '', '## Test'].join('\n');
const LP = (nummer: number) => ({ nummer, labels: ['leerpunt'] });
const plan = (body: string, diff: string[] = [], gesloten = [LP(9)]) => bewijsPlan({ gesloten, body, diff });

// Vitest-verslagen in de vorm die `vitest run --reporter=json` echt schrijft (vastgelegd met vitest 4 in deze repo).
const verslag = (
  status: string,
  asserties: string[],
  { message = '', melding = 'AssertionError: expected 1 to be 2 // Object.is equality' } = {},
) => ({
  numTotalTests: asserties.length,
  success: status === 'passed',
  testResults: [
    {
      name: '/repo/test/a.test.ts',
      status,
      message,
      assertionResults: asserties.map((s) => ({
        status: s,
        title: 't',
        failureMessages: s === 'failed' ? [melding] : [],
      })),
    },
  ],
});
const GROEN = verslag('passed', ['passed']);
const ASSERTIE = verslag('failed', ['failed']);
const IMPORT = verslag('failed', [], {
  message: "Cannot find module './nergens.mjs' imported from /repo/test/a.test.ts",
});
// Een ontbrekende export: vite geeft `undefined`, de test faalt met een TypeError (vastgelegd met vitest 5.0.3).
const EXPORT = verslag('failed', ['failed'], {
  melding: 'TypeError: (0 , __vite_ssr_import_1__.nieuw) is not a function',
});
const PAD = 'test/a.test.ts';

describe('leerlus-bewijs/AC-1 welke leerpunten de PR sluit', () => {
  test('leerlus-bewijs/AC-1: gesloten issues komen uit closingIssuesReferences', () => {
    const data = {
      data: {
        repository: {
          pullRequest: {
            closingIssuesReferences: {
              nodes: [
                { number: 9, labels: { nodes: [{ name: 'leerpunt' }] } },
                { number: 10, labels: { nodes: [{ name: 'bug' }] } },
              ],
            },
          },
        },
      },
    };
    expect(leesGesloten(data)).toEqual([LP(9), { nummer: 10, labels: ['bug'] }]);
  });

  test('leerlus-bewijs/AC-1: PR zonder leerpunt: niets te draaien, geen fout', () => {
    expect(plan('geen sectie', [], [{ nummer: 10, labels: ['bug'] }])).toEqual({
      leerpunten: [],
      fouten: [],
      runs: [],
    });
  });

  test('leerlus-bewijs/AC-1: leerpunt zonder regel in de sectie: rood met het nummer', () => {
    expect(plan('Fixes #9').fouten).toEqual(['#9: geen regel "- #9: …" in de sectie ## Leerpunt']);
    // Sinds leerpunt #717 meldt de regel voor #8, dat de PR niet sluit, ook een eigen fout.
    expect(plan(sectie('- #8: trede Check; bewijs test/a.test.ts'), ['test/a.test.ts']).fouten).toEqual([
      '#9: geen regel "- #9: …" in de sectie ## Leerpunt',
      '#8: staat in ## Leerpunt, maar de PR sluit het niet; voeg "Closes #8" toe aan de beschrijving',
    ]);
  });

  test('leerlus-bewijs/AC-1: de sectie stopt bij de volgende kop', () => {
    const body = [
      '## Leerpunt',
      '- #9: trede Check; bewijs test/a.test.ts',
      '## Test',
      '- #10: trede Check; bewijs test/b.test.ts',
    ];
    expect(leesLeerpuntSectie(body.join('\r\n')).map((r) => r.nummer)).toEqual([9]);
  });
});

describe('leerlus-bewijs/AC-2 het bewijspad', () => {
  test.each([
    ['unit in de diff', 'Check', 'test/scripts/a.test.ts', ['test/scripts/a.test.ts'], null],
    ['tsx in de diff', 'Check', 'src/web/a.test.tsx', ['src/web/a.test.tsx'], null],
    ['pad tussen backticks', 'Check', '`test/a.test.ts`', ['test/a.test.ts'], null],
    ['typetest bij Type', 'Type', 'test/a.test-d.ts', ['test/a.test-d.ts'], null],
    ['niet in de diff', 'Check', 'test/a.test.ts', [], /staat niet als toegevoegd of gewijzigd/],
    ['geen test', 'Check', 'src/a.ts', ['src/a.ts'], /geen unit- of typetest/],
    ['integratietest', 'Check', 'src/a.int.test.ts', ['src/a.int.test.ts'], /geen unit- of typetest/],
    ['e2e', 'Check', 'e2e/a.test.ts', ['e2e/a.test.ts'], /geen unit- of typetest/],
    ['typetest bij Check', 'Check', 'test/a.test-d.ts', ['test/a.test-d.ts'], /hoort bij trede Type/],
    ['onbekende trede', 'Lint', 'test/a.test.ts', ['test/a.test.ts'], /onbekende trede "Lint"/],
  ])('leerlus-bewijs/AC-2: %s', (...[, trede, pad, diff, fout]) => {
    const uitslag = plan(sectie(`- #9: trede ${trede}; bewijs ${pad}`), diff);
    if (fout === null) {
      expect(uitslag.fouten).toEqual([]);
      expect(uitslag.runs).toEqual([{ pad: pad.replaceAll('`', ''), soort: trede === 'Type' ? 'type' : 'unit' }]);
    } else expect(uitslag.fouten.join('\n')).toMatch(fout);
  });

  test('leerlus-bewijs/AC-2: één test voor twee leerpunten draait één keer', () => {
    const body = sectie('- #9: trede Check; bewijs test/a.test.ts', '* #10: trede Check; bewijs test/a.test.ts');
    expect(plan(body, ['test/a.test.ts'], [LP(9), LP(10)]).runs).toEqual([{ pad: 'test/a.test.ts', soort: 'unit' }]);
  });

  test('leerlus-bewijs/AC-2: diffPaden neemt toegevoegd, gewijzigd en het nieuwe pad bij hernoemen of kopiëren', () => {
    const uitvoer = [
      'A',
      'a.test.ts',
      'M',
      'b.test.ts',
      'D',
      'c.test.ts',
      'R100',
      'oud.ts',
      'd.test.ts',
      'C90',
      'x.ts',
      'e.test.ts',
      '',
    ].join('\0');
    expect(diffPaden(uitvoer)).toEqual(['a.test.ts', 'b.test.ts', 'd.test.ts', 'e.test.ts']);
  });
});

describe('leerlus-bewijs/AC-3 rood op de basis, groen op de head', () => {
  test('leerlus-bewijs/AC-3: leesVitest op echte verslagvormen', () => {
    expect(leesVitest(GROEN, PAD).status).toBe('groen');
    expect(leesVitest(ASSERTIE, PAD).status).toBe('rood');
    expect(leesVitest(IMPORT, PAD).status).toBe('laadfout');
    expect(leesVitest(null, PAD).status).toBe('laadfout');
  });

  const unit = { pad: 'test/a.test.ts', soort: 'unit' };
  test.each([
    ['assertie op de basis, groen op de head', ASSERTIE, GROEN, null],
    ['slaagt ook op de basis', GROEN, GROEN, /slaagt ook op de basis \(basis groen, head groen\)/],
    ['faalt op de basis alleen op een import', IMPORT, GROEN, /op laden, niet op een assertie \(basis laadfout/],
    [
      'faalt op de basis op een ontbrekende export (TypeError)',
      EXPORT,
      GROEN,
      /op laden, niet op een assertie \(basis laadfout/,
    ],
    ['faalt op de head', ASSERTIE, ASSERTIE, /faalt op de head \(basis rood, head rood\)/],
  ])('leerlus-bewijs/AC-3: %s', (...[, basis, head, fout]) => {
    const uitslag = runOordeel(unit, { basis: leesVitest(basis, PAD), head: leesVitest(head, PAD) });
    if (fout === null) expect(uitslag).toBeNull();
    else expect(uitslag).toMatch(fout);
  });

  test('leerlus-bewijs/AC-3: typetest: compileert niet op de basis, wel op de head', () => {
    const type = { pad: 'test/a.test-d.ts', soort: 'type' };
    expect(
      runOordeel(type, {
        basis: typeUitslag(2, "x.ts(1,7): error TS2322: Type 'string' is not assignable to type 'number'."),
        head: typeUitslag(0, ''),
      }),
    ).toBeNull();
    expect(runOordeel(type, { basis: typeUitslag(0, ''), head: typeUitslag(0, '') })).toMatch(/slaagt ook op de basis/);
    expect(
      runOordeel(type, {
        basis: typeUitslag(2, "x.ts(1,7): error TS2322: Type 'string' is not assignable to type 'number'."),
        head: typeUitslag(2, "x.ts(1,7): error TS2322: Type 'string' is not assignable to type 'number'."),
      }),
    ).toMatch(/faalt op de head/);
  });

  test('leerlus-bewijs/AC-3: opdracht en tsconfig per soort', () => {
    expect(opdracht({ pad: 'test/a.test.ts', soort: 'unit' }, '/t/v.json')).toEqual([
      'exec',
      'vitest',
      'run',
      'test/a.test.ts',
      '--reporter=json',
      '--outputFile=/t/v.json',
    ]);
    expect(opdracht({ pad: 'test/a.test-d.ts', soort: 'type' }, '/t/v.json')).toEqual([
      'exec',
      'tsc',
      '-p',
      TYPE_CONFIG,
    ]);
    expect(JSON.parse(typeConfig('src/web/a.test-d.ts'))).toMatchObject({
      extends: './tsconfig.web.json',
      files: ['src/web/a.test-d.ts'],
      include: [],
    });
    expect(JSON.parse(typeConfig('test/a.test-d.ts'))).toMatchObject({ extends: './tsconfig.node.json' });
  });

  test('leerlus-bewijs/AC-3: de PR-code krijgt geen token of geheim', () => {
    const oud = { ...process.env };
    Object.assign(process.env, {
      GH_TOKEN: 'x',
      GITHUB_TOKEN: 'x',
      NPM_SECRET: 'x',
      ACTIONS_RUNTIME_TOKEN: 'x',
      DB_PASSWORD: 'x',
      CI: 'true',
    });
    try {
      const env = zonderToken();
      expect(Object.keys(env).filter((k) => /TOKEN|SECRET|PASSWORD|^ACTIONS_/i.test(k))).toEqual([]);
      expect(env['CI']).toBe('true');
    } finally {
      for (const k of Object.keys(process.env)) if (!(k in oud)) Reflect.deleteProperty(process.env, k);
      Object.assign(process.env, oud);
    }
  });

  test('leerlus-bewijs/AC-3: plan op een fixture-repo neemt de merge-base en het bewijsbestand uit de diff', () => {
    const map = mkdtempSync(path.join(tmpdir(), 'leerpunt-plan-'));
    const repo = path.join(map, 'repo');
    mkdirSync(path.join(repo, 'test'), { recursive: true });
    const git = (...args: string[]) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 't@t');
    git('config', 'user.name', 't');
    writeFileSync(path.join(repo, 'a.ts'), 'export const a = 1;\n');
    git('add', '.');
    git('commit', '-qm', 'basis');
    const basis = git('rev-parse', 'HEAD');
    writeFileSync(path.join(repo, 'test/a.test.ts'), 'test\n');
    git('add', '.');
    git('commit', '-qm', 'head');
    const invoer = path.join(map, 'in.json');
    const uit = path.join(map, 'plan.json');
    writeFileSync(
      invoer,
      JSON.stringify({ gesloten: [LP(9)], body: sectie('- #9: trede Check; bewijs test/a.test.ts') }),
    );
    execFileSync(process.execPath, ['scripts/kit/leerpunt-bewijs.mjs', 'plan', invoer, repo, basis, uit], {
      encoding: 'utf8',
    });
    expect(JSON.parse(readFileSync(uit, 'utf8'))).toMatchObject({
      leerpunten: [9],
      fouten: [],
      runs: [{ pad: 'test/a.test.ts', soort: 'unit' }],
      splitsing: basis,
    });
  });
});

describe('leerlus-bewijs/AC-4 geen test: <reden>', () => {
  test.each([
    // GEWIJZIGD (spec gedragsbaseline AC-5, ADR 0107): `geen test: <reden>` bij Skill, Padregel en AGENTS.md was goed; de
    // tekstfix bewijst nu `baseline:` of `geen baseline: <reden>`, dus deze drie rijen verwachten de weigering.
    [
      'Skill',
      'alleen skilltekst',
      [],
      /bij trede Skill is het bewijs "baseline: …" of "geen baseline: <reden>", geen "geen test:"/,
    ],
    [
      'Padregel',
      'regel in .claude/rules',
      [],
      /bij trede Padregel is het bewijs "baseline: …" of "geen baseline: <reden>", geen "geen test:"/,
    ],
    [
      'AGENTS.md',
      'instructie',
      [],
      /bij trede AGENTS.md is het bewijs "baseline: …" of "geen baseline: <reden>", geen "geen test:"/,
    ],
    ['Check', 'integratietest src/a.int.test.ts', ['src/a.int.test.ts'], null],
    ['Check', 'e2e-test `e2e/login.test.ts`', ['e2e/login.test.ts'], null],
    ['Check', 'integratietest src/a.int.test.ts', [], /alleen met een integratie- of e2e-test uit de diff/],
    ['Check', 'te lastig', [], /alleen met een integratie- of e2e-test/],
    ['Type', 'geen zin', [], /alleen met een integratie- of e2e-test/],
    ['Skill', '', [], /"geen test" zonder reden/],
  ])('leerlus-bewijs/AC-4: trede %s, reden %j', (...[trede, reden, diff, fout]) => {
    const uitslag = plan(sectie(`- #9: trede ${trede}; bewijs geen test: ${reden}`), diff);
    if (fout === null) {
      expect(uitslag.fouten).toEqual([]);
      expect(uitslag.runs).toEqual([]);
    } else expect(uitslag.fouten.join('\n')).toMatch(fout);
  });
});

describe('leerlus-bewijs/AC-1 en AC-3 GraphQL-fouten en exitstatus', () => {
  test('leerlus-bewijs/AC-1: een GraphQL-fout of ontbrekende PR telt niet als "geen leerpunten"', () => {
    expect(() =>
      graphqlData({ data: { repository: null }, errors: [{ message: 'Resource not accessible' }] }, ['repository']),
    ).toThrow(/Resource not accessible/);
    expect(() => graphqlData({ data: { repository: { pullRequest: null } } }, ['repository', 'pullRequest'])).toThrow(
      /geen pullRequest/,
    );
    const data = { repository: { pullRequest: { closingIssuesReferences: { nodes: [] } } } };
    expect(graphqlData({ data }, ['repository', 'pullRequest'])).toEqual(data);
  });

  test('leerlus-bewijs/AC-3: groene asserties met een exitstatus ongelijk aan 0 zijn geen groen en geen bewijs', () => {
    expect(metExit(leesVitest(GROEN, PAD), 0).status).toBe('groen');
    expect(metExit(leesVitest(GROEN, PAD), 1).status).toBe('laadfout');
    expect(metExit(leesVitest(ASSERTIE, PAD), 1).status).toBe('rood');
    const unit = { pad: 'test/a.test.ts', soort: 'unit' };
    expect(runOordeel(unit, { basis: leesVitest(ASSERTIE, PAD), head: metExit(leesVitest(GROEN, PAD), 1) })).toMatch(
      /faalt op de head/,
    );
  });
});

describe('leerlus-bewijs/AC-3 alleen een echte assertie is bewijs', () => {
  test('leerlus-bewijs/AC-3: een TypeError telt als laadfout, ook naast een assertie', () => {
    expect(leesVitest(EXPORT, PAD)).toMatchObject({ status: 'laadfout', laadFout: true, assertieFouten: 0 });
    const gemengd = verslag('failed', ['failed', 'failed']);
    const tests = gemengd.testResults[0]?.assertionResults ?? [];
    if (tests[1] !== undefined) tests[1].failureMessages = ['TypeError: x is not a function'];
    expect(leesVitest(gemengd, PAD).status).toBe('laadfout');
  });

  test('leerlus-bewijs/AC-3: alleen het bewijsbestand telt, niet een ander bestand met dezelfde deelstring', () => {
    const ander = {
      ...GROEN,
      testResults: [...GROEN.testResults, { ...ASSERTIE.testResults[0], name: '/repo/test/a.test.tsx' }],
    };
    expect(leesVitest(ander, PAD).status).toBe('groen');
    expect(leesVitest(GROEN, 'test/b.test.ts').status).toBe('laadfout');
  });

  test.each([
    ["error TS2305: Module '\"./mod.ts\"' has no exported member 'nieuw'.", 'laadfout'],
    ["error TS2307: Cannot find module './nergens' or its corresponding type declarations.", 'laadfout'],
    ["error TS2724: '\"./mod.ts\"' has no exported member named 'nieuw'. Did you mean 'oud'?", 'laadfout'],
    ["error TS2322: Type 'string' is not assignable to type 'number'.", 'rood'],
  ])('leerlus-bewijs/AC-3: typetest met %s op de basis: %s', (uitvoer, status) => {
    expect(typeUitslag(2, `t.test-d.ts(1,10): ${uitvoer}`).status).toBe(status);
  });

  test('leerlus-bewijs/AC-3: typetest met een ontbrekende export op de basis is geen bewijs', () => {
    const type = { pad: 'test/a.test-d.ts', soort: 'type' };
    const basis = typeUitslag(
      2,
      "t.test-d.ts(1,10): error TS2305: Module '\"./mod.ts\"' has no exported member 'nieuw'.",
    );
    expect(runOordeel(type, { basis, head: typeUitslag(0, '') })).toMatch(/op laden, niet op een assertie/);
  });
});

describe('leerlus-bewijs/AC-3 overgeslagen tests', () => {
  test('leerlus-bewijs/AC-3: alleen overgeslagen tests op de head zijn geen groen', () => {
    expect(leesVitest(verslag('passed', ['skipped']), PAD).status).toBe('laadfout');
    expect(leesVitest(verslag('passed', ['skipped', 'passed']), PAD).status).toBe('groen');
    const unit = { pad: PAD, soort: 'unit' };
    expect(
      runOordeel(unit, { basis: leesVitest(ASSERTIE, PAD), head: leesVitest(verslag('passed', ['skipped']), PAD) }),
    ).toMatch(/faalt op de head/);
  });
});

// Gedragsbaseline voor tekstwijzigingen (ADR 0107, spec gedragsbaseline AC-1 t/m AC-5): de job toetst de vorm van de
// regel `baseline:` of `geen baseline:` en van het blok `### Scenario #<nr>`; er draait geen test.
const TEKSTDIFF = ['.claude/skills/opleveren/SKILL.md'];
const BASELINE = 'baseline: zonder 1/3, met 3/3 (opus)';
const LABELS = [
  '- Prompt: sluit het issue en meld het',
  '- Beginstand: abc1234; checkout main',
  '- Criterium: ja als de run eerst de test draait, anders nee',
];
const runRegels = (zonderJa: number, metJa = 3) => [
  ...[1, 2, 3].map((n) => `- zonder ${String(n)}: ${n <= zonderJa ? 'ja' : 'nee'} — één zin`),
  ...[1, 2, 3].map((n) => `- met ${String(n)}: ${n <= metJa ? 'ja' : 'nee'} — één zin`),
];
const blok = (nr = 9, labels = LABELS, runs = runRegels(1)) => [`### Scenario #${String(nr)}`, ...labels, ...runs];

interface Opties {
  trede?: string;
  bewijs?: string;
  scenario?: string[];
  diff?: string[];
}
const baselinePlan = ({ trede = 'Skill', bewijs = BASELINE, scenario = blok(), diff = TEKSTDIFF }: Opties = {}) =>
  plan(sectie(`- #9: trede ${trede}; bewijs ${bewijs}`, '', ...scenario), diff);
const NIET_TEKST = (soort: string) => `#9: "${soort}" hoort alleen bij trede Skill, Padregel of AGENTS.md`;
const GEEN_BLOK = '#9: geen blok "### Scenario #9" in de sectie ## Leerpunt';
const RUNREGELS = '#9: scenario heeft niet precies één runregel voor zonder 1-3 en met 1-3';
const VORM = (tekst: string) => `#9: baseline "${tekst}" heeft niet de vorm zonder <a>/3, met 3/3 (<model>)`;

describe('gedragsbaseline/AC-1 de regel leest baseline en geenBaseline', () => {
  const leeg = { pad: null, reden: null, meting: null, baseline: null, geenBaseline: null };
  test.each([
    [
      'baseline',
      '- #9: trede Skill; bewijs baseline: zonder 1/3, met 3/3 (opus)',
      { baseline: 'zonder 1/3, met 3/3 (opus)' },
    ],
    [
      'baseline tussen backticks',
      '- #9: trede Padregel; bewijs `baseline: zonder 0/3, met 3/3 (opus 4.7)`',
      { baseline: 'zonder 0/3, met 3/3 (opus 4.7)' },
    ],
    [
      'geen baseline tussen backticks',
      '- #9: trede AGENTS.md; bewijs `geen baseline: schrijfgedrag`',
      { geenBaseline: 'schrijfgedrag' },
    ],
    ['geen baseline zonder reden', '- #9: trede Skill; bewijs geen baseline:', { geenBaseline: '' }],
    ['testpad blijft pad', '- #9: trede Check; bewijs test/a.test.ts', { pad: 'test/a.test.ts' }],
    ['geen test blijft reden', '- #9: trede Check; bewijs geen test: e2e', { reden: 'e2e' }],
    [
      'meting blijft meting',
      '- #9: trede Schrappen of vereenvoudigen; bewijs meting: 3 → 1 (x)',
      { meting: '3 → 1 (x)' },
    ],
  ])('gedragsbaseline/AC-1: %s', (...[, regel, verwacht]) => {
    expect(leesLeerpuntSectie(sectie(regel))).toMatchObject([{ nummer: 9, ...leeg, ...verwacht }]);
  });
});

describe('gedragsbaseline/AC-2 een correcte baseline met scenario is goed', () => {
  test.each(['Skill', 'Padregel', 'AGENTS.md'].flatMap((trede) => [0, 1, 2].map((a) => [trede, a] as const)))(
    'gedragsbaseline/AC-2: trede %s, zonder %i/3',
    (trede, a) => {
      const uitslag = baselinePlan({
        trede,
        bewijs: `baseline: zonder ${String(a)}/3, met 3/3 (opus)`,
        scenario: blok(9, LABELS, runRegels(a)),
      });
      expect(uitslag.fouten).toEqual([]);
      expect(uitslag.runs).toEqual([]);
    },
  );

  test.each([
    ['agents', ['.claude/agents/review.md']],
    ['rules', ['.claude/rules/db.md']],
    ['AGENTS.md', ['AGENTS.md']],
    ['CLAUDE.md', ['CLAUDE.md']],
    ['tekstpad naast ander pad', ['src/a.ts', '.claude/skills/x/SKILL.md']],
  ])('gedragsbaseline/AC-2: diff met %s', (...[, diff]) => {
    expect(baselinePlan({ diff }).fouten).toEqual([]);
  });

  test('gedragsbaseline/AC-2: twee teksttreden-leerpunten hebben elk een eigen regel en blok', () => {
    const body = sectie(
      `- #9: trede Skill; bewijs ${BASELINE}`,
      '- #10: trede Padregel; bewijs baseline: zonder 2/3, met 3/3 (opus)',
      '',
      ...blok(9),
      '',
      ...blok(10, LABELS, runRegels(2)),
    );
    const uitslag = plan(body, TEKSTDIFF, [LP(9), LP(10)]);
    expect(uitslag.fouten).toEqual([]);
    expect(uitslag.runs).toEqual([]);
  });
});

describe('gedragsbaseline/AC-3 een afwijking in de bewijsregel geeft de melding', () => {
  test.each([
    ['trede Check', { trede: 'Check' }, [NIET_TEKST('baseline:')]],
    ['trede Type', { trede: 'Type' }, [NIET_TEKST('baseline:')]],
    ['trede Gouden pad of generator', { trede: 'Gouden pad of generator' }, [NIET_TEKST('baseline:')]],
    ['trede Schrappen of vereenvoudigen', { trede: 'Schrappen of vereenvoudigen' }, [NIET_TEKST('baseline:')]],
    ['onbekende trede gaat voor', { trede: 'Lint' }, ['#9: onbekende trede "Lint"']],
    [
      'met 2/3',
      { bewijs: 'baseline: zonder 1/3, met 2/3 (opus)' },
      ['#9: met 2/3: alle drie runs met de wijziging moeten ja geven'],
    ],
    [
      'met 0/3',
      { bewijs: 'baseline: zonder 1/3, met 0/3 (opus)' },
      ['#9: met 0/3: alle drie runs met de wijziging moeten ja geven'],
    ],
    [
      'zonder 3/3',
      { bewijs: 'baseline: zonder 3/3, met 3/3 (opus)' },
      ['#9: zonder 3/3: het scenario reproduceert niet; wijzig de tekst niet, de eigenaar beslist over het leerpunt'],
    ],
    [
      'met gaat voor zonder',
      { bewijs: 'baseline: zonder 3/3, met 2/3 (opus)' },
      ['#9: met 2/3: alle drie runs met de wijziging moeten ja geven'],
    ],
    ['model leeg', { bewijs: 'baseline: zonder 1/3, met 3/3 ()' }, [VORM('zonder 1/3, met 3/3 ()')]],
    ['model alleen spaties', { bewijs: 'baseline: zonder 1/3, met 3/3 (  )' }, [VORM('zonder 1/3, met 3/3 (  )')]],
    ['zonder /3', { bewijs: 'baseline: zonder 1, met 3/3 (opus)' }, [VORM('zonder 1, met 3/3 (opus)')]],
    ['met zonder /3', { bewijs: 'baseline: zonder 1/3, met 3 (opus)' }, [VORM('zonder 1/3, met 3 (opus)')]],
    ['zonder 4/3', { bewijs: 'baseline: zonder 4/3, met 3/3 (opus)' }, [VORM('zonder 4/3, met 3/3 (opus)')]],
    ['model ontbreekt', { bewijs: 'baseline: zonder 1/3, met 3/3' }, [VORM('zonder 1/3, met 3/3')]],
    ['lege baseline', { bewijs: 'baseline:' }, [VORM('')]],
    [
      'diff met alleen src/a.ts',
      { diff: ['src/a.ts'] },
      [
        '#9: geen pad onder .claude/agents/, .claude/skills/, .claude/rules/, AGENTS.md of CLAUDE.md toegevoegd of gewijzigd in de diff',
      ],
    ],
    [
      'AGENTS.md alleen als exact pad',
      { diff: ['docs/AGENTS.md', '.claude/settings.json'] },
      [
        '#9: geen pad onder .claude/agents/, .claude/skills/, .claude/rules/, AGENTS.md of CLAUDE.md toegevoegd of gewijzigd in de diff',
      ],
    ],
    [
      'lege diff',
      { diff: [] },
      [
        '#9: geen pad onder .claude/agents/, .claude/skills/, .claude/rules/, AGENTS.md of CLAUDE.md toegevoegd of gewijzigd in de diff',
      ],
    ],
  ] satisfies [string, Opties, string[]][])('gedragsbaseline/AC-3: %s', (...[, opties, fouten]) => {
    expect(baselinePlan(opties).fouten).toEqual(fouten);
  });

  test('gedragsbaseline/AC-3: een afwijking geeft geen run', () => {
    expect(baselinePlan({ bewijs: 'baseline: zonder 1/3, met 2/3 (opus)' }).runs).toEqual([]);
  });
});

describe('gedragsbaseline/AC-4 het scenarioblok', () => {
  const zonderLabel = (label: string) => LABELS.filter((regel) => !regel.includes(label));
  const regelFoutMet = (scenario: string[]) => baselinePlan({ scenario }).fouten;

  test.each([
    ['geen blok', []],
    ['blok met een ander nummer', blok(8)],
    ['kop zonder nummer', ['### Scenario', ...LABELS, ...runRegels(1)]],
    ['kop met ##', ['## Scenario #9', ...LABELS, ...runRegels(1)]],
  ])('gedragsbaseline/AC-4: %s', (...[, scenario]) => {
    expect(regelFoutMet(scenario)).toEqual([GEEN_BLOK]);
  });

  test.each([
    ['Prompt', zonderLabel('Prompt:'), ['#9: scenario zonder Prompt']],
    ['Beginstand', zonderLabel('Beginstand:'), ['#9: scenario zonder Beginstand']],
    ['Criterium', zonderLabel('Criterium:'), ['#9: scenario zonder Criterium']],
    [
      'Prompt en Criterium',
      LABELS.filter((regel) => regel.includes('Beginstand:')),
      ['#9: scenario zonder Prompt', '#9: scenario zonder Criterium'],
    ],
    ['leeg Prompt', ['- Prompt:', LABELS[1] ?? '', LABELS[2] ?? ''], ['#9: scenario zonder Prompt']],
    ['Criterium alleen spaties', [...LABELS.slice(0, 2), '- Criterium:   '], ['#9: scenario zonder Criterium']],
  ])('gedragsbaseline/AC-4: label ontbreekt of is leeg: %s', (...[, labels, fouten]) => {
    expect(regelFoutMet(blok(9, labels))).toEqual(fouten);
  });

  test.each([
    ['* als opsommingsteken', LABELS.map((l) => l.replace(/^- /, '* '))],
    ['genummerd', LABELS.map((l, i) => l.replace(/^- /, `${String(i + 1)}. `))],
    ['vette labels', LABELS.map((l) => l.replace(/^- (\w+):/, '- **$1:**'))],
    ['waarde op de volgende regel', ['- Prompt:', 'sluit het issue', LABELS[1] ?? '', LABELS[2] ?? '']],
    ['waarde over twee regels', ['- Prompt: sluit het issue', 'en meld het', LABELS[1] ?? '', LABELS[2] ?? '']],
  ])('gedragsbaseline/AC-4: normalisatie en meerregelige waarde: %s', (...[, labels]) => {
    expect(regelFoutMet(blok(9, labels))).toEqual([]);
  });

  test.each([
    ['runregel zonder 3 ontbreekt', runRegels(1).filter((r) => !r.startsWith('- zonder 3:'))],
    ['runregel met 1 ontbreekt', runRegels(1).filter((r) => !r.startsWith('- met 1:'))],
    ['geen runregels', []],
    ['runregel dubbel', [...runRegels(1), '- met 2: ja — nog een']],
    ['runregel zonder streepje en zin', runRegels(1).map((r) => r.replace('zonder 1: ja — één zin', 'zonder 1: ja'))],
    ['runnummer 4', [...runRegels(1).slice(0, 5), '- met 4: ja — één zin']],
    ['runregels onder een andere kop', ['### Overig', ...runRegels(1)]],
  ])('gedragsbaseline/AC-4: %s', (...[, runs]) => {
    expect(regelFoutMet(blok(9, LABELS, runs))).toEqual([RUNREGELS]);
  });

  test.each([
    [
      'hoofdletters en lange streep',
      ['- Zonder 1: NEE — x', '- zonder 2: ja – x', '- zonder 3: nee - x', ...runRegels(0).slice(3)],
    ],
    ['genummerd', runRegels(1).map((r) => r.replace(/^- /, '1. '))],
    ['vet', runRegels(1).map((r) => r.replace(/^- (\w+ \d):/, '- **$1:**'))],
  ])('gedragsbaseline/AC-4: runregelvormen: %s', (...[, runs]) => {
    expect(regelFoutMet(blok(9, LABELS, runs.slice(0, 6)))).toEqual([]);
  });

  test.each([
    [
      'zonder 2 ja bij zonder 1/3',
      runRegels(2),
      '#9: runregels geven zonder 2/3, met 3/3; de bewijsregel zegt zonder 1/3, met 3/3',
    ],
    [
      'zonder 0 ja bij zonder 1/3',
      runRegels(0),
      '#9: runregels geven zonder 0/3, met 3/3; de bewijsregel zegt zonder 1/3, met 3/3',
    ],
    [
      'met 2 ja bij met 3/3',
      runRegels(1, 2),
      '#9: runregels geven zonder 1/3, met 2/3; de bewijsregel zegt zonder 1/3, met 3/3',
    ],
  ])('gedragsbaseline/AC-4: tellingen passen niet: %s', (...[, runs, fout]) => {
    expect(regelFoutMet(blok(9, LABELS, runs))).toEqual([fout]);
  });

  test('gedragsbaseline/AC-4: de toets heeft hooguit één fout per leerpunt: eerst kop, dan labels, dan runregels', () => {
    expect(regelFoutMet(blok(9, zonderLabel('Prompt:'), runRegels(2).slice(1)))).toEqual([
      '#9: scenario zonder Prompt',
    ]);
    expect(regelFoutMet([`### Scenario #9`, ...LABELS, ...runRegels(2).slice(1)])).toEqual([RUNREGELS]);
  });

  test('gedragsbaseline/AC-4: een volgend blok eindigt het blok van dit leerpunt', () => {
    const volgend = blok(10, LABELS, runRegels(1));
    const body = sectie(`- #9: trede Skill; bewijs ${BASELINE}`, '', ...blok(9, LABELS, []), ...volgend);
    expect(plan(body, TEKSTDIFF).fouten).toEqual([RUNREGELS]);
  });

  test('gedragsbaseline/AC-4: een ###-blok in de sectie beëindigt de regels van ## Leerpunt niet (regressie)', () => {
    const body = sectie(
      '- #9: trede Skill; bewijs ' + BASELINE,
      ...blok(9),
      '- #10: trede Check; bewijs test/a.test.ts',
    );
    expect(leesLeerpuntSectie(body).map((r) => r.nummer)).toEqual([9, 10]);
  });
});

describe('gedragsbaseline/AC-5 geen baseline: <reden>', () => {
  const GEEN = 'geen baseline: schrijfgedrag';

  test.each(['Skill', 'Padregel', 'AGENTS.md'])(
    'gedragsbaseline/AC-5: trede %s met reden is goed, zonder diff of scenario en zonder run',
    (trede) => {
      const uitslag = baselinePlan({ trede, bewijs: GEEN, scenario: [], diff: [] });
      expect(uitslag.fouten).toEqual([]);
      expect(uitslag.runs).toEqual([]);
    },
  );

  test.each(['Type', 'Check', 'Gouden pad of generator', 'Schrappen of vereenvoudigen'])(
    'gedragsbaseline/AC-5: trede %s met geen baseline is fout',
    (trede) => {
      expect(baselinePlan({ trede, bewijs: GEEN }).fouten).toEqual([NIET_TEKST('geen baseline:')]);
    },
  );

  test('gedragsbaseline/AC-5: een lege reden is fout', () => {
    expect(baselinePlan({ bewijs: 'geen baseline:', scenario: [] }).fouten).toEqual([
      '#9: "geen baseline" zonder reden',
    ]);
  });

  test.each(['Skill', 'Padregel', 'AGENTS.md'])(
    'gedragsbaseline/AC-5: trede %s met "geen test:" is altijd fout (OV-1)',
    (trede) => {
      const fout = `#9: bij trede ${trede} is het bewijs "baseline: …" of "geen baseline: <reden>", geen "geen test:"`;
      expect(baselinePlan({ trede, bewijs: 'geen test: alleen tekst' }).fouten).toEqual([fout]);
      expect(baselinePlan({ trede, bewijs: 'geen test: e2e/a.test.ts', diff: ['e2e/a.test.ts'] }).fouten).toEqual([
        fout,
      ]);
    },
  );

  test.each(['Skill', 'Padregel', 'AGENTS.md'])(
    'gedragsbaseline/AC-5: trede %s met een testpad is altijd fout (OV-1)',
    (trede) => {
      const fout = `#9: bij trede ${trede} is het bewijs "baseline: …" of "geen baseline: <reden>", geen testpad`;
      const uitslag = baselinePlan({ trede, bewijs: 'test/a.test.ts', diff: ['test/a.test.ts'] });
      expect(uitslag.fouten).toEqual([fout]);
      expect(uitslag.runs).toEqual([]);
    },
  );
});
