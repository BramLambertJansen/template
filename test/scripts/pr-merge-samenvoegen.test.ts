import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { samengevoegd } from '../../rails/hooks/lib/padtabel.mjs';
import * as prMerge from '../../scripts/kit/pr-merge.mjs';

// spec agent-samenvoegen (docs/template/specs/agent-samenvoegen.md, ADR 0093), tests vóór de bouw: het mergescript beslist weer
// op de padtabel. AC-1 en AC-2 toetsen de pure functie `beschermdPad(pad, tabel, repo)` (`tabel` = de samengevoegde ruwe
// gates-inhoud, `repo` = `owner/naam`; geeft `true` of `false`); AC-3 en AC-4 toetsen `beoordeelMerge` met een nep-API per
// endpoint, zoals test/scripts/pr-merge.test.ts. AC-5 staat in test/scripts/github-ruleset-templateregime.test.ts.
// agent-samenvoegen/AC-7 is bewijs na de merge (uitvoer in de thread en in de PR), geen test.
//
// Afspraken die de bouw volgt (ze volgen uit de spec, maar de spec noemt geen exacte vorm):
// - een 404 van GitHub is in de nep-API een Error met "HTTP 404" in de melding (zo meldt `gh api` het); elke andere fout op
//   `gates.app.json` is niet te lezen, dus een reden;
// - `beschermdPad` gooit bij een padtabel die niet te lezen is (oude vorm zonder `paden`); `beoordeelMerge` vangt dat op.
const ROOT = path.join(import.meta.dirname, '../..');
const REPO = 'BramLambertJansen/template';
const APP = 'eigenaar/app';
const HEAD = 'a'.repeat(40);
const MAIN = 'b'.repeat(40);
const ACTIONS = 15368;
const VEREIST = ['gate:fast', 'check-core'];
const b64 = (waarde: unknown) => Buffer.from(JSON.stringify(waarde)).toString('base64');
const NIET_GEVONDEN = new Error('gh: Not Found (HTTP 404)');

function alsObject(ruw: unknown): Record<string, unknown> {
  if (typeof ruw !== 'object' || ruw === null || Array.isArray(ruw)) throw new Error('verwacht een object');
  return Object.fromEntries(Object.entries(ruw));
}

const ECHT: unknown = JSON.parse(readFileSync(path.join(ROOT, '.claude/gates.json'), 'utf8'));
// De padtabel van de template: de echte gates.json, `onderhoud.repository` is REPO.
const TEMPLATE_TABEL = { ...alsObject(ECHT), merge: 'niet-kritiek' };
// Dezelfde tabel zonder `onderhoud`: zo ziet de padtabel van een app eruit.
const APP_TABEL = Object.fromEntries(Object.entries(TEMPLATE_TABEL).filter(([sleutel]) => sleutel !== 'onderhoud'));

function beschermdPad(pad: string, tabel: unknown, repo: string): unknown {
  const functie: unknown = Reflect.get(prMerge, 'beschermdPad');
  expect(typeof functie, 'beschermdPad is een export van scripts/kit/pr-merge.mjs').toBe('function');
  return typeof functie === 'function' ? Reflect.apply(functie, undefined, [pad, tabel, repo]) : undefined;
}

// De paden die niet precies `false` krijgen (dus ook bij een ontbrekende of onjuiste uitkomst): een lege lijst is goed.
function nietVrij(paden: string[], tabel: unknown, repo: string): string[] {
  return paden.filter((pad) => beschermdPad(pad, tabel, repo) !== false);
}

describe('agent-samenvoegen/AC-1 padtoets, template', () => {
  test('agent-samenvoegen/AC-1: src/web/x.tsx en docs/x.md zijn vrij (besluit agent)', () => {
    expect(nietVrij(['src/web/x.tsx', 'docs/x.md'], TEMPLATE_TABEL, REPO)).toEqual([]);
  });

  test.each(['docs/roadmap.md', 'src/x.test.ts', 'scripts/x.mjs', 'package.json', 'LICENSE'])(
    'agent-samenvoegen/AC-1: %s is beschermd (besluit niet agent, of geen passende glob)',
    (pad) => {
      expect(beschermdPad(pad, TEMPLATE_TABEL, REPO)).toBe(true);
    },
  );
});

