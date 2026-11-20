import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';

// Leerpunt #812: na de tweede bouw (`gen-volgorde`) vergelijkt scripts/check-snapshot.sh alleen de SQL-dump, dus de runner
// start daar alleen `gen-snapshot`; de eerste bouw (`gen`) maakt SQL en TypeScript. Het echte runner.sh draait in een
// fixture-repo met een nagebootste docker die per `compose run` de dienst vastlegt (zoals runner-gen-volgorde.test.ts).
const root = path.join(import.meta.dirname, '../..');
const script = readFileSync(path.join(root, 'scripts/runner.sh'), 'utf8');
const dirs: string[] = [];

const DOCKER = `#!/bin/bash
if [[ "$*" == *" run --rm --build "* ]]; then
  printf '%s\\n' "\${@: -1}" >> "$STUB_DIR/diensten"
fi
`;

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function write(dir: string, name: string, content: string): void {
  const file = path.join(dir, name);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function fixture(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'runner-gen-diensten-'));
  dirs.push(dir);
  write(dir, 'scripts/runner.sh', script);
  // Een toegevoegde migratie die ouder is dan de bestaande: alleen dan draait gen-volgorde (check-snapshot.sh).
  write(
    dir,
    'scripts/kit/migratie-volgorde.mjs',
    "process.stdout.write('20261008000000_vroeg.sql 20261009000001_vroeg.sql\\n');\n",
  );
  write(dir, 'package.json', '{}');
  write(dir, '.gitignore', 'node_modules/\n.runner-output/\nstubs/\n');
  write(dir, 'db/migrations/20261009000000_baseline.sql', '-- baseline\n');
  write(dir, 'db/migrations/20261008000000_vroeg.sql', '-- vroeg\n');
  mkdirSync(path.join(dir, 'node_modules'));
  const git = spawnSync('git', ['init', '-q'], { cwd: dir, encoding: 'utf8' });
  if (git.status !== 0) throw new Error(git.stderr);
  const add = spawnSync('git', ['add', '.'], { cwd: dir, encoding: 'utf8' });
  if (add.status !== 0) throw new Error(add.stderr);
  write(dir, 'stubs/docker', DOCKER);
  chmodSync(path.join(dir, 'stubs/docker'), 0o755);
  return dir;
}

function diensten(dir: string, doel: string): string[] {
  // Alleen fixturecode en een Docker-stub: geen echte runneroverride of Docker-aanroep.
  const result = spawnSync('bash', ['scripts/runner.sh', doel, '--sta-wijzigingen-toe'], {
    cwd: dir,
    encoding: 'utf8',
    timeout: 30_000,
    env: {
      HOME: dir,
      TMPDIR: tmpdir(),
      PATH: `${dir}/stubs:${path.dirname(process.execPath)}:/usr/bin:/bin`,
      STUB_DIR: `${dir}/stubs`,
    },
  });
  expect(result.stderr).toBe('');
  expect(result.status).toBe(0);
  const file = path.join(dir, 'stubs/diensten');
  return existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n') : [];
}

test('leerpunt #812: gen bouwt de SQL-dump en het TypeScript-schema', () => {
  expect(diensten(fixture(), 'gen')).toStrictEqual(['gen-snapshot', 'gen-schema']);
});

test('leerpunt #812: gen-volgorde bouwt alleen de SQL-dump die check:snapshot vergelijkt', () => {
  expect(diensten(fixture(), 'gen-volgorde')).toStrictEqual(['gen-snapshot']);
});
