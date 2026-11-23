import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, test } from 'vitest';
import { unsafeCast } from '../../src/core/shared/unsafe-cast.ts';
import { documentInfo } from '../../rails/hooks/lib/document-state.mjs';
import { docsViolations, heelWoord, SPEC_BESTAND, TESTBESTAND } from '../../scripts/kit/check-docs.mjs';
import { lezerSecties, specs } from '../../scripts/kit/feiten-secties.mjs';

// Spec gebouwd-zonder-nummer (ADR 0104), tests vóór de bouw: de pure AC-dekking van `rails/hooks/lib/ac-dekking.mjs` en wat
// check:docs (regel 6 id-herkenning, regel 7 `:vorm`, regel 14 dood pad) en `feiten specs` daaruit lezen. AC-5, AC-6 (herschreven),
// AC-16, AC-17, AC-22, AC-23 en AC-25. De tegenover-de-merge-base gevallen staan in test/rails/ac-dekking-basis.test.ts.
//
// De API die de tests vastleggen (rails/hooks/lib/ac-dekking.mjs, puur: geen fs, geen git):
//   eigenaarStatus(text)                  `status: gebouwd…` (elk commentaar) → 'goedgekeurd'; anders de status; geen status → undefined
//   gebouwdRegel(text)                    de letterlijke statusregel als die met `status: gebouwd` begint, anders null
//   dekkingVanSpec({ file, text }, boom)  → { eigenaar, stand: 'niet' | 'deels' | 'gebouwd', gebouwd: string[], levend: string[] }
//   acDekking(boom)                       → Map<specpad, Dekking>; boom = { bestanden, lees }
// De moduleslaat TESTBESTAND, SPEC_BESTAND en heelWoord uit scripts/kit/check-docs.mjs onder (die ze opnieuw exporteert).
const ROOT = path.resolve(import.meta.dirname, '../..');
const MODULE = path.join(ROOT, 'rails/hooks/lib/ac-dekking.mjs');

interface Boom {
  bestanden: readonly string[];
  lees: (pad: string) => string | null;
}
interface Dekking {
  eigenaar: string | undefined;
  stand: string;
  gebouwd: string[];
  levend: string[];
}
interface AcDekkingModule {
  eigenaarStatus: (text: string) => string | undefined;
  gebouwdRegel: (text: string) => string | null;
  dekkingVanSpec: (spec: { file: string; text: string }, boom: Boom) => Dekking;
  acDekking: (boom: Boom) => Map<string, Dekking>;
}

/** Laadt rails/hooks/lib/ac-dekking.mjs; een ontbrekende module of functie is een mislukte assertie, geen importfout. */
async function laad(): Promise<AcDekkingModule> {
  expect(existsSync(MODULE), 'rails/hooks/lib/ac-dekking.mjs bestaat niet: de developer bouwt het (ADR 0104)').toBe(
    true,
  );
  const mod = unsafeCast<Record<string, unknown>>(
    await import(pathToFileURL(MODULE).href),
    'dynamische import; de vorm staat in AcDekkingModule',
  );
  for (const naam of ['eigenaarStatus', 'gebouwdRegel', 'dekkingVanSpec', 'acDekking'])
    expect(typeof mod[naam], `ac-dekking.mjs exporteert ${naam} niet`).toBe('function');
  return unsafeCast<AcDekkingModule>(mod, 'vorm gecontroleerd hierboven');
}

function boom(files: Record<string, string>): Boom {
  return { bestanden: Object.keys(files), lees: (pad) => files[pad] ?? null };
}

// --- fixtures ------------------------------------------------------------------------------------------------------------

const ADR_TEMPLATE = 'docs/template/adr/0100-proces.md';
const adr = (status: string) => `# 0100 — Proces\n\nStatus: ${status}\n`;

function specTekst(status: string, namespace: string, regels: string[]): string {
  return [
    '---',
    `status: ${status}`,
    `namespace: ${namespace}`,
    '---',
    '',
    `# ${namespace}`,
    '',
    '## Hergebruik en UX',
    '',
    'Geen nieuwe UI.',
    '',
    '## Acceptatiecriteria',
    '',
    ...regels,
    '',
  ].join('\n');
}

const ac = (namespace: string, n: number, tekst = 'Gegeven iets, dan iets.') =>
  `- **${namespace}/AC-${String(n)}** — ${tekst}`;
