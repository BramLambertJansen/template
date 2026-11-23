import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';
import * as documentState from '../../rails/hooks/lib/document-state.mjs';
import { beslisOvergang, documentInfo } from '../../rails/hooks/lib/document-state.mjs';
import { docsViolations } from '../../scripts/kit/check-docs.mjs';
import { lezerSecties } from '../../scripts/kit/feiten-secties.mjs';
import { expectAbsent } from '../support/absence.ts';

// docs/template/specs/gebouwd-zonder-nummer.md (ADR 0095): `status: gebouwd` zonder PR-nummer in de bouw-PR; `pnpm docs:status`
// en de bewijstoets vervallen. Fixtures als inline tekst per AC; de rolhekgevallen (AC-7, AC-8) staan naast de bestaande in
// test/hooks/rolhek-beslisroute.test.ts.
const REPO = path.resolve(import.meta.dirname, '../..');
const ROADMAP_MODULE = ['../../scripts/kit', 'check-roadmap.mjs'].join('/');
const SHA = 'a'.repeat(40);
const ANDERE_SHA = 'b'.repeat(40);

const tijdelijk: string[] = [];
afterAll(() => {
  for (const dir of tijdelijk) rmSync(dir, { recursive: true, force: true });
});

function lees(pad: string): string {
  return readFileSync(path.join(REPO, pad), 'utf8');
}

/** Een spec met AC-1 en optioneel extra regels; `status` is de volledige waarde achter `status: `. */
function specTekst(status: string, extra: string[] = [], namespace = 'demo'): string {
  return [
    '---',
    `status: ${status}`,
    `namespace: ${namespace}`,
    '---',
    '',
    '# Demo',
    '',
    '## Acceptatiecriteria',
    '',
    `- **${namespace}/AC-1** — Gegeven iets, dan iets.`,
    ...extra,
    '',
  ].join('\n');
}

// --- git-repo's voor check-docs -----------------------------------------------------------------------------------------------

function repo(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), 'gebouwd-zonder-nummer-'));
  tijdelijk.push(root);
  const alles = { 'package.json': JSON.stringify({ scripts: {} }), 'scripts/kit/bestaat.mjs': '', ...files };
  for (const [bestand, inhoud] of Object.entries(alles)) {
    mkdirSync(path.dirname(path.join(root, bestand)), { recursive: true });
    writeFileSync(path.join(root, bestand), inhoud);
  }
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '-A'], { cwd: root });
  return root;
}

async function sleutels(files: Record<string, string>, deel: string): Promise<string[]> {
  const meldingen = await docsViolations(repo(files));
  return meldingen.map(({ key }) => key).filter((key) => key.includes(deel));
}

const TEMPLATE_SPEC = 'docs/template/specs/demo.md';
const APP_SPEC = 'docs/specs/demo.md';

// --- AC-1 en AC-2: check:roadmap -----------------------------------------------------------------------------------------------

interface Melding {
  key: string;
  message: string;
}

async function roep(module: string, naam: string, ...args: unknown[]): Promise<unknown> {
  const geladen: unknown = await import(/* @vite-ignore */ module);
  if (typeof geladen !== 'object' || geladen === null || !(naam in geladen))
    throw new Error(`${module} exporteert ${naam} niet`);
  const functie: unknown = Reflect.get(geladen, naam);
  if (typeof functie !== 'function') throw new Error(`${module} exporteert ${naam} niet als functie`);
  const resultaat: unknown = await Reflect.apply(functie, undefined, args);
  return resultaat;
}

function alsMeldingen(resultaat: unknown): Melding[] {
  if (!Array.isArray(resultaat)) throw new Error('geen lijst van meldingen');
  const lijst: unknown[] = resultaat;
  return lijst.map((item) => {
    if (
      typeof item === 'object' &&
      item !== null &&
      'key' in item &&
      typeof item.key === 'string' &&
      'message' in item &&
      typeof item.message === 'string'
    )
      return { key: item.key, message: item.message };
    throw new Error('geen { key, message }');
  });
}

