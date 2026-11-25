import { describe, expect, test } from 'vitest';
import { draai } from '../../scripts/kit/check-toolchain.mjs';

// Spec toolchain-bewaking: de beoordeling is puur over de pins, vaste registry-fixtures en `nu`; de bron- en de issue-laag
// krijgen een nep-fetch die de aanroepen vastlegt. Geen netwerk.
const NU = Date.parse('2026-11-25T06:41:00Z');
const NODE_URL = 'https://nodejs.org/dist/index.json';
const NPM = 'https://registry.npmjs.org/';
const REPO = 'eigenaar/template';
const GH = `https://api.github.com/repos/${REPO}/issues`;
const LIJST = `${GH}?state=open&creator=github-actions%5Bbot%5D&per_page=100&page=1`;
const TITEL = 'Toolchain: achterstand of volgende major';
const BOT = 'github-actions[bot]';

// --- fixtures ---------------------------------------------------------------------------------------------------------------

interface Pins {
  node?: string;
  pnpm?: string;
  tseslint?: string;
  ts?: string;
}

function bestanden({ node = '26.11.1', pnpm = '12.21.0', tseslint = '8.71.0', ts = '6.0.3' }: Pins = {}) {
  return {
    'mise.toml': `[tools]\nnode = "${node}"\npnpm = '''{{ read_file(path='package.json') }}'''\ndbmate = "2.36.0"\n`,
    'package.json': JSON.stringify({
      packageManager: `pnpm@${pnpm}`,
      devDependencies: { typescript: '~6.0.3', 'typescript-eslint': tseslint },
    }),
    'pnpm-lock.yaml': [
      '---',
      "lockfileVersion: '9.0'",
      '',
      'importers:',
      '',
      '  .:',
      '    configDependencies: {}',
      '    packageManagerDependencies:',
      '      pnpm:',
      '        specifier: 12.21.0',
      '        version: 12.21.0',
      '',
      '---',
      "lockfileVersion: '9.0'",
      '',
      'importers:',
      '',
      '  .:',
      '    dependencies:',
      '      typescript:',
      '        specifier: 1.0.0',
      '        version: 1.0.0',
      '    devDependencies:',
      "      '@types/node':",
      '        specifier: 24.0.0',
      '        version: 24.0.0',
      '      typescript:',
      '        specifier: ~6.0.3',
      `        version: ${ts}`,
      '      typescript-eslint:',
      '        specifier: 8.71.0',
      '        version: 8.71.0(typescript@6.0.3)',
      '',
      'packages:',
      '',
      '  typescript@6.0.3:',
      '    version: 9.9.9',
      '',
    ].join('\n'),
  };
}

function lezer(tekst: Record<string, string | undefined>) {
  return (bestand: string) => {
    const inhoud = tekst[bestand];
    if (inhoud === undefined) throw new Error(`ENOENT: ${bestand}`);
    return inhoud;
  };
}

type NodeRelease = { version?: unknown; date?: unknown; lts?: unknown };

function node(...releases: [string, string, (string | false)?][]): NodeRelease[] {
  return releases.map(([versie, date, lts = false]) => ({ version: `v${versie}`, date, lts, npm: '11.0.0' }));
}

function npm(
  releases: Record<string, string>,
  latest: string,
  peers: Record<string, string> = {},
): Record<string, unknown> {
  return {
    name: 'x',
    'dist-tags': { latest, next: '99.0.0-dev' },
    time: { created: '2015-01-01T00:00:00.000Z', modified: '2026-11-24T00:00:00.000Z', ...releases },
    versions: Object.fromEntries(
      Object.keys(releases).map((v) => [
        v,
        peers[v] === undefined ? {} : { peerDependencies: { typescript: peers[v], eslint: '^10' } },
      ]),
    ),
  };
}

const OUD = '2026-09-01T10:00:00.000Z';
const PEER = '>=4.8.4 <6.1.0';

interface Bronnen {
  node?: unknown;
  pnpm?: unknown;
  typescript?: unknown;
  'typescript-eslint'?: unknown;
}

