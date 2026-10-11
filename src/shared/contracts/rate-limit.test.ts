import { expect, test } from 'vitest';
import { rateLimitCategory } from '#core/shared/contract.ts';
import { contracts } from './index.ts';

// Spec rate-limit: routes die mail versturen zijn `duur`; de rest volgt de standaard per methode.
test('rate limit per contract: uitnodigen en opnieuw uitnodigen zijn duur, lezen is lezen', () => {
  expect(Object.fromEntries(contracts.map((c) => [`${c.method} ${c.path}`, rateLimitCategory(c)]))).toStrictEqual({
    'GET /me': 'lezen',
    'GET /accounts': 'lezen',
    'POST /accounts/invite': 'duur',
    'POST /accounts/:id/reinvite': 'duur',
  });
});
