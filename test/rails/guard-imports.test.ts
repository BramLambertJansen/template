import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { guardEntries, guardImportViolations } from '../../scripts/kit/guard-imports.mjs';

// Leerpunt #432: code die de guard (`.github/workflows/guard.yml`, zonder install, ADR 0045 punt 15–19) of een hook
// (`.claude/hooks`, `rails/hooks`, buiten node_modules om, R-ROL-09) draait, laadt alleen Node-builtins en eigen
// bestanden. Lokaal staat node_modules er wel, dus lint, typecheck en unit-tests zien het verschil niet.
const fixtures = path.join(import.meta.dirname, 'fixtures/guard-imports');

describe('ingangen', () => {
  test('komen uit de run-stappen van guard.yml en uit beide hookmappen', () => {
    expect(guardEntries(fixtures)).toEqual([
      '.claude/hooks/stub.mjs',
      'rails/hooks/haak.mjs',
      'scripts/kit/schoon.mjs',
      'scripts/kit/vuil.mjs',
    ]);
  });
});

describe('overtredingen in de fixtures', async () => {
  const violations = await guardImportViolations(fixtures);
  const byFrom = (from: string) => violations.filter((violation) => violation.from === from);

  test.each([
    ['scripts/kit/diep.mjs', 'typescript', 'npm-pakket'],
    ['rails/hooks/lib/dynamisch.mjs', 'vitest', 'npm-pakket'],
    ['rails/hooks/lib/vereist.mjs', 'typescript', 'npm-pakket'],
    ['rails/hooks/lib/vereist.mjs', 'module', 'node:module'],
    ['scripts/kit/onbekend.mjs', 'bestaat-niet-pakket', 'npm-pakket'],
  ])('%s → %s (%s)', (from, to, reason) => {
    expect(byFrom(from)).toContainEqual({ from, to, reason });
  });

  test('builtins, relatieve imports en onbereikbare bestanden tellen niet', () => {
    const files = new Set(violations.map((violation) => violation.from));
    for (const file of [
      'scripts/kit/schoon.mjs',
      'scripts/kit/hulp.mjs',
      'scripts/kit/vuil.mjs',
      'scripts/kit/los.mjs',
    ]) {
      expect(files.has(file), file).toBe(false);
    }
    expect(violations).toHaveLength(5);
  });
});

describe('deze repo', () => {
  test('heeft guard-jobs en hooks als ingang', () => {
    const entries = guardEntries(process.cwd());
    expect(entries).toContain('scripts/kit/check-document-status.mjs');
    expect(entries).toContain('scripts/kit/diff-guard.mjs');
    expect(entries).toContain('rails/hooks/rolhek.mjs');
    expect(entries).toContain('.claude/hooks/laden.mjs');
  });

  test('alles wat guard en hooks laden, gebruikt alleen Node-builtins en eigen bestanden', async () => {
    expect(await guardImportViolations(process.cwd())).toEqual([]);
  });
});
