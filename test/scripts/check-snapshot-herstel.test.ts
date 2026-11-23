// Leerpunt #810: de melding bij een falende bouw op volgorde van binnenkomst mag geen nieuwe migratie adviseren (dbmate bereikt een latere migratie nooit); bij verschillende schema's blijft dat advies wel.
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { expectAbsent } from '../support/absence.ts';

// Fixture, nagebootste runner en hulpscript zijn letterlijk overgenomen uit test/scripts/check-snapshot-volgorde.test.ts
// (geen gedeeld hulpbestand: de bewijsjob draait deze test op de basis, leerpunt #892). Met STUB_FAALT=gen-volgorde eindigt de
// runner voor de tweede bouw met afsluitcode 1.
const root = path.join(import.meta.dirname, '../..');
const script = readFileSync(path.join(root, 'scripts/check-snapshot.sh'), 'utf8');
const dirs: string[] = [];

const VROEG = '20261008000000_vroeg.sql';
const TUSSEN = '20261009120000_tussen.sql';
const HERNOEMD_VROEG = '20261012000001_vroeg.sql';
const HERNOEMD_TUSSEN = '20261012000002_tussen.sql';
const REGELS = [`${VROEG} ${HERNOEMD_VROEG}`, `${TUSSEN} ${HERNOEMD_TUSSEN}`];
const TS_BESTAND = 'export interface Notes { kleur: string }\n';

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

function fixture({ repo = dump(), gen = dump(), volgorde = dump(), hernoemingen = [] }: Opzet = {}): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'check-snapshot-herstel-'));
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

test('leerpunt #810: faalt de bouw, dan noemt de melding de namen, de volgorde van binnenkomst en de eerste fout', () => {
  const dir = fixture({ hernoemingen: REGELS });

  const result = run(dir, 'gen-volgorde');

  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain(VROEG);
  expect(result.stderr).toContain(TUSSEN);
  expect(result.stderr).toMatch(/volgorde van binnenkomst/);
  expect(result.stderr).toMatch(/eerste fout/);
});

test('leerpunt #810: faalt de bouw, dan houdt de melding de update tegen', () => {
  const dir = fixture({ hernoemingen: REGELS });

  const result = run(dir, 'gen-volgorde');

  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(/houd de update tegen/);
});

test('leerpunt #810: faalt de bouw, dan adviseert de melding geen nieuwe migratie', () => {
  const dir = fixture({ hernoemingen: REGELS });

  const result = run(dir, 'gen-volgorde');

  expect(result.status).not.toBe(0);
  expectAbsent(result.stderr, /nieuwe migratie/i, {
    recognizes: ['leg het vast in een nieuwe migratie', 'Een Nieuwe Migratie'],
    allows: ['de eerste fout van de runner', 'houd de update tegen', 'een latere migratie bereikt dbmate niet'],
  });
  expect(result.stderr).toContain(VROEG);
  expect(result.stderr).toContain(TUSSEN);
});

test('leerpunt #810: verschillen de schemas, dan blijft het advies van een nieuwe migratie en staat er ander schema', () => {
  const dir = fixture({ hernoemingen: REGELS, volgorde: dump({ kleur: 'blauw' }) });

  const result = run(dir);

  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(/nieuwe migratie/);
  expect(result.stderr).toMatch(/ander schema/);
  expect(result.stderr).toContain(VROEG);
  expect(result.stderr).toContain(TUSSEN);
});
