import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { docsKrimp, docsViolations } from '../../scripts/kit/check-docs.mjs';

// Leerpunt #940, check-docs regel 20 via de echte merge-base: een tijdelijke git-repo met `origin/main` op de basiscommit
// en daarna de werkmap als head. De overtreding staat in het strikte kanaal (`docsKrimp`), nooit in `docsViolations`
// (de baseline). De gevallen van de pure kern staan in test/rails/ac-tekst.test.ts.
const dirs: string[] = [];
beforeEach(() => {
  vi.stubEnv('GITHUB_ACTIONS', 'false');
});
afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function git(cwd: string, ...args: string[]) {
  const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, encoding: 'utf8' });
  expect(r.status, r.stderr).toBe(0);
}

function schrijf(dir: string, bestanden: Record<string, string>) {
  for (const [pad, inhoud] of Object.entries(bestanden)) {
    mkdirSync(path.dirname(path.join(dir, pad)), { recursive: true });
    writeFileSync(path.join(dir, pad), inhoud);
  }
}

const SPEC = 'docs/template/specs/x.md';
const TEST = 'test/x.test.ts';

const spec = (ac1: string) =>
  [
    '---',
    'status: goedgekeurd',
    'namespace: xn',
    '---',
    '',
    '# X',
    '',
    '## Hergebruik en UX',
    '',
    'Geen nieuwe UI.',
    '',
    '## Acceptatiecriteria',
    '',
    `- **xn/AC-1** — ${ac1}`,
    '',
  ].join('\n');

const testTekst = (...regels: string[]) => [...regels, "test('xn/AC-1: doet iets', () => {});", ''].join('\n');

/** Basis met een gebouwd xn/AC-1 als origin/main, daarna `head` in de werkmap, getrackt. */
function repo(head: Record<string, string>) {
  const dir = mkdtempSync(path.join(tmpdir(), 'ac-tekst-krimp-'));
  dirs.push(dir);
  schrijf(dir, {
    'package.json': JSON.stringify({ scripts: {} }),
    [SPEC]: spec('Alleen aanmaken.'),
    [TEST]: testTekst(),
  });
  git(dir, 'init', '-q');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'basis');
  git(dir, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  schrijf(dir, head);
  git(dir, 'add', '-A');
  return dir;
}

const sleutels = (lijst: readonly { key: string }[]) => lijst.map((violation) => violation.key);

describe('check-docs regel 20 tegenover de merge-base (leerpunt #940)', () => {
  test('gewijzigde test voor een gebouwd AC met ongewijzigde AC-tekst: rood in docsKrimp, niet in de baseline', async () => {
    const dir = repo({ [TEST]: testTekst('// GEWIJZIGD (xn/AC-1): ook bijwerken.') });
    expect(sleutels(await docsKrimp(dir))).toContain('docs:ac-tekst:x:AC-1');
    expect(sleutels(await docsViolations(dir))).not.toContain('docs:ac-tekst:x:AC-1');
  });

  test('dezelfde wijziging met een bijgewerkte AC-tekst: groen', async () => {
    const dir = repo({
      [SPEC]: spec('Aanmaken en bijwerken.'),
      [TEST]: testTekst('// GEWIJZIGD (xn/AC-1): ook bijwerken.'),
    });
    expect(sleutels(await docsKrimp(dir)).filter((key) => key.startsWith('docs:ac-tekst:'))).toEqual([]);
  });
});
