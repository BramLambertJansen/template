import { cpSync, mkdtempSync, readdirSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { adapterFouten } from '../../scripts/kit/check-storage-adapters.mjs';

// Spec files, AC-30 (tweede deel): `pnpm check:storage-adapters` faalt voor een defineFileStorage-adapter zonder testbestand
// dat fileStorageContract op die adapter draait. De fixture-repo's staan in test/rails/fixtures/storage-adapters/<geval>/ als
// bestanden met de extensie .fixture (zodat ze niet in typecheck, lint of depcruise komen); elke test kopieert er één naar een
// tijdelijke map onder TMPDIR (test/setup/tmp-root.ts ruimt op) en haalt de extensie weg. Wat de check meldt (de naam
// adapterFouten, bronbestand en het woord fileStorageContract) staat in de koppelnotitie van deel A.

const repo = path.join(import.meta.dirname, '../..');
const FIXTURES = path.join(import.meta.dirname, 'fixtures/storage-adapters');
const SUITE = 'fileStorageContract';
const ADAPTER = 'src/api/storage/mijn-adapter.ts';

function fixtureRoot(geval: string): string {
  const root = mkdtempSync(path.join(tmpdir(), 'check-storage-adapters-'));
  cpSync(path.join(FIXTURES, geval), root, { recursive: true });
  for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.fixture')) continue;
    const file = path.join(entry.parentPath, entry.name);
    renameSync(file, file.slice(0, -'.fixture'.length));
  }
  return root;
}

describe('files/AC-30: een adapter zonder suite faalt', () => {
  test('files/AC-30: een defineFileStorage-adapter zonder testbestand faalt met het bronbestand en fileStorageContract', () => {
    const errors = adapterFouten(fixtureRoot('zonder-suite'));

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(ADAPTER);
    expect(errors[0]).toContain(SUITE);
  });

  test('files/AC-30: een suite op een andere adapter telt niet voor deze adapter', () => {
    const errors = adapterFouten(fixtureRoot('suite-op-andere-adapter'));

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(ADAPTER);
    expect(errors[0]).toContain(SUITE);
    expect(errors[0]).not.toContain('andere-adapter.ts');
  });

  test('files/AC-30: defineFileStorage via een re-export onder een andere naam wordt toch gevonden en faalt zonder suite', () => {
    const errors = adapterFouten(fixtureRoot('re-export-andere-naam'));

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(ADAPTER);
    expect(errors[0]).toContain(SUITE);
  });

  test('files/AC-30: defineFileStorage via een import-alias wordt toch gevonden en faalt zonder suite', () => {
    const errors = adapterFouten(fixtureRoot('import-alias'));

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(ADAPTER);
    expect(errors[0]).toContain(SUITE);
  });
});

describe('files/AC-30: de check is niet te ontwijken', () => {
  test.each([
    ['een namespace-import (import * as storage; storage.defineFileStorage)', 'namespace-import'],
    ['een barrel met export * die de poort doorgeeft', 'barrel-export-star'],
    ['een destructurering van een namespace-import (const { defineFileStorage: d } = s)', 'destructurering'],
    ['een eigen fileStorageContract in een helperbestand dat de adapter "dekt"', 'nep-contract'],
    [
      'een suite die de adapter alleen als argument noemt (de suite draait op een andere adapter)',
      'suite-alleen-argument',
    ],
  ])('files/AC-30: %s faalt met het adapterbestand en fileStorageContract', (_, geval) => {
    const errors = adapterFouten(fixtureRoot(geval));

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(ADAPTER);
    expect(errors[0]).toContain(SUITE);
  });
});

describe('files/AC-30: nog meer manieren om de check te ontwijken', () => {
  test.each([
    ['een alias-variabele (const define = storage.defineFileStorage)', 'alias-variabele'],
    ["een element-access (storage['defineFileStorage'](…))", 'element-access'],
    ['een komma-aanroep ((0, storage.defineFileStorage)(…))', 'comma-aanroep'],
    ['een aanroep via .call(undefined, …)', 'call-aanroep'],
    [
      'een fabriek waarvan de suite de fabriek aanroept maar een andere gedekte adapter teruggeeft',
      'fabriek-andere-storage',
    ],
    [
      'een suite waarin storage: mijnAdapter in een object staat dat de setup niet teruggeeft',
      'object-niet-teruggegeven',
    ],
  ])('files/AC-30: %s faalt met het adapterbestand en fileStorageContract', (_, geval) => {
    const errors = adapterFouten(fixtureRoot(geval));

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(ADAPTER);
    expect(errors[0]).toContain(SUITE);
  });

  test('files/AC-30: een fabriek met een suite waarvan de setup (blok-body) de fabriek aanroept en die storage teruggeeft, geeft []', () => {
    expect(adapterFouten(fixtureRoot('fabriek-blok-body'))).toStrictEqual([]);
  });
});

describe('files/AC-30: de check scant ook deploy/', () => {
  test('files/AC-30: een adapter in deploy/mijnhost/opslag.ts met een suite in deploy/mijnhost/opslag.test.ts geeft []', () => {
    expect(adapterFouten(fixtureRoot('deploy-met-suite'))).toStrictEqual([]);
  });

  test('files/AC-30: dezelfde adapter zonder suite faalt met het bronbestand en fileStorageContract', () => {
    const errors = adapterFouten(fixtureRoot('deploy-zonder-suite'));

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('deploy/mijnhost/opslag.ts');
    expect(errors[0]).toContain(SUITE);
  });
});

describe('files/AC-30: een adapter met suite slaagt', () => {
  test('files/AC-30: een adapter met een testbestand dat fileStorageContract op hem draait geeft []', () => {
    expect(adapterFouten(fixtureRoot('met-suite'))).toStrictEqual([]);
  });

  test('files/AC-30: een suite die de adapter via een re-export importeert telt (de import wordt tot de bron gevolgd)', () => {
    expect(adapterFouten(fixtureRoot('suite-via-reexport'))).toStrictEqual([]);
  });

  test('files/AC-30: een suite met fileStorageContractCases telt ook', () => {
    expect(adapterFouten(fixtureRoot('suite-met-cases'))).toStrictEqual([]);
  });

  test('files/AC-30: defineFileStorage in een testbestand is geen adapter en geeft []', () => {
    expect(adapterFouten(fixtureRoot('alleen-in-testbestand'))).toStrictEqual([]);
  });

  test('files/AC-30: een lege repo geeft []', () => {
    expect(adapterFouten(mkdtempSync(path.join(tmpdir(), 'check-storage-adapters-leeg-')))).toStrictEqual([]);
  });

  test('files/AC-30: de echte repo geeft []', () => {
    expect(adapterFouten(repo)).toStrictEqual([]);
  });
});
