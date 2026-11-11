import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

// tests-naar-vermogen/AC-5 (de ⚠-regel), AC-6 (reporter en CI-kenmerk): vitest draait op een fixture met één skip en één
// todo, met de reporter test/setup/skip-reporter.ts. De uitslag van de kooi staat in de fixtureconfig vast
// (`provide: { kooi }` = de vorm die test/setup/vermogen.ts levert), zodat de test overal hetzelfde meet.
const ROOT = path.resolve(import.meta.dirname, '..', '..');
const VITEST = path.join(ROOT, 'node_modules', 'vitest', 'vitest.mjs');
const REPORTER = path.join(ROOT, 'test', 'setup', 'skip-reporter.ts');
const REDEN = '✗ kooi: fixture start niet';
const CI_NAMEN = ['CI', 'GITHUB_ACTIONS'];

let map = '';

function config(projectnaam: string): string {
  return `export default {
  test: {
    reporters: ['default', ${JSON.stringify(REPORTER)}],
    globals: true,
    projects: [
      {
        test: {
          name: ${JSON.stringify(projectnaam)},
          include: ['*.test.ts'],
          provide: { kooi: { soort: 'start-niet', melding: ${JSON.stringify(REDEN)} } },
        },
      },
    ],
  },
};
`;
}

beforeAll(() => {
  map = mkdtempSync(path.join(tmpdir(), 'vermogen-reporter-'));
  writeFileSync(path.join(map, 'unit.config.mjs'), config('unit'));
  writeFileSync(path.join(map, 'int.config.mjs'), config('int'));
  writeFileSync(path.join(map, 'schoon.test.ts'), "test('draait gewoon', () => { expect(1).toBe(1); });\n");
  writeFileSync(
    path.join(map, 'skip.test.ts'),
    "test.skip('slaat over', () => {});\ntest.todo('nog te doen');\ntest('draait ook', () => { expect(1).toBe(1); });\n",
  );
});

afterAll(() => {
  rmSync(map, { recursive: true, force: true });
});

function draai(bestand: string, env: Record<string, string>, config = 'unit.config.mjs') {
  const schoon = Object.fromEntries(Object.entries(process.env).filter(([naam]) => !CI_NAMEN.includes(naam)));
  const r = spawnSync(
    process.execPath,
    [VITEST, 'run', '--root', map, '--config', path.join(map, config), '--no-color', bestand],
    { cwd: map, encoding: 'utf8', env: { ...schoon, ...env }, timeout: 60_000 },
  );
  return { code: r.status, uit: `${r.stdout}\n${r.stderr}` };
}

const regels = (uit: string, begin: string) =>
  uit
    .split('\n')
    .map((r) => r.trim())
    .filter((r) => r.startsWith(begin));

describe('reporter lokaal (AC-5, AC-6)', () => {
  test('AC-6: zonder CI-kenmerk: exitcode 0 en precies één ⚠-regel met het aantal en de reden', () => {
    const { code, uit } = draai('skip.test.ts', {});

    expect(code, uit).toBe(0);
    expect(regels(uit, '⚠ ')).toStrictEqual([
      `⚠ overgeslagen: 2 tests, want de kooi kan hier niet starten (${REDEN}); ze draaien in CI, waar overslaan rood is (ADR 0088)`,
    ]);
    expect(uit).not.toContain('✗ overgeslagen in CI');
  });

  test('AC-6: zonder overgeslagen test geen ⚠-regel en exitcode 0', () => {
    const { code, uit } = draai('schoon.test.ts', {});

    expect(code, uit).toBe(0);
    expect(regels(uit, '⚠ ')).toStrictEqual([]);
  });

  test.each([
    ['CI', ''],
    ['CI', 'false'],
    ['CI', '0'],
    ['GITHUB_ACTIONS', ''],
    ['GITHUB_ACTIONS', 'false'],
    ['GITHUB_ACTIONS', '0'],
  ])('AC-6: %s=%j telt niet als CI: exitcode 0 met ⚠-regel', (naam, waarde) => {
    const { code, uit } = draai('skip.test.ts', { [naam]: waarde });

    expect(code, uit).toBe(0);
    expect(regels(uit, '⚠ overgeslagen: 2 tests')).toHaveLength(1);
    expect(regels(uit, '✗ overgeslagen in CI')).toStrictEqual([]);
  });
});

describe('reporter in CI (AC-6)', () => {
  test.each([
    ['CI', 'true'],
    ['CI', '1'],
    ['GITHUB_ACTIONS', 'true'],
  ])('AC-6: %s=%s: exitcode niet 0 en elke overgeslagen en todo-test met de CI-melding', (naam, waarde) => {
    const { code, uit } = draai('skip.test.ts', { [naam]: waarde });

    expect(code, uit).not.toBe(0);
    const meldingen = regels(uit, '✗ overgeslagen in CI: ');
    expect(meldingen).toHaveLength(2);
    expect(meldingen[0]).toMatch(
      /^✗ overgeslagen in CI: .*skip\.test\.ts > slaat over; in CI slaat geen test over \(ADR 0088\)$/,
    );
    expect(meldingen[1]).toMatch(
      /^✗ overgeslagen in CI: .*skip\.test\.ts > nog te doen; in CI slaat geen test over \(ADR 0088\)$/,
    );
    expect(regels(uit, '⚠ ')).toStrictEqual([]);
  });

  test('AC-6: in CI zonder overgeslagen test is de run groen', () => {
    const { code, uit } = draai('schoon.test.ts', { CI: 'true' });

    expect(code, uit).toBe(0);
    expect(regels(uit, '✗ overgeslagen in CI')).toStrictEqual([]);
  });

  test('AC-6: het project int telt niet mee, ook niet in CI', () => {
    const { code, uit } = draai('skip.test.ts', { CI: 'true' }, 'int.config.mjs');

    expect(code, uit).toBe(0);
    expect(regels(uit, '✗ overgeslagen in CI')).toStrictEqual([]);
    expect(regels(uit, '⚠ ')).toStrictEqual([]);
  });
});
