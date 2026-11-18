import { describe, expect, test } from 'vitest';
import { STEEKPROEF, beoordeelMerge, slotRegels } from '../../scripts/kit/pr-merge.mjs';

// `pnpm pr:merge` zonder omvanggrens (verwijderd, ADR 0089 punt 5) en zonder externe-reviewvoorwaarde met
// steekproefregel na de merge (AC-7): nagebootste REST-antwoorden. De wereld `goed` is mergebaar en kent bewust geen enkel
// endpoint voor reacties, check-suites, reviews of branch-PR's: een onbekend endpoint gooit.
const BOT = 'chatgpt-codex-connector[bot]';
const MARKER = '<!-- codex-review-state:v1';
const REPO = 'BramLambertJansen/template';
const HEAD = 'a'.repeat(40);
const MAIN = 'b'.repeat(40);
const ACTIONS = 15368;
const VEREIST = ['gate:fast', 'check-core'];
const REVIEW = { user: { login: 'BramLambertJansen' }, body: `Review ${HEAD}: geen blokkerende bevindingen` };
const b64 = (waarde: unknown) => Buffer.from(JSON.stringify(waarde)).toString('base64');

type Wereld = Record<string, unknown>;

function check(name: string, sha: string) {
  return { id: 1, name, head_sha: sha, status: 'completed', conclusion: 'success', app: { id: ACTIONS } };
}

const PULL = {
  state: 'open',
  draft: false,
  base: { ref: 'main' },
  head: { sha: HEAD, ref: 'claude/x', repo: { full_name: REPO } },
};

function goed(): Wereld {
  return {
    [`repos/${REPO}/branches/main`]: { commit: { sha: MAIN } },
    [`repos/${REPO}/contents/.claude/gates.json?ref=${MAIN}`]: {
      content: b64({
        merge: 'niet-kritiek',
        onderhoud: { repository: REPO },
        paden: { 'src/**': { besluit: 'agent' } },
      }),
    },
    // GEWIJZIGD (agent-samenvoegen AC-3 en AC-4, ADR 0093): het script leest de padtabel en de bestanden van de PR weer; een
    // app-bestand dat niet bestaat (404) telt als leeg. De endpoints van de grenscontrole (templateregime AC-14) zijn weg.
    [`repos/${REPO}/contents/.claude/gates.app.json?ref=${MAIN}`]: new Error('gh: Not Found (HTTP 404)'),
    [`repos/${REPO}/contents/.claude/decisions.json?ref=${MAIN}`]: { content: b64({ requiredChecks: VEREIST }) },
    [`repos/${REPO}/pulls/7`]: PULL,
    [`repos/${REPO}/pulls/7/files`]: [{ filename: 'src/web/x.tsx', status: 'modified' }],
    [`repos/${REPO}/commits/${HEAD}/check-runs`]: { check_runs: VEREIST.map((n) => check(n, HEAD)) },
    [`repos/${REPO}/commits/${MAIN}/check-runs`]: { check_runs: [check('gate:fast', MAIN)] },
  };
}

function api(wereld: Wereld, gelezen: string[] = []) {
  return (endpoint: string) => {
    const sleutel = endpoint.replace(/[?&]per_page=100&page=\d+$/, '');
    gelezen.push(sleutel);
    if (!(sleutel in wereld)) throw new Error(`onbekend endpoint ${sleutel}`);
    const antwoord = wereld[sleutel];
    if (antwoord instanceof Error) throw antwoord;
    return antwoord;
  };
}

function uitslag(aanpassing: (w: Wereld) => void = () => {}) {
  const wereld = goed();
  aanpassing(wereld);
  return beoordeelMerge(api(wereld), { repo: REPO, nummer: 7, head: HEAD });
}

const redenen = (aanpassing?: (w: Wereld) => void) => uitslag(aanpassing).redenen.join('\n');

