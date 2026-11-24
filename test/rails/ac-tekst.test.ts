import { describe, expect, test } from 'vitest';
import { acItem, acTekstViolations, VRIJSTELLING } from '../../scripts/kit/ac-tekst.mjs';

// Leerpunt #940, check-docs regel 20: een nieuwe GEWIJZIGD-regel voor een AC in een testbestand, terwijl het lijstitem van
// dat AC in de spec gelijk is aan dat op de basis (origin/main), is een overtreding. De bomen staan in het geheugen; de
// koppeling aan de merge-base zit in `docsKrimp` (scripts/kit/check-docs.mjs) en is dezelfde als voor regel 6.
type Boom = { bestanden: string[]; lees: (pad: string) => string | null };

const boom = (bestanden: Record<string, string>): Boom => ({
  bestanden: Object.keys(bestanden),
  lees: (pad) => bestanden[pad] ?? null,
});

const SPEC = 'docs/template/specs/x.md';
const TEST = 'test/x.test.ts';

const spec = (ac1: string) =>
  [
    '---',
    'status: goedgekeurd',
    'namespace: xn',
    '---',
    '',
    '## Acceptatiecriteria',
    '',
    `- **xn/AC-1** — ${ac1}`,
    '  met een vervolgregel.',
    '- **xn/AC-2** — Iets anders.',
    '',
  ].join('\n');

const testTekst = (...regels: string[]) => [...regels, "test('xn/AC-1: doet iets', () => {});", ''].join('\n');

const basis = boom({ [SPEC]: spec('Alleen aanmaken.'), [TEST]: testTekst() });
const sleutels = (nu: Boom, hernoemd: Record<string, string> = {}) =>
  acTekstViolations({ basis, nu, hernoemd }).map((violation) => violation.key);

describe('check-docs regel 20: AC-tekst na een testwijziging (leerpunt #940)', () => {
  test('nieuwe GEWIJZIGD-regel voor een AC met ongewijzigde AC-tekst is een overtreding', () => {
    const nu = boom({ [SPEC]: spec('Alleen aanmaken.'), [TEST]: testTekst('// GEWIJZIGD (xn/AC-1): ook bijwerken.') });
    expect(sleutels(nu)).toEqual(['docs:ac-tekst:x:AC-1']);
  });

  test('bijgewerkte AC-tekst in dezelfde wijziging: groen', () => {
    const nu = boom({
      [SPEC]: spec('Aanmaken en bijwerken.'),
      [TEST]: testTekst('// GEWIJZIGD (xn/AC-1): ook bijwerken.'),
    });
    expect(sleutels(nu)).toEqual([]);
  });

  test(`"${VRIJSTELLING}" in het commentaar, ook op een vervolgregel: groen`, () => {
    const opRegel = testTekst(`// GEWIJZIGD (xn/AC-1): alleen de testnaam; ${VRIJSTELLING}.`);
    const opVervolg = testTekst('// GEWIJZIGD (xn/AC-1): alleen de testnaam', `// ${VRIJSTELLING}.`);
    expect(sleutels(boom({ [SPEC]: spec('Alleen aanmaken.'), [TEST]: opRegel }))).toEqual([]);
    expect(sleutels(boom({ [SPEC]: spec('Alleen aanmaken.'), [TEST]: opVervolg }))).toEqual([]);
  });

  test('een GEWIJZIGD-regel die al op de basis stond, ook in een verhuisd testbestand: groen', () => {
    const regel = '// GEWIJZIGD (xn/AC-1): ook bijwerken.';
    const oud = boom({ [SPEC]: spec('Alleen aanmaken.'), [TEST]: testTekst(regel) });
    const nu = boom({ [SPEC]: spec('Alleen aanmaken.'), 'test/y.test.ts': testTekst(regel) });
    expect(acTekstViolations({ basis: oud, nu, hernoemd: {} })).toEqual([]);
  });

  test('een GEWIJZIGD-regel zonder AC-id met voorvoegsel, of voor een onbekende spec: groen', () => {
    const zonderId = testTekst('// GEWIJZIGD (spec x, PR-3): AC-1 kreeg een testnaam.');
    const onbekend = testTekst('// GEWIJZIGD (ander/AC-1): iets.');
    expect(sleutels(boom({ [SPEC]: spec('Alleen aanmaken.'), [TEST]: zonderId }))).toEqual([]);
    expect(sleutels(boom({ [SPEC]: spec('Alleen aanmaken.'), [TEST]: onbekend }))).toEqual([]);
  });

  test('een spec of AC die op de basis niet bestond: groen', () => {
    const regel = testTekst('// GEWIJZIGD (xn/AC-1): ook bijwerken.');
    const nieuweSpec = acTekstViolations({
      basis: boom({ [TEST]: testTekst() }),
      nu: boom({ [SPEC]: spec('Alleen aanmaken.'), [TEST]: regel }),
      hernoemd: {},
    });
    expect(nieuweSpec).toEqual([]);
  });

  test('een AC dat op de basis nog niet gebouwd was (de bouw-PR noemt het als reden): groen', () => {
    const ongebouwd = boom({ [SPEC]: spec('Alleen aanmaken.'), [TEST]: "test('iets', () => {});\n" });
    const nu = boom({
      [SPEC]: spec('Alleen aanmaken.'),
      [TEST]: testTekst('// GEWIJZIGD (xn/AC-1): nu volgens de spec.'),
    });
    expect(acTekstViolations({ basis: ongebouwd, nu, hernoemd: {} })).toEqual([]);
  });

  test('CRLF-regeleinden en een pgTAP-commentaar met de vrijstelling op de vervolgregel', () => {
    const crlf = testTekst('// GEWIJZIGD (xn/AC-1): ook bijwerken.').replaceAll('\n', '\r\n');
    expect(sleutels(boom({ [SPEC]: spec('Alleen aanmaken.'), [TEST]: crlf }))).toEqual(['docs:ac-tekst:x:AC-1']);
    const pgtap = testTekst('-- GEWIJZIGD (xn/AC-1): alleen de opzet', `-- ${VRIJSTELLING}.`);
    expect(sleutels(boom({ [SPEC]: spec('Alleen aanmaken.'), [TEST]: pgtap }))).toEqual([]);
  });

  test('de regel noemt de specnaam terwijl het lijstitem onder de namespace staat: toch een overtreding', () => {
    const nu = boom({ [SPEC]: spec('Alleen aanmaken.'), [TEST]: testTekst('// GEWIJZIGD (x/AC-1): ook bijwerken.') });
    expect(sleutels(nu)).toEqual(['docs:ac-tekst:x:AC-1']);
  });

  test('een hernoemde spec vergelijkt met haar oude pad; de sleutel draagt de nieuwe naam', () => {
    const nieuw = 'docs/template/specs/y.md';
    const nu = boom({ [nieuw]: spec('Alleen aanmaken.'), [TEST]: testTekst('// GEWIJZIGD (xn/AC-1): ook bijwerken.') });
    expect(sleutels(nu, { [nieuw]: SPEC })).toEqual(['docs:ac-tekst:y:AC-1']);
  });

  test('acItem neemt de ingesprongen vervolgregels mee en stopt bij het volgende lijstitem', () => {
    expect(acItem(spec('Alleen aanmaken.'), 'xn/AC-1')).toBe(
      '- **xn/AC-1** — Alleen aanmaken.\n  met een vervolgregel.',
    );
    expect(acItem(spec('Alleen aanmaken.'), 'xn/AC-9')).toBeNull();
  });
});
