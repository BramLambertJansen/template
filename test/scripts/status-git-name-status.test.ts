import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { parseNameStatus } from '../../scripts/kit/status-git.mjs';

// templateregime/AC-13: parseNameStatus bleef bestaan in status-git.mjs (statusOnlyDiff) toen diff-guard.mjs verdween.
// Echte git-uitvoer in een tijdelijke repository; geen mock van git.
const mappen: string[] = [];

afterEach(() => {
  for (const map of mappen.splice(0)) rmSync(map, { recursive: true, force: true });
});

test('templateregime/AC-13 parseNameStatus leest echte git-uitvoer: hernoeming, verwijdering, spatie en regeleinde in een pad', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'status-git-'));
  mappen.push(root);
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.test', ...args], {
      cwd: root,
      encoding: 'utf8',
    });
  git('init', '-q', '-b', 'main');
  mkdirSync(path.join(root, 'e2e'));
  writeFileSync(path.join(root, 'e2e/a.spec.ts'), 'test("a", () => {});\n'.repeat(5));
  writeFileSync(path.join(root, 'weg.ts'), 'x\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'basis');
  renameSync(path.join(root, 'e2e/a.spec.ts'), path.join(root, 'e2e/b.spec.ts'));
  writeFileSync(path.join(root, 'met spatie\nen regel.ts'), 'y\n');
  git('rm', '-q', 'weg.ts');
  git('add', '-A');
  git('commit', '-q', '-m', 'wijziging');

  const uitvoer = git('diff', '--name-status', '-z', '--find-renames', 'HEAD~1', 'HEAD');

  expect(parseNameStatus(uitvoer)).toStrictEqual([
    { status: 'R', van: 'e2e/a.spec.ts', pad: 'e2e/b.spec.ts' },
    { status: 'A', pad: 'met spatie\nen regel.ts' },
    { status: 'D', pad: 'weg.ts' },
  ]);
});