const testTekst = (...ids: string[]) => ids.map((id) => `test('${id}: doet iets', () => {});\n`).join('');

const specPad = (naam: string) => `docs/template/specs/${naam}.md`;

// --- gedeelde delen ------------------------------------------------------------------------------------------------------

describe('rails/hooks/lib/ac-dekking.mjs: puur en gedeeld met check-docs', () => {
  test('gebouwd-zonder-nummer/AC-16: de module importeert niets uit node:fs, node:child_process of scripts/kit', () => {
    expect(existsSync(MODULE), 'rails/hooks/lib/ac-dekking.mjs bestaat niet').toBe(true);
    const bron = readFileSync(MODULE, 'utf8');
    const specificaties = [...bron.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g)].map(
      (treffer) => treffer[1] ?? '',
    );
    const verboden = specificaties.filter((naam) => /^(?:node:)?(?:fs|child_process)(?:\/|$)|scripts\/kit/.test(naam));
    expect(verboden).toStrictEqual([]);
  });

  test('gebouwd-zonder-nummer/AC-16: TESTBESTAND, SPEC_BESTAND en heelWoord verhuizen en check-docs exporteert ze opnieuw', async () => {
    const mod = unsafeCast<Record<string, unknown>>(await laad(), 'de module is geladen');
    expect(mod['TESTBESTAND']).toBe(TESTBESTAND);
    expect(mod['SPEC_BESTAND']).toBe(SPEC_BESTAND);
    expect(mod['heelWoord']).toBe(heelWoord);
  });
});

// --- AC-5: de vervallen-vorm -----------------------------------------------------------------------------------------------

describe('AC-5: een AC in de vervallen-vorm staat niet in levend', () => {
  const regels = (nummer: string, tekst = `Vervallen door ADR ${nummer} (reden). Was: Gegeven iets.`) => [
    ac('v', 1),
    `- **v/AC-2** — ${tekst}`,
  ];

  test('gebouwd-zonder-nummer/AC-5: een geaccepteerd ADR in de map naast de specmap, voor template en app', async () => {
    const { dekkingVanSpec } = await laad();
    const gevallen: [string, string][] = [
      ['docs/template/specs/v.md', 'docs/template/adr/0100-proces.md'],
      ['docs/specs/v.md', 'docs/adr/0100-proces.md'],
    ];
    for (const [file, adrPad] of gevallen) {
      const text = specTekst('goedgekeurd', 'v', regels('0100'));
      const tree = boom({ [file]: text, [adrPad]: adr('geaccepteerd'), 'test/v.test.ts': testTekst('v/AC-1') });
      const dekking = dekkingVanSpec({ file, text }, tree);
      expect(dekking.levend, file).toStrictEqual(['AC-1']);
      expect(dekking.gebouwd, file).toStrictEqual(['AC-1']);
      expect(dekking.stand, file).toBe('gebouwd');
    }
  });

  test.each([
    ['een onbekend nummer', { [ADR_TEMPLATE]: adr('geaccepteerd') }, '0999'],
    ['een ADR met status voorgesteld', { [ADR_TEMPLATE]: adr('voorgesteld') }, '0100'],
    ['een ADR met status vervallen', { [ADR_TEMPLATE]: adr('vervallen') }, '0100'],
    ['een ADR met status vervangen door NNNN', { [ADR_TEMPLATE]: adr('vervangen door 0101') }, '0100'],
    [
      'een ADR in de verkeerde map (docs/adr voor een templatespec)',
      { 'docs/adr/0100-proces.md': adr('geaccepteerd') },
      '0100',
    ],
  ])('gebouwd-zonder-nummer/AC-5: %s houdt de AC levend', async (_naam, adrs, nummer) => {
    const { dekkingVanSpec } = await laad();
    const file = specPad('v');
    const text = specTekst('goedgekeurd', 'v', regels(nummer));
    const dekking = dekkingVanSpec({ file, text }, boom({ [file]: text, ...adrs }));
    expect(dekking.levend).toStrictEqual(['AC-1', 'AC-2']);
    expect(dekking.gebouwd).toStrictEqual([]);
  });

  test('gebouwd-zonder-nummer/AC-5: "Vervallen door ADR" elders in de tekst dan direct na het streepje is geen vervallen-vorm', async () => {
    const { dekkingVanSpec } = await laad();
    const file = specPad('v');
    const elders = [
      ac('v', 1),
      '- **v/AC-2** — Gegeven iets. Vervallen door ADR 0100 (te laat).',
      '- **v/AC-3** — **Vervallen door ADR 0100**',
      '  - **v/AC-4** — Vervallen door ADR 0100 (ingesprongen is geen item).',
    ];
    const text = specTekst('goedgekeurd', 'v', elders);
    const dekking = dekkingVanSpec({ file, text }, boom({ [file]: text, [ADR_TEMPLATE]: adr('geaccepteerd') }));
    expect(dekking.levend).toStrictEqual(['AC-1', 'AC-2', 'AC-3']);
  });
});

