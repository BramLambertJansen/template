import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { STANDAARD_POORTEN } from '../../scripts/kit/nieuwe-app.mjs';

const document = readFileSync(new URL('../../docs/nieuwe-app.md', import.meta.url), 'utf8');
const portsSection = document.split('### 7.1 Poorten en `.env.local`')[1]?.split('### 7.2')[0] ?? '';

// Sinds spec nieuwe-app-script (AC-15) doet het setupscript de poortcontrole en niet meer een grep in het playbook: het
// playbook verwijst naar `poorten`, en het script bewaakt database, mail (twee poorten), API en web.
test('de poortpreflight controleert database, mail, API en web vóór een tweede app start', () => {
  expect(portsSection).toContain('scripts/kit/nieuwe-app.mjs poorten');
  expect(Object.values(STANDAARD_POORTEN).toSorted((a, b) => a - b)).toStrictEqual([5173, 8787, 54322, 54324, 54325]);
});
