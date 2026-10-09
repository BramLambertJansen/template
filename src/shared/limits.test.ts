import { expect, test } from 'vitest';
import { MAX_PAGE_SIZE } from '#core/shared/limits.ts';
import { APP_LIMITS } from './limits.ts';

test('geen app-grens boven de harde grens uit core (ADR 0008)', () => {
  expect(APP_LIMITS.ACCOUNTS_PAGE_SIZE).toBeLessThanOrEqual(MAX_PAGE_SIZE);
});
