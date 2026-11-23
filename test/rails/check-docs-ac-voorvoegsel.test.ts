import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { docsKrimp } from '../../scripts/kit/check-docs.mjs';

// check-docs regel 6 (AC-dekking, ADR 0104), aanvulling op test/rails/check-docs-ac.test.ts: `<namespace>/AC-n` dekt alleen als heel
// woord. Staat er een `/` of `.` vóór de naam (`andere/mijn/AC-1`, `x.mijn/AC-1`), dan is het een ander woord en dekt het
// niet. Specnaam `mijn-spec`, namespace `mijn`.
// Regel 6 is een ratchet tegenover de merge-base (ADR 0104): het verlies van een gebouwde AC staat in `docsKrimp`.
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

const SPEC = 'docs/specs/mijn-spec.md';
const SPEC_TEKST = [
  '---',
  'status: goedgekeurd',
  'namespace: mijn',
  '---',
  '',
  '# mijn-spec',
  '',
  '## Hergebruik en UX',
  '',
  'Geen nieuwe UI.',
  '',
  '## Acceptatiecriteria',
  '',
  '- **mijn/AC-1** — Gegeven iets, dan dit.',
  '',
].join('\n');

async function acKeys(testtekst: string): Promise<string[]> {
  const root = mkdtempSync(path.join(tmpdir(), 'check-docs-ac-voorvoegsel-'));
  dirs.push(root);
  const schrijf = (files: Record<string, string>) => {
    for (const [file, content] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      writeFileSync(path.join(root, file), content);
    }
  };
  // Basis (origin/main): de spec is goedgekeurd en `mijn/AC-1` is gebouwd; de werkmap vervangt die test door `testtekst`.
  schrijf({
    'package.json': JSON.stringify({ scripts: {} }),
    [SPEC]: SPEC_TEKST,
    'test/basis.test.ts': '// mijn/AC-1\n',
  });
  git(root, 'init', '-q');
  git(root, 'add', '-A');
  git(root, 'commit', '-qm', 'basis');
  git(root, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  rmSync(path.join(root, 'test/basis.test.ts'));
  schrijf({ 'src/a/a.test.ts': testtekst });
  git(root, 'add', '-A');
  const violations = await docsKrimp(root);
  return violations.map((violation) => violation.key).filter((key) => key.startsWith('docs:ac:'));
}

test.each([
  ['een langer voorvoegsel (andere/mijn/AC-1)', "test('andere/mijn/AC-1: iets', () => {});\n"],
  ['een naam met een punt ervoor (x.mijn/AC-1)', "test('x.mijn/AC-1: iets', () => {});\n"],
  ['een specnaam met een punt ervoor (x.mijn-spec/AC-1)', "test('x.mijn-spec/AC-1: iets', () => {});\n"],
])('<naam>/AC-n als staart van een ander woord dekt niet: %s', async (_soort, testtekst) => {
  expect(await acKeys(testtekst)).toStrictEqual(['docs:ac:mijn-spec:AC-1']);
});

test.each([
  ['aan het begin van de testnaam', "test('mijn/AC-1: iets', () => {});\n"],
  ['na een spatie', "test('iets (mijn/AC-1)', () => {});\n"],
  ['in commentaar', '// mijn-spec/AC-1\n'],
])('controle: <naam>/AC-n als heel woord dekt wel (%s)', async (_soort, testtekst) => {
  expect(await acKeys(testtekst)).toStrictEqual([]);
});
