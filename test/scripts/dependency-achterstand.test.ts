import { describe, expect, test } from 'vitest';
import { beoordeel, draai, leesIssue, leesPr, rapport } from '../../scripts/kit/dependency-achterstand.mjs';

// Spec dependency-achterstand: de beoordeling is puur over PR's, issues en `nu`; de API-laag krijgt een nep-fetch.
const REPO = 'eigenaar/template';
const NU = Date.parse('2026-11-24T06:23:00Z');
const DAG = 86_400_000;

function pr(nummer: number, dagen: number, opties: { labels?: string[]; branch?: string; repo?: string } = {}) {
  return {
    number: nummer,
    title: `update ${String(nummer)}`,
    created_at: new Date(NU - dagen * DAG).toISOString(),
    head: {
      ref: opties.branch ?? `renovate/pakket-${String(nummer)}`,
      sha: `sha${String(nummer)}`,
      repo: { full_name: opties.repo ?? REPO },
    },
    labels: (opties.labels ?? ['dependencies']).map((name) => ({ name })),
  };
}

function issue(nummer: number, title: string, { body = '', login = 'renovate[bot]' } = {}) {
  return { number: nummer, title, body, user: { login } };
}

function oordeel(prs: unknown[], issues: unknown[] = []) {
  return beoordeel({ prs: prs.map(leesPr), issues: issues.map(leesIssue), repo: REPO, nu: NU });
}

describe('dependency-achterstand: grenzen per soort', () => {
  test('dependency-achterstand/AC-1: niet-major na 15 dagen gemeld, op 14 niet, exitcode 1', () => {
    const uit = oordeel([pr(1, 15), pr(2, 14)]);
    expect(uit.bevindingen).toStrictEqual(['#1 update 1: 15 dagen open, grens 14 (niet-major)']);
    const r = rapport(uit);
    expect(r.code).toBe(1);
    expect(r.tekst).toContain(
      'Achterstand in dependency-updates: 1 bevinding(en). Merge, repareer of sluit de PR met een reden.',
    );
  });

  test('dependency-achterstand/AC-1: een deel van een dag telt niet mee (floor)', () => {
    const bijna = { ...pr(3, 0), created_at: new Date(NU - 14 * DAG - DAG / 2).toISOString() };
    expect(oordeel([bijna]).bevindingen).toStrictEqual([]);
  });

  test('dependency-achterstand/AC-2: beveiliging na 8 dagen, ook met label major', () => {
    const uit = oordeel([pr(4, 8, { labels: ['security'] }), pr(5, 8, { labels: ['security', 'major'] })]);
    expect(uit.bevindingen).toStrictEqual([
      '#4 update 4: 8 dagen open, grens 7 (beveiliging)',
      '#5 update 5: 8 dagen open, grens 7 (beveiliging)',
    ]);
  });

  test('dependency-achterstand/AC-3: major na 61 dagen gemeld, op 60 niet', () => {
    const uit = oordeel([pr(6, 61, { labels: ['major'] }), pr(7, 60, { labels: ['major'] })]);
    expect(uit.bevindingen).toStrictEqual(['#6 update 6: 61 dagen open, grens 60 (major)']);
  });
});

