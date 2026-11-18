import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

// Leerpunt #720: een check die niet kan starten (ENOENT: pnpm ontbreekt) mag er niet uitzien als een rode check met lege
// uitvoer. De hook meldt dan "kon niet starten: <commando> (<foutcode>)"; de uitslag blijft rood (decision block).
// Het echte entry-script (rails/hooks/werkstraat.mjs) met een PATH waarin alleen git staat, zonder pnpm.
const root = process.cwd();

function findOnPath(name: string): string {
  const dirs = (process.env['PATH'] ?? '').split(path.delimiter);
  const found = dirs.map((dir) => path.join(dir, name)).find((file) => existsSync(file));
  if (found === undefined) throw new Error(`${name} staat niet op het PATH van de test`);
  return found;
}

/** Een tijdelijke map met alleen `git` erin (en optioneel een nep-pnpm), als enige PATH-map voor de hook. */
function binDir(fakePnpm?: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'werkstraat-bin-'));
  symlinkSync(findOnPath('git'), path.join(dir, 'git'));
  if (fakePnpm !== undefined) {
    writeFileSync(path.join(dir, 'pnpm'), `#!/bin/sh\n${fakePnpm}\n`);
    chmodSync(path.join(dir, 'pnpm'), 0o755);
  }
  return dir;
}

/** Een git-repo met één ongecommit .ts-bestand, zodat de Stop-hook zijn checks start. */
function repoMetWijziging(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'werkstraat-startfout-'));
  const git = (...args: string[]) =>
    spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd: dir });
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'tmp' }));
  git('init', '-b', 'startfout');
  git('add', '.');
  git('commit', '-m', 'init');
  writeFileSync(path.join(dir, 'nieuw.ts'), 'export const x = 1;\n');
  return dir;
}

function runHook(event: string, payload: object, bin: string) {
  const result = spawnSync(process.execPath, [path.join(root, 'rails/hooks/werkstraat.mjs'), event], {
    cwd: root,
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, PATH: bin },
  });
  return { status: result.status, stdout: result.stdout };
}

describe('werkstraat-hook: een check die niet kan starten', () => {
  test('stop: ontbrekende pnpm blokkeert en meldt "kon niet starten: pnpm (ENOENT)"', () => {
    const result = runHook('stop', { cwd: repoMetWijziging() }, binDir());

    expect(result.stdout).toContain('"decision":"block"');
    expect(result.stdout).toMatch(/kon niet starten: pnpm[^"]*\(ENOENT\)/);
  });

  test('stop: de startfout staat bij elke check die niet start (typecheck, lint en unit)', () => {
    const result = runHook('stop', { cwd: repoMetWijziging() }, binDir());

    expect((result.stdout.match(/kon niet starten: pnpm/g) ?? []).length).toBe(3);
  });

  test('subagent-stop tester: ontbrekende pnpm blokkeert en meldt de startfout', () => {
    const result = runHook('subagent-stop', { agent_type: 'tester', cwd: repoMetWijziging() }, binDir());

    expect(result.stdout).toContain('"decision":"block"');
    expect(result.stdout).toMatch(/kon niet starten: pnpm[^"]*\(ENOENT\)/);
  });

  test('stop: een check die wel start maar rood is, houdt zijn eigen uitvoer en krijgt geen startfout', () => {
    const bin = binDir('echo "typecheck kapot: TS2322"; exit 1');

    const result = runHook('stop', { cwd: repoMetWijziging() }, bin);

    expect(result.stdout).toContain('"decision":"block"');
    expect(result.stdout).toContain('typecheck kapot: TS2322');
    expect(result.stdout).not.toContain('kon niet starten');
  });

  test('stop: een groene check meldt geen startfout en blokkeert niet', () => {
    const bin = binDir('exit 0');

    const result = runHook('stop', { cwd: repoMetWijziging() }, bin);

    expect(result).toStrictEqual({ status: 0, stdout: '' });
  });
});
