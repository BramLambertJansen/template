import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { subagentStop } from '../../rails/hooks/lib/werkstraat.mjs';

// Spec agents-leveren (punt 1a, gebouwd in #850): de agentteksten zeggen wat de hooks en skills werkelijk doen, en verwijzen
// naar één bron in plaats van een kopie.
const lees = (rol: string): string => readFileSync(`.claude/agents/${rol}.md`, 'utf8');

/** Punt `n` van een genummerde lijst: de regel die met `n. ` begint. */
function punt(tekst: string, n: number): string {
  return tekst.split('\n').find((regel) => regel.startsWith(`${String(n)}. `)) ?? '';
}

describe('agents-leveren/AC-7 tester punt 4 zegt wat de SubagentStop-hook draait', () => {
  test('agents-leveren/AC-7 de hook draait Vitest alleen op gewijzigde unittests, niet op *.int.test.ts of e2e', () => {
    const calls: string[] = [];
    const deps = {
      run: (command: string, args: readonly string[]) => {
        calls.push([command, ...args].join(' '));
        return { code: 0, output: '{"testResults":[]}' };
      },
      changed: () => ['a.test.ts', 'b.test.tsx', 'c.int.test.ts', 'e2e/d.spec.ts'],
      read: () => null,
    };

    subagentStop({ agent_type: 'tester' }, deps);

    const vitest = calls.filter((call) => call.includes('vitest'));
    expect(vitest).toHaveLength(1);
    const woorden = (vitest[0] ?? '').split(' ');
    expect(woorden.filter((woord) => /\.(test|spec)\.tsx?$/.test(woord))).toStrictEqual(['a.test.ts', 'b.test.tsx']);
  });

  test('agents-leveren/AC-7 punt 4 van tester.md noemt *.int.test.ts en e2e als niet gedraaid', () => {
    const vier = punt(lees('tester'), 4);
    expect(vier).toContain('`*.int.test.ts`');
    expect(vier).toMatch(/draait geen integratie-, pgTAP- of e2e-tests/);
  });
});

describe('agents-leveren/AC-8 architect en docs verwijzen naar één bron', () => {
  test('agents-leveren/AC-8 punt 6 van de architect verwijst naar de afsluitcheck van de skill spec, zonder eigen lijst', () => {
    const architect = lees('architect');
    expect(punt(architect, 6)).toContain('.claude/skills/spec/SKILL.md');
    expect(architect).not.toContain('check:migrations');
  });

  test('agents-leveren/AC-8 de docs-agent noemt schrijfrecht.docs en geen padlijst', () => {
    const docs = lees('docs');
    expect(docs).toContain('schrijfrecht.docs');
    for (const pad of ['docs/reviews/', 'docs/operations/', 'CHANGELOG.md']) expect(docs).not.toContain(pad);
  });
});
