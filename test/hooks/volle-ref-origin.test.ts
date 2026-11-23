import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { trustedBase } from '../../rails/hooks/lib/authority-context.mjs';
import { ankerVerouderd } from '../../rails/hooks/lib/runner-authority.mjs';
import { changedFiles, sessionStart } from '../../rails/hooks/lib/werkstraat.mjs';

// Leerpunt #932: de hooks lezen de vertrouwde ref met de korte naam `origin/main`. Git zoekt die eerst als
// `refs/heads/origin/main`, dus een lokale branch met die naam schaduwt de remote-tracking ref. De vier plekken moeten
// de volle naam `refs/remotes/origin/main` gebruiken.
const GIT_ENV = {
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@example.com',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@example.com',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
};
const VOL = 'refs/remotes/origin/main';
const dirs: string[] = [];

beforeEach(() => {
  Reflect.deleteProperty(process.env, 'RAILS_ANKER');
});

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_ENV } });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
}

function commit(root: string, rel: string, tekst: string): string {
  mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  writeFileSync(path.join(root, rel), tekst);
  git(root, 'add', '--', rel);
  git(root, 'commit', '-q', '-m', rel);
  return git(root, 'rev-parse', 'HEAD');
}

/** Commit A met scripts/x.mjs en package.json; geeft root en sha van A. */
function repoMetA() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'volle-ref-')));
  dirs.push(root);
  git(root, 'init', '-q', '-b', 'main');
  mkdirSync(path.join(root, 'scripts'), { recursive: true });
  writeFileSync(path.join(root, 'scripts/x.mjs'), 'a\n');
  writeFileSync(path.join(root, 'package.json'), '{}\n');
  git(root, 'add', '--', 'scripts/x.mjs', 'package.json');
  git(root, 'commit', '-q', '-m', 'A');
  return { root, a: git(root, 'rev-parse', 'HEAD') };
}

describe('volle-ref-origin: trustedBase zonder anker', () => {
  test('een lokale branch origin/main op A schaduwt refs/remotes/origin/main op B niet', () => {
    const { root, a } = repoMetA();
    const b = commit(root, 'scripts/x.mjs', 'b\n');
    git(root, 'update-ref', VOL, b);
    git(root, 'update-ref', 'refs/heads/origin/main', a);
    expect(trustedBase(root, undefined)?.sha).toBe(b);
  });
});

describe('volle-ref-origin: ankerVerouderd', () => {
  test('anker A, remote-ref B, lokale branch origin/main op A: toch true', () => {
    const { root, a } = repoMetA();
    const b = commit(root, 'scripts/x.mjs', 'b\n');
    git(root, 'update-ref', VOL, b);
    git(root, 'update-ref', 'refs/heads/origin/main', a);
    expect(ankerVerouderd(root, { sha: a })).toBe(true);
  });
});

describe('volle-ref-origin: changedFiles', () => {
  test('merge-base krijgt de volle ref refs/remotes/origin/main', () => {
    const calls: string[][] = [];
    const run = (_command: string, args: readonly string[]) => {
      calls.push([...args]);
      return { code: 1, output: '' };
    };
    changedFiles(run, () => true);
    expect(calls.find((args) => args[0] === 'merge-base')).toStrictEqual(['merge-base', VOL, 'HEAD']);
  });
});

describe('volle-ref-origin: mainLag (via sessionStart)', () => {
  test('rev-list krijgt refs/remotes/origin/main...HEAD', () => {
    const calls: string[][] = [];
    const deps = {
      run: (_command: string, args: readonly string[]) => {
        calls.push([...args]);
        return { code: 0, output: args[0] === 'rev-list' ? '0\t0' : '' };
      },
      changed: () => [],
      read: () => null,
    };
    sessionStart(deps);
    const revList = calls.find((args) => args[0] === 'rev-list');
    expect(revList).toContain(`${VOL}...HEAD`);
  });
});