describe('agent-samenvoegen/AC-2 padtoets, app', () => {
  const VRIJ = [
    'src/x.test.ts',
    'test/x.test.ts',
    'docs/roadmap.md',
    'docs/specs/x.md',
    'src/api/app.ts',
    'deploy/x/y.ts',
    'src/web/x.tsx',
  ];
  const BESCHERMD = [
    '.github/workflows/x.yml',
    'package.json',
    'scripts/x.mjs',
    'AGENTS.md',
    'eslint.config.js',
    '.claude/agents/x.md',
    'docs/adr/0001-x.md',
    'db/migrations/1_x.sql',
    'src/core/api/auth/x.ts',
    'src/core/web/x.tsx',
    'docs/template/adr/x.md',
  ];

  test('agent-samenvoegen/AC-2: de vrije paden zijn vrij in een padtabel zonder onderhoud', () => {
    expect(nietVrij(VRIJ, APP_TABEL, REPO)).toEqual([]);
  });

  test.each(BESCHERMD)('agent-samenvoegen/AC-2: %s is beschermd in een padtabel zonder onderhoud', (pad) => {
    expect(beschermdPad(pad, APP_TABEL, REPO)).toBe(true);
  });

  test('agent-samenvoegen/AC-2: ook met onderhoud van een andere repository telt de smalle lijst van een app', () => {
    expect(beschermdPad('src/x.test.ts', TEMPLATE_TABEL, APP)).toBe(false);
    expect(beschermdPad('docs/roadmap.md', TEMPLATE_TABEL, APP)).toBe(false);
    expect(beschermdPad('scripts/x.mjs', TEMPLATE_TABEL, APP)).toBe(true);
    expect(beschermdPad('src/core/web/x.tsx', TEMPLATE_TABEL, APP)).toBe(true);
  });

  test('agent-samenvoegen/AC-2: dezelfde padtabel met onderhoud gelijk aan de repository is de brede lijst van de template', () => {
    expect(beschermdPad('src/x.test.ts', TEMPLATE_TABEL, REPO)).toBe(true);
    expect(beschermdPad('src/x.test.ts', TEMPLATE_TABEL, APP)).toBe(false);
  });

  describe('rijen uit .claude/gates.app.json, strengste wint', () => {
    const MET_APP_RIJEN = samengevoegd(APP_TABEL, {
      paden: {
        'src/billing/**': { besluit: 'besluit-pr' },
        'src/web/instellingen/**': { schrijven: 'voorReview' },
        'src/web/eigenaar/**': { besluit: 'eigenaar' },
        'src/web/gate/**': { schrijven: 'gate' },
      },
    });

    test.each(['src/billing/x.ts', 'src/web/instellingen/x.tsx'])(
      'agent-samenvoegen/AC-2: %s maakt een rij met besluit-pr of schrijven voorReview beschermd',
      (pad) => {
        expect(beschermdPad(pad, MET_APP_RIJEN, REPO)).toBe(true);
      },
    );

    test('agent-samenvoegen/AC-2: een rij met alleen eigenaar of gate maakt een pad niet beschermd', () => {
      const paden = ['src/web/eigenaar/x.tsx', 'src/web/gate/x.tsx', 'src/web/x.tsx'];
      expect(nietVrij(paden, MET_APP_RIJEN, REPO)).toEqual([]);
    });
  });
});

// De nep-API per endpoint, zoals test/scripts/pr-merge.test.ts. Een waarde die een Error is, wordt gegooid; `Paginas` levert
// een lijst per pagina van 100 uit.
class Paginas {
  readonly items: unknown[];

  constructor(items: unknown[]) {
    this.items = items;
  }
}

type Wereld = Record<string, unknown>;

function check(name: string, sha: string, extra: Record<string, unknown> = {}) {
  return { id: 1, name, head_sha: sha, status: 'completed', conclusion: 'success', app: { id: ACTIONS }, ...extra };
}

const bestanden = (...paden: string[]) => paden.map((filename) => ({ filename, status: 'modified' }));

