import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { acDekking } from '../../rails/hooks/lib/ac-dekking.mjs';
import { boomWerkmap } from '../../scripts/kit/ac-dekking.mjs';
import { docsKrimp } from '../../scripts/kit/check-docs.mjs';

// check-docs regel 6 (ADR 0104, spec gebouwd-zonder-nummer): AC-dekking. Een AC is gebouwd als een testbestand (`*.test.*`,
// `*.spec.*`, `db/tests/**`, `e2e/**`, `test/**`) `<specnaam>/AC-n` of `<namespace>/AC-n` als heel woord noemt. De check is
// een ratchet tegenover de merge-base met origin/main in `docsKrimp`: een AC die op de basis gebouwd was en nu niet meer,
// is rood (sleutel `docs:ac:<spec>:<AC-n>`). Een los `AC-n`, ook met de specnaam of namespace in hetzelfde bestand of op
// dezelfde regel, dekt niet. Specnaam `mijn-spec`, namespace `mijn`: bewust verschillend.
// Elk geval: de basis (origin/main) heeft de spec `goedgekeurd` met een test die `mijn/AC-1` noemt; de werkmap vervangt
// die test door de inhoud van het geval.
const dirs: string[] = [];
beforeEach(() => {
  vi.stubEnv('GITHUB_ACTIONS', 'false');
});
afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function spec(status: string, name = 'mijn-spec', namespace = 'mijn'): string {
  return [
    '---',
    `status: ${status}`,
    `namespace: ${namespace}`,
    '---',
    '',
    `# ${name}`,
    '',
    '## Hergebruik en UX',
    '',
    'Geen nieuwe UI.',
    '',
    '## Acceptatiecriteria',
    '',
    `- **${namespace}/AC-1** — Gegeven iets, dan dit.`,
    '',
  ].join('\n');
}

function git(cwd: string, ...args: string[]) {
  const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, encoding: 'utf8' });
  expect(r.status, r.stderr).toBe(0);
}

