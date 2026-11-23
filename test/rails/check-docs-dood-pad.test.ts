import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { docsViolations } from '../../scripts/kit/check-docs.mjs';

// Leerpunt #738, ADR 0104: een spec met minstens een gebouwd AC (een testbestand noemt het volledige id) noemt geen repopad
// dat niet bestaat, tenzij er direct `(vervallen)`, `(nieuw)` of `(voorbeeld)` achter staat of het in het lijstitem van een
// eigen AC staat dat niet gebouwd is (sleutel `docs:<spec>:dood-pad:<pad>`, per pad, zodat de ratchet bestaande treffers in
// de baseline houdt en een nieuwe rood maakt). Elke fixture heeft daarom `demo/AC-9` als gebouwd AC (met een test die het
// noemt), tenzij het geval iets anders vraagt.
const SPEC = 'docs/template/specs/demo.md';
const GEBOUWD_AC = '- **demo/AC-9** — Gegeven iets, dan dit.';

function spec(status: string, regels: string[], metGebouwdAc = true): string {
  const ac = metGebouwdAc ? [GEBOUWD_AC, ''] : [];
  return ['---', `status: ${status}`, 'namespace: demo', '---', '', '# Demo', '', ...ac, ...regels, ''].join('\n');
}

function repo(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), 'check-docs-dood-pad-'));
  const all = { 'package.json': JSON.stringify({ scripts: {} }), 'scripts/kit/bestaat.mjs': '', ...files };
  for (const [file, content] of Object.entries(all)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '-A'], { cwd: root });
  return root;
}

/** `gebouwd`: de AC-ids die een testbestand noemt; standaard alleen `AC-9`. */
async function doodPad(tekst: string, bestand = SPEC, gebouwd: string[] = ['AC-9']): Promise<string[]> {
  const test = gebouwd.map((ac) => `test('demo/${ac}: doet iets', () => {});\n`).join('');
  const violations = await docsViolations(repo({ [bestand]: tekst, 'test/demo.test.ts': test }));
  return violations.map(({ key }) => key).filter((key) => key.includes(':dood-pad:'));
}

test('een spec met een gebouwd AC en een pad dat niet bestaat: overtreding met het pad in de sleutel', async () => {
  expect(await doodPad(spec('goedgekeurd', ['Zie `scripts/kit/weg.mjs`.']))).toStrictEqual([
    `docs:${SPEC}:dood-pad:scripts/kit/weg.mjs`,
  ]);
});

test('elk dood pad een eigen sleutel, elk pad één keer', async () => {
  const tekst = spec('goedgekeurd', [
    '`scripts/kit/weg.mjs` en `test/weg.test.ts`.',
    'Nog eens `scripts/kit/weg.mjs`.',
  ]);
  expect(await doodPad(tekst)).toStrictEqual([
    `docs:${SPEC}:dood-pad:scripts/kit/weg.mjs`,
    `docs:${SPEC}:dood-pad:test/weg.test.ts`,
  ]);
});

test('ook in docs/specs/ (app-specs)', async () => {
  const bestand = 'docs/specs/demo.md';
  expect(await doodPad(spec('goedgekeurd', ['`src/api/weg.ts`']), bestand)).toStrictEqual([
    `docs:${bestand}:dood-pad:src/api/weg.ts`,
  ]);
});

test('een bestaand pad, ook met regelnummer of regelbereik: geen overtreding', async () => {
  const tekst = spec('goedgekeurd', [
    '`scripts/kit/bestaat.mjs`, `scripts/kit/bestaat.mjs:12` en `scripts/kit/bestaat.mjs:3-9`.',
  ]);
  expect(await doodPad(tekst)).toStrictEqual([]);
});

test('het optionele app-bestand .claude/gates.app.json is geen dood pad, ook als het ontbreekt', async () => {
  // Het bestaat alleen in een app met eigen padrijen (spec app-padtabel), nooit in de template.
  const tekst = spec('goedgekeurd', ['Eigen rijen in `.claude/gates.app.json`; dood is `.claude/weg.json`.']);
  expect(await doodPad(tekst)).toStrictEqual([`docs:${SPEC}:dood-pad:.claude/weg.json`]);
});

test('een dood pad met regelnummer: de sleutel noemt het pad zonder regelnummer', async () => {
  expect(await doodPad(spec('goedgekeurd', ['`scripts/kit/weg.mjs:40`']))).toStrictEqual([
    `docs:${SPEC}:dood-pad:scripts/kit/weg.mjs`,
  ]);
});

test.each(['(vervallen)', '(nieuw)', '(voorbeeld)'])('direct gevolgd door %s: geen overtreding', async (markering) => {
  expect(await doodPad(spec('goedgekeurd', [`Zie \`scripts/kit/weg.mjs\` ${markering}.`]))).toStrictEqual([]);
});

