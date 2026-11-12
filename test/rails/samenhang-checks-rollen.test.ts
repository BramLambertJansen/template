import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

// Spec samenhang-checks-rollen (ADR 0068): de docs-kant van AC-3 tot en met AC-6. Structuurtests op R-id's, paden en
// sleutelwoorden, geen hele zinnen (R-TEST-02).
const lees = (pad: string): string => readFileSync(pad, 'utf8');
const regel = (id: string): string =>
  lees('docs/framework.md')
    .split('\n')
    .find((r) => r.startsWith(`- **${id}**`)) ?? '';

// GEWIJZIGD (templateregime AC-13, ADR 0089 punt 5): de describe AC-3 (de diff-guard heet geen grens, 6 tests) is verwijderd;
// de diff-guard bestaat niet meer.
describe('samenhang-checks-rollen/AC-4: regels en developer-instructie zeggen wat het rolhek doet', () => {
  test('samenhang-checks-rollen/AC-4 R-ROL-01 sluit specs en bestaande tests uit voor de developer en noemt R-TEST-02', () => {
    const tekst = regel('R-ROL-01');
    expect(tekst).toMatch(/developer alles behalve gates, specs en bestaande tests/);
    expect(tekst).toContain('R-TEST-02');
    expect(tekst).toContain('0068');
  });

  test('samenhang-checks-rollen/AC-4 developer.md noemt specs, bestaande tests en ADR 0068', () => {
    const tekst = lees('.claude/agents/developer.md');
    expect(tekst).toContain('Specs en bestaande tests wijzig je niet');
    expect(tekst).toContain('ADR 0068');
  });
});

describe('samenhang-checks-rollen/AC-5: new-resource noemt R-WERK-08', () => {
  test('samenhang-checks-rollen/AC-5 beide meldingen noemen R-WERK-08, geen van beide laat de eigenaar de status zetten', () => {
    const bron = lees('scripts/kit/new-resource.mjs');
    expect(bron.match(/\(R-WERK-08\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(bron).not.toMatch(/de eigenaar (hem op goedgekeurd zet|zet hem op goedgekeurd)/);
  });
});

describe('samenhang-checks-rollen/AC-6: wat als onafhankelijke review telt', () => {
  test('samenhang-checks-rollen/AC-6 R-ROL-05 noemt de verse reviewer-subagent, kritiek werk en 0068', () => {
    const tekst = regel('R-ROL-05');
    expect(tekst).toContain('verse reviewer-subagent');
    expect(tekst).toContain('kritiek werk');
    expect(tekst).toContain('claim geen afgedwongen onafhankelijkheid');
    expect(tekst).toContain('zelfreview');
    expect(tekst).toContain('0068');
  });
});
