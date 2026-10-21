import { closeSync, fstatSync, openSync, renameSync, symlinkSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from 'vitest';
import { readLintFile } from '../../scripts/kit/lint-inputs.mjs';
import { fixture, write } from './local-gate-fixture.ts';

function snapshot(file: string) {
  const descriptor = openSync(file, 'r');
  try {
    return fstatSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

test('een onveranderde gewone lintbron wordt via dezelfde descriptor gelezen', () => {
  const input = fixture();
  const file = path.join(input.root, 'src/input.ts');
  expect(readLintFile(file, snapshot(file)).toString('utf8')).toBe('export const value = 1;\n');
});

test('een bron die na inspectie een symlink wordt, wordt niet gevolgd', () => {
  const input = fixture();
  const file = path.join(input.root, 'src/input.ts');
  const before = snapshot(file);
  unlinkSync(file);
  symlinkSync(input.node, file);
  expect(() => readLintFile(file, before)).toThrow();
});

test('een ander gewoon bestand op dezelfde naam wordt na inspectie geweigerd', () => {
  const input = fixture();
  const file = path.join(input.root, 'src/input.ts');
  const before = snapshot(file);
  write(input.root, 'src/replacement.ts', 'export const value = 2;\n');
  renameSync(path.join(input.root, 'src/replacement.ts'), file);
  expect(() => readLintFile(file, before)).toThrow('lintbron vervangen tijdens invoercontrole');
});
