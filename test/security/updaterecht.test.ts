import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { z } from 'zod';

// suitecontract/AC-9 (docs/template/specs/suite-volgt-contract.md, ontwerp 4): het lezen van het catalogusantwoord over
// UPDATE-recht is een losse, geëxporteerde functie `updaterechtUit(tabel, poging)` in test/security/controles.ts. Fail-closed: een
// fout, een lege rij, null of een antwoord dat geen boolean is geeft `onbekend` met het probleem
// `<tabel>: updaterecht niet vast te stellen: <reden>`, nooit `geen-recht`.
//
// Verwachte vorm (de spec noemt de vorm van het resultaat niet; deze test legt hem vast, de developer volgt):
//   updaterechtUit(tabel: string, poging: Poging):
//     | { uitkomst: 'recht' } | { uitkomst: 'geen-recht' } | { uitkomst: 'onbekend'; probleem: string }
// `poging` is de bestaande (niet-geëxporteerde) interface Poging uit controles.ts: { rijen, aantal, pg, bericht }, en het
// catalogusantwoord is een rij met de boolean in de kolom `ok` (zoals de bestaande `has_column_privilege(...) as ok`).
//
// Unittest zonder database: controles.ts leest APP_ORIGIN via fixtures.ts bij het laden, dus eerst stubben en dan dynamisch
// importeren. De functie wordt via een schema gelezen, zodat dit bestand compileert voordat hij bestaat en dan op een assertie faalt.
interface Poging {
  readonly rijen: Record<string, unknown>[];
  readonly aantal: number;
  readonly pg: string | undefined;
  readonly bericht: string | undefined;
}

const uitkomstSchema = z.union([
  z.object({ uitkomst: z.literal('recht') }).strict(),
  z.object({ uitkomst: z.literal('geen-recht') }).strict(),
  z.object({ uitkomst: z.literal('onbekend'), probleem: z.string() }).strict(),
]);
type Uitkomst = z.infer<typeof uitkomstSchema>;
type UpdaterechtUit = (tabel: string, poging: Poging) => unknown;

const controlesModule = z.object({
  updaterechtUit: z.custom<UpdaterechtUit>((waarde) => typeof waarde === 'function'),
});
let functie: UpdaterechtUit | undefined;
beforeAll(async () => {
  vi.stubEnv('APP_ORIGIN', 'http://localhost:5173');
  const gelezen = controlesModule.safeParse(await import('./controles.ts'));
  functie = gelezen.success ? gelezen.data.updaterechtUit : undefined;
});
afterAll(() => {
  vi.unstubAllEnvs();
});

const TABEL = 'public.facturen';
const VOORVOEGSEL = `${TABEL}: updaterecht niet vast te stellen: `;

// De uitkomst; een ontbrekende export of een andere vorm is een gefaalde assertie, geen importfout.
function lees(poging: Poging): Uitkomst | undefined {
  expect(typeof functie, 'test/security/controles.ts exporteert updaterechtUit(tabel, poging)').toBe('function');
  const ruw = functie?.(TABEL, poging);
  const gelezen = uitkomstSchema.safeParse(ruw);
  expect(gelezen.success, `updaterechtUit gaf een onverwachte vorm: ${JSON.stringify(ruw)}`).toBe(true);
  return gelezen.data;
}

const antwoord = (rij: Record<string, unknown>): Poging => ({
  rijen: [rij],
  aantal: 1,
  pg: undefined,
  bericht: undefined,
});

// De reden na het voorvoegsel; leeg als het probleem niet de vorm van de spec heeft.
function reden(uitkomst: Uitkomst | undefined): string {
  if (uitkomst?.uitkomst !== 'onbekend' || !uitkomst.probleem.startsWith(VOORVOEGSEL)) return '';
  return uitkomst.probleem.slice(VOORVOEGSEL.length);
}

describe('suitecontract/AC-9: updaterechtUit leest een geldig catalogusantwoord', () => {
  test('suitecontract/AC-9: true geeft recht', () => {
    expect(lees(antwoord({ ok: true }))).toStrictEqual({ uitkomst: 'recht' });
  });

  test('suitecontract/AC-9: false geeft geen-recht', () => {
    expect(lees(antwoord({ ok: false }))).toStrictEqual({ uitkomst: 'geen-recht' });
  });
});

describe('suitecontract/AC-9: updaterechtUit is fail-closed (onbekend, nooit geen-recht)', () => {
  test('suitecontract/AC-9: een fout van de catalogusvraag geeft onbekend met het probleem en de reden van de fout', () => {
    const uitkomst = lees({
      rijen: [],
      aantal: 0,
      pg: '42501',
      bericht: 'permission denied for function has_any_column_privilege',
    });

    expect(uitkomst?.uitkomst).toBe('onbekend');
    expect(reden(uitkomst)).toContain('permission denied for function has_any_column_privilege');
  });

  test('suitecontract/AC-9: een fout zonder SQLSTATE (alleen een bericht) geeft onbekend', () => {
    const uitkomst = lees({ rijen: [], aantal: 0, pg: undefined, bericht: 'connection terminated' });

    expect(uitkomst?.uitkomst).toBe('onbekend');
    expect(reden(uitkomst)).toContain('connection terminated');
  });

  test('suitecontract/AC-9: een fout wint van een rij met true (de rij zegt dan niets)', () => {
    const uitkomst = lees({ rijen: [{ ok: true }], aantal: 1, pg: '42P01', bericht: 'relation does not exist' });

    expect(uitkomst?.uitkomst).toBe('onbekend');
  });

  test('suitecontract/AC-9: geen rij geeft onbekend met een niet-lege reden', () => {
    const uitkomst = lees({ rijen: [], aantal: 0, pg: undefined, bericht: undefined });

    expect(uitkomst?.uitkomst).toBe('onbekend');
    expect(reden(uitkomst).trim()).not.toBe('');
  });

  test('suitecontract/AC-9: een rij met null (onbekende tabel) geeft onbekend met een niet-lege reden', () => {
    const uitkomst = lees(antwoord({ ok: null }));

    expect(uitkomst?.uitkomst).toBe('onbekend');
    expect(reden(uitkomst).trim()).not.toBe('');
  });

  test.each([
    ['de tekst "true"', { ok: 'true' }],
    ['de tekst "t" (de ruwe pg-tekst)', { ok: 't' }],
    ['het getal 1', { ok: 1 }],
    ['het getal 0', { ok: 0 }],
    ['een rij zonder de kolom', { anders: true }],
    ['een lege rij', {}],
    ['undefined', { ok: undefined }],
    ['een object', { ok: { waarde: true } }],
  ])('suitecontract/AC-9: een antwoord dat geen boolean is (%s) geeft onbekend met een niet-lege reden', (_, rij) => {
    const uitkomst = lees(antwoord(rij));

    expect(uitkomst?.uitkomst).toBe('onbekend');
    expect(reden(uitkomst).trim()).not.toBe('');
  });

  test('suitecontract/AC-9: het probleem begint met de tabelnaam en heeft precies de vorm "<tabel>: updaterecht niet vast te stellen: <reden>"', () => {
    const uitkomst = lees(antwoord({ ok: null }));

    expect(uitkomst?.uitkomst).toBe('onbekend');
    expect(uitkomst?.uitkomst === 'onbekend' ? uitkomst.probleem.startsWith(VOORVOEGSEL) : undefined).toBe(true);
  });
});
