import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, test } from 'vitest';
import { unsafeCast } from '../../src/core/shared/unsafe-cast.ts';
import { roadmapMeldingen } from '../../scripts/kit/check-roadmap.mjs';

// Spec gebouwd-zonder-nummer (ADR 0104), AC-24, tests vóór de bouw: `roadmapMeldingen` meldt een spec die in deze PR volledig
// gebouwd wordt (stand `gebouwd` op de head, op de merge-base `niet`, `deels` of afwezig), een roadmap-id noemt en
// docs/roadmap.md niet wijzigt: sleutel `spec:roadmap:<specpad>`. De sleutel `spec:bewijs` bestaat niet meer.
//
// De API die de tests vastleggen (scripts/kit/check-roadmap.mjs, puur): `roadmapMeldingen` krijgt naast `basis` en `head`
// (beide een Boom: { bestanden, lees }, head met `hernoemd`) een derde bron `dekking: { basis, head }`, elk een
// Map<specpad, Dekking> uit `acDekking` van rails/hooks/lib/ac-dekking.mjs. De naam `dekking` en de vorm { basis, head } zijn
// een aanname van de tester: de spec noemt alleen "de dekking als derde bron" (Hergebruik en UX, check-roadmap).
const ROOT = path.resolve(import.meta.dirname, '../..');
const MODULE = path.join(ROOT, 'rails/hooks/lib/ac-dekking.mjs');

interface Boom {
  bestanden: readonly string[];
  lees: (pad: string) => string | null;
}
interface AcDekkingModule {
  acDekking: (boom: Boom) => Map<string, unknown>;
}
interface Melding {
  key: string;
  message: string;
}

async function laadDekking(): Promise<AcDekkingModule> {
  expect(existsSync(MODULE), 'rails/hooks/lib/ac-dekking.mjs bestaat niet: de developer bouwt het (ADR 0104)').toBe(
    true,
  );
  const mod = unsafeCast<Record<string, unknown>>(
    await import(pathToFileURL(MODULE).href),
    'dynamische import; de vorm staat in AcDekkingModule',
  );
  expect(typeof mod['acDekking'], 'ac-dekking.mjs exporteert acDekking niet').toBe('function');
  return unsafeCast<AcDekkingModule>(mod, 'vorm gecontroleerd hierboven');
}

const SPEC = 'docs/template/specs/a.md';
const TEST = 'test/a.test.ts';
const ROADMAP = 'docs/roadmap.md';
const ACS = ['- **an/AC-1** — Eerste.', '- **an/AC-2** — Tweede.'];

function spec(status: string, opties: { verwijzing?: string; regels?: string[] } = {}): string {
  const { verwijzing = 'Hoort bij ST-09.', regels = ACS } = opties;
  return `---\nstatus: ${status}\nnamespace: an\n---\n\n# A\n\n${verwijzing}\n\n## Acceptatiecriteria\n\n${regels.join('\n')}\n`;
}
const tests = (...ids: string[]) => ids.map((id) => `test('${id}: doet iets', () => {});\n`).join('');
const roadmap = (extra = '') => `# Roadmap\n\n## Stuk\n\n- [ ] Iets (ST-09)\n${extra}`;

type Bestanden = Record<string, string>;
const VOL = tests('an/AC-1', 'an/AC-2');
const DEELS = tests('an/AC-1');

function boom(files: Bestanden): Boom {
  return { bestanden: Object.keys(files), lees: (pad) => files[pad] ?? null };
}

/** Roept `roadmapMeldingen` aan met bronnen in het geheugen en de dekking die `acDekking` van beide bomen geeft. */
async function meldingen(basis: Bestanden, head: Bestanden, hernoemd: Record<string, string> = {}): Promise<Melding[]> {
  const { acDekking } = await laadDekking();
  const [basisBoom, headBoom] = [boom(basis), boom(head)];
  const invoer = {
    basis: basisBoom,
    head: { ...headBoom, hernoemd },
    dekking: { basis: acDekking(basisBoom), head: acDekking(headBoom) },
    scripts: {},
    testpaden: ['test/**'],
  };
  const uit: unknown = roadmapMeldingen(
    unsafeCast<Parameters<typeof roadmapMeldingen>[0]>(invoer, 'de derde bron staat nog niet in de JSDoc-type'),
  );
  if (!Array.isArray(uit)) throw new Error('roadmapMeldingen geeft geen lijst');
  const lijst: unknown[] = uit;
  return lijst.map((item) => {
    if (typeof item === 'object' && item !== null && 'key' in item && 'message' in item)
      return { key: String(item.key), message: String(item.message) };
    throw new Error('geen { key, message }');
  });
}

