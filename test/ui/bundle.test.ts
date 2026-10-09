import path from 'node:path';
import { build, type Rolldown } from 'vite';
import { describe, expect, test } from 'vitest';

// Wat alleen in dev bestaat (src/web/dev: catalogus, later de rolwisselaar), zit niet in de productiebundel
// (framework §6; devOnlyModules in vite.config.ts). Bouwt in het geheugen, schrijft niets.
const root = path.join(import.meta.dirname, '../..');

async function productionChunks(): Promise<string[]> {
  const result = await build({
    configFile: path.join(root, 'vite.config.ts'),
    mode: 'production',
    logLevel: 'silent',
    build: { write: false },
  });
  const outputs: Rolldown.RolldownOutput[] = Array.isArray(result) ? result : 'output' in result ? [result] : [];
  return outputs.flatMap((output) =>
    output.output.map((chunk) => (chunk.type === 'chunk' ? chunk.code : String(chunk.source))),
  );
}

describe('productiebundel', () => {
  test('bevat de catalogus uit src/web/dev niet', async () => {
    const bundle = (await productionChunks()).join('\n');

    expect(bundle).toContain('API-status');
    expect(bundle).not.toContain('Design system');
    expect(bundle).not.toContain('Dialoog openen');
  }, 30_000);
});