function goed(repo: string, gates: unknown): Wereld {
  const sleutel = (rest: string) => `repos/${repo}/${rest}`;
  return {
    [sleutel('branches/main')]: { commit: { sha: MAIN } },
    [sleutel(`contents/.claude/gates.json?ref=${MAIN}`)]: { content: b64(gates) },
    [sleutel(`contents/.claude/gates.app.json?ref=${MAIN}`)]: NIET_GEVONDEN,
    [sleutel(`contents/.claude/decisions.json?ref=${MAIN}`)]: { content: b64({ requiredChecks: VEREIST }) },
    [sleutel('pulls/7')]: {
      state: 'open',
      draft: false,
      base: { ref: 'main' },
      head: { sha: HEAD, repo: { full_name: repo } },
    },
    [sleutel('pulls/7/files')]: bestanden('src/web/x.tsx'),
    [sleutel(`commits/${HEAD}/check-runs`)]: { check_runs: VEREIST.map((naam) => check(naam, HEAD)) },
    [sleutel(`commits/${MAIN}/check-runs`)]: { check_runs: [check('gate:fast', MAIN)] },
  };
}

const templateWereld = () => goed(REPO, TEMPLATE_TABEL);
const appWereld = () => goed(APP, APP_TABEL);

const zet = (repo: string, rest: string, waarde: unknown) => (w: Wereld) => {
  w[`repos/${repo}/${rest}`] = waarde;
};
const zetBestanden = (repo: string, lijst: unknown) => zet(repo, 'pulls/7/files', lijst);
const zetApp = (repo: string, waarde: unknown) => zet(repo, `contents/.claude/gates.app.json?ref=${MAIN}`, waarde);

function api(wereld: Wereld, gelezen: string[] = []) {
  return (endpoint: string) => {
    const sleutel = endpoint.replace(/[?&]per_page=100&page=\d+$/, '');
    const pagina = Number(/[?&]page=(\d+)$/.exec(endpoint)?.[1] ?? '1');
    gelezen.push(sleutel);
    if (!(sleutel in wereld)) throw new Error(`onbekend endpoint ${sleutel}`);
    const waarde = wereld[sleutel];
    if (waarde instanceof Error) throw waarde;
    return waarde instanceof Paginas ? waarde.items.slice((pagina - 1) * 100, pagina * 100) : waarde;
  };
}

function beoordeel(wereld: Wereld, repo = REPO, gelezen: string[] = []): string[] {
  return prMerge.beoordeelMerge(api(wereld, gelezen), { repo, nummer: 7, head: HEAD }).redenen;
}

function beoordeelMet(maak: () => Wereld, repo: string, ...aanpassingen: ((w: Wereld) => void)[]): string[] {
  const wereld = maak();
  for (const aanpassing of aanpassingen) aanpassing(wereld);
  return beoordeel(wereld, repo);
}

const template = (...aanpassingen: ((w: Wereld) => void)[]) => beoordeelMet(templateWereld, REPO, ...aanpassingen);
const app = (...aanpassingen: ((w: Wereld) => void)[]) => beoordeelMet(appWereld, APP, ...aanpassingen);

const ONLEESBAAR = 'de bestanden van de PR of de padtabel op main zijn niet te lezen: de eigenaar voegt samen';
const beschermd = (paden: string) => `raakt een beschermd pad (${paden}): de eigenaar voegt samen`;

