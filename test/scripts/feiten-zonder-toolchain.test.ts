import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';

// `hoofdstuk` en `pad` laden geen dependencies: ze werken ook als de toolchain-preflight faalt (pnpm ontbreekt), zodat een
// agent het regelboek en de padtabel kan lezen terwijl de eigenaar de toolchain herstelt. De andere secties stoppen wel.
const REPO = path.join(import.meta.dirname, '../..');
const leeg = mkdtempSync(path.join(tmpdir(), 'zonder-pnpm-'));
afterAll(() => {
  rmSync(leeg, { recursive: true, force: true });
});

/** feiten.mjs met een PATH zonder pnpm; Node zelf via zijn absolute pad. */
function feiten(...args: string[]) {
  return spawnSync(process.execPath, ['scripts/kit/feiten.mjs', ...args], {
    cwd: REPO,
    encoding: 'utf8',
    env: { ...process.env, PATH: leeg, CLAUDECODE: undefined },
  });
}

describe('feiten.mjs zonder werkende toolchain', () => {
  test('een gewone sectie stopt met de toolchainmelding', () => {
    const uit = feiten('specs');
    expect(uit.status).toBe(1);
    expect(uit.stderr).toContain('✗ toolchain ontbreekt');
  });

  test('hoofdstuk drukt het hoofdstuk af', () => {
    const uit = feiten('hoofdstuk', '10');
    expect(uit.status).toBe(0);
    expect(uit.stdout).toContain('## 10.');
    expect(uit.stderr).not.toContain('toolchain ontbreekt');
  });

  test('pad drukt het niveau af', () => {
    const uit = feiten('pad', 'notities.md');
    expect(uit.status).toBe(0);
    expect(uit.stdout).toContain('notities.md: schrijven vrij (standaard), besluit eigenaar (standaard)');
  });
});
