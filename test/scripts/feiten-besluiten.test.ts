import { describe, expect, test } from 'vitest';
import { besluitenIn, besluitenSectie, specBestanden } from '../../scripts/kit/besluiten.mjs';
import { VOLGORDE, werkmap } from '../../scripts/kit/feiten-secties.mjs';

// Spec nachtrun AC-4 en AC-5 (ADR 0115 punt 7): voorlopige en geparkeerde open vragen als feitensectie `besluiten`.
const SPEC = [
  '# X',
  '',
  '## Open vragen',
  '',
  '- **OV-1 ✅ besloten** — al beslist (eigenaar, 2026-11-01)',
  '- **OV-2 ⏳ voorlopig** — welke kolom? gekozen: `naam` (agent, 2026-11-27)',
  '  vervolgregel telt niet mee',
  '- **OV-3 ⏸ geparkeerd** — nieuwe dependency nodig; wacht op de eigenaar (2026-11-27)',
  '- OV-4 ⏳ voorlopig — zonder vette markering telt niet',
  '`- **OV-5 ⏳ voorlopig** — in een codespan telt niet`',
].join('\n');

describe('nachtrun/AC-4: besluitenIn', () => {
  test('nachtrun/AC-4: alleen ⏳ voorlopig en ⏸ geparkeerd in de vaste vorm, met regelnummer', () => {
    expect(besluitenIn({ pad: 'docs/template/specs/x.md', tekst: SPEC })).toStrictEqual([
      {
        spec: 'docs/template/specs/x.md',
        id: 'OV-2',
        soort: 'voorlopig',
        tekst: 'welke kolom? gekozen: `naam` (agent, 2026-11-27)',
        regel: 6,
      },
      {
        spec: 'docs/template/specs/x.md',
        id: 'OV-3',
        soort: 'geparkeerd',
        tekst: 'nieuwe dependency nodig; wacht op de eigenaar (2026-11-27)',
        regel: 8,
      },
    ]);
  });

  test('nachtrun/AC-4: een gewoon streepje of en-dash na de markering telt ook', () => {
    expect(besluitenIn({ pad: 'a.md', tekst: '- **OV-9 ⏳ voorlopig** - kort' })).toHaveLength(1);
    expect(besluitenIn({ pad: 'a.md', tekst: '- **OV-9 ⏸ geparkeerd** – kort' })).toHaveLength(1);
  });
});

describe('nachtrun/AC-5: besluitenSectie', () => {
  test('nachtrun/AC-5: geparkeerd eerst, dan voorlopig, met telling in de kop', () => {
    const sectie = besluitenSectie([
      { pad: 'a.md', tekst: '- **OV-1 ⏳ voorlopig** — eerst in het bestand' },
      { pad: 'b.md', tekst: SPEC },
    ]);
    expect(sectie.kop).toBe('1 geparkeerd, 2 voorlopig; herzien: zet de markering op ✅ besloten');
    expect(sectie.inhoud).toStrictEqual([
      'geparkeerd b.md:8 OV-3 — nieuwe dependency nodig; wacht op de eigenaar (2026-11-27)',
      'voorlopig a.md:1 OV-1 — eerst in het bestand',
      'voorlopig b.md:6 OV-2 — welke kolom? gekozen: `naam` (agent, 2026-11-27)',
    ]);
  });

  test('nachtrun/AC-5: zonder treffers één regel', () => {
    expect(besluitenSectie([{ pad: 'a.md', tekst: '# leeg' }]).inhoud).toStrictEqual([
      'geen voorlopige of geparkeerde besluiten',
    ]);
  });

  test('nachtrun/AC-5: besluiten staat in VOLGORDE, als laatste', () => {
    expect(VOLGORDE.at(-1)).toBe('besluiten');
  });
});

describe('nachtrun/AC-5: specBestanden', () => {
  test('nachtrun/AC-5: beide specmappen, zonder _*.md en andere bestanden, ontbrekende map geeft niets', () => {
    const mappen: Record<string, string[]> = { 'docs/template/specs': ['a.md', '_template.md', 'b.txt'] };
    const lezer = {
      lijst: (map: string) => mappen[map] ?? [],
      lees: (pad: string) => (pad.endsWith('a.md') ? 'tekst' : null),
    };
    expect(specBestanden(lezer)).toStrictEqual([{ pad: 'docs/template/specs/a.md', tekst: 'tekst' }]);
  });

  test('nachtrun/AC-5: op de repo zelf vindt de sectie de voorlopige keuzes van deze spec', () => {
    const ids = besluitenSectie(specBestanden(werkmap))
      .json.filter((besluit) => besluit.spec === 'docs/template/specs/nachtrun.md')
      .map((besluit) => besluit.id);
    expect(ids).toStrictEqual(['OV-10', 'OV-5', 'OV-6', 'OV-7', 'OV-8', 'OV-9']);
  });
});
