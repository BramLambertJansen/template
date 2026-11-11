import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

// tests-naar-vermogen/AC-6, tak "kooi werkt": lokaal slaan tests over terwijl de kooi wél start. Dan volgt nog steeds één
// ⚠-regel, maar zonder de kooireden. De uitslag van de kooi staat in de fixtureconfig vast (`provide: { kooi }`, de vorm
// die test/setup/vermogen.ts levert), zodat de test overal hetzelfde meet. Zelfde opzet als vermogen-reporter.test.ts.
const ROOT = path.resolve(import.meta.dirname, '..', '..');
const VITEST = path.join(ROOT, 'node_modules', 'vitest', 'vitest.mjs');
const REPORTER = path.join(ROOT, 'test', 'setup', 'skip-reporter.ts');
const CI_NAMEN = ['CI', 'GITHUB_ACTIONS'];

let map = '';

const CONFIG = `export default {
  test: {
    reporters: ['default', ${JSON.stringify(REPORTER)}],
    globals: true,
    projects: [
      {
        test: {
          name: 'unit',
          include: ['*.test.ts'],
          provide: { kooi: { soort: 'goed', melding: 'goed' } },
        },
      },
    ],
  },
};
`;

beforeAll(() => {
  map = mkdtempSync(path.join(tmpdir(), 'vermogen-reporter-kooi-goed-'));
  writeFileSync(path.join(map, 'unit.config.mjs'), CONFIG);
  writeFileSync(
    path.join(map, 'skip.test.ts'),
    "test.skip('slaat over', () => {});\ntest.todo('nog te doen');\ntest.skip('slaat ook over', () => {});\ntest('draait', () => { expect(1).toBe(1); });\n",
  );
});

afterAll(() => {
  rmSync(map, { recursive: true, force: true });
});

function draai(bestand: string) {
  const schoon = Object.fromEntries(Object.entries(process.env).filter(([naam]) => !CI_NAMEN.includes(naam)));
  const r = spawnSync(
    process.execPath,
    [VITEST, 'run', '--root', map, '--config', path.join(map, 'unit.config.mjs'), '--no-color', bestand],
    { cwd: map, encoding: 'utf8', env: { ...schoon, CI: '', GITHUB_ACTIONS: '' }, timeout: 60_000 },
  );
  return { code: r.status, uit: `${r.stdout}\n${r.stderr}` };
}

const regels = (uit: string, begin: string) =>
  uit
    .split('\n')
    .map((r) => r.trim())
    .filter((r) => r.startsWith(begin));

describe('reporter lokaal met werkende kooi (AC-6)', () => {
  test('AC-6: kooi goed en tests overgeslagen: exitcode 0 en één ⚠-regel zonder kooireden', () => {
    const { code, uit } = draai('skip.test.ts');

    expect(code, uit).toBe(0);
    expect(regels(uit, '⚠ ')).toStrictEqual([
      '⚠ overgeslagen: 3 tests; ze draaien in CI, waar overslaan rood is (ADR 0088)',
    ]);
    expect(uit).not.toContain('want de kooi kan hier niet starten');
    expect(uit).not.toContain('✗ overgeslagen in CI');
  });
});
