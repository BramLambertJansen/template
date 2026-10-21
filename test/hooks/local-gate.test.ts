import { expect, test } from 'vitest';
import { subagentStop } from '../../rails/hooks/lib/werkstraat.mjs';

test.each([
  { source: null, expected: 'pnpm gate:fast' },
  { source: '// helper aanwezig', expected: 'node scripts/kit/local-gate.mjs' },
])('developer-stop kiest $expected, rood blijft blokkeren', ({ source, expected }) => {
  const calls: string[] = [];
  const deps = {
    read: (file: string) => (file === 'scripts/kit/local-gate.mjs' ? source : null),
    changed: () => [],
    run: (command: string, args: readonly string[]) => {
      calls.push([command, ...args].join(' '));
      return { code: 1, output: 'inhoudelijke lintfout' };
    },
  };
  expect(subagentStop({ agent_type: 'developer' }, deps).stdout).toContain('Groen vóór klaar');
  expect(calls).toStrictEqual([expected]);
});