// --- AC-16: acDekking ------------------------------------------------------------------------------------------------------

describe('AC-16: acDekking per spec', () => {
  const tweeAcs = (ns: string) => [ac(ns, 1), ac(ns, 2)];
  const bomen = (): Record<string, string> => ({
    [specPad('vol')]: specTekst('goedgekeurd', 'vol', tweeAcs('vol')),
    [specPad('half')]: specTekst('goedgekeurd', 'half', tweeAcs('half')),
    [specPad('leeg')]: specTekst('goedgekeurd', 'leeg', tweeAcs('leeg')),
    [specPad('voorstel')]: specTekst('voorstel', 'voorstel', tweeAcs('voorstel')),
    [specPad('verval')]: specTekst('vervallen', 'verval', tweeAcs('verval')),
    'test/dekking.test.ts': testTekst(
      'vol/AC-1',
      'vol/AC-2',
      'half/AC-1',
      'voorstel/AC-1',
      'voorstel/AC-2',
      'verval/AC-1',
      'verval/AC-2',
    ),
  });

  test('gebouwd-zonder-nummer/AC-16: goedgekeurd met een test voor elk, een deel of geen levend AC: gebouwd n/n, deels n/m, niet 0/m', async () => {
    const { acDekking } = await laad();
    const kaart = acDekking(boom(bomen()));
    expect(kaart.get(specPad('vol'))).toMatchObject({
      eigenaar: 'goedgekeurd',
      stand: 'gebouwd',
      gebouwd: ['AC-1', 'AC-2'],
      levend: ['AC-1', 'AC-2'],
    });
    expect(kaart.get(specPad('half'))).toMatchObject({ stand: 'deels', gebouwd: ['AC-1'], levend: ['AC-1', 'AC-2'] });
    expect(kaart.get(specPad('leeg'))).toMatchObject({ stand: 'niet', gebouwd: [], levend: ['AC-1', 'AC-2'] });
  });

  test('gebouwd-zonder-nummer/AC-16: voorstel en vervallen met tests voor elk AC: stand niet, dezelfde gebouwd en levend als bij goedgekeurd', async () => {
    const { acDekking } = await laad();
    const kaart = acDekking(boom(bomen()));
    for (const naam of ['voorstel', 'verval'])
      expect(kaart.get(specPad(naam)), naam).toMatchObject({
        stand: 'niet',
        gebouwd: ['AC-1', 'AC-2'],
        levend: ['AC-1', 'AC-2'],
      });
    expect(kaart.get(specPad('voorstel'))?.eigenaar).toBe('voorstel');
    expect(kaart.get(specPad('verval'))?.eigenaar).toBe('vervallen');
  });

  test("gebouwd-zonder-nummer/AC-16: goedgekeurd zonder AC's of met alleen vervallen AC's: stand niet, 0/0 (OV-9)", async () => {
    const { acDekking } = await laad();
    const vervallen = [
      '- **alle/AC-1** — Vervallen door ADR 0100 (reden). Was: een.',
      '- **alle/AC-2** — Vervallen door ADR 0100 (reden). Was: twee.',
    ];
    const kaart = acDekking(
      boom({
        [specPad('geen')]: specTekst('goedgekeurd', 'geen', []),
        [specPad('alle')]: specTekst('goedgekeurd', 'alle', vervallen),
        [ADR_TEMPLATE]: adr('geaccepteerd'),
        'test/x.test.ts': testTekst('geen/AC-1'),
      }),
    );
    for (const naam of ['geen', 'alle'])
      expect(kaart.get(specPad(naam)), naam).toMatchObject({ stand: 'niet', gebouwd: [], levend: [] });
  });

  test('gebouwd-zonder-nummer/AC-16: acDekking neemt alleen specbestanden en geen _-bestanden of andere mappen', async () => {
    const { acDekking } = await laad();
    const kaart = acDekking(
      boom({
        [specPad('echt')]: specTekst('goedgekeurd', 'echt', [ac('echt', 1)]),
        'docs/template/specs/_sjabloon.md': specTekst('goedgekeurd', 'sjabloon', [ac('sjabloon', 1)]),
        'docs/anders/spec.md': specTekst('goedgekeurd', 'anders', [ac('anders', 1)]),
      }),
    );
    expect([...kaart.keys()]).toStrictEqual([specPad('echt')]);
  });

  test('gebouwd-zonder-nummer/AC-16: een testbestand telt met <namespace>/AC-n of <specnaam>/AC-n als heel woord; los AC-n, andere/<namespace>/AC-n en een niet-testbestand niet', async () => {
    const { acDekking } = await laad();
    const regels = [ac('mijn', 1), ac('mijn', 2), ac('mijn', 3), ac('mijn', 4), ac('mijn', 5)];
    const kaart = acDekking(
      boom({
        'docs/template/specs/mijn-spec.md': specTekst('goedgekeurd', 'mijn', [
          ...regels,
          '',
          'Zie ook andere-spec/AC-7 voor het vervolg.',
        ]),
        'test/namespace.test.ts': testTekst('mijn/AC-1'),
        'test/specnaam.test.ts': testTekst('mijn-spec/AC-2'),
        'test/los.test.ts':
          "test('AC-3: los id met mijn en mijn-spec ernaast', () => {});\n// andere/mijn/AC-3\n// x.mijn/AC-3\n",
        'src/notitie.ts': '// mijn/AC-4 staat alleen in een niet-testbestand\n',
        'docs/notitie.md': 'mijn/AC-4 en mijn-spec/AC-4\n',
        'test/lang.test.ts': testTekst('mijn/AC-50'),
      }),
    );
    expect(kaart.get('docs/template/specs/mijn-spec.md')).toMatchObject({
      stand: 'deels',
      gebouwd: ['AC-1', 'AC-2'],
      levend: ['AC-1', 'AC-2', 'AC-3', 'AC-4', 'AC-5'],
    });
  });

  test('gebouwd-zonder-nummer/AC-16: een kruisverwijzing andere-spec/AC-n is geen eigen AC, en een test ervoor dekt de andere spec', async () => {
    const { acDekking } = await laad();
    const kaart = acDekking(
      boom({
        [specPad('eigen')]: specTekst('goedgekeurd', 'eigen', [
          ac('eigen', 1),
          '- **andere/AC-7** — Kruisverwijzing, geen eigen AC.',
          '',
          'Zie `andere-spec/AC-7`.',
        ]),
        [specPad('andere-spec')]: specTekst('goedgekeurd', 'andere', [ac('andere', 7)]),
        'test/x.test.ts': testTekst('eigen/AC-1', 'andere-spec/AC-7'),
      }),
    );
    expect(kaart.get(specPad('eigen'))).toMatchObject({ stand: 'gebouwd', gebouwd: ['AC-1'], levend: ['AC-1'] });
    expect(kaart.get(specPad('andere-spec'))).toMatchObject({ stand: 'gebouwd', gebouwd: ['AC-7'], levend: ['AC-7'] });
  });

  test('gebouwd-zonder-nummer/AC-16: AC-ids staan numeriek oplopend, ook bij AC-10 en hoger', async () => {
    const { acDekking } = await laad();
    const kaart = acDekking(
      boom({
        [specPad('n')]: specTekst('goedgekeurd', 'n', [ac('n', 10), ac('n', 2), ac('n', 1)]),
        'test/n.test.ts': testTekst('n/AC-10', 'n/AC-2'),
      }),
    );
    expect(kaart.get(specPad('n'))).toMatchObject({
      stand: 'deels',
      gebouwd: ['AC-2', 'AC-10'],
      levend: ['AC-1', 'AC-2', 'AC-10'],
    });
  });
});

