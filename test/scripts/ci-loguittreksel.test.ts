import { describe, expect, test } from 'vitest';
import { argumenten, foutUittreksel, rodeJobs, verslag } from '../../scripts/kit/pr-log.mjs';

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