/** Een groene stand: elke pin is de nieuwste in zijn major, geen volgende major. */
function bronnen(over: Bronnen = {}): Record<string, Antwoord> {
  const data = {
    node: node(['26.11.1', '2026-09-01'], ['24.12.0', '2026-09-01', 'Krypton']),
    pnpm: npm({ '12.21.0': OUD, '11.9.0': OUD }, '12.21.0'),
    typescript: npm({ '6.0.3': OUD, '7.0.0-beta': OUD }, '6.0.3'),
    'typescript-eslint': npm({ '8.71.0': OUD }, '8.71.0', { '8.71.0': PEER }),
    ...over,
  };
  return {
    [NODE_URL]: { status: 200, body: JSON.stringify(data.node) },
    [`${NPM}pnpm`]: { status: 200, body: JSON.stringify(data.pnpm) },
    [`${NPM}typescript`]: { status: 200, body: JSON.stringify(data.typescript) },
    [`${NPM}typescript-eslint`]: { status: 200, body: JSON.stringify(data['typescript-eslint']) },
  };
}

type Antwoord = { status: number; body: string } | Error;
type Aanroep = { url: string; method: string; body: unknown };

/** Nep-fetch: per exacte URL een antwoord, of een lijst antwoorden per aanroep; logt elke aanroep. */
function nepFetch(antwoorden: Record<string, Antwoord | Antwoord[]>) {
  const log: Aanroep[] = [];
  const tellers: Record<string, number> = {};
  const fetch: typeof globalThis.fetch = (invoer, init) => {
    const url = invoer instanceof Request ? invoer.url : String(invoer);
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    log.push({ url, method: init?.method ?? 'GET', body });
    const waarde = antwoorden[url] ?? { status: 404, body: '{}' };
    const n = tellers[url] ?? 0;
    tellers[url] = n + 1;
    const antwoord = Array.isArray(waarde) ? (waarde[n] ?? { status: 500, body: '' }) : waarde;
    if (antwoord instanceof Error) return Promise.reject(antwoord);
    return Promise.resolve(new Response(antwoord.body, { status: antwoord.status }));
  };
  return { fetch, log };
}

interface Opzet {
  pins?: Pins;
  bron?: Bronnen;
  nu?: number;
  args?: string[];
  env?: Record<string, string | undefined>;
  github?: Record<string, Antwoord | Antwoord[]>;
  bestand?: Record<string, string | undefined>;
}

async function check({ pins, bron, nu = NU, args = [], env = {}, github = {}, bestand = {} }: Opzet = {}) {
  const { fetch, log } = nepFetch({ ...bronnen(bron), ...github });
  const uit = await draai({ args, env, fetch, nu, lees: lezer({ ...bestanden(pins), ...bestand }) });
  return { ...uit, log, regels: uit.tekst.split('\n') };
}

// --- AC-1 t/m AC-3: achterstand ---------------------------------------------------------------------------------------------

const NODE_AC1 = node(
  ['26.13.1', '2026-11-10'],
  ['26.13.0', '2026-10-28'],
  ['26.12.1', '2026-10-21'],
  ['26.12.0', '2026-10-14'],
  ['26.11.1', '2026-09-01'],
);