// --- AC-17: gebouwd is een oude vorm van goedgekeurd -----------------------------------------------------------------------

describe('AC-17: een bestaande status: gebouwd leest als goedgekeurd', () => {
  const REGELS = ['status: gebouwd', 'status: gebouwd # #12', 'status: gebouwd # ander commentaar'];

  test.each(REGELS)('gebouwd-zonder-nummer/AC-17: eigenaarStatus en gebouwdRegel lezen "%s"', async (regel) => {
    const { eigenaarStatus, gebouwdRegel } = await laad();
    const tekst = `---\n${regel}\nnamespace: x\n---\n\n# X\n`;
    expect(eigenaarStatus(tekst)).toBe('goedgekeurd');
    expect(gebouwdRegel(tekst)).toBe(regel);
  });

  test('gebouwd-zonder-nummer/AC-17: eigenaarStatus houdt de drie eigenaarstatussen, gebouwdRegel is dan null', async () => {
    const { eigenaarStatus, gebouwdRegel } = await laad();
    for (const status of ['voorstel', 'goedgekeurd', 'vervallen', 'goedgekeurd # #12']) {
      const tekst = `---\nstatus: ${status}\nnamespace: x\n---\n\n# X\n`;
      expect(eigenaarStatus(tekst), status).toBe(status.split(' ')[0]);
      expect(gebouwdRegel(tekst), status).toBeNull();
    }
    expect(eigenaarStatus('# Zonder kop\n')).toBeUndefined();
  });

  test.each(['docs/specs/demo.md', 'docs/template/specs/demo.md'])(
    'gebouwd-zonder-nummer/AC-17: documentInfo geeft %s met een oude gebouwd-regel de status goedgekeurd',
    (file) => {
      for (const regel of REGELS) {
        const tekst = `---\n${regel}\nnamespace: demo\n---\n\n# Demo\n`;
        expect(documentInfo(file, tekst)?.status, regel).toBe('goedgekeurd');
      }
    },
  );

  test('gebouwd-zonder-nummer/AC-17: het merkteken (nog niet gebouwd) verandert de afleiding niet: met test gebouwd, zonder niet', async () => {
    const { dekkingVanSpec } = await laad();
    const file = specPad('m');
    const text = specTekst('gebouwd # #12', 'm', [
      ac('m', 1),
      '- **m/AC-2** (nog niet gebouwd) — Gegeven meer, dan meer.',
    ]);
    const met = dekkingVanSpec({ file, text }, boom({ [file]: text, 'test/m.test.ts': testTekst('m/AC-1', 'm/AC-2') }));
    expect(met).toMatchObject({
      eigenaar: 'goedgekeurd',
      stand: 'gebouwd',
      gebouwd: ['AC-1', 'AC-2'],
      levend: ['AC-1', 'AC-2'],
    });
    const zonder = dekkingVanSpec({ file, text }, boom({ [file]: text, 'test/m.test.ts': testTekst('m/AC-1') }));
    expect(zonder).toMatchObject({ stand: 'deels', gebouwd: ['AC-1'], levend: ['AC-1', 'AC-2'] });
  });

  test('gebouwd-zonder-nummer/AC-17: check:docs leest de oude regel als goedgekeurd: zonder tests geen dood-padmelding, met volle dekking wel', async () => {
    for (const map of ['docs/specs', 'docs/template/specs']) {
      const file = `${map}/oud.md`;
      const tekst = specTekst('gebouwd # #12', 'oud', [ac('oud', 1), '', 'Zie `scripts/kit/weg.mjs`.']);
      const zonderTest = await doodPaden({ [file]: tekst });
      expect(zonderTest, `${file} zonder test`).toStrictEqual([]);
      const metTest = await doodPaden({ [file]: tekst, 'test/oud.test.ts': testTekst('oud/AC-1') });
      expect(metTest, `${file} met test`).toStrictEqual([`docs:${file}:dood-pad:scripts/kit/weg.mjs`]);
    }
  });
});