function testpaden(): string[] {
  const json: unknown = JSON.parse(lees('.claude/gates.json'));
  if (typeof json !== 'object' || json === null || !('testpaden' in json) || !Array.isArray(json.testpaden))
    throw new Error('gates.json zonder testpaden');
  const lijst: unknown[] = json.testpaden;
  return lijst.map(String);
}

async function roadmapMeldingen(basis: Record<string, string>, head: Record<string, string>): Promise<Melding[]> {
  const resultaat = await roep(ROADMAP_MODULE, 'roadmapMeldingen', {
    basis: { lees: (pad: string) => basis[pad] ?? null, bestanden: Object.keys(basis) },
    head: { lees: (pad: string) => head[pad] ?? null, bestanden: Object.keys(head), hernoemd: {} },
    scripts: { 'test:unit': 'vitest' },
    testpaden: testpaden(),
  });
  return alsMeldingen(resultaat);
}

const SPEC_PAD = 'docs/specs/a.md';
const KOP = '# Roadmap\n\n## Stuk\n\n';
const OUD_ITEM = '- [x] Oud werk (#5)\n';

function eenvoudigeSpec(status: string, verwijzing = ''): string {
  return `---\nstatus: ${status}\n---\n\n# Spec A\n\nEen spec zonder verwijzing. ${verwijzing}\n`;
}

describe('gebouwd-zonder-nummer/AC-1: een spec naar gebouwd zonder roadmap-id is groen, zonder nummer of met commentaar', () => {
  test.each([
    ['status: gebouwd'],
    ['status: gebouwd # #12'],
    ['status: gebouwd # gebouwd in PR #51'],
    ['status: gebouwd # test/rails/x.test.ts'],
    [`status: gebouwd # #130; gevalideerd: ${SHA}`],
  ])('gebouwd-zonder-nummer/AC-1: %s geeft geen enkele melding', async (statusregel) => {
    const meldingen = await roadmapMeldingen(
      { [SPEC_PAD]: eenvoudigeSpec('goedgekeurd') },
      { [SPEC_PAD]: eenvoudigeSpec(statusregel.replace('status: ', '')) },
    );
    expect(meldingen).toStrictEqual([]);
    expect(meldingen.map(({ key }) => key).filter((key) => key.startsWith('spec:bewijs'))).toStrictEqual([]);
  });
});

describe('gebouwd-zonder-nummer/AC-2: een spec die een roadmap-id noemt vraagt een wijziging van docs/roadmap.md', () => {
  const MET_ID = eenvoudigeSpec('gebouwd', 'Bouwt ST-14.');
  const BASIS = { [SPEC_PAD]: eenvoudigeSpec('goedgekeurd', 'Bouwt ST-14.'), 'docs/roadmap.md': `${KOP}${OUD_ITEM}` };

  test('gebouwd-zonder-nummer/AC-2: docs/roadmap.md wijzigt niet: rood met de bestaande melding', async () => {
    const meldingen = await roadmapMeldingen(BASIS, { [SPEC_PAD]: MET_ID, 'docs/roadmap.md': `${KOP}${OUD_ITEM}` });
    expect(meldingen.map(({ key }) => key)).toStrictEqual([`spec:roadmap:${SPEC_PAD}`]);
    expect(meldingen[0]?.message).toBe(
      `${SPEC_PAD}: naar gebouwd en noemt ST-14, maar docs/roadmap.md wijzigt niet in deze PR`,
    );
  });

  test('gebouwd-zonder-nummer/AC-2: docs/roadmap.md wijzigt wel: groen', async () => {
    const meldingen = await roadmapMeldingen(BASIS, {
      [SPEC_PAD]: MET_ID,
      'docs/roadmap.md': `${KOP}${OUD_ITEM}- [x] ST-14 klaar (#130)\n`,
    });
    expect(meldingen).toStrictEqual([]);
  });

  test('gebouwd-zonder-nummer/AC-2: ook met een nummer in de statusregel blijft de roadmap-id-regel gelden', async () => {
    const meldingen = await roadmapMeldingen(BASIS, {
      [SPEC_PAD]: eenvoudigeSpec('gebouwd # #12', 'Bouwt ST-14.'),
      'docs/roadmap.md': `${KOP}${OUD_ITEM}`,
    });
    expect(meldingen.map(({ key }) => key)).toStrictEqual([`spec:roadmap:${SPEC_PAD}`]);
  });
});