const zet =
  (...paren: [string, unknown][]) =>
  (w: Wereld) => {
    for (const [sleutel, waarde] of paren) w[`repos/${REPO}/${sleutel}`] = waarde;
  };

// GEWIJZIGD (templateregime AC-7, ADR 0089 punt 5): de describe "AC-9 pr:merge telt de omvang via REST" (9 tests) is
// verwijderd met de omvanggrens; de wereld heeft geen agentMerge-blok, bestandenlijst, compare of job agent-merge meer.
// Nieuw: de beoordeling leest de bestandenlijst en de workflow-runs niet meer.
describe('templateregime/AC-7 pr:merge doet geen inhoudstoets', () => {
  test('een PR van elke omvang zonder bestandenlijst in de wereld: geen reden', () => {
    expect(redenen()).toBe('');
  });

  // GEWIJZIGD (agent-samenvoegen AC-3, ADR 0093; R-TEST-02): `pulls/7/files` is uit de regex en uit de titel: de padtoets leest
  // de bestandenlijst weer (de omvang telt het script nog steeds niet).
  test('de beoordeling leest geen compare, workflow-runs of commentaar', () => {
    const gelezen: string[] = [];
    beoordeelMerge(api(goed(), gelezen), { repo: REPO, nummer: 7, head: HEAD });
    expect(gelezen.filter((e) => /compare\/|actions\/runs|issues\/7\/comments/.test(e))).toEqual([]);
  });
});

describe('agent-merge-niet-kritiek/AC-7 geen externe-reviewvoorwaarde, steekproefregel na de merge', () => {
  const EERSTE = `PR #7 gemerged op ${HEAD}. Meld PR en SHA in de thread en volg de CI op main (ADR 0069 punt 5).`;
  const samenvatting = (stand: Record<string, unknown>) => ({
    user: { login: BOT },
    body: `${MARKER} ${JSON.stringify({ code_review: stand }).replaceAll('{', '&#123;').replaceAll('}', '&#125;')} -->`,
  });
  const OOG = { user: { login: BOT }, content: 'eyes', created_at: '2026-11-03T10:01:00Z' };
  const LOPEND = samenvatting({ status: 'running', commit_sha: HEAD });

  test('een wereld zonder enig spoor van de bot: geen reden en geen stand', () => {
    expect(uitslag()).toEqual({ redenen: [] });
  });

  test('een 👀 van de bot op de PR en een samenvatting running geven geen reden', () => {
    const u = uitslag(zet(['issues/7/comments', [REVIEW, LOPEND]], ['issues/7/reactions', [OOG]]));
    expect(u).toEqual({ redenen: [] });
  });

  test("de beoordeling leest geen reacties, check-suites, reviews, inline-commentaar of branch-PR's", () => {
    const gelezen: string[] = [];
    beoordeelMerge(api(goed(), gelezen), { repo: REPO, nummer: 7, head: HEAD });
    expect(gelezen.filter((e) => /reactions|check-suites|\/reviews|pulls\/7\/comments|pulls\?head=/.test(e))).toEqual(
      [],
    );
  });

  test('een samenvatting van de bot met open punten op de head houdt de merge niet tegen', () => {
    const open = samenvatting({ status: 'completed', commit_sha: HEAD, has_unresolved_findings: true });
    expect(uitslag(zet(['issues/7/comments', [REVIEW, open]])).redenen).toEqual([]);
  });

  test('slotRegels geeft precies twee regels: de slotregel en de steekproefregel', () => {
    expect(slotRegels(7, HEAD)).toEqual([EERSTE, STEEKPROEF]);
  });

  test('de steekproefregel is letterlijk die uit de spec', () => {
    expect(STEEKPROEF).toBe('Meld deze merge als steekproef (ADR 0069 punt 5).');
  });

  test('de steekproefregel komt ook bij een wereld zonder enig spoor van de bot', () => {
    expect(uitslag().redenen).toEqual([]);
    expect(slotRegels(7, HEAD).at(-1)).toBe(STEEKPROEF);
  });
});
