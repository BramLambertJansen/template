import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { expectAbsent } from '../support/absence';

// ADR 0096 en R-CI-08: in CI mag alleen de pnpm-store uit een cache, met de lockfile in de sleutel; node_modules, builds en
// uitslagen nooit. En de concurrency van osv-scanner scheidt de events, zodat een push de wekelijkse scan niet afbreekt.
const MAP = path.join(import.meta.dirname, '../../.github/workflows');
const WORKFLOWS = readdirSync(MAP)
  .filter((naam) => naam.endsWith('.yml'))
  .map((naam) => ({ naam, tekst: readFileSync(path.join(MAP, naam), 'utf8') }));
const CI = WORKFLOWS.find((w) => w.naam === 'ci.yml')?.tekst ?? '';

/** De `with:`-regels van elke stap die `actions/cache` gebruikt. */
function cacheStappen(tekst: string): string[] {
  return [...tekst.matchAll(/uses: actions\/cache[@/][^\n]*\n((?: {8,}[^\n]*\n)*)/g)].map((m) => m[1] ?? '');
}

describe('ADR 0096: alleen de pnpm-store in de cache', () => {
  test('ADR 0096: elke pnpm install in ci.yml volgt direct op de store-cache', () => {
    const installs = [...CI.matchAll(/^ {6}- run: pnpm install --frozen-lockfile$/gm)];
    expect(installs.length).toBeGreaterThanOrEqual(4);
    for (const install of installs) {
      const ervoor = CI.slice(0, install.index).trimEnd().split('\n').slice(-5).join('\n');
      expect(ervoor).toMatch(
        /uses: actions\/cache@[0-9a-f]{40} # v[\d.]+\n {8}with:\n {10}path: \$\{\{ steps\.pnpm-store\.outputs\.pad \}\}/,
      );
    }
  });

  test('ADR 0096: elke cachestap bewaart alleen de store, met de lockfile in de sleutel', () => {
    const stappen = WORKFLOWS.flatMap((w) => cacheStappen(w.tekst));
    expect(stappen.length).toBeGreaterThanOrEqual(4);
    for (const stap of stappen) {
      expect([...stap.matchAll(/^ {10}path:(.*)$/gm)].map((m) => m[1]?.trim())).toStrictEqual([
        '${{ steps.pnpm-store.outputs.pad }}',
      ]);
      expect(stap).toMatch(/^ {10}key: pnpm-store-\$\{\{ runner\.os \}\}-\$\{\{ hashFiles\('pnpm-lock\.yaml'\) \}\}$/m);
      expect(stap).toMatch(/^ {10}restore-keys: pnpm-store-\$\{\{ runner\.os \}\}-$/m);
    }
  });

  test('ADR 0096: geen andere cache-action of ingebouwde cache van een setup-action', () => {
    for (const { tekst } of WORKFLOWS) {
      expectAbsent(tekst, /uses: actions\/cache\/(save|restore)@|^\s+cache(-dependency-path)?:/m, {
        recognizes: ['      - uses: actions/cache/save@abc', '          cache: pnpm'],
        allows: ['      - uses: actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9 # v6.1.0'],
      });
    }
  });

  test('ADR 0096: de store-stap vraagt het pad aan pnpm en zet het als output', () => {
    expect(CI).toContain(
      '      - id: pnpm-store\n        run: echo "pad=$(pnpm store path --silent)" >> "$GITHUB_OUTPUT"\n',
    );
  });
});

test('osv-scanner: de concurrency-groep bevat het event, zodat push en schema elkaar niet afbreken', () => {
  const osv = WORKFLOWS.find((w) => w.naam === 'osv.yml')?.tekst ?? '';
  expect(osv).toMatch(/^ {2}group: osv-\$\{\{ github\.event_name \}\}-/m);
});