function schrijf(root: string, files: Record<string, string | null>) {
  for (const [file, content] of Object.entries(files)) {
    if (content === null) {
      rmSync(path.join(root, file), { force: true });
      continue;
    }
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
}

const SPEC = 'docs/specs/mijn-spec.md';
const BASIS_TEST = 'test/basis.test.ts';
const DEKT = "test('mijn/AC-1: doet iets', () => {});\n";

/** Basis: spec en een dekkende test op origin/main; head: `head` in de werkmap, getrackt. Geeft de docsKrimp-sleutels. */
async function krimpKeys(status: string, head: Record<string, string | null>): Promise<string[]> {
  const root = mkdtempSync(path.join(tmpdir(), 'check-docs-ac-'));
  dirs.push(root);
  schrijf(root, { 'package.json': JSON.stringify({ scripts: {} }), [SPEC]: spec(status), [BASIS_TEST]: DEKT });
  git(root, 'init', '-q');
  git(root, 'add', '-A');
  git(root, 'commit', '-qm', 'basis');
  git(root, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  schrijf(root, { [BASIS_TEST]: null, ...head });
  git(root, 'add', '-A');
  const violations = await docsKrimp(root);
  return violations.map((violation) => violation.key).filter((key) => key.startsWith('docs:ac:'));
}

/** Het AC-verlies tegenover de merge-base voor een goedgekeurde spec waarvan de test door `head` is vervangen. */
const acKeys = (head: Record<string, string | null>) => krimpKeys('goedgekeurd', head);

test('een goedgekeurde spec waarvan de enige test verdwijnt: overtreding docs:ac:<spec>:<AC-n> (strikt kanaal)', async () => {
  expect(await acKeys({})).toStrictEqual(['docs:ac:mijn-spec:AC-1']);
});

test.each([
  ['unit', 'src/a/a.test.ts'],
  ['spec', 'e2e/a.spec.ts'],
  ['test/', 'test/api/a.int.test.ts'],
  ['db/tests', 'db/tests/a.sql'],
])('gedekt via <namespace>/AC-n in een testbestand (%s): geen overtreding', async (_soort, file) => {
  expect(await acKeys({ [file]: DEKT })).toStrictEqual([]);
});

test('gedekt via <specnaam>/AC-n (naast <namespace>/AC-n): geen overtreding', async () => {
  expect(await acKeys({ 'src/a/a.test.ts': "test('mijn-spec/AC-1: doet iets', () => {});\n" })).toStrictEqual([]);
});

test.each([
  ['specnaam op een eerdere regel', "// mijn-spec\ntest('AC-1: doet iets', () => {});\n"],
  ['namespace op een eerdere regel', "// spec mijn\ntest('AC-1: doet iets', () => {});\n"],
  ['specnaam op dezelfde regel', "test('mijn-spec: AC-1 doet iets', () => {});\n"],
  ['namespace op dezelfde regel', "test('mijn AC-1 doet iets', () => {});\n"],
])('een los AC-id met de %s in hetzelfde bestand dekt niet: overtreding', async (_soort, content) => {
  expect(await acKeys({ 'src/a/a.test.ts': content })).toStrictEqual(['docs:ac:mijn-spec:AC-1']);
});

test('het AC-id in een test die een andere spec noemt: overtreding', async () => {
  const keys = await acKeys({
    'src/a/a.test.ts': "// andere-spec en andere\ntest('AC-1: doet iets anders', () => {});\n",
    'test/b.test.ts': "test('andere/AC-1: nog iets', () => {});\n",
  });

  expect(keys).toStrictEqual(['docs:ac:mijn-spec:AC-1']);
});

test('het AC-id en de specnaam in verschillende bestanden dekken niet', async () => {
  const keys = await acKeys({
    'src/a/a.test.ts': "test('AC-1: doet iets', () => {});\n",
    'src/b/b.test.ts': "// mijn-spec\ntest('doet iets', () => {});\n",
  });

  expect(keys).toStrictEqual(['docs:ac:mijn-spec:AC-1']);
});

// Alleen een `goedgekeurde` spec heeft een stand; `voorstel` en `vervallen` worden niet gecontroleerd, ook niet bij verlies.
test.each(['voorstel', 'vervallen'])(
  'een spec met status %s wordt niet gecontroleerd, ook niet bij verlies',
  async (status) => {
    expect(await krimpKeys(status, {})).toStrictEqual([]);
  },
);

test('een AC die op de basis niet gebouwd was en het nog niet is, is geen verlies', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'check-docs-ac-'));
  dirs.push(root);
  schrijf(root, { 'package.json': JSON.stringify({ scripts: {} }), [SPEC]: spec('goedgekeurd') });
  git(root, 'init', '-q');
  git(root, 'add', '-A');
  git(root, 'commit', '-qm', 'basis');
  git(root, 'update-ref', 'refs/remotes/origin/main', 'HEAD');

  expect((await docsKrimp(root)).filter((violation) => violation.key.startsWith('docs:ac:'))).toStrictEqual([]);
});

test.each([
  ['<namespace>/AC-10', "test('mijn/AC-10: iets', () => {});\n"],
  ['<specnaam>/AC-10', "test('mijn-spec/AC-10: iets', () => {});\n"],
  ['AC-1 als deel van een woord (XAC-1, AC-1a)', "// mijn-spec\ntest('XAC-1 en AC-1a', () => {});\n"],
])('een ander AC-id telt niet als dekking van AC-1: %s', async (_soort, content) => {
  expect(await acKeys({ 'src/a/a.test.ts': content })).toStrictEqual(['docs:ac:mijn-spec:AC-1']);
});

test('een bestand buiten de testpaden dekt niet', async () => {
  const keys = await acKeys({ 'src/a/a.ts': '// mijn/AC-1 en mijn-spec AC-1\n' });

  expect(keys).toStrictEqual(['docs:ac:mijn-spec:AC-1']);
});

test('een kruisverwijzing naar een AC van een andere spec in de spec zelf is geen eigen AC', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'check-docs-ac-'));
  dirs.push(root);
  const text = spec('goedgekeurd').replace('Gegeven iets, dan dit.', 'Gegeven iets, dan dit; zie ook accounts/AC-42.');
  schrijf(root, { 'package.json': JSON.stringify({ scripts: {} }), [SPEC]: text, 'src/a/a.test.ts': DEKT });
  git(root, 'init', '-q');
  git(root, 'add', '-A');

  const dekking = acDekking(boomWerkmap(root)).get(SPEC);

  expect(dekking?.levend).toStrictEqual(['AC-1']);
  expect(dekking?.stand).toBe('gebouwd');
});