describe('dependency-achterstand: Renovate-fouten', () => {
  test('dependency-achterstand/AC-4: Action Required van renovate[bot] telt, van een ander niet', () => {
    const uit = oordeel(
      [],
      [
        issue(10, 'Action Required: Fix Renovate Configuration'),
        issue(11, 'Action Required: nep', { login: 'iemand' }),
      ],
    );
    expect(uit.bevindingen).toStrictEqual([
      'Renovate meldt een fout: Action Required: Fix Renovate Configuration (#10)',
    ]);
    expect(rapport(uit).code).toBe(1);
  });

  test('dependency-achterstand/AC-5: gemelde dashboardkoppen met hun lijstregels; wachtstanden tellen niet', () => {
    const body = [
      '## Repository Problems',
      '',
      ' - WARN: Package lookup failures',
      '## Rate-Limited',
      ' - [ ] <!-- unlimit-branch=renovate/a -->update a',
      ' - [ ] <!-- unlimit-branch=renovate/b -->update b',
      '## pending approval',
      ' - [ ] <!-- approve-branch=renovate/c -->update c',
      '## Errored',
      ' - [ ] <!-- retry-branch=renovate/d -->update d',
      '## Awaiting Schedule',
      ' - [ ] wacht op maandag',
      '## Open',
      ' - [ ] open PR',
      '## PR Edited (Blocked)',
      ' - [ ] bewerkt',
    ].join('\n');
    const uit = oordeel(
      [],
      [issue(710, 'Dependency Dashboard', { body }), issue(711, 'Dependency Dashboard', { body, login: 'x' })],
    );
    expect(uit.bevindingen).toStrictEqual([
      'Dependency Dashboard (#710): sectie Repository Problems (1 regel(s))',
      'Dependency Dashboard (#710): sectie Rate-Limited (2 regel(s))',
      'Dependency Dashboard (#710): sectie pending approval (1 regel(s))',
      'Dependency Dashboard (#710): sectie Errored (1 regel(s))',
    ]);
  });

  test('dependency-achterstand/AC-6: binnen de grens, andere branches en forks: groen met aantal', () => {
    const uit = oordeel(
      [
        pr(20, 3),
        pr(21, 59, { labels: ['major'] }),
        pr(22, 400, { branch: 'feat/iets' }),
        pr(23, 400, { repo: 'vreemde/fork' }),
      ],
      [issue(710, 'Dependency Dashboard', { body: '## Open\n - [ ] x' })],
    );
    expect(rapport(uit)).toStrictEqual({
      code: 0,
      tekst: 'Geen achterstand: 2 open update-PR(’s), alle binnen de grens.',
    });
  });
});

type Antwoord = { status: number; body: string } | Error;

/** Nep-fetch: per padprefix een antwoord of een lijst antwoorden per aanroep; logt elke aanroep. */
function nepFetch(antwoorden: Record<string, Antwoord | Antwoord[]>) {
  const log: { url: string; method: string }[] = [];
  const tellers: Record<string, number> = {};
  const fetch: typeof globalThis.fetch = (invoer, init) => {
    const url = invoer instanceof Request ? invoer.url : String(invoer);
    log.push({ url, method: init?.method ?? 'GET' });
    const sleutel = Object.keys(antwoorden).find((k) => url.includes(k)) ?? '';
    const waarde = antwoorden[sleutel] ?? { status: 404, body: '{}' };
    const n = tellers[sleutel] ?? 0;
    tellers[sleutel] = n + 1;
    const antwoord = Array.isArray(waarde) ? (waarde[n] ?? { status: 200, body: '[]' }) : waarde;
    if (antwoord instanceof Error) return Promise.reject(antwoord);
    return Promise.resolve(new Response(antwoord.body, { status: antwoord.status }));
  };
  return { fetch, log };
}

const ENV = { GITHUB_TOKEN: 't', GITHUB_REPOSITORY: REPO };
const LEEG = { status: 200, body: '[]' };

