import { describe, expect, test } from 'vitest';
import { A4_MELDING, beslisOvergang } from '../../rails/hooks/lib/document-state.mjs';

// ADR 0097: de herzieningsregel is `Herzien: JJJJ-MM-DD: wat`; een PR-nummer `(#NNN)` mag nog en moet dan ≥ 1 zijn.
const ADR = 'docs/adr/0099-demo.md';
const MET_NUMMER = 'Herzien: 2026-10-22 (#262): tekst aangepast.';

const adr = (besluit = 'Iets.', extra: string[] = []): string =>
  `# 0099 — Demo\n\nStatus: geaccepteerd\n\n## Besluit\n\n${besluit}\n${extra.map((regel) => `\n${regel}\n`).join('')}`;

function uitkomst(voor: string, na: string): { uitslag: string; nieuw: boolean } {
  const { uitslag, nieuw } = beslisOvergang(ADR, voor, na);
  return { uitslag, nieuw };
}

describe('ADR 0097: herzieningsregel zonder PR-nummer', () => {
  test('geen PR-nummer, bestaande datum en omschrijving: herzien', () => {
    const na = adr('Iets anders.', ['Herzien: 2026-11-18: gewijzigd door 0097 punt 1.']);
    expect(uitkomst(adr(), na)).toStrictEqual({ uitslag: 'herzien', nieuw: false });
  });

  test('een regel zonder nummer erbij naast een bestaande regel met nummer: herzien', () => {
    const na = adr('Iets anders.', [MET_NUMMER, 'Herzien: 2026-11-18: tweede herziening.']);
    expect(uitkomst(adr('Iets.', [MET_NUMMER]), na).uitslag).toBe('herzien');
  });

  test('een PR-nummer mag nog: herzien', () => {
    expect(uitkomst(adr(), adr('Iets anders.', [MET_NUMMER])).uitslag).toBe('herzien');
  });

  test.each([
    ['PR-nummer 0', 'Herzien: 2026-11-18 (#0): tekst.'],
    ['zonder nummer, lege omschrijving', 'Herzien: 2026-11-18: '],
    ['zonder nummer, omschrijving ontbreekt', 'Herzien: 2026-11-18:'],
    ['zonder nummer, onbestaande datum', 'Herzien: 2026-02-30: tekst.'],
    ['zonder nummer, lege haakjes', 'Herzien: 2026-11-18 (): tekst.'],
    ['zonder nummer, geen spatie na de dubbele punt', 'Herzien: 2026-11-18:tekst.'],
  ])('%s: a4', (_naam, regel) => {
    expect(uitkomst(adr(), adr('Iets anders.', [regel])).uitslag).toBe('a4');
  });

  test('de melding noemt de vorm zonder PR-nummer', () => {
    expect(A4_MELDING).toContain('`Herzien: JJJJ-MM-DD: wat`');
  });
});
