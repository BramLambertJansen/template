import { afterEach, describe, expect, test, vi } from 'vitest';
import { format } from './format.ts';

// Spec relatieve-tijd: vaste referentietijd, verschil `d` in seconden ten opzichte van `now` (negatief = verleden).
const NOW = new Date('2026-11-13T10:00:00Z');
const MINUTE = 60;
const HOUR = 3600;
const DAY = 86_400;

function at(seconds: number): string {
  return new Date(NOW.getTime() + seconds * 1000).toISOString();
}

afterEach(() => {
  vi.useRealTimers();
});

describe('format.relative (nl-NL, numeric auto)', () => {
  const table: readonly (readonly [number, string])[] = [
    [0, 'nu'],
    [59, 'nu'],
    [-59, 'nu'],
    [-60, '1 minuut geleden'],
    [-180, '3 minuten geleden'],
    [300, 'over 5 minuten'],
    [-3600, '1 uur geleden'],
    [-(23 * HOUR + 59 * MINUTE), '23 uur geleden'],
    [2 * HOUR, 'over 2 uur'],
    [-DAY, 'gisteren'],
    [DAY, 'morgen'],
    [-2 * DAY, 'eergisteren'],
    [2 * DAY, 'overmorgen'],
    [3 * DAY, 'over 3 dagen'],
    [-6 * DAY, '6 dagen geleden'],
    [-7 * DAY, 'vorige week'],
    [7 * DAY, 'volgende week'],
    [14 * DAY, 'over 2 weken'],
    [-29 * DAY, '4 weken geleden'],
    [-30 * DAY, 'vorige maand'],
    [30 * DAY, 'volgende maand'],
    [-364 * DAY, '12 maanden geleden'],
    [-365 * DAY, 'vorig jaar'],
    [365 * DAY, 'volgend jaar'],
    [-3 * 365 * DAY, '3 jaar geleden'],
  ];

  test.each(table)('relatieve-tijd/AC-1: d = %i s geeft %s', (seconds, text) => {
    expect(format.relative(at(seconds), NOW)).toBe(text);
  });

  const boundaries: readonly (readonly [number, string, string])[] = [
    [59, 'nu', 'nu'],
    [60, '1 minuut geleden', 'over 1 minuut'],
    [3599, '59 minuten geleden', 'over 59 minuten'],
    [3600, '1 uur geleden', 'over 1 uur'],
    [86_399, '23 uur geleden', 'over 23 uur'],
    [86_400, 'gisteren', 'morgen'],
    [604_799, '6 dagen geleden', 'over 6 dagen'],
    [604_800, 'vorige week', 'volgende week'],
    [2_591_999, '4 weken geleden', 'over 4 weken'],
    [2_592_000, 'vorige maand', 'volgende maand'],
    [31_535_999, '12 maanden geleden', 'over 12 maanden'],
    [31_536_000, 'vorig jaar', 'volgend jaar'],
  ];

  test.each(boundaries)('relatieve-tijd/AC-2: grens %i s in verleden en toekomst', (seconds, past, future) => {
    expect(format.relative(at(-seconds), NOW)).toBe(past);
    expect(format.relative(at(seconds), NOW)).toBe(future);
  });

  test('relatieve-tijd/AC-3: kapt af richting nul, nooit naar boven afronden', () => {
    expect(format.relative(at(-89 * MINUTE), NOW)).toBe('1 uur geleden');
    expect(format.relative(at(-47 * HOUR), NOW)).toBe('gisteren');
    expect(format.relative(at(-13 * DAY), NOW)).toBe('vorige week');
  });

  test('relatieve-tijd/AC-4: gelijk aan now of een paar seconden ervoor of erna is altijd "nu"', () => {
    expect(format.relative(NOW.toISOString(), NOW)).toBe('nu');
    expect(format.relative(at(3), NOW)).toBe('nu');
    expect(format.relative(at(-3), NOW)).toBe('nu');
    expect(format.relative(at(0.4), NOW)).toBe('nu');
    expect(format.relative(at(-0.4), NOW)).toBe('nu');
  });

  test('relatieve-tijd/AC-5: ongeldige iso of now gooit een duidelijke fout', () => {
    expect(() => format.relative('gisteren', NOW)).toThrow("format: geen geldige ISO-tijd: 'gisteren'");
    expect(() => format.relative(NOW.toISOString(), new Date('x'))).toThrow('format: geen geldig referentietijdstip');
  });

  test('relatieve-tijd/AC-6: de uitvoer hangt niet af van de systeemklok', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2020-01-01T00:00:00Z'));
    const first = format.relative(at(-180), NOW);
    vi.setSystemTime(new Date('2031-06-30T12:00:00Z'));
    expect(format.relative(at(-180), NOW)).toBe(first);
    expect(first).toBe('3 minuten geleden');
  });
});