const specSleutels = (lijst: readonly Melding[]) =>
  lijst.map(({ key }) => key).filter((key) => key.startsWith('spec:'));
const ROOD = [`spec:roadmap:${SPEC}`];
const melding = (id: string) =>
  `${SPEC}: wordt in deze PR volledig gebouwd en noemt ${id}, maar docs/roadmap.md wijzigt niet in deze PR`;

describe('AC-24: een spec die in deze PR volledig gebouwd wordt, wijzigt docs/roadmap.md mee', () => {
  test('gebouwd-zonder-nummer/AC-24: van deels naar gebouwd met roadmap-id en zonder roadmapwijziging: rood met de tekst uit de spec', async () => {
    const basis = { [SPEC]: spec('goedgekeurd'), [TEST]: DEELS, [ROADMAP]: roadmap() };
    const head = { [SPEC]: spec('goedgekeurd'), [TEST]: VOL, [ROADMAP]: roadmap() };
    const uit = await meldingen(basis, head);
    expect(specSleutels(uit)).toStrictEqual(ROOD);
    expect(uit.find(({ key }) => key === ROOD[0])?.message).toBe(melding('ST-09'));
  });

  test('gebouwd-zonder-nummer/AC-24: van niet naar gebouwd, en een spec die op de merge-base niet bestaat: ook rood', async () => {
    const head = { [SPEC]: spec('goedgekeurd'), [TEST]: VOL, [ROADMAP]: roadmap() };
    const niet = { [SPEC]: spec('goedgekeurd'), [ROADMAP]: roadmap() };
    expect(specSleutels(await meldingen(niet, head))).toStrictEqual(ROOD);
    expect(specSleutels(await meldingen({ [ROADMAP]: roadmap() }, head))).toStrictEqual(ROOD);
  });

  test('gebouwd-zonder-nummer/AC-24: het roadmap-id mag ook "roadmap stuk <n>" zijn', async () => {
    const tekst = spec('goedgekeurd', { verwijzing: 'Zie roadmap stuk 3b.' });
    const uit = await meldingen(
      { [SPEC]: tekst, [ROADMAP]: roadmap() },
      { [SPEC]: tekst, [TEST]: VOL, [ROADMAP]: roadmap() },
    );
    expect(uit.find(({ key }) => key === ROOD[0])?.message).toBe(melding('roadmap stuk 3b'));
  });

  test('gebouwd-zonder-nummer/AC-24: groen: docs/roadmap.md wijzigt in dezelfde PR', async () => {
    const basis = { [SPEC]: spec('goedgekeurd'), [TEST]: DEELS, [ROADMAP]: roadmap() };
    const rood = await meldingen(basis, { ...basis, [TEST]: VOL });
    expect(specSleutels(rood)).toStrictEqual(ROOD);
    const groen = await meldingen(basis, { ...basis, [TEST]: VOL, [ROADMAP]: roadmap('- [x] Iets (ST-08, #12)\n') });
    expect(specSleutels(groen)).toStrictEqual([]);
  });

  test('gebouwd-zonder-nummer/AC-24: groen: de spec was op de merge-base al gebouwd (ook met een oude gebouwd-regel)', async () => {
    const basis = { [SPEC]: spec('goedgekeurd'), [TEST]: DEELS, [ROADMAP]: roadmap() };
    expect(specSleutels(await meldingen(basis, { ...basis, [TEST]: VOL }))).toStrictEqual(ROOD);
    for (const status of ['goedgekeurd', 'gebouwd # #5']) {
      const gebouwd = { [SPEC]: spec(status), [TEST]: VOL, [ROADMAP]: roadmap() };
      expect(
        specSleutels(await meldingen(gebouwd, { ...gebouwd, 'docs/x.md': 'wijziging elders\n' })),
        status,
      ).toStrictEqual([]);
    }
  });

  test('gebouwd-zonder-nummer/AC-24: groen: de spec wordt alleen deels gebouwd, of noemt geen roadmap-id', async () => {
    const tweeAcs = { [SPEC]: spec('goedgekeurd'), [ROADMAP]: roadmap() };
    const deels = await meldingen(tweeAcs, { ...tweeAcs, [TEST]: DEELS });
    expect(specSleutels(deels)).toStrictEqual([]);
    // Controle: dezelfde bouw met een roadmap-id is rood.
    const zonderId = spec('goedgekeurd', { verwijzing: 'Geen verwijzing.' });
    const volledig = await meldingen(
      { [SPEC]: zonderId, [ROADMAP]: roadmap() },
      { [SPEC]: zonderId, [TEST]: VOL, [ROADMAP]: roadmap() },
    );
    expect(specSleutels(volledig)).toStrictEqual([]);
    const metId = await meldingen(tweeAcs, { ...tweeAcs, [TEST]: VOL });
    expect(specSleutels(metId)).toStrictEqual(ROOD);
  });

  test('gebouwd-zonder-nummer/AC-24: groen: alleen de statusregel gaat van gebouwd naar goedgekeurd', async () => {
    const basis = { [SPEC]: spec('gebouwd # #5'), [TEST]: VOL, [ROADMAP]: roadmap() };
    const nu = await meldingen(basis, { ...basis, [SPEC]: spec('goedgekeurd') });
    expect(specSleutels(nu)).toStrictEqual([]);
    // Controle: dezelfde regel op een spec die nog niet gebouwd was is rood.
    const nieuw = await meldingen(
      { [SPEC]: spec('goedgekeurd'), [ROADMAP]: roadmap() },
      { ...basis, [SPEC]: spec('goedgekeurd') },
    );
    expect(specSleutels(nieuw)).toStrictEqual(ROOD);
  });

  test('gebouwd-zonder-nummer/AC-24: groen: de spec is alleen hernoemd en was onder haar oude naam al gebouwd (hernoemd)', async () => {
    const nieuw = 'docs/template/specs/b.md';
    const basis = { [SPEC]: spec('goedgekeurd'), [TEST]: VOL, [ROADMAP]: roadmap() };
    const head = { [nieuw]: spec('goedgekeurd'), [TEST]: VOL, [ROADMAP]: roadmap() };
    const metHernoemd = await meldingen(basis, head, { [nieuw]: SPEC });
    expect(specSleutels(metHernoemd)).toStrictEqual([]);
    // Controle: zonder de hernoeming is de spec nieuw en dus rood, onder de nieuwe naam.
    const zonder = await meldingen(basis, head);
    expect(specSleutels(zonder)).toStrictEqual([`spec:roadmap:${nieuw}`]);
  });

  test('gebouwd-zonder-nummer/AC-24: een spec op voorstel of vervallen wordt nooit gebouwd, ook niet met alle tests', async () => {
    const basis = { [SPEC]: spec('voorstel'), [ROADMAP]: roadmap() };
    const gebouwd = await meldingen(
      { [SPEC]: spec('goedgekeurd'), [ROADMAP]: roadmap() },
      { [SPEC]: spec('goedgekeurd'), [TEST]: VOL, [ROADMAP]: roadmap() },
    );
    expect(specSleutels(gebouwd)).toStrictEqual(ROOD);
    for (const status of ['voorstel', 'vervallen'])
      expect(
        specSleutels(await meldingen(basis, { [SPEC]: spec(status), [TEST]: VOL, [ROADMAP]: roadmap() })),
        status,
      ).toStrictEqual([]);
  });

  test('gebouwd-zonder-nummer/AC-24: geen invoer geeft nog de sleutel spec:bewijs', async () => {
    const basis = { [SPEC]: spec('goedgekeurd'), [TEST]: DEELS, [ROADMAP]: roadmap() };
    const invoeren: [Bestanden, Bestanden][] = [
      [basis, { ...basis, [TEST]: VOL }],
      [basis, { ...basis, [SPEC]: spec('gebouwd'), [TEST]: VOL }],
      [basis, { ...basis, [SPEC]: spec('gebouwd # #5; gevalideerd: ' + 'a'.repeat(40)), [TEST]: VOL }],
      [{ [ROADMAP]: roadmap() }, { ...basis, [SPEC]: spec('gebouwd # gebouwd in PR #51') }],
    ];
    let rood = 0;
    for (const [van, naar] of invoeren) {
      const sleutels = (await meldingen(van, naar)).map(({ key }) => key);
      expect(sleutels).not.toContain('spec:bewijs');
      rood += sleutels.filter((key) => key.startsWith('spec:roadmap:')).length;
    }
    expect(rood, 'minstens de eerste invoer is rood op spec:roadmap').toBeGreaterThan(0);
  });
});