describe('agent-samenvoegen/AC-3 de padtoets op de bestanden van de PR', () => {
  test('agent-samenvoegen/AC-3: een PR met alleen vrije bestanden geeft geen reden', () => {
    expect(template()).toEqual([]);
  });

  test('agent-samenvoegen/AC-3: de bestanden komen uit repos/<repo>/pulls/<nr>/files, de padtabel van de kop van main', () => {
    const gelezen: string[] = [];
    beoordeel(templateWereld(), REPO, gelezen);
    expect(gelezen).toContain(`repos/${REPO}/pulls/7/files`);
    expect(gelezen).toContain(`repos/${REPO}/contents/.claude/gates.json?ref=${MAIN}`);
  });

  test('agent-samenvoegen/AC-3: een beschermd pad geeft precies de reden met dat pad', () => {
    expect(template(zetBestanden(REPO, bestanden('src/web/x.tsx', 'docs/roadmap.md', 'docs/x.md')))).toEqual([
      beschermd('docs/roadmap.md'),
    ]);
  });

  test('agent-samenvoegen/AC-3: hernoemen van een beschermd pad naar een vrij pad is beschermd (previous_filename)', () => {
    const hernoemd = [{ filename: 'docs/x.md', previous_filename: 'docs/roadmap.md', status: 'renamed' }];
    const redenen = template(zetBestanden(REPO, hernoemd));
    expect(redenen).toHaveLength(1);
    expect(redenen[0]).toMatch(/^raakt een beschermd pad \(.*docs\/roadmap\.md.*\): de eigenaar voegt samen$/);
  });

  test('agent-samenvoegen/AC-3: hernoemen van een vrij pad naar een beschermd pad is beschermd (filename)', () => {
    const hernoemd = [{ filename: 'scripts/x.mjs', previous_filename: 'docs/x.md', status: 'renamed' }];
    expect(template(zetBestanden(REPO, hernoemd))).toEqual([beschermd('scripts/x.mjs')]);
  });

  test('agent-samenvoegen/AC-3: hernoemen van een vrij pad naar een vrij pad geeft geen reden', () => {
    const hernoemd = [{ filename: 'docs/y.md', previous_filename: 'docs/x.md', status: 'renamed' }];
    expect(template(zetBestanden(REPO, hernoemd))).toEqual([]);
  });

  test('agent-samenvoegen/AC-3: hoogstens vijf paden: bij precies vijf staan ze er alle vijf, zonder "en <n> meer"', () => {
    const vijf = ['docs/roadmap.md', 'package.json', 'scripts/a.mjs', 'scripts/b.mjs', 'scripts/c.mjs'];
    expect(template(zetBestanden(REPO, bestanden(...vijf)))).toEqual([beschermd(vijf.join(', '))]);
  });

  test('agent-samenvoegen/AC-3: bij zeven beschermde paden staan de eerste vijf erin, dan ", en 2 meer"', () => {
    const zeven = [
      'docs/roadmap.md',
      'package.json',
      'scripts/a.mjs',
      'scripts/b.mjs',
      'scripts/c.mjs',
      'scripts/d.mjs',
      'scripts/e.mjs',
    ];
    expect(template(zetBestanden(REPO, bestanden(...zeven)))).toEqual([
      beschermd('docs/roadmap.md, package.json, scripts/a.mjs, scripts/b.mjs, scripts/c.mjs, en 2 meer'),
    ]);
  });

  test('agent-samenvoegen/AC-3: vrije bestanden staan niet in de lijst en tellen niet mee in "meer"', () => {
    const zes = ['docs/roadmap.md', 'package.json', 'scripts/a.mjs', 'scripts/b.mjs', 'scripts/c.mjs', 'scripts/d.mjs'];
    const gemengd = bestanden('src/web/x.tsx', ...zes.slice(0, 3), 'docs/x.md', ...zes.slice(3), 'src/web/y.tsx');
    expect(template(zetBestanden(REPO, gemengd))).toEqual([
      beschermd('docs/roadmap.md, package.json, scripts/a.mjs, scripts/b.mjs, scripts/c.mjs, en 1 meer'),
    ]);
  });

  test("agent-samenvoegen/AC-3: alle pagina's worden gelezen: een beschermd pad op de tweede pagina telt", () => {
    const vrij = Array.from({ length: 119 }, (_, i) => `src/web/vrij${String(i)}.tsx`);
    const lijst = new Paginas(bestanden(...vrij, 'package.json', 'src/web/laatste.tsx'));
    expect(template(zetBestanden(REPO, lijst))).toEqual([beschermd('package.json')]);
  });

  test('agent-samenvoegen/AC-3: de padtoets leest de bestanden in een app net zo', () => {
    expect(app(zetBestanden(APP, bestanden('src/web/x.tsx', 'src/core/api/auth/x.ts')))).toEqual([
      beschermd('src/core/api/auth/x.ts'),
    ]);
    expect(app(zetBestanden(APP, bestanden('src/x.test.ts', 'docs/roadmap.md', 'src/web/x.tsx')))).toEqual([]);
  });
});