// --- AC-3: documentInfo en feiten ----------------------------------------------------------------------------------------------

describe('gebouwd-zonder-nummer/AC-3: een spec met status: gebouwd zonder nummer is gebouwd', () => {
  test.each(['gebouwd', 'gebouwd # #12', 'gebouwd # gebouwd in PR #51'])(
    'gebouwd-zonder-nummer/AC-3: documentInfo leest status: %s als gebouwd',
    (status) => {
      expect(documentInfo(APP_SPEC, specTekst(status))?.status).toBe('gebouwd');
    },
  );

  test('gebouwd-zonder-nummer/AC-3: feiten specs telt haar onder gebouwd en toont haar niet in de standaardlijst', () => {
    const bestanden: Record<string, string> = {
      'docs/specs/open.md': specTekst('goedgekeurd'),
      'docs/specs/zonder.md': specTekst('gebouwd'),
      'docs/specs/met.md': specTekst('gebouwd # #12'),
    };
    const lezer = {
      lees: (pad: string) => bestanden[pad] ?? null,
      lijst: (map: string) => (map === 'docs/specs' ? ['open.md', 'zonder.md', 'met.md'] : []),
    };
    const uit: unknown = lezerSecties(lezer, { alle: false }).specs();
    expect(uit).toMatchObject({
      'docs/specs/': [{ spec: 'open.md', status: 'goedgekeurd' }],
      'overig docs/specs/': '2 gebouwd (feiten specs --alle of docs/specs/)',
    });
  });
});

// --- AC-4 en AC-5: de AC-dekking van check:docs ---------------------------------------------------------------------------------

const AC_KEY = 'docs:ac:demo:AC-1';

describe('gebouwd-zonder-nummer/AC-4: de AC-dekking geldt voor status: gebouwd zonder nummer', () => {
  test.each(['gebouwd', 'gebouwd # #12'])(
    'gebouwd-zonder-nummer/AC-4: status: %s met een AC zonder testbestand: rood met de bestaande melding',
    async (status) => {
      const meldingen = await docsViolations(repo({ [TEMPLATE_SPEC]: specTekst(status) }));
      const ac = meldingen.filter(({ key }) => key === AC_KEY);
      expect(ac.map(({ message }) => message)).toStrictEqual([
        `${TEMPLATE_SPEC}: AC-1 heeft geen testbestand met demo/AC-1`,
      ]);
    },
  );

  test('gebouwd-zonder-nummer/AC-4: met een test die het AC-id noemt: groen', async () => {
    const files = {
      [TEMPLATE_SPEC]: specTekst('gebouwd'),
      'test/demo.test.ts': "test('demo/AC-1: iets', () => {});\n",
    };
    expect(await sleutels(files, 'docs:ac:')).toStrictEqual([]);
  });
});

const ADR_INHOUD = (status: string): string => `# 0095 — Demo\n\nStatus: ${status}\n\n## Besluit\n\nIets.\n`;
const VERVALLEN_AC = '- **demo/AC-2** — Vervallen door ADR 0095 (reden). Was: Gegeven meer, dan meer.';

function metTest(files: Record<string, string>): Record<string, string> {
  return { 'test/demo.test.ts': "test('demo/AC-1: iets', () => {});\n", ...files };
}

