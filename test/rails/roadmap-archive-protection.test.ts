import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

test('CODEOWNERS spiegelt de bescherming van het roadmaparchief', () => {
  expect(readFileSync('.github/CODEOWNERS', 'utf8')).toMatch(/^\/docs\/roadmap-archief\.md\s+@\S+/m);
});
