import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

const root = path.join(import.meta.dirname, '../..');

// Leerpunt #752: deze modules leveren hun overtredingen aan de ratchet, die met .kit/baseline.json vergelijkt.
// Los gedraaid gaven ze geen uitvoer en exit 0 (stil groen); nu verwijzen ze naar de gate, zoals check-docs (#751).
describe.each(['conflictmarkers', 'depcruise', 'onderdrukkingen', 'ac-toets'])('%s los gedraaid', (naam) => {
  test('geeft geen groen maar verwijst naar pnpm ratchet', () => {
    const result = spawnSync(process.execPath, [`scripts/kit/${naam}.mjs`], { cwd: root, encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('pnpm ratchet');
  });

  test('noemt de eigen naam in de melding', () => {
    const result = spawnSync(process.execPath, [`scripts/kit/${naam}.mjs`], { cwd: root, encoding: 'utf8' });
    expect(result.stderr).toContain(naam);
  });
});

// De exports blijven gelijk en importeren geeft geen melding of exitcode (de ratchet importeert ze).
describe('importeren door de ratchet', () => {
  test.each([
    ['conflictmarkers', ['markerRegels', 'conflictMarkerViolations']],
    ['depcruise', ['dependencyViolations']],
    ['onderdrukkingen', ['onderdrukkingViolations', 'onderdrukkingMeldingen', 'onderdrukkingenUitGit']],
    ['ac-toets', ['acItems', 'geldigeToets', 'acToetsUitGit', 'acToetsMeldingen']],
  ])('%s importeren blijft stil met exit 0 en behoudt zijn exports', (naam, exports) => {
    const script = `const m = await import('./scripts/kit/${naam}.mjs'); console.log(JSON.stringify(${JSON.stringify(exports)}.filter((e) => typeof m[e] !== 'function')));`;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: root, encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout.trim()).toBe('[]');
  });
});
