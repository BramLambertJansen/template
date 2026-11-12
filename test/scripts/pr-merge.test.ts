import { describe, expect, test } from 'vitest';
import { nummerUit, voorwaarden } from '../../scripts/kit/pr-merge.mjs';

// `pnpm pr:merge` (ADR 0069 punt 3, spec agent-merge-niet-kritiek AC-3): per voorwaarde een nagebootst REST-antwoord dat
// de merge tegenhoudt. De wereld `goed` is mergebaar; elke test verandert precies één antwoord.
// GEWIJZIGD (templateregime AC-7, ADR 0089 punt 5): de inhoudstoets is weg. De rijen over de job agent-merge (6), "achter
// main" en "review op een oude SHA", en de test over een run zonder pull_requests zijn verwijderd; de wereld heeft geen
// agentMerge-blok, bestandenlijst, compare, job agent-merge, workflow-runs of reviewcommentaar meer.
const REPO = 'BramLambertJansen/template';
const HEAD = 'a'.repeat(40);
const MAIN = 'b'.repeat(40);
const ACTIONS = 15368;
const VEREIST = ['gate:fast', 'check-core'];
const b64 = (waarde: unknown) => Buffer.from(JSON.stringify(waarde)).toString('base64');

type Wereld = Record<string, unknown>;

function check(name: string, sha: string, extra: Record<string, unknown> = {}) {
  return { id: 1, name, head_sha: sha, status: 'completed', conclusion: 'success', app: { id: ACTIONS }, ...extra };
}

const PR = { state: 'open', draft: false, base: { ref: 'main' }, head: { sha: HEAD, repo: { full_name: REPO } } };

function goed(): Wereld {
  return {
    [`repos/${REPO}/branches/main`]: { commit: { sha: MAIN } },
    [`repos/${REPO}/contents/.claude/gates.json?ref=${MAIN}`]: {
      content: b64({ merge: 'niet-kritiek' }),
    },
    [`repos/${REPO}/contents/.claude/decisions.json?ref=${MAIN}`]: { content: b64({ requiredChecks: VEREIST }) },
    [`repos/${REPO}/pulls/7`]: {
      state: 'open',
      draft: false,
      base: { ref: 'main' },
      head: { sha: HEAD, repo: { full_name: REPO } },
      additions: 10,
      deletions: 2,
    },
    [`repos/${REPO}/commits/${HEAD}/check-runs`]: { check_runs: VEREIST.map((n) => check(n, HEAD)) },
    [`repos/${REPO}/commits/${MAIN}/check-runs`]: { check_runs: [check('gate:fast', MAIN)] },
  };
}

function api(wereld: Wereld) {
  return (endpoint: string) => {
    const sleutel = endpoint.replace(/[?&]per_page=100&page=\d+$/, '');
    if (!(sleutel in wereld)) throw new Error(`onbekend endpoint ${sleutel}`);
    return wereld[sleutel];
  };
}

function redenen(aanpassing: (w: Wereld) => void = () => {}) {
  const wereld = goed();
  aanpassing(wereld);
  return voorwaarden(api(wereld), { repo: REPO, nummer: 7, head: HEAD }).join('\n');
}

const zet = (sleutel: string, waarde: unknown) => (w: Wereld) => {
  w[`repos/${REPO}/${sleutel}`] = waarde;
};

describe('agent-merge-niet-kritiek/AC-3 pr:merge', () => {
  test('alle voorwaarden vervuld: geen reden', () => {
    expect(redenen()).toBe('');
  });

  test.each([
    [
      'modus eigenaar',
      zet(`contents/.claude/gates.json?ref=${MAIN}`, { content: b64({ merge: 'eigenaar' }) }),
      /modus/,
    ],
    ['modus ontbreekt', zet(`contents/.claude/gates.json?ref=${MAIN}`, { content: b64({}) }), /modus/],
    ['gates.json onleesbaar', zet(`contents/.claude/gates.json?ref=${MAIN}`, { content: 'kapot' }), /modus/],
    ['PR dicht', zet('pulls/7', { ...PR, state: 'closed' }), /niet open/],
    ['draft', zet('pulls/7', { ...PR, draft: true }), /draft/],
    ['basis niet main', zet('pulls/7', { ...PR, base: { ref: 'dev' } }), /basis/],
    [
      'fork',
      zet('pulls/7', {
        ...PR,
        head: { sha: HEAD, repo: { full_name: 'x/y' } },
      }),
      /fork/,
    ],
    [
      'andere head',
      zet('pulls/7', {
        ...PR,
        head: { sha: 'c'.repeat(40), repo: { full_name: REPO } },
      }),
      /lokale HEAD/,
    ],
    [
      'verplichte check rood',
      zet(`commits/${HEAD}/check-runs`, {
        check_runs: [check('gate:fast', HEAD, { conclusion: 'failure' }), check('check-core', HEAD)],
      }),
      /verplichte checks niet groen/,
    ],
    [
      'verplichte check ontbreekt op de head',
      zet(`commits/${HEAD}/check-runs`, { check_runs: [check('gate:fast', HEAD)] }),
      /verplichte checks niet groen/,
    ],
    [
      'verplichte check van een andere app',
      zet(`commits/${HEAD}/check-runs`, {
        check_runs: [check('gate:fast', HEAD), check('check-core', HEAD, { app: { id: 1 } })],
      }),
      /verplichte checks niet groen/,
    ],
    [
      'main rood',
      zet(`commits/${MAIN}/check-runs`, { check_runs: [check('gate:fast', MAIN, { conclusion: 'failure' })] }),
      /main is niet groen/,
    ],
    [
      'main loopt nog',
      zet(`commits/${MAIN}/check-runs`, {
        check_runs: [check('gate:fast', MAIN, { status: 'in_progress', conclusion: null })],
      }),
      /main is niet groen/,
    ],
    [
      'main zonder checks',
      zet(`commits/${MAIN}/check-runs`, { check_runs: [] }),
      /geen verplichte check op de kop van main/,
    ],
  ])('%s', (_naam, aanpassing, reden) => {
    expect(redenen(aanpassing)).toMatch(reden);
  });

  test.each([[[]], [['0']], [['7', '8']], [['7;x']], [['abc']]])('ongeldig argument %j', (args) => {
    expect(() => nummerUit(args)).toThrow(/Gebruik: pnpm pr:merge <nummer>/);
  });
});

describe('leerlus-bewijs/AC-4 pr:merge leest de sectie Leerpunt bij het mergen', () => {
  const PULL = goed()[`repos/${REPO}/pulls/7`];
  const metBody = (body: string) => zet('pulls/7', { ...Object(PULL), body });

  test('leerlus-bewijs/AC-4: bewijs met testpad: geen reden', () => {
    expect(redenen(metBody('## Leerpunt\n\n- #9: trede Check; bewijs test/scripts/x.test.ts'))).toBe('');
  });

  test('leerlus-bewijs/AC-4: beschrijving na het oordeel gewijzigd naar geen test: weigering', () => {
    expect(redenen(metBody('## Leerpunt\n\n- #9: trede Skill; bewijs geen test: alleen skilltekst'))).toMatch(
      /leerpunt zonder test: de eigenaar merget/,
    );
  });
});
