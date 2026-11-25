import { describe, expect, test } from 'vitest';
import {
  argumenten,
  foutUittreksel,
  ghArgs,
  leesPr,
  maakApi,
  rodeJobs,
  rodeRuns,
  verslag,
} from '../../scripts/kit/pr-log.mjs';

// Spec ci-log (ADR 0102): de pure delen van `pnpm pr:log <nummer>`, zonder netwerk.

const stempel = (n: number): string => `2026-11-21T10:48:${String(n % 60).padStart(2, '0')}.0000000Z `;
/** Een log van `aantal` regels `regel <i>`, met tijdstempels; op de indexen uit `fouten` een `##[error]`-regel. */
function log(aantal: number, fouten: readonly number[]): string {
  const regels = Array.from({ length: aantal }, (_, i) =>
    fouten.includes(i) ? `${stempel(i)}##[error]fout ${String(i)}` : `${stempel(i)}regel ${String(i)}`,
  );
  return `${String.fromCharCode(0xfeff)}${regels.join('\n')}`;
}
const kaal = (i: number, fouten: readonly number[]): string =>
  fouten.includes(i) ? `##[error]fout ${String(i)}` : `regel ${String(i)}`;
const bereik = (van: number, tot: number, fouten: readonly number[]): string[] =>
  Array.from({ length: tot - van + 1 }, (_, k) => kaal(van + k, fouten));

describe('ci-log/AC-1: argumenten', () => {
  test.each([[[]], [['0']], [['12', 'x']], [['abc']], [['-1']]])('ci-log/AC-1: %j geeft de gebruiksregel', (args) => {
    expect(() => argumenten(args)).toThrow('Gebruik: pnpm pr:log <nummer>');
  });

  test('ci-log/AC-1: één positief nummer', () => {
    expect(argumenten(['12'])).toBe(12);
  });
});

describe('ci-log/AC-2: rodeJobs', () => {
  test('ci-log/AC-2: alleen failure en timed_out blijven over', () => {
    const antwoord = {
      jobs: [
        { id: 1, name: 'a', conclusion: 'success' },
        { id: 2, name: 'b', conclusion: 'failure' },
        { id: 3, name: 'c', conclusion: 'timed_out' },
        { id: 4, name: 'd', conclusion: 'cancelled' },
        { id: 5, name: 'e', conclusion: null },
      ],
    };
    expect(rodeJobs(antwoord)).toStrictEqual([
      { id: 2, name: 'b', conclusion: 'failure' },
      { id: 3, name: 'c', conclusion: 'timed_out' },
    ]);
  });

  test('ci-log/AC-2: een onleesbaar antwoord gooit', () => {
    expect(() => rodeJobs({ jobs: 'x' })).toThrow('GitHub-jobs zijn niet leesbaar');
  });
});

describe('ci-log/AC-3: foutUittreksel, vensters', () => {
  test('ci-log/AC-3: twee fouten dicht bij elkaar geven één blok zonder tijdstempels en BOM', () => {
    const fouten = [30, 35];
    expect(foutUittreksel(log(50, fouten))).toStrictEqual(bereik(15, 35, fouten));
  });

  test('ci-log/AC-3: twee fouten ver uit elkaar geven twee blokken met … ertussen', () => {
    const fouten = [20, 60];
    expect(foutUittreksel(log(80, fouten))).toStrictEqual([...bereik(5, 20, fouten), '…', ...bereik(45, 60, fouten)]);
  });

  test('ci-log/AC-3: een fout aan het begin begint bij regel 0', () => {
    expect(foutUittreksel(log(10, [3]))).toStrictEqual(bereik(0, 3, [3]));
  });
});

describe('ci-log/AC-4: foutUittreksel, grenzen', () => {
  test('ci-log/AC-4: boven 120 regels de eerste 120 en een telregel', () => {
    const fouten = Array.from({ length: 30 }, (_, i) => 20 + i * 40);
    const uit = foutUittreksel(log(1300, fouten));
    const volledig = fouten.flatMap((f, i) => [...(i === 0 ? [] : ['…']), ...bereik(f - 15, f, fouten)]);
    expect(uit).toHaveLength(121);
    expect(uit.slice(0, 120)).toStrictEqual(volledig.slice(0, 120));
    expect(uit[120]).toBe(`… (${String(volledig.length - 120)} regels weggelaten)`);
  });

  test('ci-log/AC-4: zonder ##[error] de laatste 30 regels', () => {
    expect(foutUittreksel(log(100, []))).toStrictEqual(bereik(70, 99, []));
  });
});