// --- check:docs: regel 14 (AC-6, AC-22) en regel 7 (AC-23) -------------------------------------------------------------------

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function repo(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), 'ac-dekking-'));
  dirs.push(root);
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
  const violations = await docsViolations(repo(files));
  return violations.map(({ key }) => key).filter((key) => key.includes(deel));
}
const doodPaden = (files: Record<string, string>) => sleutels(files, ':dood-pad:');

const DOOD = 'scripts/kit/weg.mjs';
const DEMO = 'docs/template/specs/demo.md';
const DOOD_KEY = `docs:${DEMO}:dood-pad:${DOOD}`;
const TEST_DEMO = { 'test/demo.test.ts': testTekst('demo/AC-1') };

/** Een goedgekeurde spec met AC-1 (getest) en een regel proza buiten elk AC-item. */
function metProza(prozaRegels: string[], status = 'goedgekeurd', extra: Record<string, string> = TEST_DEMO) {
  return { [DEMO]: specTekst(status, 'demo', [ac('demo', 1), '', ...prozaRegels]), ...extra };
}

describe('AC-6 (herschreven): de markeringen (vervallen), (nieuw) en (voorbeeld) bij een spec met een gebouwd AC', () => {
  test.each(['(vervallen)', '(nieuw)', '(voorbeeld)'])(
    'gebouwd-zonder-nummer/AC-6: %s direct achter het pad, ook na witruimte of één regeleinde: geen melding',
    async (markering) => {
      // Controle: zonder markering meldt de check wel (de spec heeft een gebouwd AC).
      expect(await doodPaden(metProza([`Zie \`${DOOD}\`.`]))).toStrictEqual([DOOD_KEY]);
      for (const vorm of [`\`${DOOD}\` ${markering}.`, `\`${DOOD}\`\t${markering}.`, `\`${DOOD}\`\n  ${markering}.`])
        expect(await doodPaden(metProza([`Zie ${vorm}`])), JSON.stringify(vorm)).toStrictEqual([]);
    },
  );

  test('gebouwd-zonder-nummer/AC-6: met een ander woord ertussen, of een lege regel ertussen, wel een melding', async () => {
    const vormen = [
      `\`${DOOD}\` is (vervallen).`,
      `\`${DOOD}\` nog (nieuw)`,
      `\`${DOOD}\`\n\n(vervallen)`,
      `\`${DOOD}\` (anders)`,
    ];
    for (const vorm of vormen)
      expect(await doodPaden(metProza([`Zie ${vorm}`])), JSON.stringify(vorm)).toStrictEqual([DOOD_KEY]);
  });

  test('gebouwd-zonder-nummer/AC-6: de melding noemt het pad en de eis van een markering', async () => {
    const violations = await docsViolations(repo(metProza([`Zie \`${DOOD}\`.`])));
    const melding = violations.find(({ key }) => key === DOOD_KEY);
    expect(melding, 'een melding voor het dode pad').toBeDefined();
    expect(melding?.message).toContain(DOOD);
    expect(melding?.message).toContain('(nieuw)');
  });
});