describe('gebouwd-zonder-nummer/AC-5: een vervallen AC slaat de AC-dekking over als het ADR bestaat en geaccepteerd is', () => {
  test.each([
    ['de template', TEMPLATE_SPEC, 'docs/template/adr/0095-demo.md'],
    ['een app', APP_SPEC, 'docs/adr/0095-demo.md'],
  ])(
    'gebouwd-zonder-nummer/AC-5: %s: ADR in de map naast de specmap, geaccepteerd: geen melding',
    async (_naam, spec, adr) => {
      const files = metTest({ [spec]: specTekst('gebouwd', [VERVALLEN_AC]), [adr]: ADR_INHOUD('geaccepteerd') });
      expect(await sleutels(files, 'docs:ac:')).toStrictEqual([]);
    },
  );

  test.each([
    ['een onbekend nummer', { 'docs/template/adr/0096-ander.md': ADR_INHOUD('geaccepteerd').replace('0095', '0096') }],
    ['geen ADR in de map', {}],
    ['een ADR met status voorgesteld', { 'docs/template/adr/0095-demo.md': ADR_INHOUD('voorgesteld') }],
    ['een ADR met status vervallen', { 'docs/template/adr/0095-demo.md': ADR_INHOUD('vervallen') }],
    ['een ADR met status vervangen door NNNN', { 'docs/template/adr/0095-demo.md': ADR_INHOUD('vervangen door 0096') }],
    [
      'een ADR in de verkeerde map (app-map voor een templatespec)',
      { 'docs/adr/0095-demo.md': ADR_INHOUD('geaccepteerd') },
    ],
  ])('gebouwd-zonder-nummer/AC-5: %s: de AC wordt gemeld', async (_naam, adrs) => {
    const files = metTest({ [TEMPLATE_SPEC]: specTekst('gebouwd', [VERVALLEN_AC]), ...adrs });
    expect(await sleutels(files, 'docs:ac:')).toStrictEqual(['docs:ac:demo:AC-2']);
  });

  test('gebouwd-zonder-nummer/AC-5: een app-spec met een ADR in de template-map wordt gemeld', async () => {
    const files = metTest({
      [APP_SPEC]: specTekst('gebouwd', [VERVALLEN_AC]),
      'docs/template/adr/0095-demo.md': ADR_INHOUD('geaccepteerd'),
    });
    expect(await sleutels(files, 'docs:ac:')).toStrictEqual(['docs:ac:demo:AC-2']);
  });

  test.each([
    ['in de tekst na andere woorden', '- **demo/AC-2** — Gegeven meer. Vervallen door ADR 0095 (reden).'],
    ['achter een voorafgaand woord', '- **demo/AC-2** — Nu vervallen: Vervallen door ADR 0095 (reden).'],
    ['op een vervolgregel', '- **demo/AC-2** — Gegeven meer, dan meer.\n  Vervallen door ADR 0095 (reden).'],
  ])(
    'gebouwd-zonder-nummer/AC-5: "Vervallen door ADR" %s (niet direct na het streepje): gemeld',
    async (_naam, regel) => {
      const files = metTest({
        [TEMPLATE_SPEC]: specTekst('gebouwd', [regel]),
        'docs/template/adr/0095-demo.md': ADR_INHOUD('geaccepteerd'),
      });
      expect(await sleutels(files, 'docs:ac:')).toStrictEqual(['docs:ac:demo:AC-2']);
    },
  );
});

// --- AC-6: de dood-padcheck -----------------------------------------------------------------------------------------------------