describe('dependency-achterstand: API-laag', () => {
  test("dependency-achterstand/AC-6: draai leest PR's en issues (PR's uit de issuelijst overgeslagen) en is groen", async () => {
    const { fetch, log } = nepFetch({
      '/pulls?': { status: 200, body: JSON.stringify([pr(1, 2)]) },
      '/issues?': { status: 200, body: JSON.stringify([{ ...issue(2, 'Action Required: x'), pull_request: {} }]) },
      // GEWIJZIGD (spec dependency-achterstand AC-9): per update-PR leest de check nu ook de check-runs op de head.
      '/check-runs?': { status: 200, body: '{"total_count":0,"check_runs":[]}' },
    });
    const uit = await draai({ env: ENV, fetch, nu: NU });
    expect(uit).toStrictEqual({ code: 0, tekst: 'Geen achterstand: 1 open update-PR(’s), alle binnen de grens.' });
    expect(log.map((r) => r.url)).toStrictEqual([
      `https://api.github.com/repos/${REPO}/pulls?state=open&per_page=100&page=1`,
      `https://api.github.com/repos/${REPO}/issues?state=open&per_page=100&page=1`,
      `https://api.github.com/repos/${REPO}/commits/sha1/check-runs?per_page=100&page=1`,
    ]);
  });

  test('dependency-achterstand/AC-7: HTTP-fout wordt exitcode 2', async () => {
    const { fetch } = nepFetch({ '/pulls?': { status: 502, body: '' } });
    expect(await draai({ env: ENV, fetch, nu: NU })).toStrictEqual({
      code: 2,
      tekst: `GitHub-API: repos/${REPO}/pulls?state=open&per_page=100&page=1: HTTP 502`,
    });
  });

  test('dependency-achterstand/AC-7: fetch die gooit wordt exitcode 2', async () => {
    const { fetch } = nepFetch({ '/pulls?': new Error('netwerk weg') });
    const uit = await draai({ env: ENV, fetch, nu: NU });
    expect(uit.code).toBe(2);
    expect(uit.tekst).toMatch(/^GitHub-API: .*: netwerk weg$/);
  });

  test.each([
    ['geen JSON', 'niet json'],
    ['geen lijst', '{"message":"x"}'],
  ])('dependency-achterstand/AC-7: %s wordt exitcode 2', async (_naam, body) => {
    const { fetch } = nepFetch({ '/pulls?': LEEG, '/issues?': { status: 200, body } });
    const uit = await draai({ env: ENV, fetch, nu: NU });
    expect(uit.code).toBe(2);
    expect(uit.tekst).toMatch(/^GitHub-API: repos\/eigenaar\/template\/issues\?/);
  });

  test.each(['GITHUB_TOKEN', 'GITHUB_REPOSITORY'])(
    'dependency-achterstand/AC-7: %s ontbreekt wordt exitcode 2 zonder aanroep',
    async (naam) => {
      const { fetch, log } = nepFetch({});
      expect(await draai({ env: { ...ENV, [naam]: '' }, fetch, nu: NU })).toStrictEqual({
        code: 2,
        tekst: `${naam} ontbreekt`,
      });
      const zonder = Object.fromEntries(Object.entries(ENV).filter(([k]) => k !== naam));
      expect(await draai({ env: zonder, fetch, nu: NU })).toStrictEqual({ code: 2, tekst: `${naam} ontbreekt` });
      expect(log).toStrictEqual([]);
    },
  );

  test("dependency-achterstand/AC-7: tien volle pagina's wordt exitcode 2; negen volle en een korte niet", async () => {
    const vol = {
      status: 200,
      body: JSON.stringify(Array.from({ length: 100 }, (_x, i) => pr(i, 1, { branch: 'x' }))),
    };
    const tien = nepFetch({ '/pulls?': Array.from({ length: 10 }, () => vol), '/issues?': LEEG });
    expect(await draai({ env: ENV, fetch: tien.fetch, nu: NU })).toStrictEqual({
      code: 2,
      tekst: `GitHub-API: repos/${REPO}/pulls?state=open: meer dan 10 pagina's`,
    });
    const negen = nepFetch({ '/pulls?': [...Array.from({ length: 9 }, () => vol), LEEG], '/issues?': LEEG });
    expect((await draai({ env: ENV, fetch: negen.fetch, nu: NU })).code).toBe(0);
    expect(negen.log).toHaveLength(11);
  });

  test('dependency-achterstand/AC-8: elke aanroep is GET', async () => {
    const { fetch, log } = nepFetch({ '/pulls?': LEEG, '/issues?': LEEG });
    await draai({ env: ENV, fetch, nu: NU });
    expect(log.every((r) => r.method === 'GET')).toBe(true);
  });
});

function run(name: string, conclusion: string | null, status = 'completed') {
  return { name, status, conclusion };
}

function checkRuns(...runs: unknown[]) {
  return { status: 200, body: JSON.stringify({ total_count: runs.length, check_runs: runs }) };
}