describe('agent-samenvoegen/AC-3 onleesbaar: de eigenaar voegt samen', () => {
  const ONLEESBARE_LIJSTEN: [string, unknown][] = [
    ['de lijst is geen lijst', 'kapot'],
    ['de aanroep van de lijst faalt', new Error('gh: HTTP 502')],
    ['een bestand zonder filename', [{ status: 'modified' }]],
    [
      'een bestand zonder filename naast een vrij bestand',
      [...bestanden('src/web/x.tsx'), { previous_filename: 'docs/x.md' }],
    ],
    ['een filename die geen tekst is', [{ filename: 7 }]],
    ['een item dat geen object is', ['src/web/x.tsx']],
  ];

  test.each(ONLEESBARE_LIJSTEN)('agent-samenvoegen/AC-3: %s', (_naam, lijst) => {
    expect(template(zetBestanden(REPO, lijst))).toEqual([ONLEESBAAR]);
  });

  test("agent-samenvoegen/AC-3: meer dan tien pagina's (1001 bestanden) is niet te lezen", () => {
    const veel = new Paginas(bestanden(...Array.from({ length: 1001 }, (_, i) => `src/web/vrij${String(i)}.tsx`)));
    expect(template(zetBestanden(REPO, veel))).toEqual([ONLEESBAAR]);
  });

  const ONLEESBARE_TABELLEN: [string, unknown][] = [
    ['een padtabel in de oude vorm, zonder paden', { merge: 'niet-kritiek', gates: ['src/**'] }],
    ['een padtabel waarvan paden geen object is', { merge: 'niet-kritiek', paden: 'src/**' }],
  ];

  test.each(ONLEESBARE_TABELLEN)('agent-samenvoegen/AC-3: %s op main', (_naam, tabel) => {
    const wereld = goed(REPO, tabel);
    expect(beoordeel(wereld)).toEqual([ONLEESBAAR]);
  });

  const ONLEESBARE_APP_BESTANDEN: [string, unknown][] = [
    ['gates.app.json is geen geldige JSON', { content: Buffer.from('{ dit is geen json').toString('base64') }],
    ['gates.app.json is geldige JSON zonder paden', { content: b64({}) }],
    ['gates.app.json heeft een paden die geen object is', { content: b64({ paden: ['src/**'] }) }],
    ['gates.app.json is niet te lezen om een andere reden dan 404', new Error('gh: HTTP 500')],
  ];

  test.each(ONLEESBARE_APP_BESTANDEN)('agent-samenvoegen/AC-3: %s', (_naam, antwoord) => {
    expect(app(zetApp(APP, antwoord))).toEqual([ONLEESBAAR]);
  });

  test('agent-samenvoegen/AC-3: een gates.app.json dat niet bestaat (404) telt als leeg: alleen de padtabel van de template telt', () => {
    expect(app()).toEqual([]);
    expect(app(zetBestanden(APP, bestanden('package.json')))).toEqual([beschermd('package.json')]);
    expect(app(zetBestanden(APP, bestanden('src/x.test.ts', 'src/web/x.tsx')))).toEqual([]);
  });

  test('agent-samenvoegen/AC-3: ook zonder reden van een andere kant geeft onleesbaar precies één reden en geen schrijfactie', () => {
    const gelezen: string[] = [];
    const wereld = templateWereld();
    zetBestanden(REPO, 'kapot')(wereld);
    expect(beoordeel(wereld, REPO, gelezen)).toEqual([ONLEESBAAR]);
    // Alleen lezen: elk endpoint is een GET zonder schrijfvoorvoegsel.
    expect(gelezen.filter((endpoint) => /merge|-X/.test(endpoint))).toEqual([]);
  });
});

describe('agent-samenvoegen/AC-3 rijen uit .claude/gates.app.json op main', () => {
  const rij = (glob: string, waarde: Record<string, string>) => ({ content: b64({ paden: { [glob]: waarde } }) });

  test('agent-samenvoegen/AC-3: een rij met besluit-pr maakt het pad beschermd, zonder de rij is het vrij', () => {
    const wijziging = zetBestanden(APP, bestanden('src/billing/x.ts'));
    expect(app(wijziging)).toEqual([]);
    expect(app(wijziging, zetApp(APP, rij('src/billing/**', { besluit: 'besluit-pr' })))).toEqual([
      beschermd('src/billing/x.ts'),
    ]);
  });

  test('agent-samenvoegen/AC-3: een rij met schrijven voorReview maakt het pad beschermd', () => {
    const wijziging = zetBestanden(APP, bestanden('src/web/instellingen/x.tsx'));
    expect(app(wijziging, zetApp(APP, rij('src/web/instellingen/**', { schrijven: 'voorReview' })))).toEqual([
      beschermd('src/web/instellingen/x.tsx'),
    ]);
  });

  test.each([
    ['eigenaar', { besluit: 'eigenaar' }],
    ['gate', { schrijven: 'gate' }],
  ])('agent-samenvoegen/AC-3: een rij met alleen %s maakt het pad niet beschermd', (_naam, waarde) => {
    const wijziging = zetBestanden(APP, bestanden('src/web/eigen/x.tsx'));
    expect(app(wijziging, zetApp(APP, rij('src/web/eigen/**', waarde)))).toEqual([]);
  });
});

