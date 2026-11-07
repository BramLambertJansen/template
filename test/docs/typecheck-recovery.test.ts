import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const pkg: unknown = JSON.parse(readFileSync('package.json', 'utf8'));
const scripts: Record<string, unknown> =
  typeof pkg === 'object' && pkg !== null && 'scripts' in pkg && typeof pkg.scripts === 'object' && pkg.scripts !== null
    ? { ...pkg.scripts }
    : {};

test('het herstelcommando zonder pnpm behoudt de argumenten van het typecheck-script', () => {
  const typecheck = scripts['typecheck'];
  if (typeof typecheck !== 'string' || !/^tsc(?=\s|$)/.test(typecheck)) {
    throw new Error('Verwacht een rechtstreeks tsc-commando in package.json scripts.typecheck');
  }
  const herstelcommando = typecheck.replace(/^tsc/, 'node node_modules/typescript/bin/tsc');
  const draaiboek = readFileSync('docs/operations/agent-doorloop.md', 'utf8');
  const blokken = draaiboek.matchAll(/^ {0,3}```(?:bash|sh)[ \t]*\r?\n([\s\S]*?)^ {0,3}```[ \t]*\r?$/gm);
  const regels = Array.from(blokken).flatMap(([, blok = '']) => blok.split(/\r?\n/).map((regel) => regel.trim()));

  expect(regels).toContain(herstelcommando);
});
