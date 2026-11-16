import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

// Spec samenhang-checks-rollen (ADR 0068): de meldingen van de generator noemen R-WERK-08.
// GEWIJZIGD (refactorplan stap 3b, R-TEST-02): de tests die alleen een formulering in docs/framework.md of
// .claude/agents/developer.md pinden zijn weg; het gedrag van het rolhek staat in test/hooks/rolhek-developer.test.ts.
describe('samenhang-checks-rollen/AC-5: new-resource noemt R-WERK-08', () => {
  test('samenhang-checks-rollen/AC-5 beide meldingen noemen R-WERK-08, geen van beide laat de eigenaar de status zetten', () => {
    const bron = readFileSync('scripts/kit/new-resource.mjs', 'utf8');
    expect(bron.match(/\(R-WERK-08\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(bron).not.toMatch(/de eigenaar (hem op goedgekeurd zet|zet hem op goedgekeurd)/);
  });
});
