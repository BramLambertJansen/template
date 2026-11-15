import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';

// template-update PR 2, AC-7: het doel `gen-volgorde` van scripts/runner.sh hernoemt de migraties die het hulpscript noemt in
// de tijdelijke invoermap, nooit in de werkmap, en vertrouwt de regels van het hulpscript niet. Het echte runner.sh draait in
// een fixture-repo met een nagebootste docker (zoals test/scripts/runner-inputs.test.ts) en een nagebootst hulpscript dat
// vaste regels afdrukt (fixture/regels.txt) of faalt. De echte bouw met dbmate draait hier niet: de docker-stub legt alleen
// vast welke migraties de container zou zien.
const root = path.join(import.meta.dirname, '../..');
const script = readFileSync(path.join(root, 'scripts/runner.sh'), 'utf8');
const dirs: string[] = [];

const BASIS = '20261009000000_baseline.sql';
const VROEG = '20261008000000_vroeg.sql';
const HERNOEMD = '20261009000001_vroeg.sql';

const DOCKER = `#!/bin/bash
if [[ "$*" == *" run --rm --build "* ]]; then
  test -n "$RUNNER_INPUT_DIR" || exit 91
  ls "$RUNNER_INPUT_DIR/db/migrations" > "$STUB_DIR/migraties"
fi
`;

const HULPSCRIPT = `import { existsSync, readFileSync } from 'node:fs';

if (process.env.NODE_OPTIONS !== undefined) process.stdout.write('NODE_OPTIONS bereikt het hulpscript\\n');
if (existsSync('fixture/faalt')) process.exit(3);
if (existsSync('fixture/regels.txt')) process.stdout.write(readFileSync('fixture/regels.txt', 'utf8'));
`;

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function write(dir: string, name: string, content: string): void {
  const file = path.join(dir, name);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function fixture(regels?: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'runner-gen-volgorde-'));
  dirs.push(dir);
  write(dir, 'scripts/runner.sh', script);
  write(dir, 'scripts/kit/migratie-volgorde.mjs', HULPSCRIPT);
  write(dir, 'package.json', '{}');
  write(dir, '.gitignore', 'node_modules/\n.runner-output/\nstubs/\nfixture/\n');
  write(dir, `db/migrations/${BASIS}`, '-- baseline\n');
  write(dir, `db/migrations/${VROEG}`, '-- vroeg\n');
  mkdirSync(path.join(dir, 'node_modules'));
  if (regels !== undefined) write(dir, 'fixture/regels.txt', regels);
  const git = spawnSync('git', ['init', '-q'], { cwd: dir, encoding: 'utf8' });
  if (git.status !== 0) throw new Error(git.stderr);
  const add = spawnSync('git', ['add', '.'], { cwd: dir, encoding: 'utf8' });
  if (add.status !== 0) throw new Error(add.stderr);
  write(dir, 'stubs/docker', DOCKER);
  chmodSync(path.join(dir, 'stubs/docker'), 0o755);
  return dir;
}

function run(dir: string, doel: string, extra: Readonly<Record<string, string>> = {}) {
  // Alleen fixturecode en een Docker-stub: geen echte runneroverride of Docker-aanroep.
  return spawnSync('bash', ['scripts/runner.sh', doel, '--sta-wijzigingen-toe'], {
    cwd: dir,
    encoding: 'utf8',
    timeout: 30_000,
    env: {
      HOME: dir,
      TMPDIR: tmpdir(),
      PATH: `${dir}/stubs:${path.dirname(process.execPath)}:/usr/bin:/bin`,
      STUB_DIR: `${dir}/stubs`,
      ...extra,
    },
  });
}

// Wat de container in db/migrations zou zien; undefined als de runner de container niet startte.
function inContainer(dir: string): string[] | undefined {
  const file = path.join(dir, 'stubs/migraties');
  return existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n').toSorted() : undefined;
}

function inWerkmap(dir: string): string[] {
  return readdirSync(path.join(dir, 'db/migrations')).toSorted();
}

test('template-update/AC-7: gen-volgorde hernoemt de genoemde migratie in de invoermap en laat de werkmap ongemoeid', () => {
  const dir = fixture(`${VROEG} ${HERNOEMD}\n`);

  const result = run(dir, 'gen-volgorde');

  expect(result.stderr).toBe('');
  expect(result.status).toBe(0);
  expect(inContainer(dir)).toStrictEqual([BASIS, HERNOEMD]);
  expect(inWerkmap(dir)).toStrictEqual([VROEG, BASIS]);
  // De werkmap wijkt niet af van de index: de hernoeming gebeurde alleen in de kopie.
  expect(spawnSync('git', ['diff', '--name-only', '--', 'db'], { cwd: dir, encoding: 'utf8' }).stdout).toBe('');
});

test('template-update/AC-7: gen hernoemt niets, ook als het hulpscript regels zou geven', () => {
  const dir = fixture(`${VROEG} ${HERNOEMD}\n`);

  const result = run(dir, 'gen');

  expect(result.status).toBe(0);
  expect(inContainer(dir)).toStrictEqual([VROEG, BASIS]);
});

test('template-update/AC-7: gen-volgorde geeft de omgeving van de aanroeper niet door aan het hulpscript', () => {
  const dir = fixture(`${VROEG} ${HERNOEMD}\n`);

  const result = run(dir, 'gen-volgorde', { NODE_OPTIONS: '--no-warnings' });

  expect(result.stderr).toBe('');
  expect(result.status).toBe(0);
  expect(inContainer(dir)).toStrictEqual([BASIS, HERNOEMD]);
});

test.each([
  { geval: 'een pad als bron', regels: `../${VROEG} ${HERNOEMD}\n` },
  { geval: 'een pad als doel', regels: `${VROEG} ../${HERNOEMD}\n` },
  { geval: 'een absoluut pad als doel', regels: `${VROEG} /tmp/${HERNOEMD}\n` },
  { geval: 'een derde woord', regels: `${VROEG} ${HERNOEMD} extra\n` },
  { geval: 'een optie als bron', regels: `--help ${HERNOEMD}\n` },
  { geval: 'een andere extensie', regels: `${VROEG} 20261009000001_vroeg.sh\n` },
  { geval: 'een lege regel tussen geldige regels', regels: `\n${VROEG} ${HERNOEMD}\n` },
  { geval: 'een bron die niet in de invoermap staat', regels: `20261007000000_weg.sql ${HERNOEMD}\n` },
  { geval: 'een doel dat al bestaat', regels: `${VROEG} ${BASIS}\n` },
  { geval: 'dezelfde bron twee keer', regels: `${VROEG} ${HERNOEMD}\n${VROEG} 20261009000002_vroeg.sql\n` },
  { geval: 'geen regels', regels: '' },
])('template-update/AC-7: gen-volgorde stopt bij $geval, vóór de container', ({ regels }) => {
  const dir = fixture(regels);

  const result = run(dir, 'gen-volgorde');

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('gen-volgorde');
  expect(inContainer(dir)).toBeUndefined();
  expect(inWerkmap(dir)).toStrictEqual([VROEG, BASIS]);
});

test('template-update/AC-7: gen-volgorde stopt als het hulpscript faalt, vóór de container', () => {
  const dir = fixture(`${VROEG} ${HERNOEMD}\n`);
  write(dir, 'fixture/faalt', '');

  const result = run(dir, 'gen-volgorde');

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('scripts/kit/migratie-volgorde.mjs faalde');
  expect(inContainer(dir)).toBeUndefined();
});