describe('AC-22: regel 14 toetst elke spec met minstens één gebouwd AC, behalve het lijstitem van een niet-gebouwd AC', () => {
  const tweeAcs = (extra: string[]) => ({
    [DEMO]: specTekst('goedgekeurd', 'demo', [ac('demo', 1), ...extra]),
    ...TEST_DEMO,
  });

  test('gebouwd-zonder-nummer/AC-22: een dood pad buiten het lijstitem van een niet-gebouwd AC wordt gemeld, ook bij een deels gebouwde spec', async () => {
    const deels = {
      [DEMO]: specTekst('goedgekeurd', 'demo', [ac('demo', 1), ac('demo', 2), '', `Zie \`${DOOD}\`.`]),
      ...TEST_DEMO,
    };
    expect(await doodPaden(deels)).toStrictEqual([DOOD_KEY]);
    expect(await doodPaden(metProza([`Zie \`${DOOD}\`.`]))).toStrictEqual([DOOD_KEY]);
  });

  test('gebouwd-zonder-nummer/AC-22: een dood pad in een gebouwd AC-item zelf wordt gemeld', async () => {
    const bestanden = {
      [DEMO]: specTekst('goedgekeurd', 'demo', [ac('demo', 1, `Gegeven \`${DOOD}\`, dan iets.`), ac('demo', 2)]),
      ...TEST_DEMO,
    };
    expect(await doodPaden(bestanden)).toStrictEqual([DOOD_KEY]);
  });

  test('gebouwd-zonder-nummer/AC-22: een pad binnen het lijstitem van een niet-gebouwd AC geeft geen melding (ook op een vervolgregel en in een ingesprongen sub-bullet)', async () => {
    const item = [
      ac('demo', 2, `De check meldt \`${DOOD}\` en`),
      `  \`test/weg.test.ts\` bewijst het:`,
      `  - \`src/weg.ts\` geeft exit 1;`,
    ];
    expect(await doodPaden(tweeAcs(item))).toStrictEqual([]);
    // Controle: dezelfde paden na het einde van het item (lege regel) tellen wel.
    const na = tweeAcs([ac('demo', 2), '', `Daarna \`${DOOD}\`.`]);
    expect(await doodPaden(na)).toStrictEqual([DOOD_KEY]);
  });

  test('gebouwd-zonder-nummer/AC-22: het item van een niet-gebouwd AC eindigt bij een lege regel of een regel met - of #', async () => {
    const volgendItem = [ac('demo', 2, 'Zonder test.'), ac('demo', 3, `Met \`${DOOD}\`.`)];
    const metKop = [ac('demo', 2, 'Zonder test.'), `# Kop met \`${DOOD}\``];
    expect(await doodPaden(tweeAcs(volgendItem))).toStrictEqual([DOOD_KEY]);
    expect(await doodPaden(tweeAcs(metKop))).toStrictEqual([DOOD_KEY]);
  });

  test('gebouwd-zonder-nummer/AC-22: een spec met stand niet toetst de dood-padcheck niet (zonder tests, voorstel of vervallen)', async () => {
    // Controle: dezelfde tekst met een gebouwd AC meldt wel.
    expect(await doodPaden(metProza([`Zie \`${DOOD}\`.`]))).toStrictEqual([DOOD_KEY]);
    expect(await doodPaden(metProza([`Zie \`${DOOD}\`.`], 'goedgekeurd', {}))).toStrictEqual([]);
    expect(await doodPaden(metProza([`Zie \`${DOOD}\`.`], 'voorstel'))).toStrictEqual([]);
    expect(await doodPaden(metProza([`Zie \`${DOOD}\`.`], 'vervallen'))).toStrictEqual([]);
  });
});

