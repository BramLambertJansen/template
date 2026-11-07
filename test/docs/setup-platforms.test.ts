import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

test('de startgids noemt vóór de installatiestappen welke besturingssystemen worden ondersteund', () => {
  const startgids = readFileSync('START-NIEUWE-APP.md', 'utf8');
  const inleiding = startgids.split(/^## Eerste agentsessie$/m)[0];
  const platforms =
    inleiding?.split(/^## Ondersteunde besturingssystemen$/m)[1]?.split(/^## /m)[0]?.replaceAll('**', '') ?? '';

  expect(platforms).toMatch(/\bUbuntu 24\.04\b/);
  expect(platforms).toMatch(/\bUbuntu 26\.04\b/);
  expect(platforms).toMatch(/\b(?:rechtstreeks|native)\b/);
  expect(platforms).toMatch(/\bWindows via WSL2\b/);
  expect(platforms).toMatch(/\bmacOS\b[^.!?]*\bbuiten de huidige ondersteuning\b/);
});

test('de README linkt rechtstreeks naar het platformoverzicht in de startgids', () => {
  const readme = readFileSync('README.md', 'utf8');
  expect(readme).toContain('](START-NIEUWE-APP.md#ondersteunde-besturingssystemen)');
});
