import { describe, expect, test } from 'vitest';
import { beoordeelMerge } from '../../scripts/kit/pr-merge.mjs';
import { OUD, nieuw } from '../rails/padtabel-kit';

// padtabel/AC-5: `pr:merge` leest de `gates.json` van main in de nieuwe vorm (a) en de oude vorm van 30cc352 (b).
// Nep-API zoals test/scripts/pr-merge.test.ts.
// GEWIJZIGD (templateregime AC-7, ADR 0089 punt 5): `pr:merge` leest alleen nog de modus `merge`, niet meer het blok
// agentMerge of de padtabel. Verwijderd: de gevallen over `leesAgentMerge`, `agentMergeFouten`, maxRegels, maxBytes en het
// padoordeel van de diff-guard, en "(c) paden naast gates faalt dicht" (dat was de lezer van de inhoudstoets; de samenhang
// van gates.json toetst check-docs in CI). De wereld heeft geen bestandenlijst, compare, job agent-merge of review meer.
const REPO = 'BramLambertJansen/template';
const HEAD = 'a'.repeat(40);
const MAIN = 'b'.repeat(40);
const ACTIONS = 15368;
const VEREIST = ['gate:fast', 'check-core'];
const GATES = `repos/${REPO}/contents/.claude/gates.json?ref=${MAIN}`;
const b64 = (waarde: unknown) => Buffer.from(JSON.stringify(waarde)).toString('base64');

type Wereld = Record<string, unknown>;

const check = (name: string, sha: string) => ({
  id: 1,
  name,
  head_sha: sha,
  status: 'completed',
  conclusion: 'success',
  app: { id: ACTIONS },
});

function wereld(gates: unknown): Wereld {
  return {
    [`repos/${REPO}/branches/main`]: { commit: { sha: MAIN } },
    [GATES]: { content: b64(gates) },
    [`repos/${REPO}/contents/.claude/decisions.json?ref=${MAIN}`]: { content: b64({ requiredChecks: VEREIST }) },
    [`repos/${REPO}/pulls/7`]: {
      state: 'open',
      draft: false,
      base: { ref: 'main' },
      head: { sha: HEAD, repo: { full_name: REPO } },
    },
    [`repos/${REPO}/commits/${HEAD}/check-runs`]: { check_runs: VEREIST.map((n) => check(n, HEAD)) },
    [`repos/${REPO}/commits/${MAIN}/check-runs`]: { check_runs: [check('gate:fast', MAIN)] },
  };
}

function api(w: Wereld) {
  return (endpoint: string) => {
    const sleutel = endpoint.replace(/[?&]per_page=100&page=\d+$/, '');
    if (!(sleutel in w)) throw new Error(`onbekend endpoint ${sleutel}`);
    return w[sleutel];
  };
}

const redenen = (w: Wereld) => beoordeelMerge(api(w), { repo: REPO, nummer: 7, head: HEAD }).redenen;

const VORMEN: [string, Record<string, unknown>][] = [
  ['(a) nieuwe vorm', nieuw()],
  ['(b) oude vorm van 30cc352', OUD.ruw],
];

describe('padtabel/AC-5 pr:merge leest de modus uit main in beide vormen', () => {
  test.each(VORMEN)('%s: beoordeelMerge merget een geldige PR (padtabel/AC-5)', (_n, ruw) => {
    expect(redenen(wereld(ruw))).toEqual([]);
  });

  test.each(VORMEN)('%s: zonder modus niet-kritiek merget beoordeelMerge niet (padtabel/AC-5)', (_n, ruw) => {
    expect(redenen(wereld({ ...ruw, merge: 'eigenaar' })).join('\n')).toMatch(/modus/);
  });
});
