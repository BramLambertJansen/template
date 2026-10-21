import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export function write(root: string, file: string, text: string): void {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), text);
}

export function git(root: string, ...args: string[]): string {
  return execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.test', ...args], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

export function fixture(): { root: string; env: NodeJS.ProcessEnv; node: string } {
  const base = mkdtempSync(path.join(tmpdir(), 'local-gate-'));
  const root = path.join(base, 'project');
  const node = path.join(base, 'node');
  writeFileSync(node, 'fixture runtime\n');
  mkdirSync(root);
  for (const name of [
    'eslint.config.js',
    'tsconfig.base.json',
    'tsconfig.json',
    'tsconfig.node.json',
    'tsconfig.web.json',
  ])
    copyFileSync(name, path.join(root, name));
  write(root, 'package.json', JSON.stringify({ type: 'module', scripts: { lint: 'eslint . --max-warnings 0' } }));
  write(root, 'src/input.ts', 'export const value = 1;\n');
  write(root, 'node_modules/.modules.yaml', 'fixture\n');
  write(root, 'node_modules/eslint/bin/eslint.js', '// fixture\n');
  write(root, '.gitignore', 'node_modules/\n');
  git(root, 'init', '-q', '-b', 'fixture');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'fixture');
  return { root, env: { PATH: process.env['PATH'], TMPDIR: base }, node };
}

export function cacheRecord(root: string): string {
  const directory = path.join(path.dirname(root), 'template-lint-cache');
  const first = readdirSync(directory)[0];
  if (first === undefined) throw new Error('geen cachemap');
  return path.join(directory, first, 'lint.json');
}
