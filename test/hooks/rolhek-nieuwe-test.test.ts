import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { decide, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';

// Leerpunt #887: een testbestand is pas "bestaand" als het op origin/main staat (ctx.bestaand), niet zodra het op schijf staat.
// Een nieuw, nog niet gemergd testbestand mag de developer dus bewerken en verwijderen, ook als het al op de branch is gecommit.
const ROOT = '/repo';
const config = loadConfig(readFileSync('.claude/gates.json', 'utf8'));
const PAD = 'test/scripts/x.test.ts';
const FILES: Record<string, string> = { [PAD]: "test('a', () => {});\ntest('b', () => {});\n" };

type Committed = boolean | 'zonder-origin';

function beslis(payload: unknown, committed: Committed) {
  return decide(payload, {
    root: ROOT,
    cwd: ROOT,
    config,
    read: (rel: string) => FILES[rel] ?? null,
    committed: () => false,
    bestaand: () => committed,
    isDir: () => false,
    branch: 'feat/x',
  });
}

const alleMeldingen = (d: ReturnType<typeof decide>) => [...d.deny, ...d.ask, ...d.context];
const bestaandeTest = (d: ReturnType<typeof decide>) => alleMeldingen(d).filter((m) => m.includes('bestaande test'));

const edit = (agent?: string) => ({
  tool_name: 'Edit',
  tool_input: {
    file_path: `${ROOT}/${PAD}`,
    old_string: "test('a', () => {});",
    new_string: "test('a', () => { expect(1).toBe(1); });",
  },
  ...(agent === undefined ? {} : { agent_type: agent }),
});
const write = (agent?: string) => ({
  tool_name: 'Write',
  tool_input: {
    file_path: `${ROOT}/${PAD}`,
    content: "test('a', () => {});\ntest('b', () => {});\ntest('c', () => {});\n",
  },
  ...(agent === undefined ? {} : { agent_type: agent }),
});
const rm = (agent?: string) => ({
  tool_name: 'Bash',
  tool_input: { command: `rm ${PAD}` },
  ...(agent === undefined ? {} : { agent_type: agent }),
});

describe('nieuw testbestand (niet op origin/main): developer mag bewerken en verwijderen', () => {
  test('developer Edit op nieuw testbestand: geen "bestaande test"', () => {
    expect(bestaandeTest(beslis(edit('developer'), false))).toEqual([]);
    expect(beslis(edit('developer'), false).deny).toEqual([]);
  });

  test('developer Write op nieuw testbestand: geen "bestaande test"', () => {
    expect(bestaandeTest(beslis(write('developer'), false))).toEqual([]);
    expect(beslis(write('developer'), false).deny).toEqual([]);
  });

  test('developer rm op nieuw testbestand: geen deny of ask over een bestaande test', () => {
    const d = beslis(rm('developer'), false);
    expect(bestaandeTest(d)).toEqual([]);
    expect(d.deny).toEqual([]);
    expect(d.ask).toEqual([]);
  });

  test('hoofdsessie Edit op nieuw testbestand: geen context "is een bestaande test"', () => {
    expect(bestaandeTest(beslis(edit(), false))).toEqual([]);
  });
});

const BESTAAND: { naam: string; committed: Committed }[] = [
  { naam: 'op origin/main (true)', committed: true },
  { naam: 'zonder origin (faalt dicht)', committed: 'zonder-origin' },
];

describe.each(BESTAAND)('bestaand testbestand $naam: developer blijft vergrendeld', ({ committed }) => {
  test('developer Edit blijft een deny met "is een bestaande test"', () => {
    const d = beslis(edit('developer'), committed);
    expect(d.deny.some((m) => m.includes('is een bestaande test'))).toBe(true);
  });

  test('developer rm blijft een gate (verwijderen alleen met akkoord van de eigenaar)', () => {
    const d = beslis(rm('developer'), committed);
    const gates = [...d.deny, ...d.ask];
    expect(gates.some((m) => m.includes('verwijderen alleen met akkoord van de eigenaar'))).toBe(true);
  });
});