describe('toolchain-bewaking: achterstand', () => {
  test('toolchain-bewaking/AC-1: Node 26.11.1 met vier opvolgers loopt 35 dagen achter, exitcode 1', async () => {
    const uit = await check({ bron: { node: NODE_AC1 } });
    expect(uit.code).toBe(1);
    expect(uit.regels).toStrictEqual([
      'achterstand: Node 26.11.1, toegestaan 26.13.1, achter sinds 2026-10-21 (35 dagen)',
      'Toolchain loopt achter: 1 melding(en). Werk de pin bij of zoek uit waarom Renovate vastzit.',
    ]);
  });

  test('toolchain-bewaking/AC-1: grensgeval pin 26.13.0: op 2026-11-25 geen melding (8 dagen), op 2026-12-02 wel (15)', async () => {
    const bijna = await check({ pins: { node: '26.13.0' }, bron: { node: NODE_AC1 } });
    expect(bijna.code).toBe(0);
    expect(bijna.tekst).not.toContain('achterstand:');
    const wel = await check({
      pins: { node: '26.13.0' },
      bron: { node: NODE_AC1 },
      nu: Date.parse('2026-12-02T23:59:00Z'),
    });
    expect(wel.code).toBe(1);
    expect(wel.regels[0]).toBe('achterstand: Node 26.13.0, toegestaan 26.13.1, achter sinds 2026-11-17 (15 dagen)');
  });

  test('toolchain-bewaking/AC-1: een release jonger dan 7 dagen is nog geen opvolger', async () => {
    const uit = await check({
      pins: { node: '26.13.0' },
      bron: { node: node(['26.13.1', '2026-11-19'], ['26.13.0', '2026-09-01']) },
      nu: Date.parse('2026-12-31T00:00:00Z'),
    });
    expect(uit.regels[0]).toBe('achterstand: Node 26.13.0, toegestaan 26.13.1, achter sinds 2026-11-26 (35 dagen)');
    const jong = await check({
      pins: { node: '26.13.0' },
      bron: { node: node(['26.13.1', '2026-11-19'], ['26.13.0', '2026-09-01']) },
      nu: Date.parse('2026-11-25T23:00:00Z'),
    });
    expect(jong.code).toBe(0);
  });

  test('toolchain-bewaking/AC-2: pnpm 12.21.0 loopt 17 dagen achter; nieuwere releases zetten de klok niet terug en 13.0.0 telt niet', async () => {
    const pnpm = npm(
      {
        '12.21.0': '2026-10-01T08:00:00.000Z',
        '12.22.0': '2026-11-01T08:00:00.000Z',
        '12.23.0': '2026-11-08T08:00:00.000Z',
        '12.24.0': '2026-11-15T08:00:00.000Z',
        '12.25.0': '2026-11-17T23:30:00.000Z',
        '13.0.0': '2026-11-01T08:00:00.000Z',
        '12.26.0-rc.0': '2026-11-01T08:00:00.000Z',
      },
      '12.25.0',
    );
    const uit = await check({ bron: { pnpm } });
    expect(uit.code).toBe(1);
    expect(uit.regels).toStrictEqual([
      'achterstand: pnpm 12.21.0, toegestaan 12.25.0, achter sinds 2026-11-08 (17 dagen)',
      'Toolchain loopt achter: 1 melding(en). Werk de pin bij of zoek uit waarom Renovate vastzit.',
    ]);
  });

  test('toolchain-bewaking/AC-3: de nieuwste TypeScript-opvolger valt binnen de peer van de gepinde typescript-eslint', async () => {
    const typescript = npm({ '6.0.3': OUD, '6.0.5': '2026-10-01T00:00:00.000Z', '6.1.0': OUD }, '6.1.0');
    const uit = await check({ bron: { typescript }, args: ['--json'] });
    expect(uit.code).toBe(1);
    expect(JSON.parse(uit.tekst)).toStrictEqual({
      achterstand: [{ tool: 'TypeScript', gepind: '6.0.3', toegestaan: '6.0.5', sinds: '2026-10-08', dagen: 48 }],
      volgendeMajor: [],
    });
  });

  test('toolchain-bewaking/AC-3: de peer komt van de gepinde typescript-eslint, niet van latest', async () => {
    const typescript = npm({ '6.0.3': OUD, '6.1.2': '2026-10-01T00:00:00.000Z' }, '6.1.2');
    const eslint = npm({ '8.71.0': OUD, '8.80.0': OUD }, '8.80.0', { '8.71.0': PEER, '8.80.0': '>=4.8.4 <6.2.0' });
    const uit = await check({ bron: { typescript, 'typescript-eslint': eslint } });
    expect(uit.code).toBe(0);
    expect(uit.tekst).not.toContain('achterstand:');
  });

  test('toolchain-bewaking/AC-3: een pin nieuwer dan elke opvolger geeft geen achterstand', async () => {
    const uit = await check({ pins: { node: '26.13.1' }, bron: { node: NODE_AC1 } });
    expect(uit.code).toBe(0);
  });
});

// --- AC-4 t/m AC-7: volgende major en afsluitregels ---------------------------------------------------------------------------