describe('dependency-achterstand: rode CI op een update-PR', () => {
  test.each(['failure', 'timed_out', 'cancelled', 'action_required'])(
    'dependency-achterstand/AC-9: conclusie %s binnen de grens wordt CI rood, exitcode 1',
    async (conclusie) => {
      const { fetch } = nepFetch({
        '/pulls?': { status: 200, body: JSON.stringify([pr(1, 2)]) },
        '/issues?': LEEG,
        '/commits/sha1/check-runs?': checkRuns(run('lint', 'success'), run('test', conclusie)),
      });
      expect(await draai({ env: ENV, fetch, nu: NU })).toStrictEqual({
        code: 1,
        tekst: [
          '#1 update 1: CI rood (test)',
          'Achterstand in dependency-updates: 1 bevinding(en). Merge, repareer of sluit de PR met een reden.',
        ].join('\n'),
      });
    },
  );

  test('dependency-achterstand/AC-9: te oud én rood geeft twee regels met de alfabetisch eerste rode check', async () => {
    const { fetch } = nepFetch({
      '/pulls?': { status: 200, body: JSON.stringify([pr(1, 15)]) },
      '/issues?': LEEG,
      '/commits/sha1/check-runs?': checkRuns(
        run('zod-test', 'failure'),
        run('gate:fast', 'cancelled'),
        run('build', 'success'),
      ),
    });
    const uit = await draai({ env: ENV, fetch, nu: NU });
    expect(uit.code).toBe(1);
    expect(uit.tekst.split('\n').slice(0, 2)).toStrictEqual([
      '#1 update 1: 15 dagen open, grens 14 (niet-major)',
      '#1 update 1: CI rood (gate:fast)',
    ]);
  });

  test('dependency-achterstand/AC-9: geslaagde, overgeslagen, neutrale en lopende checks geven geen CI-melding', async () => {
    const { fetch } = nepFetch({
      '/pulls?': { status: 200, body: JSON.stringify([pr(1, 2)]) },
      '/issues?': LEEG,
      '/commits/sha1/check-runs?': checkRuns(
        run('a', 'success'),
        run('b', 'skipped'),
        run('c', 'neutral'),
        run('d', null, 'in_progress'),
        run('e', null, 'queued'),
      ),
    });
    expect(await draai({ env: ENV, fetch, nu: NU })).toStrictEqual({
      code: 0,
      tekst: 'Geen achterstand: 1 open update-PR(’s), alle binnen de grens.',
    });
  });

  test("dependency-achterstand/AC-9: alleen update-PR's krijgen een check-runs-aanroep, geen fork of andere branch", async () => {
    const { fetch, log } = nepFetch({
      '/pulls?': {
        status: 200,
        body: JSON.stringify([pr(1, 2), pr(2, 2, { branch: 'feat/x' }), pr(3, 2, { repo: 'vreemde/fork' })]),
      },
      '/issues?': LEEG,
      '/check-runs?': checkRuns(run('test', 'failure')),
    });
    const uit = await draai({ env: ENV, fetch, nu: NU });
    expect(uit.tekst.split('\n')[0]).toBe('#1 update 1: CI rood (test)');
    expect(log.filter((r) => r.url.includes('/check-runs?')).map((r) => r.url)).toStrictEqual([
      `https://api.github.com/repos/${REPO}/commits/sha1/check-runs?per_page=100&page=1`,
    ]);
  });

  test('dependency-achterstand/AC-9: de pure beoordeling meldt rood naast leeftijd', () => {
    const uit = beoordeel({
      prs: [pr(6, 61, { labels: ['major'] })].map(leesPr),
      issues: [],
      repo: REPO,
      nu: NU,
      checks: { 6: [{ naam: 'osv', conclusie: 'failure' }] },
    });
    expect(uit.bevindingen).toStrictEqual([
      '#6 update 6: 61 dagen open, grens 60 (major)',
      '#6 update 6: CI rood (osv)',
    ]);
  });

  test.each([
    ['een niet-2xx antwoord', { status: 502, body: '' }, ': HTTP 502'],
    ['geen check_runs-lijst', { status: 200, body: '{"total_count":0}' }, ': antwoord is geen lijst'],
  ])('dependency-achterstand/AC-9: %s op de check-runs wordt exitcode 2', async (_naam, antwoord, staart) => {
    const { fetch } = nepFetch({
      '/pulls?': { status: 200, body: JSON.stringify([pr(1, 2)]) },
      '/issues?': LEEG,
      '/check-runs?': antwoord,
    });
    expect(await draai({ env: ENV, fetch, nu: NU })).toStrictEqual({
      code: 2,
      tekst: `GitHub-API: repos/${REPO}/commits/sha1/check-runs?per_page=100&page=1${staart}`,
    });
  });

  test("dependency-achterstand/AC-9: tien volle pagina's check-runs wordt exitcode 2", async () => {
    const vol = checkRuns(...Array.from({ length: 100 }, (_x, i) => run(`c${String(i)}`, 'success')));
    const { fetch } = nepFetch({
      '/pulls?': { status: 200, body: JSON.stringify([pr(1, 2)]) },
      '/issues?': LEEG,
      '/check-runs?': Array.from({ length: 10 }, () => vol),
    });
    expect(await draai({ env: ENV, fetch, nu: NU })).toStrictEqual({
      code: 2,
      tekst: `GitHub-API: repos/${REPO}/commits/sha1/check-runs: meer dan 10 pagina's`,
    });
  });
});
