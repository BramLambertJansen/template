import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { controle } from './schaduw-kit';

// Spec schaduwmodus (docs/template/specs/schaduwmodus.md), AC-12: `pnpm meting --schaduw` als proces, met METING_DIR op een
// tijdelijke map en een tijdelijke repo met .kit/schaduw.json als werkmap. Tests vóór de bouw.
const root = process.cwd();
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tijdelijk(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

type Regel = Record<string, string>;
const gewoon = (s: string): Regel[] => [
  { e: 'UserPromptSubmit', s, b: 'feat-x' },
  { e: 'Stop', s, b: 'feat-x' },
];
const schaduw = (s: string, c: string, k: string): Regel => ({ e: 'Schaduw', s, b: 'feat-x', c, k });

function opslag(schaduwRegels: boolean, extra: Regel[] = []): string {
  const dir = tijdelijk('meting-schaduw-');
  const sessies: Record<string, Regel[]> = {
    's-1': [...gewoon('s-1'), ...(schaduwRegels ? [schaduw('s-1', 'a', 'git push')] : [])],
    's-2': [...gewoon('s-2'), ...(schaduwRegels ? [schaduw('s-2', 'a', 'pnpm test')] : [])],
  };
  for (const regel of schaduwRegels ? extra : []) sessies['s-1']?.push(regel);
  for (const [naam, regels] of Object.entries(sessies))
    writeFileSync(
      path.join(dir, `${naam}.jsonl`),
      `${regels.map((regel) => JSON.stringify({ t: '2026-11-20T10:00:00.000Z', a: 'hoofdsessie', ...regel })).join('\n')}\n`,
    );
  return dir;
}

function werkmap(): string {
  const dir = tijdelijk('meting-schaduw-repo-');
  mkdirSync(path.join(dir, '.git'));
  writeFileSync(path.join(dir, '.git/HEAD'), 'ref: refs/heads/feat-x\n');
  mkdirSync(path.join(dir, '.kit'));
  const register = [controle({ naam: 'a', eind: '2026-11-14' }), controle({ naam: 'b', eind: '2026-11-20' })];
  writeFileSync(path.join(dir, '.kit/schaduw.json'), `${JSON.stringify(register)}\n`);
  return dir;
}

function nepGh(): string {
  const file = path.join(tijdelijk('meting-gh-'), 'gh');
  writeFileSync(file, '#!/usr/bin/env node\nprocess.stdout.write("[]");\n');
  chmodSync(file, 0o755);
  return file;
}

function meting(dir: string, cwd: string, ...args: string[]) {
  const r = spawnSync('node', [path.join(root, 'scripts/kit/meting.mjs'), ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, METING_DIR: dir, METING_GH: nepGh() },
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

test('schaduwmodus/AC-12: --schaduw toont a met 2 treffers en b met 0', () => {
  const uit = meting(opslag(true), werkmap(), '--schaduw');
  expect(uit.stdout.split('\n')).toEqual(
    expect.arrayContaining([
      'schaduw a: 2 treffers, 2 sleutels, 2 sessies, eind 2026-11-14',
      'schaduw b: 0 treffers, 0 sleutels, 0 sessies, eind 2026-11-20',
    ]),
  );
  expect(uit.status, uit.stderr).toBe(0);
});

test('schaduwmodus/AC-12: een controle in de opslag die niet in het register staat krijgt (niet in register)', () => {
  const uit = meting(opslag(true, [schaduw('s-1', 'z', 'git push')]), werkmap(), '--schaduw');
  const regel = uit.stdout.split('\n').find((r) => r.startsWith('schaduw z:'));
  expect(regel).toBe('schaduw z: 1 treffers, 1 sleutels, 1 sessies (niet in register)');
});

test('schaduwmodus/AC-12: pnpm meting zonder vlag geeft dezelfde tellingen als zonder de Schaduw-regels', () => {
  const werk = werkmap();
  const met = meting(opslag(true), werk, '--schaduw');
  expect(met.stdout).toContain('schaduw a: 2 treffers');
  for (const args of [[], ['--json']]) {
    const metRegels = meting(opslag(true), werk, ...args);
    const zonderRegels = meting(opslag(false), werk, ...args);
    expect(metRegels.status, metRegels.stderr).toBe(0);
    expect(metRegels.stdout).toBe(zonderRegels.stdout);
  }
});

test('schaduwmodus/AC-12: de help noemt --schaduw', () => {
  const uit = meting(opslag(false), werkmap(), '--help');
  expect(uit.stdout).toContain('--schaduw');
});