// ADR 0104: een eigen AC zonder test is niet gebouwd; zijn lijstitem (ook vervolgregels en sub-bullets) mag een nieuw pad
// noemen, zonder merkteken. Zodra een test het AC noemt, telt het item weer mee. Het volgende AC-item telt apart.
test('het lijstitem van een eigen AC zonder test mag een nieuw pad noemen, ook op een vervolgregel', async () => {
  const tekst = spec('goedgekeurd', [
    '## Acceptatiecriteria',
    '',
    '- **demo/AC-2** — `scripts/kit/nieuw.mjs` geeft exit 1 bij een fout en',
    '  `test/scripts/nieuw.test.ts` bewijst het.',
    '- **demo/AC-1** — `scripts/kit/weg.mjs` bestaat.',
  ]);
  expect(await doodPad(tekst, SPEC, ['AC-9', 'AC-1'])).toStrictEqual([`docs:${SPEC}:dood-pad:scripts/kit/weg.mjs`]);
});

test('het lijstitem van een AC zonder test mag een nieuw pad noemen in een sub-bullet; het volgende gebouwde AC-item telt weer', async () => {
  const tekst = spec('goedgekeurd', [
    '## Acceptatiecriteria',
    '',
    '- **demo/AC-2** — De check meldt:',
    '  - `scripts/kit/nieuw.mjs` geeft exit 1;',
    '  - `test/scripts/nieuw.test.ts` bewijst het.',
    '- **demo/AC-1** — `scripts/kit/weg.mjs` bestaat.',
  ]);
  expect(await doodPad(tekst, SPEC, ['AC-9', 'AC-1'])).toStrictEqual([`docs:${SPEC}:dood-pad:scripts/kit/weg.mjs`]);
});

test('hetzelfde pad in een AC dat wel gebouwd is, is dood', async () => {
  const tekst = spec('goedgekeurd', ['- **demo/AC-2** — `scripts/kit/nieuw.mjs` geeft exit 1.']);
  expect(await doodPad(tekst, SPEC, ['AC-9', 'AC-2'])).toStrictEqual([`docs:${SPEC}:dood-pad:scripts/kit/nieuw.mjs`]);
});

test('een markering die niet direct volgt, telt niet', async () => {
  expect(await doodPad(spec('goedgekeurd', ['`scripts/kit/weg.mjs` is (vervallen).']))).toStrictEqual([
    `docs:${SPEC}:dood-pad:scripts/kit/weg.mjs`,
  ]);
});

// Alleen een `goedgekeurde` spec met een gebouwd AC wordt getoetst; `voorstel` en `vervallen` niet, ook niet met een test.
test.each(['voorstel', 'vervallen'])('status %s met een gebouwd AC: geen overtreding', async (status) => {
  expect(await doodPad(spec(status, ['`scripts/kit/weg.mjs`']))).toStrictEqual([]);
});

test('goedgekeurd zonder enig gebouwd AC (niemand noemt een id): geen overtreding', async () => {
  expect(await doodPad(spec('goedgekeurd', ['`scripts/kit/weg.mjs`']), SPEC, [])).toStrictEqual([]);
});

test('goedgekeurd zonder AC-regels: geen overtreding', async () => {
  expect(await doodPad(spec('goedgekeurd', ['`scripts/kit/weg.mjs`'], false), SPEC, [])).toStrictEqual([]);
});

test('een oude status: gebouwd leest als goedgekeurd: met een gebouwd AC geldt de check, zonder niet', async () => {
  const tekst = spec('gebouwd', ['`scripts/kit/weg.mjs`']);
  expect(await doodPad(tekst)).toStrictEqual([`docs:${SPEC}:dood-pad:scripts/kit/weg.mjs`]);
  expect(await doodPad(tekst, SPEC, [])).toStrictEqual([]);
});

test.each([
  ['een branchnaam', '`feat/iets`'],
  ['een ref', '`origin/main`'],
  ['een kale bestandsnaam', '`weg.mjs`'],
  ['een map zonder extensie', '`src/web/ui/weg/`'],
  ['een glob', '`src/**/*.ts`'],
  ['een placeholder', '`src/api/routes/<naam>.ts`'],
  ['een pad buiten de codemappen', '`docs/specs/archief/weg.md`'],
  ['een AC-verwijzing', '`samenhang-checks-rollen/AC-1`'],
])('%s is geen repopad: geen overtreding', async (_naam, token) => {
  expect(await doodPad(spec('goedgekeurd', [`Zie ${token}.`]))).toStrictEqual([]);
});

test.each(['src/', 'scripts/', 'rails/', 'test/', 'e2e/', 'db/', 'deploy/', '.claude/', '.github/'])(
  'een dood pad onder %s telt',
  async (map) => {
    expect(await doodPad(spec('goedgekeurd', [`\`${map}weg.ts\``]))).toStrictEqual([
      `docs:${SPEC}:dood-pad:${map}weg.ts`,
    ]);
  },
);

test('een sjabloonbestand met underscore wordt niet getoetst', async () => {
  expect(await doodPad(spec('goedgekeurd', ['`scripts/kit/weg.mjs`']), 'docs/specs/_demo.md')).toStrictEqual([]);
});
