import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { unsafeCast } from '../../src/core/shared/unsafe-cast.ts';
import { decide, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';
import { parseCommands } from '../../rails/hooks/lib/shell.mjs';

// Spec rolhek-leerpunten/AC-3 (leerpunt #955), bewijsbestand: `shell.mjs` exporteert twee vergelijkers voor de differentiële
// test (AC-1, AC-2). Dit bestand importeert alleen modules die op de basis al bestaan en laadt de nieuwe exports als namespace,
// zodat het op de basis op een `expect` faalt en niet op een import of een throw.
const ns: Record<string, unknown> = await import('../../rails/hooks/lib/shell.mjs');

type Uitslag = 'deny' | 'ask' | 'context' | 'allow';
interface UitslagBevinding {
  readonly sleutel: string;
  readonly oud: Uitslag;
  readonly nieuw: Uitslag | undefined;
}
interface WoordBevinding {
  readonly sleutel: string;
  readonly woord: string;
  readonly oud: number;
  readonly nieuw: number | undefined;
}
type VergelijkUitslagen = (oud: Map<string, Uitslag>, nieuw: Map<string, Uitslag>) => UitslagBevinding[];
type VergelijkWoorden = (oud: Map<string, string[][]>, nieuw: Map<string, string[][]>) => WoordBevinding[];

function vergelijkUitslagen(oud: Map<string, Uitslag>, nieuw: Map<string, Uitslag>): UitslagBevinding[] {
  expect(typeof ns['vergelijkUitslagen']).toBe('function');
  return unsafeCast<VergelijkUitslagen>(ns['vergelijkUitslagen'], 'typeof hierboven gecontroleerd')(oud, nieuw);
}

function vergelijkWoorden(oud: Map<string, string[][]>, nieuw: Map<string, string[][]>): WoordBevinding[] {
  expect(typeof ns['vergelijkWoorden']).toBe('function');
  return unsafeCast<VergelijkWoorden>(ns['vergelijkWoorden'], 'typeof hierboven gecontroleerd')(oud, nieuw);
}

const SCHEIDER = '␟';
const config = loadConfig(readFileSync(path.resolve(import.meta.dirname, '../../.claude/gates.json'), 'utf8'));

// De vaste ctx uit de meettabel van de spec (die van rolhek-pr-merge.test.ts), plus `netwerkvormen`.
const ctx = {
  root: '/repo',
  cwd: '/repo',
  config,
  read: () => null,
  committed: () => false,
  isDir: () => false,
  branch: 'feat/x',
  mergeTrusted: true,
  kitTrusted: true,
  netwerkvormen: ['git commit *', 'git push origin HEAD'],
};

type Decide = typeof decide;

function uitslagVan(decision: ReturnType<Decide>): Uitslag {
  if (decision.deny.length > 0) return 'deny';
  if (decision.ask.length > 0) return 'ask';
  return decision.context.length > 0 ? 'context' : 'allow';
}

const RIJEN = ['rm -rf .claude/hooks', 'git status', 'tee lefthook.yml'];
const OMHULSELS: readonly { readonly naam: string; readonly maak: (x: string) => string }[] = [
  { naam: 'X', maak: (x) => x },
  { naam: '(X)', maak: (x) => `(${x})` },
];
const ROLLEN: readonly { readonly naam: string; readonly agent: string | undefined }[] = [
  { naam: 'hoofdsessie', agent: undefined },
  { naam: 'developer', agent: 'developer' },
  { naam: 'tester', agent: 'tester' },
];

function uitslagen(beslis: Decide): Map<string, Uitslag> {
  const kaart = new Map<string, Uitslag>();
  for (const rij of RIJEN)
    for (const omhulsel of OMHULSELS)
      for (const rol of ROLLEN) {
        const payload = {
          tool_name: 'Bash',
          tool_input: { command: omhulsel.maak(rij) },
          ...(rol.agent === undefined ? {} : { agent_type: rol.agent }),
        };
        kaart.set([rij, omhulsel.naam, rol.naam].join(SCHEIDER), uitslagVan(beslis(payload, ctx)));
      }
  return kaart;
}

type Lezer = (tekst: string) => string[];
const eersteWoorden: Lezer = (tekst) => parseCommands(tekst).map(({ words }) => words[0] ?? '');

function woorden(lezer: Lezer, rijen: readonly string[]): Map<string, string[][]> {
  return new Map(rijen.map((rij) => [[rij, 'X'].join(SCHEIDER), [lezer(rij)]] as const));
}

describe('rolhek-leerpunten/AC-3 vergelijkUitslagen', () => {
  test('rolhek-leerpunten/AC-3: een decide-wrapper die voor één rol deny in ask omzet geeft een bevinding met rij, omhulsel en rol', () => {
    expect(typeof ns['vergelijkUitslagen']).toBe('function');
    const zwakker: Decide = (payload, c) => {
      const d = decide(payload, c);
      const agent: unknown =
        typeof payload === 'object' && payload !== null ? Reflect.get(payload, 'agent_type') : undefined;
      return agent === 'developer' ? { ...d, ask: [...d.ask, ...d.deny], deny: [] } : d;
    };
    const bevindingen = vergelijkUitslagen(uitslagen(decide), uitslagen(zwakker));
    expect(bevindingen.length).toBeGreaterThan(0);
    expect(bevindingen).toContainEqual({
      sleutel: ['rm -rf .claude/hooks', '(X)', 'developer'].join(SCHEIDER),
      oud: 'deny',
      nieuw: 'ask',
    });
    // Alleen de rol van de wrapper wijkt af: de andere rollen blijven buiten de bevindingen.
    expect(bevindingen.filter(({ sleutel }) => !sleutel.endsWith(`${SCHEIDER}developer`))).toStrictEqual([]);
  });

  test('rolhek-leerpunten/AC-3: een sleutel die in nieuw ontbreekt geeft een bevinding met nieuw undefined', () => {
    expect(typeof ns['vergelijkUitslagen']).toBe('function');
    const sleutel = ['rm -rf .claude/hooks', 'X', 'developer'].join(SCHEIDER);
    const bevindingen = vergelijkUitslagen(new Map<string, Uitslag>([[sleutel, 'deny']]), new Map<string, Uitslag>());
    expect(bevindingen).toStrictEqual([{ sleutel, oud: 'deny', nieuw: undefined }]);
  });

  test('rolhek-leerpunten/AC-3: een sterkere of gelijke nieuwe uitslag is geen bevinding, een zwakkere stap wel (deny > ask > context > allow)', () => {
    expect(typeof ns['vergelijkUitslagen']).toBe('function');
    const oud = new Map<string, Uitslag>([
      ['a', 'ask'],
      ['b', 'context'],
      ['c', 'allow'],
      ['d', 'ask'],
      ['e', 'context'],
    ]);
    const nieuw = new Map<string, Uitslag>([
      ['a', 'deny'],
      ['b', 'ask'],
      ['c', 'allow'],
      ['d', 'context'],
      ['e', 'allow'],
    ]);
    expect(vergelijkUitslagen(oud, nieuw)).toStrictEqual([
      { sleutel: 'd', oud: 'ask', nieuw: 'context' },
      { sleutel: 'e', oud: 'context', nieuw: 'allow' },
    ]);
  });

  test('rolhek-leerpunten/AC-3: de huidige decide als oud en als nieuw geeft geen bevinding', () => {
    expect(typeof ns['vergelijkUitslagen']).toBe('function');
    const kaart = uitslagen(decide);
    expect(kaart.size).toBe(RIJEN.length * OMHULSELS.length * ROLLEN.length);
    expect(vergelijkUitslagen(kaart, uitslagen(decide))).toStrictEqual([]);
  });
});

describe('rolhek-leerpunten/AC-3 vergelijkWoorden', () => {
  test('rolhek-leerpunten/AC-3: een lezer die een tweede gelijk segment weglaat geeft een bevinding', () => {
    expect(typeof ns['vergelijkWoorden']).toBe('function');
    const rijen = ['cd .. && cd .. && printf x > lefthook.yml'];
    const zonderHerhaling: Lezer = (tekst) => [...new Set(eersteWoorden(tekst))];
    const oud = woorden(eersteWoorden, rijen);
    expect(oud.get([rijen[0], 'X'].join(SCHEIDER))).toStrictEqual([['cd', 'cd', 'printf']]);
    expect(vergelijkWoorden(oud, woorden(zonderHerhaling, rijen))).toStrictEqual([
      { sleutel: [rijen[0], 'X'].join(SCHEIDER), woord: 'cd', oud: 2, nieuw: 1 },
    ]);
  });

  test('rolhek-leerpunten/AC-3: een lezer die niets na # ziet geeft een bevinding', () => {
    expect(typeof ns['vergelijkWoorden']).toBe('function');
    const rijen = ['echo ${x/ #/}; rm -rf .claude/hooks'];
    const nietsNaHekje: Lezer = (tekst) => eersteWoorden(tekst.split('#')[0] ?? '');
    const oud = woorden(eersteWoorden, rijen);
    const bevindingen = vergelijkWoorden(oud, woorden(nietsNaHekje, rijen));
    expect(bevindingen).toContainEqual({ sleutel: [rijen[0], 'X'].join(SCHEIDER), woord: 'rm', oud: 1, nieuw: 0 });
  });

  test('rolhek-leerpunten/AC-3: een lezer die een segment met alleen een redirect weglaat geeft een bevinding met woord ""', () => {
    expect(typeof ns['vergelijkWoorden']).toBe('function');
    const rijen = ['> lefthook.yml'];
    const zonderRedirect: Lezer = (tekst) =>
      parseCommands(tekst)
        .filter(({ words }) => words.length > 0)
        .map(({ words }) => words[0] ?? '');
    const oud = woorden(eersteWoorden, rijen);
    expect(oud.get([rijen[0], 'X'].join(SCHEIDER))).toStrictEqual([['']]);
    expect(vergelijkWoorden(oud, woorden(zonderRedirect, rijen))).toStrictEqual([
      { sleutel: [rijen[0], 'X'].join(SCHEIDER), woord: '', oud: 1, nieuw: 0 },
    ]);
  });

  test('rolhek-leerpunten/AC-3: een sleutel die in nieuw ontbreekt geeft per woord een bevinding met nieuw undefined', () => {
    expect(typeof ns['vergelijkWoorden']).toBe('function');
    const sleutel = ['cd .. && rm x', 'X'].join(SCHEIDER);
    const oud = new Map<string, string[][]>([[sleutel, [['cd', 'rm'], ['cd']]]]);
    const bevindingen = vergelijkWoorden(oud, new Map<string, string[][]>());
    expect(bevindingen).toHaveLength(2);
    expect(bevindingen).toContainEqual({ sleutel, woord: 'cd', oud: 1, nieuw: undefined });
    expect(bevindingen).toContainEqual({ sleutel, woord: 'rm', oud: 1, nieuw: undefined });
  });

  test('rolhek-leerpunten/AC-3: het maximum over de lezingen telt: een andere lezing die het woord nog ziet, geeft geen bevinding', () => {
    expect(typeof ns['vergelijkWoorden']).toBe('function');
    const sleutel = ['cd .. && cd ..', 'X'].join(SCHEIDER);
    const oud = new Map<string, string[][]>([[sleutel, [['cd', 'cd'], ['cd']]]]);
    const nieuw = new Map<string, string[][]>([[sleutel, [['cd'], ['cd', 'cd'], []]]]);
    expect(vergelijkWoorden(oud, nieuw)).toStrictEqual([]);
  });

  test('rolhek-leerpunten/AC-3: de huidige lezer als oud en als nieuw geeft geen bevinding', () => {
    expect(typeof ns['vergelijkWoorden']).toBe('function');
    const rijen = [
      'cd .. && cd .. && printf x > lefthook.yml # c',
      'echo ${x/ #/}; rm -rf .claude/hooks',
      'true && ls',
    ];
    const oud = woorden(eersteWoorden, rijen);
    expect(oud.size).toBe(rijen.length);
    expect(vergelijkWoorden(oud, woorden(eersteWoorden, rijen))).toStrictEqual([]);
  });
});
