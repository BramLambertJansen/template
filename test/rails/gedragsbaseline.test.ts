import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { expectAbsent } from '../support/absence';

// Spec gedragsbaseline AC-7 (ADR 0107): de regelvormen, het scenarioblok en het recept staan in het PR-sjabloon, stap 8 van
// `opleveren`, `docs/operations/gedragsbaseline.md` en R-WERK-13. Op structuur (R-TEST-02), geen hele zinnen.
const lees = (pad: string) => (existsSync(pad) ? readFileSync(pad, 'utf8') : '');
const skill = lees('.claude/skills/opleveren/SKILL.md');
const prSjabloon = lees('.github/pull_request_template.md');
const recept = lees('docs/operations/gedragsbaseline.md');
const framework = lees('docs/framework.md');

/** Stap 8 van `opleveren` tot de volgende genummerde stap of kop. */
function stap8(tekst: string): string {
  const start = tekst.search(/^8\. Leerpunt/m);
  if (start === -1) return '';
  const rest = tekst.slice(start);
  const einde = rest.slice(1).search(/^(\d+\.|#+) /m);
  return einde === -1 ? rest : rest.slice(0, einde + 1);
}

const stap = stap8(skill);
const REGEL_BASELINE = '- #<nr>: trede <Skill|Padregel|AGENTS.md>; bewijs baseline: zonder <a>/3, met 3/3 (<model>)';
const REGEL_GEEN = '- #<nr>: trede <Skill|Padregel|AGENTS.md>; bewijs geen baseline: <reden>';
const KOP_SCENARIO = '### Scenario #<nr>';
// Een teksttrede, hooguit 80 tekens zonder backtick, dan `bewijs geen test`: de oude zin uit sjabloon en skill.
const GEEN_TEST_BIJ_TEKST = /(?:Skill|Padregel|AGENTS\.md)[^`]{0,80}`?bewijs geen test/;
const TEKSTEN: [string, string][] = [
  ['PR-sjabloon', prSjabloon],
  ['stap 8 van opleveren', stap],
];

describe('gedragsbaseline/AC-7 regelvormen en scenarioblok in sjabloon en skill', () => {
  test.each(TEKSTEN)('gedragsbaseline/AC-7: %s noemt beide regelvormen en de scenariokop', (...[, tekst]) => {
    expect(tekst).not.toBe('');
    expect(tekst).toContain(REGEL_BASELINE);
    expect(tekst).toContain(REGEL_GEEN);
    expect(tekst).toContain(KOP_SCENARIO);
  });

  test('gedragsbaseline/AC-7: stap 8 verwijst naar het recept', () => {
    expect(stap).toContain('docs/operations/gedragsbaseline.md');
  });

  test.each(TEKSTEN)(
    'gedragsbaseline/AC-7: %s heeft geen "geen test" meer bij Skill, Padregel of AGENTS.md',
    (...[, tekst]) => {
      expect(tekst).not.toBe('');
      expectAbsent(tekst, GEEN_TEST_BIJ_TEKST, {
        recognizes: [
          'Bij Skill, Padregel, AGENTS.md of een integratie- of e2e-test (noem die in de reden):\n`bewijs geen test: <reden>`',
          'Alleen bij Skill, Padregel, AGENTS.md of een integratie- of e2e-test: `bewijs geen test: <reden>`',
        ],
        allows: [
          'Bij een integratie- of e2e-test (noem die in de reden): `bewijs geen test: <reden>`',
          'Skill, Padregel of AGENTS.md: `bewijs baseline: zonder 1/3, met 3/3 (opus)`; integratie: `bewijs geen test: x`',
        ],
      });
    },
  );

  test('gedragsbaseline/AC-7: de regel met bewijs <testpad> noemt alleen Type, Check en Gouden pad of generator', () => {
    const regels = (tekst: string) => tekst.split('\n').filter((regel) => regel.includes('bewijs <testpad>'));
    const treden = (tekst: string) => regels(tekst).flatMap((regel) => /trede (<[^>]+>)/.exec(regel)?.[1] ?? []);
    expect(treden(prSjabloon)).toEqual(['<Type|Check|Gouden pad of generator>']);
    for (const trede of treden(stap)) expect(trede).toBe('<Type|Check|Gouden pad of generator>');
  });
});

describe('gedragsbaseline/AC-7 recept en regelboek', () => {
  test('gedragsbaseline/AC-7: het recept bevat de opdrachttekst met <<< en >>>', () => {
    expect(recept).not.toBe('');
    const regels = recept.split('\n').map((regel) => regel.trim());
    const open = regels.indexOf('<<<');
    const dicht = regels.indexOf('>>>');
    expect(open).toBeGreaterThanOrEqual(0);
    expect(dicht).toBeGreaterThan(open);
    expect(recept).toContain('gedragsbaseline (ADR 0107)');
    expect(recept).toContain('Opdracht: <Prompt uit het scenario>');
  });

  test('gedragsbaseline/AC-7: R-WERK-13 noemt baseline: en 0107', () => {
    const regel = framework.split('\n').find((r) => r.startsWith('- **R-WERK-13**')) ?? '';
    expect(regel).not.toBe('');
    expect(regel).toContain('baseline:');
    expect(regel).toContain('0107');
  });
});
