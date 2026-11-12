import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { globMatch, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';
import { OUD, REPO, object, voorbeeldPad } from './padtabel-kit';

// padtabel/AC-2 (ADR 0079 punt 5 en 9): niets wordt losser dan op 30cc352. Blijvende vloer: per getrackt pad en per
// voorbeeldpad van elke glob uit de bevroren lijsten en uit de huidige `.claude/gates.json` is het nieuwe niveau gelijk of
// strenger. De "oude" kant is hier bevroren berekend uit de fixture (test/rails/fixtures/padtabel), los van de code, zodat een
// latere wijziging van lezer of tabel die één pad losser maakt rood is.

const TEKST = readFileSync(path.join(REPO, '.claude/gates.json'), 'utf8');
const RUW = object(JSON.parse(TEKST));

const past = (globs: readonly string[], pad: string) => globs.some((glob) => globMatch(glob, pad));

/** Rolhekniveau zoals rails/hooks/lib/rolhek.mjs het toepast: geen gate 0, gate 1, voorReview 2, altijdVragen 3. */
function niveau(
  lijsten: { gates: string[]; voorReview?: string[] | undefined; altijdVragen?: string[] | undefined },
  pad: string,
) {
  if (!past(lijsten.gates, pad)) return 0;
  const voorReview = lijsten.voorReview ?? lijsten.gates;
  if (past(lijsten.altijdVragen ?? voorReview, pad)) return 3;
  return past(voorReview, pad) ? 2 : 1;
}

function kandidaten(): string[] {
  const getrackt = execFileSync('git', ['ls-files'], { cwd: REPO, encoding: 'utf8' }).split('\n').filter(Boolean);
  const paden = typeof RUW['paden'] === 'object' && RUW['paden'] !== null ? Object.keys(RUW['paden']) : [];
  const lijst = (sleutel: string) => (Array.isArray(RUW[sleutel]) ? RUW[sleutel].map(String) : []);
  const globs = [
    ...OUD.gates,
    ...OUD.voorReview,
    ...OUD.altijdVragen,
    ...OUD.toegestaan,
    ...OUD.agentKritiek,
    ...OUD.kritiek,
    ...lijst('gates'),
    ...lijst('voorReview'),
    ...lijst('altijdVragen'),
    ...paden,
  ];
  return [...new Set([...getrackt, ...globs.map(voorbeeldPad)])];
}

describe('padtabel/AC-2 gelijkwaardigheid als vloer tegen 30cc352', () => {
  test('de huidige .claude/gates.json is in de nieuwe vorm (padtabel/AC-2)', () => {
    expect(typeof RUW['paden']).toBe('object');
    expect(RUW).not.toHaveProperty('gates');
  });

  const PADEN = kandidaten();
  const nieuweConfig = loadConfig(TEKST);

  test('rolhekniveau nieuw ≥ oud voor elk pad (padtabel/AC-2)', () => {
    const losser = PADEN.filter((pad) => niveau(nieuweConfig, pad) < niveau(OUD, pad));
    expect(losser).toEqual([]);
  });
});
