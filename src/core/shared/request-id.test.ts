import { describe, expect, test } from 'vitest';
import { MAX_REQUEST_ID_LENGTH } from './limits.ts';
import { safeRequestId } from './request-id.ts';

describe('safeRequestId', () => {
  test('foutreferentie/AC-4: 64 tekens en 1 teken komen ongewijzigd terug; 0 en 65 tekens geven null', () => {
    expect(MAX_REQUEST_ID_LENGTH).toBe(64);
    const max = `${'aZ09_-'.repeat(10)}abcd`;
    expect(max).toHaveLength(64);
    expect(safeRequestId(max)).toBe(max);
    expect(safeRequestId('x')).toBe('x');
    expect(safeRequestId('')).toBeNull();
    expect(safeRequestId(`${max}e`)).toBeNull();
  });

  test('foutreferentie/AC-4: een UUID voldoet; andere tekens of typen niet', () => {
    expect(safeRequestId('3f6c2a9e-1b4d-4c8e-9a7f-2d5e8b1c0a64')).toBe('3f6c2a9e-1b4d-4c8e-9a7f-2d5e8b1c0a64');
    for (const value of ['a b', '<script>', 'a/b', 'a\nb', "a'b", 'aé', 42, null, undefined, {}, ['a']]) {
      expect(safeRequestId(value)).toBeNull();
    }
  });
});
