import { expect, test } from 'vitest';
import { invalidFileLimits } from '#core/shared/limits.ts';
import { FILE_LIMITS } from './limits.ts';

// Spec bestandsopslag, AC-6: de standaardwaarden van de app liggen binnen de harde grenzen uit core, ook met een adapter.
test('files/AC-6: FILE_LIMITS van de app is geldig met en zonder adapter', () => {
  expect(invalidFileLimits(FILE_LIMITS, { hasStorage: true })).toStrictEqual([]);
  expect(invalidFileLimits(FILE_LIMITS, { hasStorage: false })).toStrictEqual([]);
});
