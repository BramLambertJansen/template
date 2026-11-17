import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const document = readFileSync(new URL('../../docs/nieuwe-app.md', import.meta.url), 'utf8');
const portsSection = document.split('### 7.1 Poorten en `.env.local`')[1]?.split('### 7.2')[0] ?? '';

test('de poortpreflight controleert database, mail, API en web vóór een tweede app start', () => {
  const pattern = /grep -E '([^']+)'/.exec(portsSection)?.[1];
  expect(pattern).toBeDefined();
  const expression = new RegExp(pattern ?? '(?!)');
  for (const port of [54322, 54324, 54325, 8787, 5173]) expect(`127.0.0.1:${String(port)}`).toMatch(expression);
  expect('127.0.0.1:51730').not.toMatch(expression);
});
