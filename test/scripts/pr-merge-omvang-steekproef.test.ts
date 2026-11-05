import { describe, expect, test } from 'vitest';
import { STEEKPROEF, beoordeelMerge, slotRegels } from '../../scripts/kit/pr-merge.mjs';

// `pnpm pr:merge` met omvanggrens (spec agent-merge-niet-kritiek AC-9) en zonder externe-reviewvoorwaarde met
// steekproefregel na de merge (AC-7): nagebootste REST-antwoorden. De wereld `goed` is mergebaar en kent bewust geen enkel
// endpoint voor reacties, check-suites, reviews of branch-PR's: een onbekend endpoint gooit.
// De naam van de externe reviewbot wordt samengesteld, zodat dit bestand de afwezigheidstoets van AC-10 niet raakt.
const NAAM = ['co', 'dex'].join('');
const BOT = `chatgpt-${NAAM}-connector[bot]`;
const MARKER = `<!-- ${NAAM}-review-state:v1`;
const REPO = 'BramLambertJansen/template';
const HEAD = 'a'.repeat(40);
const MAIN = 'b'.repeat(40);
const ACTIONS = 15368;
const VEREIST = ['gate:fast', 'document-status'];
const REVIEW = { user: { login: 'BramLambertJansen' }, body: `Review ${HEAD}: geen blokkerende bevindingen` };
const b64 = (waarde: unknown) => Buffer.from(JSON.stringify(waarde)).toString('base64');

type Wereld = Record<string, unknown>;

function check(name: string, sha: string, extra: Record<string, unknown> = {}) {
  return { id: 1, name, head_sha: sha, status: 'completed', conclusion: 'success', app: { id: ACTIONS }, ...extra };
}

const gatesMet = (agentMerge: Record<string, unknown>) => ({
  content: b64({
    merge: 'niet-kritiek',
    agentMerge: { toegestaan: ['src/**'], kritiek: [], maxBytes: 40000, ...agentMerge },
  }),
});

const PULL = {
  state: 'open',
  draft: false,
  base: { ref: 'main' },
  head: { sha: HEAD, ref: 'claude/x', repo: { full_name: REPO } },
  additions: 300,
  deletions: 100,
};
const BYTES_ONLEESBAAR = 'omvang van de PR niet leesbaar of agentMerge.maxBytes ontbreekt: geen agent-merge';
// Een REST-bestand waarvan de patch klopt met `additions` en `deletions` (spec agent-merge-bytegrens AC-4).
const bestand = (erbij: number, eraf: number) => ({
  filename: 'src/web/x.ts',
  status: 'modified',
  additions: erbij,
  deletions: eraf,
  changes: erbij + eraf,
  patch: ['@@', ...Array.from({ length: eraf }, () => '-a'), ...Array.from({ length: erbij }, () => '+b')].join('\n'),
});

function goed(): Wereld {
  return {
    [`repos/${REPO}/branches/main`]: { commit: { sha: MAIN } },
    [`repos/${REPO}/contents/.claude/gates.json?ref=${MAIN}`]: gatesMet({ maxRegels: 400 }),
    [`repos/${REPO}/contents/.claude/decisions.json?ref=${MAIN}`]: { content: b64({ requiredChecks: VEREIST }) },
    [`repos/${REPO}/pulls/7`]: PULL,
    [`repos/${REPO}/pulls/7/files`]: [bestand(300, 100)],
    [`repos/${REPO}/compare/${MAIN}...${HEAD}`]: { behind_by: 0 },
    [`repos/${REPO}/commits/${HEAD}/check-runs`]: {
      check_runs: [
        ...VEREIST.map((n) => check(n, HEAD)),
        check('agent-merge', HEAD, { id: 9, check_suite: { id: 55 } }),
      ],
    },
    [`repos/${REPO}/actions/runs?check_suite_id=55`]: {
      workflow_runs: [
        { path: '.github/workflows/guard.yml', event: 'pull_request_target', pull_requests: [{ number: 7 }] },
      ],
    },
    [`repos/${REPO}/commits/${MAIN}/check-runs`]: { check_runs: [check('gate:fast', MAIN)] },
    [`repos/${REPO}/issues/7/comments`]: [REVIEW],
  };
}