describe('gebouwd-zonder-nummer/AC-6: het merkteken van een dood pad mag na witruimte met hooguit één regeleinde staan', () => {
  const DOOD = `docs:${TEMPLATE_SPEC}:dood-pad:scripts/kit/weg.mjs`;
  const doodPad = (regels: string[]) =>
    sleutels({ [TEMPLATE_SPEC]: specTekst('gebouwd', ['', ...regels]) }, ':dood-pad:');

  test.each(['(vervallen)', '(nieuw)', '(voorbeeld)'])(
    'gebouwd-zonder-nummer/AC-6: %s op de volgende regel: geen melding',
    async (merkteken) => {
      expect(await doodPad(['Zie `scripts/kit/weg.mjs`', `${merkteken}.`])).toStrictEqual([]);
    },
  );

  test('gebouwd-zonder-nummer/AC-6: het merkteken na een regeleinde en inspringing: geen melding', async () => {
    expect(await doodPad(['Zie `scripts/kit/weg.mjs`', '  (vervallen).'])).toStrictEqual([]);
  });

  test('gebouwd-zonder-nummer/AC-6: meerdere spaties of tabs vóór het merkteken: geen melding', async () => {
    expect(await doodPad(['Zie `scripts/kit/weg.mjs` \t (nieuw).'])).toStrictEqual([]);
  });

  test('gebouwd-zonder-nummer/AC-6: een ander woord tussen pad en merkteken: melding', async () => {
    expect(await doodPad(['Zie `scripts/kit/weg.mjs` en (vervallen).'])).toStrictEqual([DOOD]);
    expect(await doodPad(['Zie `scripts/kit/weg.mjs`', 'en (vervallen).'])).toStrictEqual([DOOD]);
  });

  test('gebouwd-zonder-nummer/AC-6: een lege regel tussen pad en merkteken: melding', async () => {
    expect(await doodPad(['Zie `scripts/kit/weg.mjs`', '', '(vervallen).'])).toStrictEqual([DOOD]);
  });

  test('gebouwd-zonder-nummer/AC-6: een regel met alleen witruimte tussen pad en merkteken telt als lege regel: melding', async () => {
    expect(await doodPad(['Zie `scripts/kit/weg.mjs`', '   ', '(vervallen).'])).toStrictEqual([DOOD]);
  });
});

// --- AC-8: vervolgbouw, de checks (het rolhek staat in test/hooks/rolhek-beslisroute.test.ts) -----------------------------------

describe('gebouwd-zonder-nummer/AC-8: vervolgbouw met een onveranderde statusregel is groen voor check:docs en check:roadmap', () => {
  const GEMARKEERD = '- **demo/AC-2** (nog niet gebouwd) — Gegeven meer, dan meer.';
  const KAAL = '- **demo/AC-2** — Gegeven meer, dan meer.';

  test.each(['gebouwd # #12', 'gebouwd'])(
    'gebouwd-zonder-nummer/AC-8: status %s, merkteken weg en test erbij: check:docs en check:roadmap groen',
    async (status) => {
      const files = {
        [TEMPLATE_SPEC]: specTekst(status, [KAAL]),
        'test/demo.test.ts': "test('demo/AC-1 en demo/AC-2: iets', () => {});\n",
      };
      expect(await sleutels(files, 'docs:ac:')).toStrictEqual([]);
      const basis = { [SPEC_PAD]: specTekst(status, [GEMARKEERD]) };
      expect(await roadmapMeldingen(basis, { [SPEC_PAD]: specTekst(status, [KAAL]) })).toStrictEqual([]);
    },
  );
});

// --- AC-9: beslisOvergang ---------------------------------------------------------------------------------------------------------

