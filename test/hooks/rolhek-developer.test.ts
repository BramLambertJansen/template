import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { decide, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';

// GEWIJZIGD (ADR 0091): de drie gevallen "via de toets op effect" (decideChange) zijn weg met de effecttoets; de gevallen
// vooraf (decide) blijven.

// Spec samenhang-checks-rollen/AC-4 (ADR 0068 punt 4): het rolhek weigert de developer specs en bestaande tests, via Edit,
// Write en de toets op effect; architect, tester en hoofdsessie houden wat ze hadden.
const ROOT = '/repo';
const config = loadConfig(readFileSync('.claude/gates.json', 'utf8'));

type Ctx = Parameters<typeof decide>[1];
type Authority = NonNullable<Ctx['authority']>;

const spec = (status: string, tekst = 'Bestaande kit.'): string =>
  `---\nstatus: ${status}\nnamespace: demo\n---\n\n# Demo\n\n## Hergebruik en UX\n\n${tekst}\n`;
const SPEC = 'docs/specs/demo.md';
const SPEC_NIEUW = 'docs/specs/nieuw.md';
const TEST = 'test/rails/demo.test.ts';
const TEST_NIEUW = 'test/rails/nieuw.test.ts';
const TEST_TEKST = "import { test } from 'vitest';\n\ntest('a', () => {\n  expect(1).toBe(1);\n});\n";

const FILES: Record<string, string> = { [SPEC]: spec('voorstel'), [TEST]: TEST_TEKST };

function authority(werkmap: Record<string, string> = FILES): Authority {
  return {
    registry: { version: 1, requiredChecks: ['gate:fast'], decisions: [] },
    repository: 'BramLambertJansen/template',
    branch: 'feat/x',
    trusted: (file) => FILES[file] ?? null,
    working: (file) => werkmap[file] ?? null,
    safe: () => true,
  };
}

function ctx(werkmap: Record<string, string> = FILES): Ctx {
  return {
    root: ROOT,
    cwd: ROOT,
    config,
    read: (rel: string) => werkmap[rel] ?? null,
    committed: (rel: string) => rel in FILES,
    isDir: () => false,
    branch: 'feat/x',
    authority: authority(werkmap),
  };
}

const as = (agent: string | undefined) => (agent === undefined ? {} : { agent_type: agent });
const write = (file: string, content: string, agent?: string) =>
  decide({ tool_name: 'Write', tool_input: { file_path: `${ROOT}/${file}`, content }, ...as(agent) }, ctx());
const edit = (file: string, [from, to]: [string, string], agent?: string) =>
  decide(
    { tool_name: 'Edit', tool_input: { file_path: `${ROOT}/${file}`, old_string: from, new_string: to }, ...as(agent) },
    ctx(),
  );

describe('samenhang-checks-rollen/AC-4: de developer schrijft geen spec', () => {
  test.each([
    ['een nieuwe spec', () => write(SPEC_NIEUW, spec('voorstel'), 'developer')],
    ['inhoud van een voorstel', () => edit(SPEC, ['Bestaande kit.', 'Andere kit.'], 'developer')],
  ])('samenhang-checks-rollen/AC-4 %s: geweigerd, met verwijzing naar de architect', (_naam, maak) => {
    expect(maak().deny.join('\n')).toContain('dat doet de architect');
  });

  test('samenhang-checks-rollen/AC-4 status terug naar voorstel, ook zonder vastgelegde basis: geweigerd', () => {
    const werkmap = { [SPEC]: spec('goedgekeurd') };
    const zonderBasis: Ctx = { ...ctx(werkmap), authority: null };
    const besluit = decide(
      {
        tool_name: 'Edit',
        tool_input: { file_path: `${ROOT}/${SPEC}`, old_string: 'status: goedgekeurd', new_string: 'status: voorstel' },
        agent_type: 'developer',
      },
      zonderBasis,
    );
    expect(besluit.deny).not.toHaveLength(0);
  });

  test('samenhang-checks-rollen/AC-4 terugzetten naar precies de tekst op main: toegestaan', () => {
    const gewijzigd = { ...FILES, [SPEC]: spec('voorstel', 'Lokaal gewijzigd.') };
    const besluit = decide(
      {
        tool_name: 'Write',
        tool_input: { file_path: `${ROOT}/${SPEC}`, content: spec('voorstel') },
        agent_type: 'developer',
      },
      ctx(gewijzigd),
    );
    expect([besluit.deny, besluit.ask]).toStrictEqual([[], []]);
  });

  test.each([
    ['architect', 'architect'],
    ['hoofdsessie', undefined],
  ])('samenhang-checks-rollen/AC-4 %s: een spec schrijven blijft toegestaan', (_rol, agent) => {
    expect(write(SPEC_NIEUW, spec('voorstel'), agent).deny).toStrictEqual([]);
    expect(edit(SPEC, ['Bestaande kit.', 'Andere kit.'], agent).deny).toStrictEqual([]);
  });
});

describe('samenhang-checks-rollen/AC-4: de developer wijzigt geen bestaande test', () => {
  test('samenhang-checks-rollen/AC-4 developer wijzigt een bestaande test: geweigerd, met verwijzing naar hoofdsessie of tester', () => {
    const tekst = edit(TEST, ['toBe(1)', 'toBe(2)'], 'developer').deny.join('\n');
    expect(tekst).toContain('de hoofdsessie doet dat');
    expect(tekst).toContain('de tester');
  });

  test('samenhang-checks-rollen/AC-4 developer voegt een nieuwe test toe: toegestaan', () => {
    expect(write(TEST_NIEUW, TEST_TEKST, 'developer').deny).toStrictEqual([]);
  });

  test.each([
    ['hoofdsessie', undefined],
    ['tester', 'tester'],
  ])('samenhang-checks-rollen/AC-4 %s wijzigt een bestaande test: geen weigering', (_rol, agent) => {
    const besluit = edit(TEST, ['toBe(1)', 'toBe(2)'], agent);
    expect(besluit.deny).toStrictEqual([]);
  });
});

// Bewijsbestand van leerpunt #960 (spec rolhek-leerpunten/AC-9): de weigering van cherry-pick, apply, format-patch of merge
// wijst de developer de route `git checkout <sha> -- <paden>`. De ctx is een ruimer type dan `Ctx` (geen nieuwe velden nodig).
const OVERNAME =
  'overnemen uit een commit kan met git checkout <sha> -- <paden> (expliciete paden), anders doet de hoofdsessie het (spec rolhek-leerpunten/AC-9)';
const OVERNAME_AANHANGSEL = `; ${OVERNAME}`;

function bash(command: string, agent: string | undefined, bestaand: boolean = false) {
  const ctxBash = {
    root: ROOT,
    cwd: ROOT,
    config,
    read: (rel: string) => (rel.endsWith('.test.ts') ? 'x' : null),
    committed: () => false,
    bestaand: (rel: string) => bestaand && rel === 'test/bestaand.test.ts',
    isDir: () => false,
    branch: 'feat/x',
    mergeTrusted: true,
    kitTrusted: true,
    netwerkvormen: ['git commit *', 'git push origin HEAD'],
  };
  const besluit = decide({ tool_name: 'Bash', tool_input: { command }, ...as(agent) }, ctxBash);
  return { deny: besluit.deny, ask: besluit.ask, context: besluit.context };
}

const alles = (b: ReturnType<typeof bash>): string => [...b.deny, ...b.ask, ...b.context].join('\n');
const keren = (tekst: string, deel: string): number => tekst.split(deel).length - 1;

const OVERNAME_COMMANDOS = [
  'git cherry-pick abc1234',
  'git apply p.patch',
  'git merge feat/y',
  'git format-patch -o x -1 abc1234',
];

describe('rolhek-leerpunten/AC-9 de developer krijgt de overnameroute bij elke weigering van cherry-pick, apply, format-patch en merge', () => {
  test.each(OVERNAME_COMMANDOS)(
    'rolhek-leerpunten/AC-9 developer: %s eindigt een weigering met de overnametekst, één keer',
    (command) => {
      const uitslag = bash(command, 'developer');
      expect(uitslag.deny.length).toBeGreaterThan(0);
      expect(uitslag.deny.some((reden) => reden.includes(OVERNAME_AANHANGSEL))).toBe(true);
      expect(keren(uitslag.deny.join('\n'), OVERNAME)).toBe(1);
    },
  );

  test.each(OVERNAME_COMMANDOS)(
    'rolhek-leerpunten/AC-9 regressie: de overnametekst staat nergens voor tester, reviewer en hoofdsessie: %s',
    (command) => {
      for (const agent of ['tester', 'reviewer', undefined]) {
        expect(alles(bash(command, agent))).not.toContain('overnemen uit een commit kan');
      }
    },
  );

  test('rolhek-leerpunten/AC-9 regressie: de weigeringen van de developer blijven (cherry-pick en merge)', () => {
    expect(bash('git cherry-pick abc1234', 'developer').deny.join('\n')).toContain(
      'git cherry-pick schrijft de werkmap',
    );
    expect(bash('git merge feat/y', 'developer').deny.join('\n')).toContain('git merge doet de hoofdsessie');
  });

  test('rolhek-leerpunten/AC-9 regressie: git format-patch -1 abc1234 gaat door voor de developer', () => {
    const uitslag = bash('git format-patch -1 abc1234', 'developer');
    expect([uitslag.deny, uitslag.ask]).toStrictEqual([[], []]);
  });

  test('rolhek-leerpunten/AC-9 regressie: git checkout <sha> -- expliciete paden gaat door voor de developer', () => {
    const uitslag = bash('git checkout abc1234 -- src/a.ts test/a.test.ts', 'developer');
    expect([uitslag.deny, uitslag.ask]).toStrictEqual([[], []]);
  });

  test('rolhek-leerpunten/AC-9 regressie: tegenrij, een bestaande test blijft geweigerd bij git checkout <sha> --', () => {
    const uitslag = bash('git checkout abc1234 -- test/bestaand.test.ts', 'developer', true);
    expect(uitslag.deny.join('\n')).toContain('is een bestaande test');
    expect(uitslag.deny.join('\n')).not.toContain('overnemen uit een commit kan');
  });

  test.each(['.claude/settings.json', 'lefthook.yml'])(
    'rolhek-leerpunten/AC-9 regressie: git checkout <sha> -- %s (zelfladend) blijft geweigerd',
    (pad) => {
      const uitslag = bash(`git checkout abc1234 -- ${pad}`, 'developer');
      expect(uitslag.deny.length).toBeGreaterThan(0);
    },
  );
});
