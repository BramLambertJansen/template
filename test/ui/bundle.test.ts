import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { build, type Rolldown } from 'vite';
import { describe, expect, test } from 'vitest';
import { bundleBudgetKb } from '../../src/web/bundle-budget.ts';

// Wat alleen in dev bestaat (src/web/dev: de rolwisselaar), zit niet in de productiebundel
// (framework §6; devOnlyModules in vite.config.ts). Bouwt in het geheugen, schrijft niets.
const root = path.join(import.meta.dirname, '../..');

type Chunk = { code: string; isEntry: boolean };

// Eén productiebuild voor alle tests in dit bestand.
let built: Promise<Chunk[]> | undefined;

async function buildChunks(): Promise<Chunk[]> {
  const result = await build({
    configFile: path.join(root, 'vite.config.ts'),
    mode: 'production',
    logLevel: 'silent',
    build: { write: false },
  });
  const outputs: Rolldown.RolldownOutput[] = Array.isArray(result) ? result : 'output' in result ? [result] : [];
  return outputs.flatMap((output) =>
    output.output.map((chunk) =>
      chunk.type === 'chunk'
        ? { code: chunk.code, isEntry: chunk.isEntry }
        : { code: String(chunk.source), isEntry: false },
    ),
  );
}

function productionChunks(): Promise<Chunk[]> {
  built ??= buildChunks();
  return built;
}

describe('productiebundel', () => {
  test('bevat de rolwisselaar uit src/web/dev niet (spec accounts/AC-8)', async () => {
    const bundle = (await productionChunks()).map((chunk) => chunk.code).join('\n');

    expect(bundle).toContain('Inloggen');
    expect(bundle).not.toContain('Lokaal inloggen als');
    expect(bundle).not.toContain('Rol wisselen (alleen lokaal)');
  }, 30_000);

  test('bevat de catalogus ("Dialoog openen") in een andere chunk dan de entry-chunk (spec design-system/AC-6)', async () => {
    const chunks = await productionChunks();

    const withCatalogue = chunks.filter((chunk) => chunk.code.includes('Dialoog openen'));
    expect(withCatalogue.length).toBeGreaterThan(0);
    expect(withCatalogue.filter((chunk) => chunk.isEntry)).toStrictEqual([]);
    expect(chunks.some((chunk) => chunk.isEntry)).toBe(true);
  }, 30_000);

  // TopbarShell zit in de startbundel (AppLayout kan hem op /design-system renderen, spec schillen); de catalogus blijft lazy.
  test('schillen/AC-17: de entry-chunk bevat de catalogus niet en past binnen het entrybudget', async () => {
    const entries = (await productionChunks()).filter((chunk) => chunk.isEntry);
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) expect(entry.code).not.toContain('Dialoog openen');
    const entryKb = entries.reduce((sum, entry) => sum + gzipSync(entry.code).length, 0) / 1024;
    expect(entryKb).toBeLessThanOrEqual(bundleBudgetKb.entry);
  }, 30_000);
});
