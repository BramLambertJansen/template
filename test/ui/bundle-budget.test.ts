import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { build, type Rolldown } from 'vite';
import { expect, test } from 'vitest';

// Bundelbudget (roadmap stuk 4): de productiebundel groeit niet ongemerkt. Gemeten met gzip, zoals een browser hem ophaalt.
// Bij invoering (2026-10-10): JS 209,8 kB, grootste chunk 91,7 kB, CSS 5,1 kB; het budget is dat plus ongeveer 25%.
// Ophogen is een wijziging van deze (beschermde) test: met reden in de PR.
const BUDGET_KB = { js: 260, grootsteChunk: 115, css: 15 } as const;
const root = path.join(import.meta.dirname, '../..');

async function productionAssets(): Promise<{ name: string; gzipKb: number }[]> {
  const result = await build({
    configFile: path.join(root, 'vite.config.ts'),
    mode: 'production',
    logLevel: 'silent',
    build: { write: false },
    // Vitest zet NODE_ENV=test; zonder dit meet de test de ontwikkelversie van React.
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  });
  const outputs: Rolldown.RolldownOutput[] = Array.isArray(result) ? result : 'output' in result ? [result] : [];
  return outputs.flatMap((output) =>
    output.output.map((asset) => ({
      name: asset.fileName,
      gzipKb: gzipSync(asset.type === 'chunk' ? asset.code : asset.source).length / 1024,
    })),
  );
}

test('de productiebundel blijft binnen het budget', async () => {
  const assets = await productionAssets();
  const js = assets.filter((asset) => asset.name.endsWith('.js'));
  const css = assets.filter((asset) => asset.name.endsWith('.css'));
  const sum = (list: readonly { gzipKb: number }[]) => list.reduce((total, asset) => total + asset.gzipKb, 0);
  const largest = js.reduce((max, asset) => (asset.gzipKb > max.gzipKb ? asset : max), { name: '-', gzipKb: 0 });

  expect(js.length).toBeGreaterThan(0);
  expect(sum(js), 'JS totaal (kB gzip)').toBeLessThanOrEqual(BUDGET_KB.js);
  expect(largest.gzipKb, `grootste chunk ${largest.name} (kB gzip)`).toBeLessThanOrEqual(BUDGET_KB.grootsteChunk);
  expect(sum(css), 'CSS totaal (kB gzip)').toBeLessThanOrEqual(BUDGET_KB.css);
}, 30_000);
