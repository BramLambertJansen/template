import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { meContract } from '../../src/shared/contracts/me.ts';

test('het rollenrecept noemt de vereiste permissie voor inloggen via de webapp', () => {
  const guide = readFileSync('docs/gouden-pad.md', 'utf8');
  const recipe = guide.split('## Een rol toevoegen of weghalen')[1]?.split('\n## ')[0];
  const permissions = recipe?.split('**Permissies**')[1]?.split('\n4.')[0];
  expect(permissions).toContain(meContract.permission);
  expect(permissions).toMatch(/webapp/i);
});
