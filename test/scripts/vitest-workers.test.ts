// Leerpunt #866: bij weinig geheugen draait Vitest met minder workers, zodat web-tests niet op hun limiet van 5 s aflopen.
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import * as geheugen from '../../scripts/kit/geheugen.mjs';
import { unsafeCast } from '../../src/core/shared/unsafe-cast.ts';

type VitestWorkers = (opties: { beperkt: boolean; cpus: number }) => number;

function workers(opties: { beperkt: boolean; cpus: number }): number {
  expect(geheugen).toHaveProperty('vitestWorkers');
  expect(typeof Reflect.get(geheugen, 'vitestWorkers')).toBe('function');
  const functie = unsafeCast<VitestWorkers>(
    Reflect.get(geheugen, 'vitestWorkers'),
    'test: export bestaat nog niet op de basis, eerst gecontroleerd',
  );
  return functie(opties);
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

test('vitest.config.ts gebruikt vitestWorkers en weinigGeheugen', () => {
  const tekst = readFileSync(new URL('../../vitest.config.ts', import.meta.url), 'utf8');
  expect(tekst).toContain('vitestWorkers');
  expect(tekst).toContain('weinigGeheugen');
});