describe('toolchain-bewaking: volgende major', () => {
  test('toolchain-bewaking/AC-4: Node 28 met een LTS-release wordt gemeld met de codenaam', async () => {
    const releases = node(
      ['28.1.0', '2026-10-30', 'Neon'],
      ['28.0.0', '2026-10-01'],
      ['27.2.0', '2026-09-20'],
      ['26.11.1', '2026-09-01'],
    );
    const uit = await check({ bron: { node: releases } });
    expect(uit.code).toBe(0);
    expect(uit.regels[0]).toBe('volgende major klaar: Node 28 (LTS Neon)');
  });

  test('toolchain-bewaking/AC-4: zonder melding als alleen 27.x en 28.0.0 bestaan, allemaal zonder LTS', async () => {
    const releases = node(['28.0.0', '2026-10-01'], ['27.2.0', '2026-09-20'], ['26.11.1', '2026-09-01']);
    const uit = await check({ bron: { node: releases } });
    expect(uit.code).toBe(0);
    expect(uit.tekst).toBe('Toolchain bij: Node 26.11.1, pnpm 12.21.0, TypeScript 6.0.3.');
  });

  test('toolchain-bewaking/AC-5: pnpm latest 13.0.0 boven een pin op 12', async () => {
    const pnpm = npm({ '12.21.0': OUD, '13.0.0': OUD }, '13.0.0');
    const uit = await check({ bron: { pnpm } });
    expect(uit.regels[0]).toBe('volgende major klaar: pnpm 13 (latest is 13.0.0)');
    const zonder = await check({ bron: { pnpm: npm({ '12.21.0': OUD, '13.0.0': OUD }, '12.21.0') } });
    expect(zonder.tekst).not.toContain('volgende major');
  });

  test('toolchain-bewaking/AC-6: TypeScript 7 als de nieuwste typescript-eslint hem toestaat en er een stabiele 7.x is', async () => {
    const eslint = npm({ '8.71.0': OUD, '8.80.0': OUD }, '8.80.0', { '8.71.0': PEER, '8.80.0': '>=4.8.4 <7.1.0' });
    const typescript = npm({ '6.0.3': OUD, '7.0.2': OUD }, '7.0.2');
    const uit = await check({ bron: { typescript, 'typescript-eslint': eslint } });
    expect(uit.code).toBe(0);
    expect(uit.regels[0]).toBe(
      'volgende major klaar: TypeScript 7 (typescript-eslint 8.80.0 staat typescript >=4.8.4 <7.1.0 toe)',
    );
  });

  test('toolchain-bewaking/AC-6: zonder melding bij een peer <6.1.0 of zonder stabiele 7.x', async () => {
    const smal = npm({ '8.71.0': OUD, '8.80.0': OUD }, '8.80.0', { '8.71.0': PEER, '8.80.0': PEER });
    const breed = npm({ '8.71.0': OUD, '8.80.0': OUD }, '8.80.0', { '8.71.0': PEER, '8.80.0': '>=4.8.4 <7.1.0' });
    const met7 = npm({ '6.0.3': OUD, '7.0.2': OUD }, '7.0.2');
    const zonder7 = npm({ '6.0.3': OUD, '7.0.0-rc.1': OUD }, '6.0.3');
    for (const bron of [
      { typescript: met7, 'typescript-eslint': smal },
      { typescript: zonder7, 'typescript-eslint': breed },
    ]) {
      const uit = await check({ bron });
      expect(uit.tekst).toBe('Toolchain bij: Node 26.11.1, pnpm 12.21.0, TypeScript 6.0.3.');
    }
  });

  test('toolchain-bewaking/AC-7: alleen volgende major: exitcode 0 en de afsluitregel', async () => {
    const pnpm = npm({ '12.21.0': OUD, '13.0.0': OUD }, '13.0.0');
    const uit = await check({ bron: { pnpm } });
    expect(uit).toMatchObject({
      code: 0,
      regels: [
        'volgende major klaar: pnpm 13 (latest is 13.0.0)',
        'Toolchain bij, volgende major klaar: 1 melding(en). Start de major met de majorchecklist (R-PROV-04).',
      ],
    });
  });

  test('toolchain-bewaking/AC-7: geen melding: exitcode 0 en de groene regel, en met --json lege lijsten', async () => {
    const uit = await check();
    expect(uit.code).toBe(0);
    expect(uit.tekst).toBe('Toolchain bij: Node 26.11.1, pnpm 12.21.0, TypeScript 6.0.3.');
    const json = await check({ args: ['--json'] });
    expect(json.code).toBe(0);
    expect(JSON.parse(json.tekst)).toStrictEqual({ achterstand: [], volgendeMajor: [] });
  });

  test('toolchain-bewaking/AC-7: achterstand en volgende major samen: achterstand eerst, exitcode 1, alle meldingen geteld', async () => {
    const pnpm = npm({ '12.21.0': OUD, '13.0.0': OUD }, '13.0.0');
    const uit = await check({ bron: { node: NODE_AC1, pnpm }, args: ['--json'] });
    expect(uit.code).toBe(1);
    expect(JSON.parse(uit.tekst)).toStrictEqual({
      achterstand: [{ tool: 'Node', gepind: '26.11.1', toegestaan: '26.13.1', sinds: '2026-10-21', dagen: 35 }],
      volgendeMajor: [{ tool: 'pnpm', major: 13, reden: 'latest is 13.0.0' }],
    });
    const tekst = await check({ bron: { node: NODE_AC1, pnpm } });
    expect(tekst.regels.at(-1)).toBe(
      'Toolchain loopt achter: 2 melding(en). Werk de pin bij of zoek uit waarom Renovate vastzit.',
    );
  });
});

