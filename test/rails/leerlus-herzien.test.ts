import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

// Spec leerlus-herzien AC-6 (ADR 0081): het signaal en de vorm in de skill en het PR-sjabloon.
// Op structuur (R-TEST-02): plek, koppen en hun volgorde en de regelvorm die scripts/kit/leerpunt.mjs leest; geen hele zinnen.
const PLEK = 'Schrappen of vereenvoudigen';
const skill = readFileSync('.claude/skills/opleveren/SKILL.md', 'utf8');
const prSjabloon = readFileSync('.github/pull_request_template.md', 'utf8');

/** Stap 8 van `opleveren` tot de volgende genummerde stap of kop. */
function stap8(tekst: string): string {
  const start = tekst.search(/^8\. Leerpunt/m);
  if (start === -1) return '';
  const rest = tekst.slice(start);
  const einde = rest.slice(1).search(/^(\d+\.|#+) /m);
  return einde === -1 ? rest : rest.slice(0, einde + 1);
}

describe('leerlus-herzien/AC-6 signaal en vorm', () => {
  const stap = stap8(skill);

  test('leerlus-herzien/AC-6: stap 8 noemt ADR 0081, de plek en de drie delen van de onderbouwing', () => {
    expect(stap).not.toBe('');
    expect(stap).toContain('ADR 0081');
    expect(stap).toContain(PLEK);
    for (const deel of ['Meting:', 'Overname:', 'Terugval:']) expect(stap).toContain(deel);
  });

  test('leerlus-herzien/AC-6: in het CLI-blok volgt ### Onderbouwing direct op ### Voorstel voor de plek', () => {
    const koppen = [...stap.matchAll(/^\s*### (.+?)\s*$/gm)].map((m) => m[1] ?? '');
    const plek = koppen.indexOf('Voorstel voor de plek');
    expect(plek).toBeGreaterThanOrEqual(0);
    expect(koppen[plek + 1]).toBe('Onderbouwing');
    const regelNaPlek =
      stap.split('\n')[stap.split('\n').findIndex((r) => r.trim() === '### Voorstel voor de plek') + 1];
    expect(regelNaPlek).toContain(PLEK);
  });

  test('leerlus-herzien/AC-6: de regelvorm bewijs meting: staat in stap 8 en in het PR-sjabloon', () => {
    const regelvorm = `trede ${PLEK}; bewijs meting: <voor> → <na> (<bron>)`;
    expect(stap).toContain(`bewijs meting: <voor> → <na> (<bron>)`);
    expect(prSjabloon).toContain(`- #<nr>: ${regelvorm}`);
    expect(prSjabloon).toContain(
      '- #<nr>: trede <Type|Check|Gouden pad of generator|Skill|Padregel|AGENTS.md>; bewijs <testpad>',
    );
  });
});
