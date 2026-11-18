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
    // GEWIJZIGD (agent-samenvoegen AC-3 en AC-4, ADR 0093): het script leest de bestanden van de PR en de padtabel weer; een
    // app-bestand dat niet bestaat (404) telt als leeg. De endpoints van de grenscontrole (templateregime AC-14) zijn weg.
    [`repos/${REPO}/contents/.claude/gates.app.json?ref=${MAIN}`]: new Error('gh: Not Found (HTTP 404)'),
    [`repos/${REPO}/pulls/7/files`]: [{ filename: 'src/web/x.tsx', status: 'modified' }],
    [`repos/${REPO}/commits/${HEAD}/check-runs`]: { check_runs: VEREIST.map((n) => check(n, HEAD)) },
    [`repos/${REPO}/commits/${MAIN}/check-runs`]: { check_runs: [check('gate:fast', MAIN)] },
  };
}

function api(w: Wereld) {
  return (endpoint: string) => {
    const sleutel = endpoint.replace(/[?&]per_page=100&page=\d+$/, '');
    if (!(sleutel in w)) throw new Error(`onbekend endpoint ${sleutel}`);
    const antwoord = w[sleutel];
    if (antwoord instanceof Error) throw antwoord;
    return antwoord;
  };
}

const redenen = (w: Wereld) => beoordeelMerge(api(w), { repo: REPO, nummer: 7, head: HEAD }).redenen;

const VORMEN: [string, Record<string, unknown>][] = [
  ['(a) nieuwe vorm', nieuw()],
  ['(b) oude vorm van 30cc352', OUD.ruw],
];

// GEWIJZIGD (agent-samenvoegen AC-3, ADR 0093; R-TEST-02): het script leest de padtabel weer. In de nieuwe vorm (a) merget een
// geldige PR nog; in de oude vorm (b) zonder `paden` is de padtabel niet te lezen en weigert het script.
describe('padtabel/AC-5 pr:merge leest de modus uit main in beide vormen', () => {
  test('(a) nieuwe vorm: beoordeelMerge merget een geldige PR (padtabel/AC-5)', () => {
    expect(redenen(wereld(nieuw()))).toEqual([]);
  });

  test('(b) oude vorm van 30cc352: de padtabel is niet te lezen, beoordeelMerge merget niet (padtabel/AC-5)', () => {
    expect(redenen(wereld(OUD.ruw))).toEqual([
      'de bestanden van de PR of de padtabel op main zijn niet te lezen: de eigenaar voegt samen',
    ]);
  });

  test.each(VORMEN)('%s: zonder modus niet-kritiek merget beoordeelMerge niet (padtabel/AC-5)', (_n, ruw) => {
    expect(redenen(wereld({ ...ruw, merge: 'eigenaar' })).join('\n')).toMatch(/modus/);
  });
});
