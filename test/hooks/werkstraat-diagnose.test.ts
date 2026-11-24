import { describe, expect, test } from 'vitest';
import { postEdit, subagentStop } from '../../rails/hooks/lib/werkstraat.mjs';

// leerpunt #817 (a): een falende Prettier meldt zich; (b): zonder leesbaar vitest-rapport staat de procesuitvoer in de reden.
const ROOT = '/repo';

function fakeDeps(options: { failing?: readonly string[]; output?: string; changed?: readonly string[] }) {
  return {
    run: (command: string, args: readonly string[]) => {
      const line = [command, ...args].join(' ');
      const failed = (options.failing ?? []).some((part) => line.includes(part));
      return { code: failed ? 1 : 0, output: failed ? (options.output ?? '') : 'ok' };
    },
    changed: () => [...(options.changed ?? [])],
    read: () => null,
  };
}

const edit = (file: string) => ({ tool_name: 'Edit', tool_input: { file_path: file } });

function blocked(result: { stdout?: string }): string {
  if (result.stdout === undefined) return '';
  const parsed: unknown = JSON.parse(result.stdout);
  return typeof parsed === 'object' && parsed !== null && 'reason' in parsed ? String(parsed.reason) : '';
}

describe('post-edit Prettier (leerpunt #817)', () => {
  test('leerpunt #817: Prettier-fout op een lintbaar bestand geeft exit 2 met "Prettier in <rel>:" en de uitvoer', () => {
    const deps = fakeDeps({ failing: ['prettier'], output: 'regel 1\n[error] a.ts: SyntaxError (3:1)' });

    const result = postEdit(edit(`${ROOT}/src/a.ts`), { root: ROOT, deps });

    expect(result.exit).toBe(2);
    expect(result.stderr).toMatch(/^Prettier in src\/a\.ts:\n/);
    expect(result.stderr).toContain('SyntaxError (3:1)');
  });

  test('leerpunt #817: Prettier-fout op een niet-lintbaar bestand (Markdown) geeft ook exit 2', () => {
    const deps = fakeDeps({ failing: ['prettier'], output: '[error] a.md: kapot' });

    const result = postEdit(edit(`${ROOT}/docs/a.md`), { root: ROOT, deps });

    expect(result.exit).toBe(2);
    expect(result.stderr).toMatch(/^Prettier in docs\/a\.md:\n/);
    expect(result.stderr).toContain('kapot');
  });

  test('leerpunt #817: de uitvoer wordt tot de laatste regels beperkt', () => {
    const output = Array.from({ length: 200 }, (_, i) => `regel ${String(i)}`).join('\n');

    const result = postEdit(edit(`${ROOT}/docs/a.md`), {
      root: ROOT,
      deps: fakeDeps({ failing: ['prettier'], output }),
    });

    expect(result.exit).toBe(2);
    expect(result.stderr).toContain('regel 199');
    expect(result.stderr).not.toContain('regel 0\n');
  });

  test('leerpunt #817: geslaagde Prettier blijft ongewijzigd (schoon: niets; ESLint-fout: ESLint-melding)', () => {
    expect(postEdit(edit(`${ROOT}/src/a.ts`), { root: ROOT, deps: fakeDeps({}) })).toStrictEqual({});
    expect(postEdit(edit(`${ROOT}/docs/a.md`), { root: ROOT, deps: fakeDeps({}) })).toStrictEqual({});

    const lint = postEdit(edit(`${ROOT}/src/a.ts`), {
      root: ROOT,
      deps: fakeDeps({ failing: ['eslint'], output: 'lintfout' }),
    });
    expect(lint.exit).toBe(2);
    expect(lint.stderr).toMatch(/^ESLint in src\/a\.ts:/);
  });
});

describe('tester-SubagentStop zonder rapport (leerpunt #817)', () => {
  const tester = (output: string, failing: readonly string[] = ['vitest']) =>
    blocked(subagentStop({ agent_type: 'tester' }, fakeDeps({ changed: ['src/a.test.ts'], failing, output })));

  test('leerpunt #817: "geen uitvoer van vitest" noemt ook de procesuitvoer', () => {
    const reden = tester('vitest afgebroken na 120000 ms');

    expect(reden).toContain('geen uitvoer van vitest');
    expect(reden).toContain('afgebroken na 120000 ms');
  });

  test('leerpunt #817: "onleesbare uitvoer van vitest" noemt ook de procesuitvoer', () => {
    const reden = tester('{ kapot json, proces gestopt: ENOSPC');

    expect(reden).toContain('onleesbare uitvoer van vitest');
    expect(reden).toContain('proces gestopt: ENOSPC');
  });

  test('leerpunt #817: een geldig rapport geeft hetzelfde als nu', () => {
    const rapport = (bericht: string) =>
      JSON.stringify({
        testResults: [
          { name: 'src/a.test.ts', assertionResults: [{ title: 't', status: 'failed', failureMessages: [bericht] }] },
        ],
      });

    expect(tester(rapport('AssertionError: expected 1 to be 2'))).toBe('');
    const reden = tester(rapport('TypeError: x is not a function'));
    expect(reden).toContain('niet op een assertie');
    expect(reden).toContain('TypeError: x is not a function');
  });
});
