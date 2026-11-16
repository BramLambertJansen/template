import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { docsViolations } from '../../scripts/kit/check-docs.mjs';

// Leerpunt #738: een gebouwde spec noemt geen repopad dat niet bestaat, tenzij er direct `(vervallen)`, `(nieuw)` of
// `(voorbeeld)` achter staat of het in een AC staat met `(nog niet gebouwd)` achter het id (sleutel
// `docs:<spec>:dood-pad:<pad>`, per pad, zodat de ratchet bestaande treffers in de baseline houdt en een nieuwe rood maakt).
const SPEC = 'docs/template/specs/demo.md';

function spec(status: string, regels: string[]): string {
  return ['---', `status: ${status}`, 'namespace: demo', '---', '', '# Demo', '', ...regels, ''].join('\n');
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

async function doodPad(tekst: string, bestand = SPEC): Promise<string[]> {
  const violations = await docsViolations(repo({ [bestand]: tekst }));
  return violations.map(({ key }) => key).filter((key) => key.includes(':dood-pad:'));
}

test('een gebouwde spec met een pad dat niet bestaat: overtreding met het pad in de sleutel', async () => {
  expect(await doodPad(spec('gebouwd', ['Zie `scripts/kit/weg.mjs`.']))).toStrictEqual([
    `docs:${SPEC}:dood-pad:scripts/kit/weg.mjs`,
  ]);
});

test('elk dood pad een eigen sleutel, elk pad één keer', async () => {
  const tekst = spec('gebouwd', ['`scripts/kit/weg.mjs` en `test/weg.test.ts`.', 'Nog eens `scripts/kit/weg.mjs`.']);
  expect(await doodPad(tekst)).toStrictEqual([
    `docs:${SPEC}:dood-pad:scripts/kit/weg.mjs`,
    `docs:${SPEC}:dood-pad:test/weg.test.ts`,
  ]);
});

test('ook in docs/specs/ (app-specs)', async () => {
  const bestand = 'docs/specs/demo.md';
  expect(await doodPad(spec('gebouwd', ['`src/api/weg.ts`']), bestand)).toStrictEqual([
    `docs:${bestand}:dood-pad:src/api/weg.ts`,
  ]);
});

test('een bestaand pad, ook met regelnummer of regelbereik: geen overtreding', async () => {
  const tekst = spec('gebouwd', [
    '`scripts/kit/bestaat.mjs`, `scripts/kit/bestaat.mjs:12` en `scripts/kit/bestaat.mjs:3-9`.',
  ]);
  expect(await doodPad(tekst)).toStrictEqual([]);
});

test('een dood pad met regelnummer: de sleutel noemt het pad zonder regelnummer', async () => {
  expect(await doodPad(spec('gebouwd', ['`scripts/kit/weg.mjs:40`']))).toStrictEqual([
    `docs:${SPEC}:dood-pad:scripts/kit/weg.mjs`,
  ]);
});

test.each(['(vervallen)', '(nieuw)', '(voorbeeld)'])('direct gevolgd door %s: geen overtreding', async (markering) => {
  expect(await doodPad(spec('gebouwd', [`Zie \`scripts/kit/weg.mjs\` ${markering}.`]))).toStrictEqual([]);
});

// R-DOC-10: in een gebouwde spec staat `(nog niet gebouwd)` alleen achter een nieuw AC-id, niet achter een pad.
test('"(nog niet gebouwd)" achter een pad telt niet als markering', async () => {
  expect(await doodPad(spec('gebouwd', ['Zie `scripts/kit/weg.mjs` (nog niet gebouwd).']))).toStrictEqual([
    `docs:${SPEC}:dood-pad:scripts/kit/weg.mjs`,
  ]);
});

// R-WERK-07: een gebouwde spec krijgt een nieuwe AC als `- **<ns>/AC-n** (nog niet gebouwd)`; die mag een nieuw pad noemen.
test('een nieuwe AC met "(nog niet gebouwd)" mag een nieuw pad noemen, ook op een vervolgregel', async () => {
  const tekst = spec('gebouwd', [
    '## Acceptatiecriteria',
    '',
    '- **demo/AC-2** (nog niet gebouwd) — `scripts/kit/nieuw.mjs` geeft exit 1 bij een fout en',
    '  `test/scripts/nieuw.test.ts` bewijst het.',
    '- **demo/AC-1** — `scripts/kit/weg.mjs` bestaat.',
  ]);
  expect(await doodPad(tekst)).toStrictEqual([`docs:${SPEC}:dood-pad:scripts/kit/weg.mjs`]);
});

test('een nieuwe AC mag een nieuw pad noemen in een ingesprongen sub-bullet; het volgende AC-item telt weer', async () => {
  const tekst = spec('gebouwd', [
    '## Acceptatiecriteria',
    '',
    '- **demo/AC-2** (nog niet gebouwd) — De check meldt:',
    '  - `scripts/kit/nieuw.mjs` geeft exit 1;',
    '  - `test/scripts/nieuw.test.ts` bewijst het.',
    '- **demo/AC-1** — `scripts/kit/weg.mjs` bestaat.',
  ]);
  expect(await doodPad(tekst)).toStrictEqual([`docs:${SPEC}:dood-pad:scripts/kit/weg.mjs`]);
});

test('een markering die niet direct volgt, telt niet', async () => {
  expect(await doodPad(spec('gebouwd', ['`scripts/kit/weg.mjs` is (vervallen).']))).toStrictEqual([
    `docs:${SPEC}:dood-pad:scripts/kit/weg.mjs`,
  ]);
});

test.each(['voorstel', 'goedgekeurd', 'vervallen'])('status %s: geen overtreding', async (status) => {
  expect(await doodPad(spec(status, ['`scripts/kit/weg.mjs`']))).toStrictEqual([]);
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
  expect(await doodPad(spec('gebouwd', [`Zie ${token}.`]))).toStrictEqual([]);
});

test.each(['src/', 'scripts/', 'rails/', 'test/', 'e2e/', 'db/', 'deploy/', '.claude/', '.github/'])(
  'een dood pad onder %s telt',
  async (map) => {
    expect(await doodPad(spec('gebouwd', [`\`${map}weg.ts\``]))).toStrictEqual([`docs:${SPEC}:dood-pad:${map}weg.ts`]);
  },
);

test('een sjabloonbestand met underscore wordt niet getoetst', async () => {
  expect(await doodPad(spec('gebouwd', ['`scripts/kit/weg.mjs`']), 'docs/specs/_demo.md')).toStrictEqual([]);
});
