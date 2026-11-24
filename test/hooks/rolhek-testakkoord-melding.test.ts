import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { decide, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';

// Spec rolhek-herstel/AC-3 (leerpunt #688): een subagent die een bestaand testbestand verwijdert, skipt of er gevallen uit haalt,
// krijgt een weigering die de route noemt (de hoofdsessie krijgt de vraag aan de eigenaar). De hoofdsessie houdt haar vraag
// zonder die aanvulling; een fixture of setup houdt de bestaande melding.
const ROOT = '/repo';
const config = loadConfig(readFileSync('.claude/gates.json', 'utf8'));
const TEST = 'src/api/routes/a.test.ts';
const FIXTURE = 'test/rails/fixtures/secdef/goed.sql';
const FILES: Record<string, string> = {
  [TEST]: "test('a', () => {});\ntest('b', () => {});\n",
  [FIXTURE]: 'create function f() returns void;\n',
};

// De letterlijke testakkoordtekst uit de spec ("Hergebruik en UX").
const TESTAKKOORD =
  '; noemt een gemergede spec het akkoord (Raakt ook), dan doet de hoofdsessie deze wijziging: zij krijgt de vraag aan de eigenaar (spec rolhek-herstel/AC-3)';

function run(payload: unknown) {
  return decide(payload, {
    root: ROOT,
    cwd: ROOT,
    config,
    read: (rel: string) => FILES[rel] ?? null,
    committed: (rel: string) => rel in FILES,
    isDir: () => false,
    branch: 'feat/x',
  });
}

const as = (agent: string | undefined) => (agent === undefined ? {} : { agent_type: agent });
const write = (file: string, content: string, agent?: string) => ({
  tool_name: 'Write',
  tool_input: { file_path: `${ROOT}/${file}`, content },
  ...as(agent),
});
const edit = (file: string, [from, to]: [string, string], agent?: string) => ({
  tool_name: 'Edit',
  tool_input: { file_path: `${ROOT}/${file}`, old_string: from, new_string: to },
  ...as(agent),
});
const bash = (command: string, agent?: string) => ({ tool_name: 'Bash', tool_input: { command }, ...as(agent) });

/** Elke wijziging die `existingTest` als skip, weghalen of verwijderen telt, als payload voor een rol. */
const WIJZIGINGEN: readonly { naam: string; payload: (agent?: string) => unknown }[] = [
  { naam: 'testgevallen weghalen (Write)', payload: (a) => write(TEST, "test('a', () => {});\n", a) },
  { naam: 'testgevallen weghalen (Edit)', payload: (a) => edit(TEST, ["test('b', () => {});\n", ''], a) },
  { naam: 'een test skippen (Edit)', payload: (a) => edit(TEST, ["test('a'", "test.skip('a'"], a) },
  { naam: 'het bestand verwijderen (Bash)', payload: (a) => bash(`rm ${TEST}`, a) },
];

describe('rolhek-herstel/AC-3: testakkoordmelding in existingTest', () => {
  test.each(['tester', 'developer'])(
    'rolhek-herstel/AC-3: %s krijgt een weigering die eindigt met de testakkoordtekst',
    (agent) => {
      for (const { naam, payload } of WIJZIGINGEN) {
        const decision = run(payload(agent));
        const eindigtOpTekst = decision.deny.some((reden) => reden.endsWith(TESTAKKOORD));
        expect({ naam, agent, eindigtOpTekst }).toEqual({ naam, agent, eindigtOpTekst: true });
      }
    },
  );

  test('rolhek-herstel/AC-3: de hoofdsessie krijgt de vraag zonder de testakkoordtekst', () => {
    for (const { naam, payload } of WIJZIGINGEN) {
      const decision = run(payload());
      // De vraag blijft: de eigenaar beslist (ask), geen weigering en geen aanvulling.
      expect({ naam, deny: decision.deny.length, ask: decision.ask.length > 0 }).toEqual({
        naam,
        deny: 0,
        ask: true,
      });
      expect({ naam, metTekst: decision.ask.some((reden) => reden.includes('hoofdsessie deze wijziging')) }).toEqual({
        naam,
        metTekst: false,
      });
    }
  });

  test('rolhek-herstel/AC-3: de aanvulling is de testakkoordroute en vervangt de bestaande melding niet', () => {
    const decision = run(edit(TEST, ["test('a'", "test.skip('a'"], 'developer'));
    const reden = decision.deny.find((tekst) => tekst.endsWith(TESTAKKOORD)) ?? '';
    expect(reden).toContain(`${TEST}: een test skippen alleen met akkoord van de eigenaar (AGENTS.md)`);
  });

  test.each(['tester', 'developer'])(
    'rolhek-herstel/AC-3: een fixture (LOCKED_HELPERS) houdt de bestaande melding voor %s, zonder testakkoordtekst',
    (agent) => {
      const decision = run(edit(FIXTURE, ['void', 'int'], agent));
      expect(decision.deny.some((reden) => reden.includes('is een fixture of setup'))).toBe(true);
      expect(decision.deny.filter((reden) => reden.includes(TESTAKKOORD))).toEqual([]);
    },
  );

  test('rolhek-herstel/AC-3: een fixture houdt voor de hoofdsessie de vraag zonder testakkoordtekst', () => {
    const decision = run(edit(FIXTURE, ['void', 'int']));
    expect(decision.ask.some((reden) => reden.includes('is een fixture of setup'))).toBe(true);
    expect(decision.ask.filter((reden) => reden.includes(TESTAKKOORD))).toEqual([]);
  });
});

describe('rolhek-herstel/AC-3: .claude/agents/tester.md', () => {
  test('rolhek-herstel/AC-3: punt 5 noemt de route via de hoofdsessie en de gemergede spec', () => {
    const regels = readFileSync('.claude/agents/tester.md', 'utf8').split('\n');
    const punt = regels.find((regel) => regel.startsWith('5. ')) ?? '';
    expect(punt).toContain('Bestaande tests wijzig of verwijder je niet zonder akkoord van de eigenaar');
    expect(punt).toContain('hoofdsessie');
    expect(punt).toContain('gemergede spec');
  });
});