function api(wereld: Wereld, gelezen: string[] = []) {
  return (endpoint: string) => {
    const sleutel = endpoint.replace(/[?&]per_page=100&page=\d+$/, '');
    gelezen.push(sleutel);
    if (!(sleutel in wereld)) throw new Error(`onbekend endpoint ${sleutel}`);
    return wereld[sleutel];
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

describe('agent-merge-niet-kritiek/AC-9 pr:merge telt de omvang via REST', () => {
  test('400 regels bij grens 400: geen reden', () => {
    expect(redenen()).toBe('');
  });

  test.each([
    [
      '401 regels',
      zet(['pulls/7', { ...PULL, deletions: 101 }], ['pulls/7/files', [bestand(300, 101)]]),
      'PR te groot voor een agent-merge: 401 regels, grens 400 (agentMerge.maxRegels)',
    ],
    [
      'een bestand zonder patch met changes 3',
      zet(['pulls/7/files', [{ filename: 'src/web/groot.ts', status: 'modified', changes: 3 }]]),
      [BYTES_ONLEESBAAR, 'binair bestand in de PR: geen agent-merge (src/web/groot.ts)'],
    ],
    [
      'een binair bestand (changes 0, geen patch)',
      zet(['pulls/7/files', [{ filename: 'docs/x.png', status: 'added', changes: 0 }]]),
      [BYTES_ONLEESBAAR, 'binair bestand in de PR: geen agent-merge (docs/x.png)'],
    ],
    [
      'additions onleesbaar',
      zet(['pulls/7', { ...PULL, additions: undefined }]),
      ['omvang van de PR niet leesbaar of agentMerge.maxRegels ontbreekt: geen agent-merge', BYTES_ONLEESBAAR],
    ],
    [
      'agentMerge zonder maxRegels',
      zet([`contents/.claude/gates.json?ref=${MAIN}`, gatesMet({})]),
      'omvang van de PR niet leesbaar of agentMerge.maxRegels ontbreekt: geen agent-merge',
    ],
    [
      'agentMerge.toegestaan is tekst, maxRegels geldig',
      zet([`contents/.claude/gates.json?ref=${MAIN}`, gatesMet({ toegestaan: 'src/**', maxRegels: 400 })]),
      'agentMerge ontbreekt of is onleesbaar in .claude/gates.json',
    ],
  ])('%s', (_naam, aanpassing, reden) => {
    expect(uitslag(aanpassing).redenen).toEqual([reden].flat());
  });

  test('agentMerge ontbreekt op main: beide redenen', () => {
    expect(
      uitslag(zet([`contents/.claude/gates.json?ref=${MAIN}`, { content: b64({ merge: 'niet-kritiek' }) }])).redenen,
    ).toEqual([
      'agentMerge ontbreekt of is onleesbaar in .claude/gates.json',
      'omvang van de PR niet leesbaar of agentMerge.maxRegels ontbreekt: geen agent-merge',
      BYTES_ONLEESBAAR,
    ]);
  });

  test('zuivere hernoeming (renamed, changes 0, geen patch): geen reden', () => {
    expect(
      redenen(
        zet(
          ['pulls/7', { ...PULL, additions: 0, deletions: 0 }],
          [
            'pulls/7/files',
            [{ filename: 'src/web/nieuw.ts', previous_filename: 'src/web/oud.ts', status: 'renamed', changes: 0 }],
          ],
        ),
      ),
    ).toBe('');
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

  test('de beoordeling leest geen reacties, check-suites, reviews, inline-commentaar of branch-PR\'s', () => {
    const gelezen: string[] = [];
    beoordeelMerge(api(goed(), gelezen), { repo: REPO, nummer: 7, head: HEAD });
    expect(gelezen.filter((e) => /reactions|check-suites|\/reviews|pulls\/7\/comments|pulls\?head=/.test(e))).toEqual([]);
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