// --- AC-8: fouten -------------------------------------------------------------------------------------------------------------

const ENV = { GITHUB_TOKEN: 't', GITHUB_REPOSITORY: REPO };

const FOUTEN: [string, Opzet, string][] = [
  ['HTTP-fout', { github: { [NODE_URL]: { status: 503, body: '' } } }, `Bron: ${NODE_URL}: HTTP 503`],
  ['fetch die gooit', { github: { [`${NPM}pnpm`]: new Error('netwerk weg') } }, `Bron: ${NPM}pnpm: netwerk weg`],
  ['geen JSON', { github: { [`${NPM}pnpm`]: { status: 200, body: 'niet json' } } }, `Bron: ${NPM}pnpm: `],
  ['Node: geen lijst', { bron: { node: { versie: 1 } } }, `Bron: ${NODE_URL}: `],
  ['Node: geen date', { bron: { node: [{ version: 'v26.11.1', lts: false }] } }, `Bron: ${NODE_URL}: date ontbreekt`],
  [
    'Node: geen lts',
    { bron: { node: [{ version: 'v26.11.1', date: '2026-09-01' }] } },
    `Bron: ${NODE_URL}: lts ontbreekt`,
  ],
  [
    'Node: geen version',
    { bron: { node: [{ date: '2026-09-01', lts: false }] } },
    `Bron: ${NODE_URL}: version ontbreekt`,
  ],
  ['npm: geen time', { bron: { pnpm: { 'dist-tags': { latest: '12.21.0' } } } }, `Bron: ${NPM}pnpm: time ontbreekt`],
  [
    'npm: geen dist-tags.latest',
    { bron: { typescript: { time: { '6.0.3': OUD }, 'dist-tags': {} } } },
    `Bron: ${NPM}typescript: dist-tags.latest ontbreekt`,
  ],
  [
    'typescript-eslint: geen peer bij de gepinde versie',
    { bron: { 'typescript-eslint': npm({ '8.71.0': OUD }, '8.71.0') } },
    `Bron: ${NPM}typescript-eslint: versions.8.71.0.peerDependencies.typescript ontbreekt`,
  ],
  [
    'typescript-eslint: geen peer bij latest',
    { bron: { 'typescript-eslint': npm({ '8.71.0': OUD, '8.80.0': OUD }, '8.80.0', { '8.71.0': PEER }) } },
    `Bron: ${NPM}typescript-eslint: versions.8.80.0.peerDependencies.typescript ontbreekt`,
  ],
  [
    'onbekend bereik (spatie na de operator)',
    { bron: { 'typescript-eslint': npm({ '8.71.0': OUD }, '8.71.0', { '8.71.0': '>= 4.8.4 <6.1.0' }) } },
    'onbekende waarde: >= 4.8.4 <6.1.0',
  ],
  [
    'onbekend bereik (wildcard)',
    { bron: { 'typescript-eslint': npm({ '8.71.0': OUD }, '8.71.0', { '8.71.0': '6.x' }) } },
    'onbekende waarde: 6.x',
  ],
  [
    'ongeldige codenaam',
    { bron: { node: node(['28.1.0', '2026-10-30', 'Neon 2'], ['26.11.1', '2026-09-01']) } },
    'onbekende waarde: Neon 2',
  ],
  ['mise.toml zonder node', { bestand: { 'mise.toml': '[tools]\ndbmate = "2.36.0"\n' } }, 'mise.toml: '],
  ['mise.toml onleesbaar', { bestand: { 'mise.toml': undefined } }, 'mise.toml: '],
  ['Node-pin zonder patch', { pins: { node: '26.11' } }, 'mise.toml: '],
  ['pnpm-pin voorloopversie', { pins: { pnpm: '12.22.0-rc.1' } }, 'package.json: '],
  ['package.json zonder packageManager', { bestand: { 'package.json': '{"devDependencies":{}}' } }, 'package.json: '],
  ['package.json geen JSON', { bestand: { 'package.json': '{' } }, 'package.json: '],
  ['typescript-eslint-pin is een bereik', { pins: { tseslint: '^8.71.0' } }, 'package.json: '],
  [
    'lockfile zonder typescript',
    { bestand: { 'pnpm-lock.yaml': 'importers:\n\n  .:\n    devDependencies: {}\n' } },
    'pnpm-lock.yaml: ',
  ],
  ['TypeScript-pin voorloopversie', { pins: { ts: '6.1.0-beta' } }, 'pnpm-lock.yaml: '],
];

