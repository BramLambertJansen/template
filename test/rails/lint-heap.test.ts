import { readFile } from 'node:fs/promises';
import { describe, expect, test } from 'vitest';
import { z } from 'zod';

// ESLint met getypeerde regels piekt boven de standaardheap van Node (gemeten 19 november 2026: 2379 MB tegen een limiet
// van 2144 MB in een cloudsessie). Daarom geven lint en lint:prune ESLint zelf een grotere heap mee, als vlag
// van node en niet via NODE_OPTIONS: zo geldt hij alleen voor ESLint, blijft de NODE_OPTIONS van de gebruiker staan en
// werkt het ook in een shell zonder inline env-toewijzing.
const ESLINT = 'node --max-old-space-size=4096 node_modules/eslint/bin/eslint.js .';

async function scripts() {
  const pakket = z
    .object({ scripts: z.record(z.string(), z.string()) })
    .parse(JSON.parse(await readFile('package.json', 'utf8')));
  return pakket.scripts;
}

describe('heap van ESLint in package.json', () => {
  test('lint draait ESLint met een heap van 4096 MB', async () => {
    expect((await scripts())['lint']).toBe(`${ESLINT} --max-warnings 0`);
  });

  test('lint:prune draait ESLint met dezelfde heap', async () => {
    expect((await scripts())['lint:prune']).toBe(`${ESLINT} --prune-suppressions`);
  });
});
