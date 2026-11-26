// Leerpunt #866: bij weinig geheugen draait Vitest met minder workers, zodat web-tests minder geheugendruk krijgen.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { z } from 'zod';
import * as geheugen from '../../scripts/kit/geheugen.mjs';

const root = path.join(import.meta.dirname, '../..');

function workers(opties: { beperkt: boolean; cpus: number }): number {
  // Eerst een assertie: zo faalt de test op de basis, waar de export nog ontbreekt, niet op laden (leerlus-bewijs AC-3).
  expect(geheugen).toHaveProperty('vitestWorkers');
  return geheugen.vitestWorkers(opties);
}

test.each([
  { beperkt: true, cpus: 8, verwacht: 2 },
  { beperkt: true, cpus: 1, verwacht: 1 },
  { beperkt: false, cpus: 8, verwacht: 4 },
  { beperkt: false, cpus: 2, verwacht: 2 },
])('vitestWorkers beperkt=$beperkt cpus=$cpus geeft $verwacht', ({ beperkt, cpus, verwacht }) => {
  expect(workers({ beperkt, cpus })).toBe(verwacht);
});

test.each([{ beperkt: true }, { beperkt: false }])(
  "vitestWorkers beperkt=$beperkt met 0 cpu's geeft minstens 1 (ondergrens)",
  ({ beperkt }) => {
    expect(workers({ beperkt, cpus: 0 })).toBe(1);
  },
);

// Laadt vitest.config.ts in een apart proces met vast geheugen en vaste CPU-last (standaard 0) (zelfde opzet als test/scripts/browser-worker-budget.test.ts),
// zonder override uit de omgeving.
function maxWorkers(memoryGiB: number, last = 0) {
  const dir = mkdtempSync(path.join(tmpdir(), 'vitest-workers-'));
  try {
    const hook = path.join(dir, 'memory.mjs');
    writeFileSync(
      hook,
      `import os from 'node:os';
const bytes = ${String(memoryGiB)} * 1024 ** 3;
Object.defineProperty(process, 'availableMemory', { value: () => bytes });
Object.defineProperty(os, 'totalmem', { value: () => bytes });
Object.defineProperty(os, 'loadavg', { value: () => [${String(last)}, 0, 0] });`,
    );
    const script =
      "import config from './vitest.config.ts'; console.log(JSON.stringify({ maxWorkers: config.test?.maxWorkers ?? null }));";
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'GATE_WEINIG_GEHEUGEN'));
    const result = spawnSync(process.execPath, ['--import', hook, '--input-type=module', '-e', script], {
      cwd: root,
      encoding: 'utf8',
      env,
    });
    expect(result.status, result.stderr).toBe(0);
    return z.object({ maxWorkers: z.number().nullable() }).parse(JSON.parse(result.stdout)).maxWorkers;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('vitest.config.ts: weinig beschikbaar geheugen geeft hooguit twee workers', () => {
  expect(maxWorkers(1)).toBe(Math.max(1, Math.min(2, availableParallelism())));
});

test('vitest.config.ts: voldoende geheugen geeft hooguit vier workers, zoals voorheen', () => {
  expect(maxWorkers(64)).toBe(Math.max(1, Math.min(4, availableParallelism())));
});

test('vitest.config.ts: krap geheugen en hoge last geeft één worker', () => {
  expect(maxWorkers(1, availableParallelism())).toBe(1);
});
