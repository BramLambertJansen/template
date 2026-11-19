import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { docsViolations } from '../../scripts/kit/check-docs.mjs';

// check-docs regel 6 (AC-dekking), aanvulling op test/rails/check-docs-ac.test.ts: `<namespace>/AC-n` dekt alleen als heel
// woord. Staat er een `/` of `.` vóór de naam (`andere/mijn/AC-1`, `x.mijn/AC-1`), dan is het een ander woord en dekt het
// niet. Specnaam `mijn-spec`, namespace `mijn`.
const SPEC = 'docs/specs/mijn-spec.md';
const SPEC_TEKST = [
  '---',
  'status: gebouwd',
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
  const files = {
    'package.json': JSON.stringify({ scripts: {} }),
    [SPEC]: SPEC_TEKST,
    'src/a/a.test.ts': testtekst,
  };
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '-A'], { cwd: root });
  const violations = await docsViolations(root);
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