describe('toolchain-bewaking: fouten', () => {
  test.each(FOUTEN)('toolchain-bewaking/AC-8: %s wordt exitcode 2 met de foutregel', async (_naam, opzet, regel) => {
    const uit = await check(opzet);
    expect(uit.code).toBe(2);
    expect(uit.regels).toHaveLength(1);
    expect(uit.tekst.startsWith(regel), uit.tekst).toBe(true);
  });

  test.each(FOUTEN)(
    'toolchain-bewaking/AC-8: %s met --issue schrijft niets, met --json {fout}',
    async (_naam, opzet, regel) => {
      const issue = await check({
        ...opzet,
        args: ['--issue'],
        env: ENV,
        github: { ...opzet.github, [LIJST]: { status: 200, body: '[]' } },
      });
      expect(issue.code).toBe(2);
      expect(issue.tekst.startsWith(regel)).toBe(true);
      expect(issue.log.filter((a) => a.url.startsWith('https://api.github.com/'))).toStrictEqual([]);
      const json = await check({ ...opzet, args: ['--json'] });
      expect(json.code).toBe(2);
      expect(JSON.parse(json.tekst)).toStrictEqual({ fout: issue.tekst });
    },
  );

  test('toolchain-bewaking/AC-8: een onbekende optie is exitcode 2', async () => {
    const uit = await check({ args: ['--iets'] });
    expect(uit).toMatchObject({ code: 2, tekst: 'onbekende waarde: --iets' });
    expect(uit.log).toStrictEqual([]);
  });
});

// --- AC-9: het issue ------------------------------------------------------------------------------------------------------------

function ghIssue(nummer: number, body: string, { login = BOT, title = TITEL } = {}) {
  return { number: nummer, title, body, user: { login } };
}

const ACHTER = 'achterstand: Node 26.11.1, toegestaan 26.13.1, achter sinds 2026-10-21 (35 dagen)';
const BODY = `- ${ACHTER}\n\nBijgewerkt door de workflow toolchain op 2026-11-18.`;
const OK = { status: 200, body: '{}' };

async function metIssue(
  open: unknown[],
  bron: Bronnen = { node: NODE_AC1 },
  extra: Record<string, Antwoord | Antwoord[]> = {},
) {
  const uit = await check({
    bron,
    args: ['--issue'],
    env: ENV,
    github: { [LIJST]: { status: 200, body: JSON.stringify(open) }, ...extra },
  });
  const github = uit.log.filter((a) => a.url.startsWith('https://api.github.com/'));
  return { ...uit, github, schrijf: github.filter((a) => a.method !== 'GET') };
}