describe('agent-samenvoegen/AC-4 samenvoegen', () => {
  test('agent-samenvoegen/AC-4: zonder reden uit de modus, de PR, de padtoets, de checks en main is de lijst leeg', () => {
    expect(template()).toEqual([]);
    expect(app()).toEqual([]);
  });

  test('agent-samenvoegen/AC-4: een andere modus dan niet-kritiek stopt als eerste, zonder de bestanden te lezen', () => {
    const gelezen: string[] = [];
    const wereld = goed(REPO, { ...TEMPLATE_TABEL, merge: 'eigenaar' });
    zetBestanden(REPO, bestanden('docs/roadmap.md'))(wereld);
    const redenen = beoordeel(wereld, REPO, gelezen);
    expect(redenen).toHaveLength(1);
    expect(redenen[0]).toMatch(/modus/);
    expect(gelezen).not.toContain(`repos/${REPO}/pulls/7/files`);
  });

  test('agent-samenvoegen/AC-4: een beschermd pad en een mislukte check geven beide redenen, de padreden eerst', () => {
    const rood = zet(REPO, `commits/${HEAD}/check-runs`, {
      check_runs: [check('gate:fast', HEAD, { conclusion: 'failure' }), check('check-core', HEAD)],
    });
    const redenen = template(zetBestanden(REPO, bestanden('docs/roadmap.md')), rood);
    expect(redenen).toHaveLength(2);
    expect(redenen[0]).toBe(beschermd('docs/roadmap.md'));
    expect(redenen[1]).toMatch(/verplichte checks niet groen/);
  });

  test('agent-samenvoegen/AC-4: de volgorde is PR, padtoets, checks van de head, main; geen vroege return', () => {
    const gesloten = zet(REPO, 'pulls/7', {
      state: 'closed',
      draft: false,
      base: { ref: 'main' },
      head: { sha: HEAD, repo: { full_name: REPO } },
    });
    const headRood = zet(REPO, `commits/${HEAD}/check-runs`, {
      check_runs: [check('gate:fast', HEAD, { conclusion: 'failure' }), check('check-core', HEAD)],
    });
    const mainRood = zet(REPO, `commits/${MAIN}/check-runs`, {
      check_runs: [check('gate:fast', MAIN, { conclusion: 'failure' })],
    });
    const redenen = template(zetBestanden(REPO, bestanden('package.json')), gesloten, headRood, mainRood);
    expect(redenen).toHaveLength(4);
    expect(redenen[0]).toMatch(/niet open/);
    expect(redenen[1]).toBe(beschermd('package.json'));
    expect(redenen[2]).toMatch(/verplichte checks niet groen/);
    expect(redenen[3]).toMatch(/main is niet groen/);
  });

  test('agent-samenvoegen/AC-4: een PR met een beschermd pad en groene checks geeft alleen de padreden', () => {
    expect(template(zetBestanden(REPO, bestanden('scripts/x.mjs')))).toEqual([beschermd('scripts/x.mjs')]);
  });

  test('agent-samenvoegen/AC-4: de bestaande slotregels blijven: de melding en de steekproefregel', () => {
    expect(prMerge.slotRegels(7, HEAD)).toEqual([
      `PR #7 gemerged op ${HEAD}. Meld PR en SHA in de thread en volg de CI op main (ADR 0069 punt 5).`,
      prMerge.STEEKPROEF,
    ]);
  });
});