describe('gebouwd-zonder-nummer/AC-9: beslisOvergang voor een spec die gebouwd blijft', () => {
  const MARKERING = '- **demo/AC-2** (nog niet gebouwd) — Gegeven meer, dan meer.';
  const KAAL = '- **demo/AC-2** — Gegeven meer, dan meer.';
  const NIEUW = '- **demo/AC-3** — Gegeven nieuw, dan nieuw.';
  const uitslag = (voor: string, na: string) => beslisOvergang(APP_SPEC, voor, na).uitslag;

  test.each([
    ['# #130 naar niets', 'gebouwd # #130', 'gebouwd'],
    ['# #130 naar # #131', 'gebouwd # #130', 'gebouwd # #131'],
    ['niets naar # #12', 'gebouwd', 'gebouwd # #12'],
    ['de SHA weg', `gebouwd # #130; gevalideerd: ${SHA}`, 'gebouwd # #130'],
    ['de SHA weg en het nummer weg', `gebouwd # #130; gevalideerd: ${SHA}`, 'gebouwd'],
    ['ander commentaar', 'gebouwd # gebouwd in PR #51', 'gebouwd'],
    ['niets gewijzigd, zonder nummer', 'gebouwd', 'gebouwd'],
  ])(
    'gebouwd-zonder-nummer/AC-9: alleen het commentaar achter de status anders (%s), gelijke inhoud: vrij',
    (_naam, voor, na) => {
      expect(uitslag(specTekst(voor), specTekst(na))).toBe('vrij');
    },
  );

  test.each(['gebouwd', 'gebouwd # #130', `gebouwd # #130; gevalideerd: ${SHA}`])(
    'gebouwd-zonder-nummer/AC-9: nieuwe inhoud zonder weggehaald merkteken bij status %s: besluit',
    (status) => {
      expect(uitslag(specTekst(status), specTekst(status, [NIEUW]))).toBe('besluit');
    },
  );

  test('gebouwd-zonder-nummer/AC-9: nieuwe inhoud bij een ander nummer in de statusregel is ook een besluit', () => {
    expect(uitslag(specTekst('gebouwd # #130'), specTekst('gebouwd # #131', [NIEUW]))).toBe('besluit');
  });

  test.each(['gebouwd', 'gebouwd # #130'])(
    'gebouwd-zonder-nummer/AC-9: een merkteken (nog niet gebouwd) weggehaald bij status %s: gebouwd',
    (status) => {
      expect(uitslag(specTekst(status, [MARKERING]), specTekst(status, [KAAL]))).toBe('gebouwd');
    },
  );

  test.each([
    ['van niets naar een SHA', 'gebouwd # #130', `gebouwd # #130; gevalideerd: ${SHA}`],
    ['van zonder nummer naar een SHA', 'gebouwd', `gebouwd # #130; gevalideerd: ${SHA}`],
    ['een andere SHA', `gebouwd # #130; gevalideerd: ${SHA}`, `gebouwd # #130; gevalideerd: ${ANDERE_SHA}`],
  ])('gebouwd-zonder-nummer/AC-9: een nieuwe ; gevalideerd: <sha> (%s): gebouwd', (_naam, voor, na) => {
    expect(uitslag(specTekst(voor), specTekst(na))).toBe('gebouwd');
  });
});

// --- AC-10 en AC-11: de repo na de bouw -------------------------------------------------------------------------------------------

function jsonObject(pad: string): Record<string, unknown> {
  const json: unknown = JSON.parse(lees(pad));
  if (typeof json !== 'object' || json === null || Array.isArray(json)) throw new Error(`${pad} is geen object`);
  return Object.fromEntries(Object.entries(json));
}

function sub(object: Record<string, unknown>, sleutel: string): Record<string, unknown> {
  const waarde = object[sleutel];
  if (typeof waarde !== 'object' || waarde === null || Array.isArray(waarde))
    throw new Error(`${sleutel} is geen object`);
  return Object.fromEntries(Object.entries(waarde));
}

describe('gebouwd-zonder-nummer/AC-10: docs:status en zijn scripts bestaan niet meer', () => {
  test('gebouwd-zonder-nummer/AC-10: package.json heeft geen script docs:status', () => {
    expect(Object.keys(sub(jsonObject('package.json'), 'scripts'))).not.toContain('docs:status');
  });

  test('gebouwd-zonder-nummer/AC-10: de padtabel heeft geen rij voor document-status.mjs of roadmap-item.mjs', () => {
    const paden = Object.keys(sub(jsonObject('.claude/gates.json'), 'paden'));
    expect(paden).not.toContain('scripts/kit/document-status.mjs');
    expect(paden).not.toContain('scripts/kit/roadmap-item.mjs');
  });

  test('gebouwd-zonder-nummer/AC-10: document-status.mjs en roadmap-item.mjs bestaan niet', () => {
    const bestaand = ['scripts/kit/document-status.mjs', 'scripts/kit/roadmap-item.mjs'].filter((bestand) =>
      existsSync(path.join(REPO, bestand)),
    );
    expect(bestaand).toStrictEqual([]);
  });

  test('gebouwd-zonder-nummer/AC-10: document-state.mjs exporteert changeStatus niet meer en de rest blijft', () => {
    expect('changeStatus' in documentState).toBe(false);
    for (const naam of ['documentInfo', 'builtReference', 'acIds', 'beslisOvergang'])
      expect(typeof Reflect.get(documentState, naam), naam).toBe('function');
  });
});