describe('toolchain-bewaking: issue', () => {
  test('toolchain-bewaking/AC-9: wel meldingen, geen open issue: één POST, exitcode 0 ook bij achterstand', async () => {
    const uit = await metIssue([], { node: NODE_AC1 }, { [GH]: { status: 201, body: JSON.stringify({ number: 42 }) } });
    expect(uit.code).toBe(0);
    expect(uit.regels.slice(-2)).toStrictEqual([
      'Toolchain loopt achter: 1 melding(en). Werk de pin bij of zoek uit waarom Renovate vastzit.',
      'Issue #42 aangemaakt.',
    ]);
    expect(uit.schrijf).toStrictEqual([
      {
        url: GH,
        method: 'POST',
        body: { title: TITEL, body: `- ${ACHTER}\n\nBijgewerkt door de workflow toolchain op 2026-11-25.` },
      },
    ]);
  });

  test('toolchain-bewaking/AC-9: een issue met dezelfde titel van een andere auteur telt niet', async () => {
    const uit = await metIssue(
      [ghIssue(7, BODY, { login: 'iemand' })],
      { node: NODE_AC1 },
      {
        [GH]: { status: 201, body: JSON.stringify({ number: 43 }) },
      },
    );
    expect(uit.regels.at(-1)).toBe('Issue #43 aangemaakt.');
    expect(uit.schrijf.map((a) => `${a.method} ${a.url}`)).toStrictEqual([`POST ${GH}`]);
  });

  test('toolchain-bewaking/AC-9: afwijkende meldingen: PATCH van de body en daarna de comment, op het oudste issue', async () => {
    const oud = `- achterstand: Node 26.11.1, toegestaan 26.13.1, achter sinds 2026-10-21 (28 dagen)\n\nBijgewerkt door de workflow toolchain op 2026-11-18.`;
    const uit = await metIssue(
      [ghIssue(12, oud), ghIssue(9, oud), ghIssue(3, oud, { title: 'Iets anders' })],
      { node: NODE_AC1 },
      {
        [`${GH}/9`]: OK,
        [`${GH}/9/comments`]: { status: 201, body: '{}' },
      },
    );
    expect(uit.code).toBe(0);
    expect(uit.regels.at(-1)).toBe('Issue #9 bijgewerkt.');
    expect(uit.schrijf).toStrictEqual([
      {
        url: `${GH}/9`,
        method: 'PATCH',
        body: { body: `- ${ACHTER}\n\nBijgewerkt door de workflow toolchain op 2026-11-25.` },
      },
      {
        url: `${GH}/9/comments`,
        method: 'POST',
        body: { body: 'De meldingen zijn veranderd op 2026-11-25; zie de beschrijving.' },
      },
    ]);
  });

  test('toolchain-bewaking/AC-9: gelijke meldingen: niets schrijven, ook al is de datumregel anders', async () => {
    const uit = await metIssue([ghIssue(9, BODY)]);
    expect(uit.code).toBe(0);
    expect(uit.regels.at(-1)).toBe('Issue #9 ongewijzigd.');
    expect(uit.schrijf).toStrictEqual([]);
  });

  test('toolchain-bewaking/AC-9: geen meldingen, wel een open issue: sluitcomment en PATCH met state closed', async () => {
    const uit = await metIssue(
      [ghIssue(9, BODY)],
      {},
      { [`${GH}/9`]: OK, [`${GH}/9/comments`]: { status: 201, body: '{}' } },
    );
    expect(uit.code).toBe(0);
    expect(uit.regels).toStrictEqual([
      'Toolchain bij: Node 26.11.1, pnpm 12.21.0, TypeScript 6.0.3.',
      'Issue #9 gesloten.',
    ]);
    expect(uit.schrijf).toStrictEqual([
      {
        url: `${GH}/9/comments`,
        method: 'POST',
        body: { body: 'Geen melding meer op 2026-11-25: de toolchain volgt het beleid.' },
      },
      { url: `${GH}/9`, method: 'PATCH', body: { state: 'closed' } },
    ]);
  });

  test('toolchain-bewaking/AC-9: geen meldingen, geen open issue: niets schrijven', async () => {
    const uit = await metIssue([], {});
    expect(uit.code).toBe(0);
    expect(uit.regels.at(-1)).toBe('Geen issue nodig.');
    expect(uit.github.map((a) => a.url)).toStrictEqual([LIJST]);
  });

  test('toolchain-bewaking/AC-9: alleen volgende major: het issue wordt aangemaakt, exitcode 0', async () => {
    const pnpm = npm({ '12.21.0': OUD, '13.0.0': OUD }, '13.0.0');
    const uit = await metIssue([], { pnpm }, { [GH]: { status: 201, body: JSON.stringify({ number: 5 }) } });
    expect(uit.code).toBe(0);
    expect(uit.regels.at(-1)).toBe('Issue #5 aangemaakt.');
  });

  test.each([
    [
      'GET',
      { [LIJST]: { status: 500, body: '' } },
      `GitHub-API: repos/${REPO}/issues?state=open&creator=github-actions%5Bbot%5D&per_page=100&page=1: HTTP 500`,
    ],
    ['POST', { [GH]: { status: 422, body: '{}' } }, `GitHub-API: repos/${REPO}/issues: HTTP 422`],
  ])('toolchain-bewaking/AC-9: een %s die niet 2xx is wordt exitcode 2', async (_methode, extra, regel) => {
    const uit = await metIssue([], { node: NODE_AC1 }, extra);
    expect(uit.code).toBe(2);
    expect(uit.regels.at(-1)).toBe(regel);
  });

  test('toolchain-bewaking/AC-9: een PATCH die niet 2xx is wordt exitcode 2, zonder comment erna', async () => {
    const uit = await metIssue([ghIssue(9, 'oud')], { node: NODE_AC1 }, { [`${GH}/9`]: { status: 403, body: '' } });
    expect(uit.code).toBe(2);
    expect(uit.regels.at(-1)).toBe(`GitHub-API: repos/${REPO}/issues/9: HTTP 403`);
    expect(uit.schrijf.map((a) => a.method)).toStrictEqual(['PATCH']);
  });

  test("toolchain-bewaking/AC-9: hooguit 10 pagina's van 100; een tiende volle pagina is exitcode 2", async () => {
    const vol = {
      status: 200,
      body: JSON.stringify(Array.from({ length: 100 }, (_x, i) => ghIssue(100 + i, 'x', { title: 'ander' }))),
    };
    const paginas = Object.fromEntries(
      Array.from({ length: 10 }, (_x, i) => [LIJST.replace(/&page=1$/, `&page=${String(i + 1)}`), vol]),
    );
    const uit = await check({ bron: { node: NODE_AC1 }, args: ['--issue'], env: ENV, github: paginas });
    expect(uit.code).toBe(2);
    expect(uit.regels.at(-1)).toBe(
      `GitHub-API: repos/${REPO}/issues?state=open&creator=github-actions%5Bbot%5D: meer dan 10 pagina's`,
    );
    expect(uit.log.filter((a) => a.method !== 'GET')).toStrictEqual([]);
  });

  test.each(['GITHUB_TOKEN', 'GITHUB_REPOSITORY'])(
    'toolchain-bewaking/AC-9: zonder %s volgt "<NAAM> ontbreekt" en exitcode 2',
    async (naam) => {
      const uit = await check({ args: ['--issue'], env: { ...ENV, [naam]: '' } });
      expect(uit).toMatchObject({ code: 2, tekst: `${naam} ontbreekt` });
      const zonder = Object.fromEntries(Object.entries(ENV).filter(([k]) => k !== naam));
      expect((await check({ args: ['--issue'], env: zonder })).tekst).toBe(`${naam} ontbreekt`);
    },
  );

  test('toolchain-bewaking/AC-9: zonder --issue alleen GET op de bronnen, nooit de GitHub-API, ook met een token', async () => {
    const uit = await check({ bron: { node: NODE_AC1 }, env: ENV });
    expect(uit.log.every((a) => a.method === 'GET')).toBe(true);
    expect(uit.log.map((a) => a.url).toSorted()).toStrictEqual(
      [NODE_URL, `${NPM}pnpm`, `${NPM}typescript`, `${NPM}typescript-eslint`].toSorted(),
    );
  });
});
