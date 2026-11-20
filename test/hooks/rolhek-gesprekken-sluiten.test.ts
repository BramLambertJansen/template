import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { decide, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';
import { codeownersTekst, eersteGoedkeurder } from '../../scripts/kit/codeowners.mjs';
import { expectNegativeTable } from '../support/negative-table.ts';

// spec botgesprekken-sluiten (docs/template/specs/botgesprekken-sluiten.md, ADR 0098), tests vóór de bouw: AC-7 en AC-8 het
// rolhek op `pnpm pr:resolve <nr>` (alleen de hoofdsessie, alleen precies die vorm), AC-9 en AC-10 de kale mutaties en de
// wisroute voor reviewopmerkingen (voor elke rol dicht), AC-11 de configuratie. De vorm volgt test/hooks/rolhek-pr-merge.test.ts.
// De bestaande tests in dat bestand slagen ongewijzigd (AC-9).
const config = loadConfig(readFileSync('.claude/gates.json', 'utf8'));

// `expectNegativeTable` faalt met de rijen die niet bewaakt worden (sinds leerpunt #875 al als AssertionError); hier wordt dat een assertie op die melding,
// zodat een rij die nog niet geweigerd wordt als assertie faalt (SubagentStop-hook) en de melding de rijen noemt.
function verwachtTabel<B>(tabel: Parameters<typeof expectNegativeTable<B>>[0]): void {
  let melding = '';
  try {
    expectNegativeTable(tabel);
  } catch (error) {
    melding = error instanceof Error ? error.message : String(error);
  }
  expect(melding, 'elke rij van de negatieve tabel wordt bewaakt').toBe('');
}

interface Opties {
  agent?: string;
  vertrouwd?: boolean;
  cwd?: string;
}

function beslis(command: string, opties: Opties = {}) {
  return decide(
    { tool_name: 'Bash', tool_input: { command }, agent_type: opties.agent ?? '' },
    {
      root: '/repo',
      cwd: opties.cwd ?? '/repo',
      config,
      read: () => null,
      committed: () => false,
      isDir: () => false,
      branch: 'feat/x',
      mergeTrusted: opties.vertrouwd ?? true,
    },
  );
}

function verdict(command: string, opties: Opties = {}) {
  const decision = beslis(command, opties);
  if (decision.deny.length > 0) return { uitslag: 'deny', reden: decision.deny.join('; ') };
  if (decision.ask.length > 0) return { uitslag: 'ask', reden: decision.ask.join('; ') };
  return { uitslag: decision.allow === true ? 'allow' : 'context', reden: '' };
}

const SUBAGENTS = ['developer', 'tester', 'architect', 'reviewer', 'docs'];
const ROLLEN = ['hoofdsessie', ...SUBAGENTS];
const alsRol = (rol: string): Opties => (rol === 'hoofdsessie' ? {} : { agent: rol });
const weigertMet = (command: string, reden: string, rol: string) =>
  beslis(command, alsRol(rol)).deny.join('; ').includes(reden);

const REDEN_SUBAGENT = 'Gesprekken sluiten via pnpm pr:resolve doet alleen de hoofdsessie (ADR 0098)';
const REDEN_BUITEN_ROOT =
  'pnpm pr:resolve alleen vanuit de repo-root, met modus "niet-kritiek" in het anker en scripts, rails en hostbestanden (package.json, .npmrc, …) gelijk aan het anker (ADR 0098)';
const REDEN_VORM = 'Het sluitscript draait alleen als precies `pnpm pr:resolve <nummer>` (ADR 0098)';
const REDEN_MUTATIE = 'gh api: labels, reviews en statussen zet alleen de eigenaar';
const REDEN_WISROUTE =
  'gh api: een reviewopmerking wijzigen of wissen doet alleen de eigenaar, voor elke rol (ADR 0098)';

describe('botgesprekken-sluiten/AC-7 rolhek op pnpm pr:resolve', () => {
  test.each(['pnpm pr:resolve 12', '  pnpm  pr:resolve 7 '])(
    'botgesprekken-sluiten/AC-7: hoofdsessie, vertrouwd, vanuit de repo-root: allow (%s)',
    (command) => {
      expect(verdict(command).uitslag).toBe('allow');
    },
  );

  test('botgesprekken-sluiten/AC-7: hoofdsessie, niet vertrouwd (modus of bestanden wijken af): deny met de reden', () => {
    const uitslag = verdict('pnpm pr:resolve 12', { vertrouwd: false });
    expect(uitslag.uitslag).toBe('deny');
    expect(uitslag.reden).toContain(REDEN_BUITEN_ROOT);
  });

  test('botgesprekken-sluiten/AC-7: buiten de repo-root: deny met dezelfde reden', () => {
    const uitslag = verdict('pnpm pr:resolve 12', { cwd: '/repo/src' });
    expect(uitslag.uitslag).toBe('deny');
    expect(uitslag.reden).toContain(REDEN_BUITEN_ROOT);
  });

  test.each(['developer', 'tester', 'architect', 'reviewer', 'docs', 'onbekend'])(
    'botgesprekken-sluiten/AC-7: subagent %s: altijd deny met de reden voor de hoofdsessie',
    (agent) => {
      const uitslag = verdict('pnpm pr:resolve 12', { agent });
      expect(uitslag.uitslag).toBe('deny');
      expect(uitslag.reden).toContain(REDEN_SUBAGENT);
    },
  );

  test('botgesprekken-sluiten/AC-7: ook een niet vertrouwde subagent krijgt de reden voor de hoofdsessie', () => {
    const uitslag = verdict('pnpm pr:resolve 12', { agent: 'developer', vertrouwd: false });
    expect(uitslag.uitslag).toBe('deny');
    expect(uitslag.reden).toContain(REDEN_SUBAGENT);
  });
});

describe('botgesprekken-sluiten/AC-8 rolhek: andere vormen van het sluitscript zijn dicht', () => {
  test.each([
    'node scripts/kit/pr-resolve.mjs 12',
    'pnpm pr:resolve 12 && echo klaar',
    'pnpm pr:resolve 12 --force',
    'npm run pr:resolve 12',
    'pnpm run pr:resolve 12',
    'pnpm pr:resolve 012',
    'pnpm pr:resolve $(echo 12)',
    'env X=1 node scripts/kit/pr-resolve.mjs 12',
    '/usr/bin/node scripts/kit/pr-resolve.mjs 12',
    'sh -c "pnpm pr:resolve 12"',
    "bash -c 'node scripts/kit/pr-resolve.mjs 12'",
    'cd scripts/kit && node pr-resolve.mjs 12',
    'pnpm p\\r:resolve 12',
    "git -c alias.x='!node scripts/kit/pr-resolve.mjs 12' x",
    'rg --pre node x scripts/kit/pr-resolve.mjs',
    'LESSOPEN="|node %s" less scripts/kit/pr-resolve.mjs',
    'node scripts/kit/pr-res*.mjs 12',
    'node scripts/kit/pr-resolv?.mjs 12',
    'node scripts/kit/pr-resol[v]e.mjs 12',
    'cd scripts/kit && node pr-r*.mjs 12',
    'pnpm pr:*ve 12',
  ])('botgesprekken-sluiten/AC-8: andere vorm: deny met de reden voor de vorm (%s)', (command) => {
    const uitslag = verdict(command);
    expect(uitslag.uitslag).toBe('deny');
    expect(uitslag.reden).toContain(REDEN_VORM);
  });

  test.each([
    'cat scripts/kit/pr-resolve.mjs',
    'git log -- scripts/kit/pr-resolve.mjs',
    'grep -n x scripts/kit/pr-resolve.mjs',
  ])('botgesprekken-sluiten/AC-8: lezen blijft vrij (%s)', (command) => {
    expect(verdict(command).uitslag).not.toBe('deny');
  });
});

// De kale mutaties: voor de hoofdsessie en elke subagent dezelfde reden als bij labels, reviews en statussen (AC-9).
const MUTATIES = [
  'resolveReviewThread',
  'unresolveReviewThread',
  'deletePullRequestReviewComment',
  'updatePullRequestReviewComment',
  'minimizeComment',
  'unminimizeComment',
];
const mutatieCommand = (naam: string) =>
  `gh api graphql -f query='mutation { ${naam}(input: {threadId: "x"}) { thread { id } } }'`;
const LEES_QUERY = "gh api graphql -f query='query { viewer { login } }'";

describe('botgesprekken-sluiten/AC-9 kale mutaties op reviewgesprekken en -opmerkingen zijn dicht voor elke rol', () => {
  describe.each(ROLLEN)('%s', (rol) => {
    test('botgesprekken-sluiten/AC-9: elke mutatie geeft de bestaande reden (negatieve tabel; de leesquery is de basis)', () => {
      verwachtTabel({
        base: LEES_QUERY,
        check: (command) => !weigertMet(command, REDEN_MUTATIE, rol),
        cases: MUTATIES.map((naam) => ({ name: naam, change: () => mutatieCommand(naam) })),
      });
    });
  });

  test.each(MUTATIES)(
    'botgesprekken-sluiten/AC-9: %s: de hoofdsessie krijgt een deny met de bestaande reden',
    (naam) => {
      const uitslag = verdict(mutatieCommand(naam));
      expect(uitslag.uitslag).toBe('deny');
      expect(uitslag.reden).toContain(REDEN_MUTATIE);
    },
  );
});

// De wisroute (AC-10): `gh api` die een reviewopmerking wijzigt of wist, voor elke rol, ook de hoofdsessie. De tabel van de spec.
const LEES_OPMERKING = 'gh api repos/o/r/pulls/comments/1';
const WEIGERINGEN = [
  'gh api -X DELETE repos/o/r/pulls/comments/1',
  'gh api -XDELETE repos/o/r/pulls/comments/1',
  'gh api -iX DELETE repos/o/r/pulls/comments/1',
  'gh api -X=DELETE repos/o/r/pulls/comments/1',
  'gh api --method=delete repos/o/r/pulls/comments/1',
  'gh api -X PUT repos/o/r/pulls/comments/1',
  'gh api --method PATCH repos/o/r/pulls/comments/1 -f body=x',
  'gh api repos/o/r/pulls/comments/1 -f body=x',
  'gh api repos/o/r/pulls/comments/1 --field body=x',
  'gh api repos/o/r/pulls/comments/1 --raw-field body=x',
  'gh api repos/o/r/pulls/comments/1 -F body=@-',
  'gh api repos/o/r/pulls/comments/1 --input f.json',
  'gh api -X DELETE /repos/O/R/Pulls/Comments/1/',
  "gh api -X DELETE 'repos/o/r/pulls/comments/1?x=1'",
  "gh api -X DELETE 'repos/o/r/pulls/comments/1#x'",
  'gh api -X DELETE https://api.github.com/repos/o/r/pulls/comments/1',
  "gh api -X DELETE 'repos/{owner}/{repo}/pulls/comments/1'",
  'gh api -X DELETE repositories/1/pulls/comments/1',
  'gh -R o/r api -X DELETE repos/o/r/pulls/comments/1',
  'gh --repo=o/r api -X DELETE repos/o/r/pulls/comments/1',
  '/usr/bin/gh api -X DELETE repos/o/r/pulls/comments/1',
  'command gh api -X DELETE repos/o/r/pulls/comments/1',
];

describe('botgesprekken-sluiten/AC-10 wisroute dicht: een reviewopmerking wijzigen of wissen via gh api, voor elke rol', () => {
  describe.each(ROLLEN)('%s', (rol) => {
    test('botgesprekken-sluiten/AC-10: elke schrijvende vorm geeft de reden van de wisroute (negatieve tabel; de leesvorm is de basis)', () => {
      verwachtTabel({
        base: LEES_OPMERKING,
        check: (command) => !weigertMet(command, REDEN_WISROUTE, rol),
        cases: WEIGERINGEN.map((command) => ({ name: command, change: () => command })),
      });
    });
  });

  // De reviewer mag `gh api` nooit zelf draaien (bestaande regel, framework §8), dus die staat niet in deze lijst.
  test('botgesprekken-sluiten/AC-10: de hoofdsessie en de subagent mogen een opmerking lezen: geen deny', () => {
    expect(beslis(LEES_OPMERKING).deny).toStrictEqual([]);
    for (const agent of ['developer', 'tester', 'architect', 'docs']) {
      expect(beslis(LEES_OPMERKING, { agent }).deny).toStrictEqual([]);
    }
  });

  test('botgesprekken-sluiten/AC-10: -X GET: de hoofdsessie krijgt geen deny; een subagent houdt de bestaande deny (alleen lezende opties), niet die van de wisroute', () => {
    const command = 'gh api -X GET repos/o/r/pulls/comments/1';
    expect(beslis(command).deny).toStrictEqual([]);
    for (const agent of SUBAGENTS) {
      expect(beslis(command, { agent }).deny.length).toBeGreaterThan(0);
      expect(weigertMet(command, REDEN_WISROUTE, agent)).toBe(false);
    }
  });

  test('botgesprekken-sluiten/AC-10: de antwoordroute van de hoofdsessie geeft geen deny; een subagent houdt de bestaande deny (schrijven via gh api), niet die van de wisroute', () => {
    const commands = [
      'gh api -X POST repos/o/r/pulls/12/comments/1/replies -F body=@antwoord.md',
      'gh api -X POST repos/BramLambertJansen/template/pulls/803/comments/4617193252/replies -F body=@antwoord.md',
    ];
    for (const command of commands) {
      expect(beslis(command).deny).toStrictEqual([]);
      for (const agent of SUBAGENTS) {
        expect(beslis(command, { agent }).deny.length).toBeGreaterThan(0);
        expect(weigertMet(command, REDEN_WISROUTE, agent)).toBe(false);
      }
    }
  });
});

// AC-11: de configuratie. `.claude/settings.json` en de fixture krijgen de regels direct na die van het samenvoegscript; de
// padtabel en CODEOWNERS de rij voor het sluitscript.
function sectie(waarde: unknown): Record<string, unknown> {
  return typeof waarde === 'object' && waarde !== null && !Array.isArray(waarde)
    ? Object.fromEntries(Object.entries(waarde))
    : {};
}

function teksten(waarde: unknown): string[] {
  return Array.isArray(waarde) ? waarde.filter((item): item is string => typeof item === 'string') : [];
}

function regels(bestand: string) {
  const ruw = sectie(JSON.parse(readFileSync(bestand, 'utf8')));
  // De fixture heeft `ask` en `excludedCommands` op het hoogste niveau, settings.json onder `permissions` en `sandbox`.
  const permissions = sectie(ruw['permissions']);
  const sandbox = sectie(ruw['sandbox']);
  return {
    ask: teksten(permissions['ask'] ?? ruw['ask']),
    allow: teksten(permissions['allow']),
    excluded: teksten(sandbox['excludedCommands'] ?? ruw['excludedCommands']),
  };
}

/** De regel direct na `na`, of `undefined` als `na` ontbreekt of laatste is. */
const direktNa = (lijst: string[], na: string) => {
  const index = lijst.indexOf(na);
  return index === -1 ? undefined : lijst[index + 1];
};

describe('botgesprekken-sluiten/AC-11 configuratie', () => {
  test.each(['.claude/settings.json', 'test/rails/fixtures/claude-sandbox-werkstraat/boundaries.json'])(
    'botgesprekken-sluiten/AC-11: %s heeft Bash(pnpm pr:resolve *) in ask, direct na Bash(pnpm pr:merge *)',
    (bestand) => {
      expect(direktNa(regels(bestand).ask, 'Bash(pnpm pr:merge *)')).toBe('Bash(pnpm pr:resolve *)');
    },
  );

  test.each(['.claude/settings.json', 'test/rails/fixtures/claude-sandbox-werkstraat/boundaries.json'])(
    'botgesprekken-sluiten/AC-11: %s heeft pnpm pr:resolve * in excludedCommands, direct na pnpm pr:merge *',
    (bestand) => {
      expect(direktNa(regels(bestand).excluded, 'pnpm pr:merge *')).toBe('pnpm pr:resolve *');
    },
  );

  test('botgesprekken-sluiten/AC-11: geen regel in permissions.allow noemt pr:resolve', () => {
    expect(regels('.claude/settings.json').allow.filter((regel) => regel.includes('pr:resolve'))).toStrictEqual([]);
  });

  test('botgesprekken-sluiten/AC-11: package.json heeft de scriptregel voor het sluitscript', () => {
    const scripts = sectie(sectie(JSON.parse(readFileSync('package.json', 'utf8')))['scripts']);
    expect(scripts['pr:resolve']).toBe('node scripts/kit/pr-resolve.mjs');
  });

  const gates: unknown = JSON.parse(readFileSync('.claude/gates.json', 'utf8'));
  const eigenaar = eersteGoedkeurder(gates) ?? '';

  test('botgesprekken-sluiten/AC-11: .claude/gates.json heeft de rij voor het sluitscript met besluit besluit-pr', () => {
    expect(sectie(sectie(gates)['paden'])['scripts/kit/pr-resolve.mjs']).toStrictEqual({ besluit: 'besluit-pr' });
  });

  test('botgesprekken-sluiten/AC-11: .github/CODEOWNERS heeft een regel voor het sluitscript met de eigenaar', () => {
    const regelsTekst = readFileSync('.github/CODEOWNERS', 'utf8').split('\n');
    expect(regelsTekst.map((regel) => regel.trim().split(/\s+/))).toContainEqual([
      '/scripts/kit/pr-resolve.mjs',
      `@${eigenaar}`,
    ]);
  });

  test('botgesprekken-sluiten/AC-11: .github/CODEOWNERS is gelijk aan de uitvoer van scripts/kit/codeowners.mjs voor deze padtabel', () => {
    expect(eigenaar).not.toBe('');
    expect(readFileSync('.github/CODEOWNERS', 'utf8')).toBe(codeownersTekst(gates, eigenaar));
  });
});
