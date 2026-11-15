import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';

// template-update PR 2, AC-7, niveau 2 (docs/template/specs/template-update.md): scripts/check-snapshot.sh draait de tweede bouw
// (`runner.sh gen-volgorde`) alleen als het hulpscript migraties noemt die ouder zijn dan een bestaande, en vergelijkt dan de
// twee schemadumps. De echte dbmate-bouw draait alleen in de runner; hier zijn runner en hulpscript nagebootst.
//
// Keuze nagebootst hulpscript: `scripts/kit/migratie-volgorde.mjs` in de fixture drukt vaste regels `<naam> <nieuwe naam>` af
// (uit fixture/hernoemingen.txt). Het echte hulpscript zou een git-historie met origin/main en een tweede kopie van
// check-migrations.mjs en check-core.mjs eisen, en is al getoetst in test/rails/migratie-volgorde.test.ts (selectie, nieuwe
// namen, uitvoervorm). Dit bestand toetst wat alleen het shellscript doet: wanneer de tweede bouw draait, hoe de dumps worden
// vergeleken, en wat er in de melding staat.
//
// Keuze nagebootste runner: `scripts/runner.sh <doel>` schrijft het vaste `schema.snapshot.sql` en `schema.ts` van
// fixture/<doel>/ naar `.runner-output/gen/` (voor `gen` en `gen-volgorde` allebei dezelfde map, zoals de echte runner voor
// `gen` doet) en schrijft het doel in logs/runner-aanroepen. Het script moet de eerste dump dus veiligstellen voor het de tweede
// bouw start; een script dat dat vergeet, vergelijkt de tweede dump met zichzelf en wordt rood in 'beide dumps verschillen'.
// Met STUB_FAALT=<doel> eindigt de runner voor dat doel met afsluitcode 1 en schrijft hij niets.
const root = path.join(import.meta.dirname, '../..');
const script = readFileSync(path.join(root, 'scripts/check-snapshot.sh'), 'utf8');
const dirs: string[] = [];

const VROEG = '20261008000000_vroeg.sql';
const TUSSEN = '20261009120000_tussen.sql';
const HERNOEMD_VROEG = '20261012000001_vroeg.sql';
const HERNOEMD_TUSSEN = '20261012000002_tussen.sql';
const REGELS = [`${VROEG} ${HERNOEMD_VROEG}`, `${TUSSEN} ${HERNOEMD_TUSSEN}`];
const TS_BESTAND = 'export interface Notes { kleur: string }\n';
const BESTAANDE_MELDING = 'gegenereerde bestanden wijken af van de migraties';

const RUNNER = `#!/bin/bash
set -euo pipefail
doel="$1"
mkdir -p logs
echo "$doel" >> logs/runner-aanroepen
if [[ "\${STUB_FAALT:-}" == "$doel" ]]; then
  echo "runner: $doel faalt (nagebootst)" >&2
  exit 1
fi
mkdir -p .runner-output/gen
cp "fixture/$doel/schema.snapshot.sql" .runner-output/gen/schema.snapshot.sql
cp "fixture/$doel/schema.ts" .runner-output/gen/schema.ts
`;

const HULPSCRIPT = `import { existsSync, readFileSync } from 'node:fs';

if (existsSync('fixture/hernoemingen.txt')) process.stdout.write(readFileSync('fixture/hernoemingen.txt', 'utf8'));
`;

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

interface DumpOpties {
  sleutel?: string;
  versie?: string;
  kleur?: string;
}

// Een schemadump in de vorm van pg_dump 17: de onstabiele regels (\restrict, \unrestrict, de twee versieregels) en één echte regel.
function dump({ sleutel = 'sleutel-een', versie = '17.11', kleur = 'rood' }: DumpOpties = {}): string {
  return [
    '--',
    '-- PostgreSQL database dump',
    '--',
    '',
    `\\restrict ${sleutel}`,
    '',
    `-- Dumped from database version ${versie}`,
    `-- Dumped by pg_dump version ${versie}`,
    '',
    `alter table public.notes alter column kleur set default '${kleur}';`,
    '',
    `\\unrestrict ${sleutel}`,
    '',
  ].join('\n');
}

interface Opzet {
  repo?: string;
  gen?: string;
  volgorde?: string;
  hernoemingen?: readonly string[];
}

function write(dir: string, name: string, content: string): void {
  const file = path.join(dir, name);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function git(dir: string, ...args: string[]): void {
  execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.test', ...args], {
    cwd: dir,
    stdio: 'ignore',
  });
}