describe('AC-23: regel 7 (:vorm) toetst "Kopieer de vorm van" zolang de spec niet volledig gebouwd is', () => {
  const VORM_KEY = `docs:${DEMO}:vorm`;
  const metVorm = (status: string, regels: string[], tests: Record<string, string> = TEST_DEMO) => ({
    [DEMO]: specTekst(status, 'demo', regels).replace(
      '## Hergebruik en UX',
      `## Kopieer de vorm van\n\n- \`scripts/kit/bestaat.mjs\`\n- \`${DOOD}\` (bestaat nog niet)\n\n## Hergebruik en UX`,
    ),
    ...tests,
  });
  const vorm = (bestanden: Record<string, string>) => sleutels(bestanden, ':vorm');

  test('gebouwd-zonder-nummer/AC-23: gemeld bij voorstel en goedgekeurd met stand niet of deels, niet bij stand gebouwd (ook een oude gebouwd-regel met volledige dekking) of vervallen', async () => {
    // Gemeld bij voorstel en bij goedgekeurd met stand niet of deels.
    expect(await vorm(metVorm('voorstel', [ac('demo', 1)]))).toStrictEqual([VORM_KEY]);
    expect(await vorm(metVorm('goedgekeurd', [ac('demo', 1)], {}))).toStrictEqual([VORM_KEY]);
    expect(await vorm(metVorm('goedgekeurd', [ac('demo', 1), ac('demo', 2)]))).toStrictEqual([VORM_KEY]);
    // Controle: dezelfde spec zonder tests meldt wel.
    expect(await vorm(metVorm('goedgekeurd', [ac('demo', 1)], {}))).toStrictEqual([VORM_KEY]);
    expect(await vorm(metVorm('goedgekeurd', [ac('demo', 1)]))).toStrictEqual([]);
    expect(await vorm(metVorm('gebouwd # #12', [ac('demo', 1)]))).toStrictEqual([]);
    expect(await vorm(metVorm('vervallen', [ac('demo', 1)]))).toStrictEqual([]);
  });

  test('gebouwd-zonder-nummer/AC-23: een oude gebouwd-regel zonder volledige dekking telt als goedgekeurd met stand niet of deels: gemeld', async () => {
    expect(await vorm(metVorm('gebouwd # #12', [ac('demo', 1)], {}))).toStrictEqual([VORM_KEY]);
    expect(await vorm(metVorm('gebouwd', [ac('demo', 1), ac('demo', 2)]))).toStrictEqual([VORM_KEY]);
  });
});

// --- AC-25: feiten specs ---------------------------------------------------------------------------------------------------

