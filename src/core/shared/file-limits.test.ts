import { describe, expect, test } from 'vitest';
import {
  invalidFileLimits,
  MAX_FILE_BYTES,
  MAX_FILE_URL_TTL_SECONDS,
  MAX_FILENAME_LENGTH,
  STORAGE_CALL_TIMEOUT_MS,
  type FileLimits,
} from './limits.ts';

// Spec files, AC-6: invalidFileLimits(limits, { hasStorage }) geeft de namen van de foute sleutels (leeg = goed); createApp
// gebruikt het voor zijn melding. Plus de vaste waarden van de harde grenzen uit de spec ("Grenzen", OV-22).

const GOED: FileLimits = {
  maxBytes: 10_485_760,
  allowedTypes: ['application/pdf'],
  uploadUrlTtlSeconds: 300,
  downloadUrlTtlSeconds: 60,
  pendingTtlSeconds: 86_400,
  maxPerUser: 100,
  pageSize: 25,
};

describe('files/AC-6: invalidFileLimits', () => {
  test('files/AC-6: de harde grenzen hebben de waarden uit de spec', () => {
    expect([MAX_FILE_BYTES, MAX_FILE_URL_TTL_SECONDS, MAX_FILENAME_LENGTH, STORAGE_CALL_TIMEOUT_MS]).toStrictEqual([
      26_214_400, 900, 255, 5000,
    ]);
  });

  test.each([true, false])('files/AC-6: geldige waarden geven [] (hasStorage %s)', (hasStorage) => {
    expect(invalidFileLimits(GOED, { hasStorage })).toStrictEqual([]);
  });

  test('files/AC-6: elke waarde boven een harde grens wordt bij naam genoemd', () => {
    const limits = {
      ...GOED,
      maxBytes: MAX_FILE_BYTES + 1,
      uploadUrlTtlSeconds: MAX_FILE_URL_TTL_SECONDS + 1,
      downloadUrlTtlSeconds: MAX_FILE_URL_TTL_SECONDS + 1,
    };

    expect(invalidFileLimits(limits, { hasStorage: true })).toEqual(
      expect.arrayContaining(['maxBytes', 'uploadUrlTtlSeconds', 'downloadUrlTtlSeconds']),
    );
  });

  test('files/AC-6: pendingTtlSeconds gelijk aan uploadUrlTtlSeconds noemt pendingTtlSeconds', () => {
    expect(invalidFileLimits({ ...GOED, pendingTtlSeconds: GOED.uploadUrlTtlSeconds }, { hasStorage: true })).toContain(
      'pendingTtlSeconds',
    );
  });

  test('files/AC-6: een lege allowedTypes noemt allowedTypes alleen met een adapter', () => {
    expect(invalidFileLimits({ ...GOED, allowedTypes: [] }, { hasStorage: true })).toStrictEqual(['allowedTypes']);
    expect(invalidFileLimits({ ...GOED, allowedTypes: [] }, { hasStorage: false })).toStrictEqual([]);
  });
});