describe('ci-log/AC-5: verslag', () => {
  test('ci-log/AC-5: twee rode jobs en een run die nog loopt', () => {
    const tekst = verslag({
      nummer: 12,
      sha: 'abc',
      jobs: [
        { run: 'ci', job: 'gate:fast', conclusion: 'failure', regels: ['##[error]x'] },
        { run: 'leerpunt-bewijs', job: 'leerpunt-bewijs', conclusion: 'timed_out', regels: ['y'] },
      ],
      bezig: 1,
    });
    expect(tekst).toBe(
      [
        'PR #12 · abc',
        '',
        '## ci / gate:fast (failure)',
        '##[error]x',
        '',
        '## leerpunt-bewijs / leerpunt-bewijs (timed_out)',
        'y',
        'Nog bezig: 1 run(s)',
      ].join('\n'),
    );
  });

  test('ci-log/AC-5: geen rode jobs', () => {
    expect(verslag({ nummer: 12, sha: 'abc', jobs: [], bezig: 0 })).toBe('PR #12 · abc\nGeen rode jobs op abc.');
  });
});

describe('ci-log/AC-2: rodeRuns', () => {
  test('ci-log/AC-2: rode en lopende runs, en het aantal dat nog loopt', () => {
    const antwoord = {
      workflow_runs: [
        { id: 1, name: 'ci', status: 'completed', conclusion: 'failure' },
        { id: 2, name: 'codeql', status: 'completed', conclusion: 'success' },
        { id: 3, name: 'osv', status: 'completed', conclusion: 'cancelled' },
        { id: 4, name: 'leerpunt', status: 'in_progress', conclusion: null },
      ],
    };
    expect(rodeRuns(antwoord)).toStrictEqual({
      runs: [
        { id: 1, name: 'ci' },
        { id: 4, name: 'leerpunt' },
      ],
      bezig: 1,
    });
  });
});

const REPO = 'eigenaar/repo';
const SHA = 'a'.repeat(40);
const PR = {
  number: 12,
  state: 'open',
  merged: false,
  base: { ref: 'main', repo: { full_name: REPO } },
  head: { ref: 'feat/x', sha: SHA, repo: { full_name: REPO } },
};

describe('ci-log/AC-6: leesPr met een nep-Api', () => {
  test('ci-log/AC-6: een rode en een lopende run met elk een rode job; alleen endpoints onder repos/<repo>/', () => {
    const gevraagd: string[] = [];
    const antwoorden: Record<string, unknown> = {
      [`repos/${REPO}/pulls/12`]: PR,
      [`repos/${REPO}/actions/runs?head_sha=${SHA}&per_page=100`]: {
        workflow_runs: [
          { id: 1, name: 'ci', status: 'completed', conclusion: 'failure' },
          { id: 2, name: 'leerpunt-bewijs', status: 'in_progress', conclusion: null },
        ],
      },
      [`repos/${REPO}/actions/runs/1/jobs?per_page=100`]: {
        jobs: [{ id: 11, name: 'gate:fast', conclusion: 'failure' }],
      },
      [`repos/${REPO}/actions/runs/2/jobs?per_page=100`]: {
        jobs: [
          { id: 21, name: 'bewijs', conclusion: 'timed_out' },
          { id: 22, name: 'nog', conclusion: null },
        ],
      },
    };
    const api = {
      json: (endpoint: string): unknown => {
        gevraagd.push(endpoint);
        return antwoorden[endpoint];
      },
      tekst: (endpoint: string): string => {
        gevraagd.push(endpoint);
        return endpoint.endsWith('/11/logs') ? 'x\n##[error]stuk' : 'klaar';
      },
    };
    expect(leesPr(api, { repository: REPO, nummer: 12 })).toBe(
      [
        `PR #12 · ${SHA}`,
        '',
        '## ci / gate:fast (failure)',
        'x',
        '##[error]stuk',
        '',
        '## leerpunt-bewijs / bewijs (timed_out)',
        'klaar',
        'Nog bezig: 1 run(s)',
      ].join('\n'),
    );
    expect(gevraagd.every((endpoint) => endpoint.startsWith(`repos/${REPO}/`))).toBe(true);
    expect(gevraagd).toHaveLength(6);
  });

  test('ci-log/AC-6: ghArgs geeft precies api en het endpoint', () => {
    expect(ghArgs('repos/x/y/pulls/1')).toStrictEqual(['api', 'repos/x/y/pulls/1']);
  });

  test('ci-log/AC-6: een Api die gooit, geeft de melding door', () => {
    const api = {
      json: (endpoint: string): unknown => {
        throw new Error(`GitHub is niet leesbaar: ${endpoint}`);
      },
      tekst: (): string => '',
    };
    expect(() => leesPr(api, { repository: REPO, nummer: 12 })).toThrow(
      `GitHub is niet leesbaar: repos/${REPO}/pulls/12`,
    );
  });
});

describe('ci-log/AC-3: aansluitende vensters', () => {
  test('ci-log/AC-3: een venster dat direct op het vorige aansluit, wordt één blok', () => {
    const fouten = [20, 36];
    expect(foutUittreksel(log(40, fouten))).toStrictEqual(bereik(5, 36, fouten));
  });
});