// Een git-repo met het echte check-snapshot.sh, de vaste dumps per doel en de nagebootste runner en hulpscript.
function fixture({ repo = dump(), gen = dump(), volgorde = dump(), hernoemingen = [] }: Opzet = {}): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'check-snapshot-volgorde-'));
  dirs.push(dir);
  write(dir, 'scripts/check-snapshot.sh', script);
  write(dir, 'scripts/runner.sh', RUNNER);
  chmodSync(path.join(dir, 'scripts/runner.sh'), 0o755);
  write(dir, 'scripts/kit/migratie-volgorde.mjs', HULPSCRIPT);
  write(dir, 'db/schema.snapshot.sql', repo);
  write(dir, 'src/api/db/schema.ts', TS_BESTAND);
  write(dir, 'fixture/gen/schema.snapshot.sql', gen);
  write(dir, 'fixture/gen/schema.ts', TS_BESTAND);
  write(dir, 'fixture/gen-volgorde/schema.snapshot.sql', volgorde);
  write(dir, 'fixture/gen-volgorde/schema.ts', TS_BESTAND);
  if (hernoemingen.length > 0) write(dir, 'fixture/hernoemingen.txt', `${hernoemingen.join('\n')}\n`);
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'fixture');
  return dir;
}

function run(dir: string, faalt?: string) {
  return spawnSync('bash', ['scripts/check-snapshot.sh'], {
    cwd: dir,
    encoding: 'utf8',
    timeout: 20_000,
    env: {
      HOME: dir,
      TMPDIR: tmpdir(),
      PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`,
      STUB_FAALT: faalt ?? '',
    },
  });
}

function aanroepen(dir: string): string[] {
  try {
    return readFileSync(path.join(dir, 'logs/runner-aanroepen'), 'utf8').trim().split('\n');
  } catch {
    return [];
  }
}

test('template-update/AC-7: zonder oudere toegevoegde migratie draait alleen de gewone bouw en is de check groen', () => {
  const dir = fixture();

  const result = run(dir);

  expect(result.status).toBe(0);
  expect(result.stderr).toBe('');
  expect(result.stdout).toContain('✓ check:snapshot');
  expect(aanroepen(dir)).toStrictEqual(['gen']);
});

test('template-update/AC-7: met een oudere toegevoegde migratie draaien gen en daarna gen-volgorde; gelijke dumps zijn groen', () => {
  const dir = fixture({ hernoemingen: REGELS });

  const result = run(dir);

  expect(result.status).toBe(0);
  expect(result.stderr).toBe('');
  expect(result.stdout).toContain('✓ check:snapshot');
  expect(aanroepen(dir)).toStrictEqual(['gen', 'gen-volgorde']);
});

test('template-update/AC-7: verschillen de dumps, dan is de check rood met de namen en de volgorde van binnenkomst', () => {
  const dir = fixture({ hernoemingen: REGELS, volgorde: dump({ kleur: 'blauw' }) });

  const result = run(dir);

  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain(VROEG);
  expect(result.stderr).toContain(TUSSEN);
  expect(result.stderr).toMatch(/volgorde van binnenkomst/);
  expect(result.stderr).toMatch(/ander schema/);
  expect(aanroepen(dir)).toStrictEqual(['gen', 'gen-volgorde']);
});

// Ontwerpkeuze: de \restrict-sleutel en de versieregels van Postgres en pg_dump zijn onstabiel en tellen ook in de vergelijking
// van de twee dumps niet mee (zoals bij de vergelijking met db/schema.snapshot.sql).
test('template-update/AC-7: dumps die alleen in de onstabiele regels verschillen zijn groen', () => {
  const dir = fixture({ hernoemingen: REGELS, volgorde: dump({ sleutel: 'sleutel-twee', versie: '17.12' }) });

  const result = run(dir);

  expect(result.status).toBe(0);
  expect(result.stderr).toBe('');
  expect(aanroepen(dir)).toStrictEqual(['gen', 'gen-volgorde']);
});

test('template-update/AC-7: faalt gen-volgorde, dan is de check rood met de namen van de migraties', () => {
  const dir = fixture({ hernoemingen: REGELS });

  const result = run(dir, 'gen-volgorde');

  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain(VROEG);
  expect(result.stderr).toContain(TUSSEN);
  expect(result.stderr).toMatch(/volgorde van binnenkomst/);
  expect(result.stdout).not.toContain('✓ check:snapshot');
  expect(aanroepen(dir)).toStrictEqual(['gen', 'gen-volgorde']);
});

// Ontwerpkeuze: de bestaande vergelijking van de eerste dump met db/schema.snapshot.sql blijft, met dezelfde melding, ook als er
// een oudere migratie is en de twee dumps gelijk zijn.
test.each([
  { geval: 'zonder oudere toegevoegde migratie', hernoemingen: [] },
  { geval: 'met een oudere toegevoegde migratie', hernoemingen: REGELS },
])(
  'template-update/AC-7: wijkt de eerste dump af van db/schema.snapshot.sql, dan is de check rood $geval',
  ({ hernoemingen }) => {
    const afwijkend = dump({ kleur: 'groen' });
    const dir = fixture({ hernoemingen, gen: afwijkend, volgorde: afwijkend });

    const result = run(dir);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(BESTAANDE_MELDING);
    expect(result.stdout).not.toContain('✓ check:snapshot');
  },
);