function bestandenOnder(pad: string): string[] {
  const volledig = path.join(REPO, pad);
  if (!existsSync(volledig)) return [];
  if (!statSync(volledig).isDirectory()) return [pad];
  return readdirSync(volledig).flatMap((naam) => bestandenOnder(path.posix.join(pad, naam)));
}

describe('gebouwd-zonder-nummer/AC-11: docs:status staat niet meer in de regelboeken, instructies en sjablonen', () => {
  const PADEN = [
    'docs/framework.md',
    'AGENTS.md',
    'docs/dod.md',
    'docs/operations/agent-doorloop.md',
    '.claude/agents',
    '.claude/skills',
    'docs/specs/_template.md',
    'docs/specs/_mini.md',
    'scripts/kit/templates/spec.md.tmpl',
  ];

  test.each(PADEN)('gebouwd-zonder-nummer/AC-11: %s noemt docs:status niet', (pad) => {
    const bestanden = bestandenOnder(pad);
    expect(bestanden.length, `${pad} bestaat`).toBeGreaterThan(0);
    const treffers = bestanden.filter((bestand) => lees(bestand).includes('docs:status'));
    expect(treffers).toStrictEqual([]);
  });
});

// --- AC-12: check:docs op de repo zelf -------------------------------------------------------------------------------------------

describe('gebouwd-zonder-nummer/AC-12: check:docs is groen zonder de spec gebouwd-na-merge', () => {
  const VERVALLEN: [spec: string, ac: string][] = [
    ['docs/template/specs/specarchief-en-bouwvorm.md', 'specarchief-en-bouwvorm/AC-9'],
    ['docs/template/specs/specarchief-en-bouwvorm.md', 'specarchief-en-bouwvorm/AC-10'],
    ['docs/template/specs/template-repo.md', 'template-repo/AC-5'],
  ];

  test('gebouwd-zonder-nummer/AC-12: docs/template/specs/gebouwd-na-merge.md bestaat niet', () => {
    expect(existsSync(path.join(REPO, 'docs/template/specs/gebouwd-na-merge.md'))).toBe(false);
  });

  test.each(VERVALLEN)('gebouwd-zonder-nummer/AC-12: %s heeft %s in de vorm uit AC-5', (spec, ac) => {
    const regel = lees(spec)
      .split('\n')
      .find((tekst) => tekst.startsWith(`- **${ac}** `));
    expect(regel, `${ac} in ${spec}`).toBeDefined();
    expect(regel).toMatch(/^- \*\*[^*]+\*\* — Vervallen door ADR 0095\b.* Was: /);
  });

  test("gebouwd-zonder-nummer/AC-12: check:docs geeft geen overtreding buiten de baseline, en geen AC-melding voor de vervallen AC's", async () => {
    const baseline: unknown = jsonObject('.kit/baseline.json')['check-docs'];
    if (!Array.isArray(baseline)) throw new Error('baseline zonder check-docs');
    const bekend = new Set(baseline.map(String));
    const meldingen = (await docsViolations(REPO)).map(({ key }) => key);
    expect(meldingen.filter((key) => !bekend.has(key))).toStrictEqual([]);
    for (const [, ac] of VERVALLEN) {
      const [naam = '', nummer = ''] = ac.split('/');
      expect(meldingen).not.toContain(`docs:ac:${naam}:${nummer}`);
    }
  });
});

// --- AC-27 en AC-28: de bouw van ADR 0104 (de statusregel en het merkteken zijn weg) ----------------------------------------------

/** De aaneengesloten `//`-regels aan het begin van een bronbestand. */
function kopcommentaar(pad: string): string {
  const regels = lees(pad).split('\n');
  const eerste = regels.findIndex((regel) => !regel.startsWith('//'));
  return regels.slice(0, eerste === -1 ? regels.length : eerste).join('\n');
}