describe('ci-log/AC-6: maakApi en verkeerde vormen', () => {
  test('ci-log/AC-6: een exec die gooit of geen JSON geeft, wordt de melding met het endpoint', () => {
    const gooit = maakApi(() => {
      throw new Error('HTTP 401');
    });
    expect(() => gooit.tekst('repos/x/y/actions/jobs/1/logs')).toThrow(
      'GitHub is niet leesbaar: repos/x/y/actions/jobs/1/logs',
    );
    expect(() => maakApi(() => 'geen json').json('repos/x/y/pulls/1')).toThrow(
      'GitHub is niet leesbaar: repos/x/y/pulls/1',
    );
    expect(maakApi(() => '{"a":1}').json('repos/x/y/pulls/1')).toStrictEqual({ a: 1 });
  });

  test('ci-log/AC-6: runs met een verkeerde vorm geven de melding met het endpoint', () => {
    const endpoint = `repos/${REPO}/actions/runs?head_sha=${SHA}&per_page=100`;
    const api = {
      json: (gevraagd: string): unknown => (gevraagd === endpoint ? { workflow_runs: 'x' } : PR),
      tekst: (): string => '',
    };
    expect(() => leesPr(api, { repository: REPO, nummer: 12 })).toThrow(`GitHub is niet leesbaar: ${endpoint}`);
  });

  test('ci-log/AC-6: een kop die geen sha is, komt niet in een endpoint', () => {
    const gevraagd: string[] = [];
    const api = {
      json: (endpoint: string): unknown => {
        gevraagd.push(endpoint);
        return { ...PR, head: { ...PR.head, sha: 'abc&x=1' } };
      },
      tekst: (): string => '',
    };
    expect(() => leesPr(api, { repository: REPO, nummer: 12 })).toThrow(
      `GitHub is niet leesbaar: repos/${REPO}/pulls/12`,
    );
    expect(gevraagd).toStrictEqual([`repos/${REPO}/pulls/12`]);
  });
});

// Spec ci-bewijs AC-5 en AC-6: foutmarkeringen (vitest, Playwright, TAP) komen vooraan, vóór het bestaande uittreksel.
const ESC = String.fromCharCode(27);
const FAIL_ANSI = `${ESC}[31mFAIL${ESC}[39m  test/a.test.ts > x`;

/** Als `log()`, met per index een eigen regel (na de tijdstempel). */
function logMet(aantal: number, fouten: readonly number[], eigen: Readonly<Record<number, string>>): string {
  const regels = log(aantal, fouten)
    .slice(1)
    .split('\n')
    .map((regel, i) => {
      const vervangen = eigen[i];
      return vervangen === undefined ? regel : `${stempel(i)}${vervangen}`;
    });
  return `${String.fromCharCode(0xfeff)}${regels.join('\n')}`;
}
const venster = (
  reeks: readonly [number, number],
  fouten: readonly number[],
  eigen: Readonly<Record<number, string>>,
): string[] => bereik(reeks[0], reeks[1], fouten).map((regel, k) => eigen[reeks[0] + k] ?? regel);

describe('ci-bewijs/AC-5: foutmarkeringen vooraan', () => {
  test('ci-bewijs/AC-5: een FAIL-regel ver voor de ##[error] komt eerst, zonder tijdstempel en met ANSI-codes', () => {
    const fouten = [80];
    const eigen = { 10: FAIL_ANSI };

    expect(foutUittreksel(logMet(100, fouten, eigen))).toStrictEqual([FAIL_ANSI, '…', ...bereik(65, 80, fouten)]);
  });

  test('ci-bewijs/AC-5: een markering binnen het venster komt niet vooraan', () => {
    const fouten = [80];
    const eigen = { 70: FAIL_ANSI };

    expect(foutUittreksel(logMet(100, fouten, eigen))).toStrictEqual(venster([65, 80], fouten, eigen));
  });
});

describe('ci-bewijs/AC-6: grens van 20 markeringen en log zonder ##[error]', () => {
  test('ci-bewijs/AC-6: 30 markeringen geven de eerste 20, …, en het venster', () => {
    const eigen: Record<number, string> = {};
    for (let i = 0; i < 30; i++) eigen[10 + i] = `FAIL  test/t${String(i)}.test.ts > x`;
    const fouten = [200];

    const uit = foutUittreksel(logMet(210, fouten, eigen));

    expect(uit).toStrictEqual([
      ...Array.from({ length: 20 }, (_, i) => `FAIL  test/t${String(i)}.test.ts > x`),
      '…',
      ...bereik(185, 200, fouten),
    ]);
  });

  test('ci-bewijs/AC-6: zonder ##[error] komt een markering buiten de laatste 30 vooraan, een erin niet', () => {
    const eerste = '  1) [chromium] › e2e/a.spec.ts:3:1 › t';
    const eigen = { 4: eerste, 89: 'not ok 2 - x' };

    expect(foutUittreksel(logMet(100, [], eigen))).toStrictEqual([eerste, '…', ...venster([70, 99], [], eigen)]);
  });
});