describe('agent-samenvoegen/AC-4 de grenscontrole van templateregime AC-14 bestaat niet meer', () => {
  test.each(['grensRedenen', 'REDEN_GEEN_REVIEW', 'REDEN_BYPASS', 'REDEN_CODEOWNERS', 'REDEN_ONLEESBAAR'])(
    'agent-samenvoegen/AC-4: %s is geen export meer',
    (naam) => {
      expect(Object.keys(prMerge)).toContain('beoordeelMerge');
      expect(Object.keys(prMerge)).not.toContain(naam);
    },
  );

  test('agent-samenvoegen/AC-4: een wereld zonder enig ruleset-endpoint geeft geen reden en leest er geen', () => {
    const gelezen: string[] = [];
    expect(beoordeel(templateWereld(), REPO, gelezen)).toEqual([]);
    expect(gelezen.filter((endpoint) => /rules\/branches|rulesets|codeowners/.test(endpoint))).toEqual([]);
  });

  test('agent-samenvoegen/AC-4: een ruleset zonder review, met een bypass en met fouten in CODEOWNERS geeft geen reden', () => {
    const wereld = templateWereld();
    zet(REPO, 'rules/branches/main', [
      { type: 'pull_request', ruleset_id: 1, parameters: { require_code_owner_review: false } },
    ])(wereld);
    zet(REPO, 'rulesets/1', { current_user_can_bypass: 'always' })(wereld);
    zet(REPO, `codeowners/errors?ref=${MAIN}`, {
      errors: [{ kind: 'Unknown owner', path: '.github/CODEOWNERS', line: 5 }],
    })(wereld);
    expect(beoordeel(wereld)).toEqual([]);
  });

  test('agent-samenvoegen/AC-4: het mergescript noemt de endpoints van de ruleset en van CODEOWNERS niet meer', () => {
    const bron = readFileSync(path.join(ROOT, 'scripts/kit/pr-merge.mjs'), 'utf8');
    const patroon = /rules\/branches|codeowners\/errors|rulesets\/|current_user_can_bypass|require_code_owner_review/g;
    const vormen = [
      'repos/x/rules/branches/main',
      'repos/x/codeowners/errors?ref=y',
      'repos/x/rulesets/1',
      'current_user_can_bypass',
      'require_code_owner_review',
    ];
    // Het patroon herkent elke vorm, en raakt de endpoints die blijven niet.
    expect(vormen.filter((vorm) => [...vorm.matchAll(patroon)].length === 0)).toEqual([]);
    expect(['repos/x/commits/y/check-runs', 'repos/x/branches/main'].flatMap((s) => [...s.matchAll(patroon)])).toEqual(
      [],
    );
    // Een assertie op de treffers, zodat het geval op een assertie faalt zolang de grenscontrole in het script staat.
    expect([...bron.matchAll(patroon)].map((treffer) => treffer[0])).toEqual([]);
  });
});

describe('agent-samenvoegen/AC-6 vervallen onderdelen', () => {
  test.each(['scripts/kit/agent-token.mjs', 'test/scripts/agent-token.test.ts', 'test/scripts/merge-ruleset.test.ts'])(
    'agent-samenvoegen/AC-6: %s bestaat niet meer',
    (bestand) => {
      expect([bestand].filter((naam) => existsSync(path.join(ROOT, naam)))).toEqual([]);
    },
  );

  test('agent-samenvoegen/AC-6: de spec agent-token heeft status vervallen', () => {
    const spec = readFileSync(path.join(ROOT, 'docs/template/specs/agent-token.md'), 'utf8');
    expect(spec).toMatch(/^status:\s*vervallen\b/m);
  });

  describe('templateregime: AC-1, AC-6, AC-7 (inhoudstoets) en AC-14 zijn gemarkeerd als vervallen door ADR 0093', () => {
    const spec = readFileSync(path.join(ROOT, 'docs/template/specs/templateregime.md'), 'utf8');
    // Het blok van één AC: van zijn kop tot de kop van de volgende AC.
    function blok(nummer: number): string {
      const begin = spec.indexOf(`- **templateregime/AC-${String(nummer)}**`);
      const volgende = spec.indexOf('- **templateregime/AC-', begin + 1);
      return begin === -1 ? '' : spec.slice(begin, volgende === -1 ? undefined : volgende);
    }

    test.each([1, 6, 7, 14])(
      'agent-samenvoegen/AC-6: templateregime/AC-%i verwijst naar ADR 0093 als vervallen',
      (nummer) => {
        expect(blok(nummer)).toMatch(/vervallen[^.]{0,80}ADR 0093|ADR 0093[^.]{0,80}vervallen/i);
      },
    );

    test('agent-samenvoegen/AC-6: bij templateregime/AC-7 staat de markering bij het deel over de inhoudstoets', () => {
      expect(blok(7)).toMatch(/inhoudstoets[\s\S]{0,400}ADR 0093|ADR 0093[\s\S]{0,400}inhoudstoets/i);
    });
  });
});