describe('gebouwd-zonder-nummer/AC-27: de melding vergeten-gebouwd, regel 18 en alle gebouwd-regels en merktekens in de template zijn weg', () => {
  test('gebouwd-zonder-nummer/AC-27: scripts/kit/vergeten-gebouwd.mjs en test/rails/vergeten-gebouwd.test.ts bestaan niet', () => {
    expect(existsSync(path.join(REPO, 'scripts/kit/vergeten-gebouwd.mjs'))).toBe(false);
    expect(existsSync(path.join(REPO, 'test/rails/vergeten-gebouwd.test.ts'))).toBe(false);
  });

  test('gebouwd-zonder-nummer/AC-27: het kopcommentaar van scripts/kit/check-docs.mjs noemt geen regel 18 en geen vergeten-gebouwd', () => {
    const kop = kopcommentaar('scripts/kit/check-docs.mjs');
    expect(kop.length, 'het kopcommentaar is gelezen').toBeGreaterThan(500);
    expectAbsent(kop, /^\/\/\s+18\.\s/m, {
      recognizes: ['//  18. Een melding, nooit een overtreding', '// 18. Een melding'],
    });
    expect(kop).not.toContain('vergeten-gebouwd');
  });

  test('gebouwd-zonder-nummer/AC-27: geen bestand in docs/template/specs/ heeft een statusregel die met status: gebouwd begint', () => {
    const bestanden = bestandenOnder('docs/template/specs').filter((bestand) => bestand.endsWith('.md'));
    expect(bestanden.length, 'de specmap is gelezen').toBeGreaterThan(50);
    const gebouwd = bestanden.filter((bestand) => /^status: gebouwd/m.test(lees(bestand)));
    expect(gebouwd).toStrictEqual([]);
  });

  test('gebouwd-zonder-nummer/AC-27: geen AC-regel in docs/template/specs/ heeft het merkteken (acIds(…).gemarkeerd is leeg)', () => {
    const bestanden = bestandenOnder('docs/template/specs').filter((bestand) => bestand.endsWith('.md'));
    expect(bestanden.length, 'de specmap is gelezen').toBeGreaterThan(50);
    const gemarkeerd = bestanden.flatMap((bestand) => [...documentState.acIds(lees(bestand)).gemarkeerd]);
    expect(gemarkeerd).toStrictEqual([]);
  });
});

describe('gebouwd-zonder-nummer/AC-28: de instructies schrijven status: gebouwd niet meer voor', () => {
  const GEEN = [
    'AGENTS.md',
    'docs/dod.md',
    'docs/operations/agent-doorloop.md',
    '.claude/agents',
    '.claude/skills',
    'docs/specs/_template.md',
    'docs/specs/_mini.md',
    'scripts/kit/templates/spec.md.tmpl',
  ];

  test('gebouwd-zonder-nummer/AC-28: in AGENTS.md, docs/dod.md, agent-doorloop, de agents, de skills en de spec-sjablonen staat de tekst status: gebouwd niet', () => {
    const bestanden = GEEN.flatMap(bestandenOnder);
    expect(bestanden.length, 'de bestanden zijn gelezen').toBeGreaterThan(10);
    const treffers = bestanden.filter((bestand) => lees(bestand).includes('status: gebouwd'));
    expect(treffers).toStrictEqual([]);
  });

  test('gebouwd-zonder-nummer/AC-28: in docs/framework.md staat status: gebouwd alleen in R-WERK-08, als de oude vorm die als goedgekeurd telt', () => {
    const regels = lees('docs/framework.md')
      .split('\n')
      .filter((regel) => regel.includes('status: gebouwd'));
    expect(regels.length, 'R-WERK-08 noemt de oude vorm').toBe(1);
    expect(regels[0]).toMatch(/^- \*\*R-WERK-08\*\*/);
    const regel = regels[0] ?? '';
    const vanaf = regel.slice(regel.indexOf('status: gebouwd'));
    expect(vanaf.slice(0, 160), 'R-WERK-08 zegt dat de oude vorm als goedgekeurd telt').toMatch(/goedgekeurd/);
    // Het oude voorschrift is weg: niemand zet gebouwd nog in een bouw-PR.
    expect(regel).not.toContain('in een gewone commit van de bouw-PR');
  });
});