describe('AC-25: feiten specs toont de afgeleide stand', () => {
  const MAP = 'docs/template/specs';
  const bestanden: Record<string, string> = {
    [`${MAP}/a.md`]: specTekst('goedgekeurd', 'a', [ac('a', 1), ac('a', 2)]),
    [`${MAP}/b.md`]: specTekst('goedgekeurd', 'b', [ac('b', 1), ac('b', 2)]),
    [`${MAP}/c.md`]: specTekst('goedgekeurd', 'c', [ac('c', 1)]),
    [`${MAP}/d.md`]: specTekst('gebouwd # #5', 'd', [ac('d', 1)]),
    [`${MAP}/e.md`]: specTekst('voorstel', 'e', [ac('e', 1)]),
    [`${MAP}/f.md`]: specTekst('vervallen', 'f', [ac('f', 1)]),
    'test/stand.test.ts': testTekst('a/AC-1', 'a/AC-2', 'b/AC-1', 'd/AC-1', 'e/AC-1'),
  };
  const namen = ['a.md', 'b.md', 'c.md', 'd.md', 'e.md', 'f.md'];
  const lezerMet = (metBoom: boolean) => ({
    lees: (pad: string) => bestanden[pad] ?? null,
    lijst: (map: string) => (map === MAP ? namen : []),
    ...(metBoom ? { boom: () => boom(bestanden) } : {}),
  });

  function rij(uit: unknown, spec: string): unknown {
    expect(Array.isArray(uit), 'specs() geeft een lijst').toBe(true);
    const lijst: unknown[] = Array.isArray(uit) ? uit : [];
    return lijst.find((item) => typeof item === 'object' && item !== null && Reflect.get(item, 'spec') === spec);
  }

  test('gebouwd-zonder-nummer/AC-25: specs(lezer, map) geeft per spec { spec, status, stand, gebouwd, levend } met tellingen', () => {
    const uit: unknown = specs(lezerMet(true), MAP);
    expect(rij(uit, 'a.md')).toStrictEqual({
      spec: 'a.md',
      status: 'gebouwd',
      stand: 'gebouwd',
      gebouwd: 2,
      levend: 2,
    });
    expect(rij(uit, 'b.md')).toStrictEqual({
      spec: 'b.md',
      status: 'deels 1/2',
      stand: 'deels',
      gebouwd: 1,
      levend: 2,
    });
    expect(rij(uit, 'c.md')).toStrictEqual({
      spec: 'c.md',
      status: 'goedgekeurd',
      stand: 'niet',
      gebouwd: 0,
      levend: 1,
    });
    expect(rij(uit, 'd.md')).toStrictEqual({
      spec: 'd.md',
      status: 'gebouwd',
      stand: 'gebouwd',
      gebouwd: 1,
      levend: 1,
    });
    expect(rij(uit, 'e.md')).toStrictEqual({ spec: 'e.md', status: 'voorstel', stand: 'niet', gebouwd: 1, levend: 1 });
    expect(rij(uit, 'f.md')).toStrictEqual({ spec: 'f.md', status: 'vervallen', stand: 'niet', gebouwd: 0, levend: 1 });
  });

  test('gebouwd-zonder-nummer/AC-25: een lezer zonder boom geeft elke spec lege gebouwd en stand niet', () => {
    const uit: unknown = specs(lezerMet(false), MAP);
    for (const naam of namen) expect(rij(uit, naam), naam).toMatchObject({ stand: 'niet', gebouwd: 0 });
    expect(rij(uit, 'a.md')).toMatchObject({ status: 'goedgekeurd' });
  });

  test('gebouwd-zonder-nummer/AC-25: de standaardlijst toont geen spec met stand gebouwd en de telregel telt per stand; --alle toont alles', () => {
    const standaard: unknown = lezerSecties(lezerMet(true), { alle: false }).specs();
    expect(standaard).toMatchObject({
      'docs/template/specs/': [
        { spec: 'b.md', status: 'deels 1/2' },
        { spec: 'c.md', status: 'goedgekeurd' },
        { spec: 'e.md', status: 'voorstel' },
      ],
    });
    const overig: unknown =
      typeof standaard === 'object' && standaard !== null
        ? Reflect.get(standaard, 'overig docs/template/specs/')
        : null;
    expect(overig).toMatch(/2 gebouwd/);
    expect(overig).toMatch(/1 vervallen/);
    const alles: unknown = lezerSecties(lezerMet(true), { alle: true }).specs();
    const lijst: unknown =
      typeof alles === 'object' && alles !== null ? Reflect.get(alles, 'docs/template/specs/') : null;
    expect(Array.isArray(lijst) ? lijst.length : -1).toBe(6);
  });
});
