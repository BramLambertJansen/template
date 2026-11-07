import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const startgids = readFileSync('START-NIEUWE-APP.md', 'utf8');
const platformkop = /^## Ondersteunde besturingssystemen$/m;

test('de startgids noemt welke besturingssystemen worden ondersteund', () => {
  const platforms = startgids.split(platformkop)[1]?.split(/^## /m)[0]?.replaceAll('**', '') ?? '';

  expect(platforms).toMatch(/\bUbuntu 24\.04\b/);
  expect(platforms).toMatch(/\bUbuntu 26\.04\b/);
  expect(platforms).toMatch(/\b(?:rechtstreeks|native)\b/);
  expect(platforms).toMatch(/\bWindows via WSL2\b/);
  expect(platforms).toMatch(/\bmacOS\b[^.!?]*\bbuiten de huidige ondersteuning\b/);
});

test('het platformoverzicht staat vóór de installatiestappen en is vindbaar vanuit de template-README', () => {
  const [inleiding = '', eersteSessie] = startgids.split(/^## Eerste agentsessie$/m);
  expect(eersteSessie, 'De sectie Eerste agentsessie ontbreekt').toBeDefined();
  expect(inleiding).toMatch(platformkop);

  const gates: unknown = JSON.parse(readFileSync('.claude/gates.json', 'utf8'));
  const isTemplate = typeof gates === 'object' && gates !== null && 'onderhoud' in gates;
  if (isTemplate) {
    const readme = readFileSync('README.md', 'utf8');
    expect(readme).toContain('](START-NIEUWE-APP.md#ondersteunde-besturingssystemen)');
  }
});
