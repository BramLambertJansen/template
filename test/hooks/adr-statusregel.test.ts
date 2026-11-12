import { afterEach, describe, expect, test } from 'vitest';
import { opruimen, roep } from './follow-up-kit';

// ADR 0045 punt 22 (strikte statusregel voor ADR's), tests vóór de bouw.
//
// Verwachte pure functie in rails/hooks/lib/document-state.mjs:
//   statusregelOvertreding(nieuweRegel: string, oudeRegel: string | null, bestaandeAdrBestanden: readonly string[]): string | null
// `nieuweRegel` en `oudeRegel` zijn de volledige regels (`Status: ...`); `oudeRegel` is null bij een nieuw ADR-bestand.
// Resultaat: null = geen overtreding, anders de melding (niet-lege tekst). Een regel gelijk aan `oudeRegel` wordt niet getoetst.
// Een regel die niet met `Status:` begint (spec-frontmatter, `status: gebouwd # #<PR>; gevalideerd: <sha>`) valt erbuiten.
// Toegestaan achter de statuswaarde: `(JJJJ-MM-DD)` met een bestaande kalenderdatum, `#<nr>` en `[NNNN](NNNN-<slug>.md)` (alleen
// het nummer als linktekst, de bestandsnaam moet in `bestaandeAdrBestanden` staan), gescheiden door `, ` of ` — `.
afterEach(opruimen);

const MODULE = ['../../rails/hooks/lib', 'document-state.mjs'].join('/');
const BESTAAND = ['0001-voorbeeld.md', '0017-diff-guard.md'];

async function overtreding(nieuw: string, oud: string | null = null): Promise<unknown> {
  return roep(MODULE, 'statusregelOvertreding', nieuw, oud, BESTAAND);
}

describe('statusregelOvertreding: toegestane regels', () => {
  test.each([
    ['alleen een datum', 'Status: geaccepteerd (2026-10-14)'],
    ['alleen de statuswaarde', 'Status: geaccepteerd'],
    ['datum, PR en ADR-link met komma', 'Status: geaccepteerd (2026-10-14), #153, [0017](0017-diff-guard.md)'],
    ['datum, PR en ADR-link met streepje', 'Status: geaccepteerd (2026-10-14) — #153 — [0017](0017-diff-guard.md)'],
    ['alleen een ADR-link', 'Status: geaccepteerd — [0001](0001-voorbeeld.md)'],
    ['vervangen door', 'Status: vervangen door 0017 (2026-10-14)'],
    ['schrikkeldag', 'Status: geaccepteerd (2028-02-29)'],
  ])('%s: geen overtreding', async (_naam, regel) => {
    expect(await overtreding(regel)).toBeNull();
  });
});

describe('statusregelOvertreding: overtredingen in een nieuwe of gewijzigde regel', () => {
  test.each([
    ['link naar een niet-bestaand ADR', 'Status: geaccepteerd (2026-10-14), [0099](0099-bestaat-niet.md)'],
    ['vrije tekst achter de statuswaarde', 'Status: geaccepteerd (2026-10-14) — herzien na review van de eigenaar'],
    ['vrije tekst zonder datum', 'Status: geaccepteerd — zomaar tekst'],
    ['link met begeleidende woorden', 'Status: geaccepteerd (2026-10-14), zie [0017](0017-diff-guard.md)'],
    ['link met een andere tekst dan het nummer', 'Status: geaccepteerd (2026-10-14), [diff-guard](0017-diff-guard.md)'],
    ['datum in een verkeerde vorm', 'Status: geaccepteerd (14-10-2026)'],
    ['PR zonder nummer', 'Status: geaccepteerd (2026-10-14), #'],
    [
      'link naar een bestaand nummer met een verkeerde bestandsnaam',
      'Status: geaccepteerd, [0001](0001-bestaat-niet.md)',
    ],
    ['maand die niet bestaat', 'Status: geaccepteerd (2026-13-14)'],
    ['dag die niet bestaat', 'Status: geaccepteerd (2026-02-30)'],
    ['komma direct na de statuswaarde', 'Status: geaccepteerd, #153'],
    ['spatie aan het eind', 'Status: geaccepteerd (2026-10-14) '],
    ['dubbele spatie na de komma', 'Status: geaccepteerd (2026-10-14),  #153'],
    ['tab als scheiding', 'Status: geaccepteerd\t(2026-10-14)'],
    ['dubbel streepje', 'Status: geaccepteerd — — #153'],
  ])('%s: overtreding', async (_naam, regel) => {
    const resultaat = await overtreding(regel, 'Status: voorgesteld');
    expect(typeof resultaat).toBe('string');
    expect(resultaat).toContain('mag niet achter de statuswaarde');
  });

  test('een nieuw ADR-bestand (geen oude regel) wordt ook getoetst', async () => {
    const resultaat = await overtreding('Status: voorgesteld — nog bespreken met de eigenaar', null);
    expect(typeof resultaat).toBe('string');
    expect(resultaat).not.toBe('');
  });
});

describe('statusregelOvertreding: ongewijzigd en buiten de regel', () => {
  test('vrije tekst in een ongewijzigde regel (gelijk aan main): geen overtreding', async () => {
    const regel = 'Status: geaccepteerd — herkomsttekst uit een eerdere correctie';
    expect(await overtreding(regel, regel)).toBeNull();
  });

  test('vrije tekst die afwijkt van de oude regel blijft een overtreding', async () => {
    const oud = 'Status: geaccepteerd — herkomsttekst';
    const resultaat = await overtreding('Status: geaccepteerd — herkomsttekst, uitgebreid', oud);
    expect(typeof resultaat).toBe('string');
  });

  test('de melding noemt het afgewezen deel, ook zonder geldige scheiding', async () => {
    expect(await overtreding('Status: geaccepteerd, #153', 'Status: voorgesteld')).toContain(', #153');
  });

  test('spec met #-commentaar (builtReference) valt buiten de regel', async () => {
    const regel = `status: gebouwd # #153; gevalideerd: ${'a'.repeat(40)}`;
    expect(await overtreding(regel, 'status: goedgekeurd')).toBeNull();
  });
});
