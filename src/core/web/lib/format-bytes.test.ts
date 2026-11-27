import { describe, expect, test } from 'vitest';
import { format } from './format.ts';

// Spec files ("Opmaak"): format.bytes in src/core/web/lib/format.ts, veelvouden van 1024, eenheden B, KB, MB en GB,
// Nederlandse getalnotatie (komma) met hooguit één decimaal en zonder ",0". Geen AC van deel A; gebruikt door /bestanden (deel B).

describe('format.bytes (nl-NL)', () => {
  test.each([
    [10_485_760, '10 MB'],
    [1_572_864, '1,5 MB'],
    [900, '900 B'],
  ])('de voorbeelden uit de spec: %i is "%s"', (value, expected) => {
    expect(format.bytes(value)).toBe(expected);
  });

  test.each([
    [0, '0 B'],
    [1, '1 B'],
    [1024, '1 KB'],
    [1536, '1,5 KB'],
    [10_240, '10 KB'],
    [1_048_576, '1 MB'],
    [26_214_400, '25 MB'],
    [1_073_741_824, '1 GB'],
    [5_368_709_120, '5 GB'],
    [2_684_354_560, '2,5 GB'],
  ])('veelvouden van 1024 en de eenheden B, KB, MB en GB: %i is "%s"', (value, expected) => {
    expect(format.bytes(value)).toBe(expected);
  });

  test('een kilo is 1024, niet 1000: 1000 bytes blijft in B en 1024 is 1 KB', () => {
    expect(format.bytes(1000)).toMatch(/ B$/);
    expect(format.bytes(1024)).toBe('1 KB');
  });

  test('hooguit één decimaal, afgerond: 1,074 MB is "1,1 MB", 1,04 MB is "1 MB"', () => {
    expect(format.bytes(1_126_400)).toBe('1,1 MB');
    expect(format.bytes(1_090_519)).toBe('1 MB');
  });

  test.each([1, 700, 1500, 3000, 123_456, 1_090_519, 5_000_000, 77_777_777, 3_000_000_000])(
    'het patroon voor %i: een getal met hooguit één decimaal achter een komma, een spatie, een eenheid, nooit ",0"',
    (value) => {
      const text = format.bytes(value);

      expect(text).toMatch(/^\d+(,[1-9])? (B|KB|MB|GB)$/);
      expect(text).not.toContain(',0');
      expect(text).not.toContain('.');
    },
  );
});
