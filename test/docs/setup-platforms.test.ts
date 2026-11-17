import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const startgids = readFileSync('START-NIEUWE-APP.md', 'utf8');
const platformkop = /^## Ondersteunde besturingssystemen$/m;

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
