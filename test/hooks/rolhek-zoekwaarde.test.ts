import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import * as rolhek from '../../rails/hooks/lib/rolhek.mjs';
import { decide, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';

// Spec rolhek-herstel/AC-1 en AC-2 (leerpunt #947): de zoekopdracht van de reviewer blijft binnen de eigen repository, zonder
// losse OR, AND of NOT en zonder repo:, org: of user:. Eén gedeelde toets `zoekScopeFout`; `ZOEKVORMEN` somt de vormen op
// waarop de aanvallentabel draait. De exports bestaan nog niet bij het schrijven van deze tests: ze worden dynamisch gelezen,
// zodat de test op een assertie faalt en niet op een import.
const config = loadConfig(readFileSync('.claude/gates.json', 'utf8'));

function verdict(command: string) {
  const decision = decide(
    { tool_name: 'Bash', tool_input: { command }, agent_type: 'reviewer' },
    {
      root: '/repo',
      cwd: '/repo',
      config,
      read: () => null,
      committed: () => false,
      isDir: () => false,
      branch: 'feat/x',
    },
  );
  if (decision.deny.length > 0) return { uitslag: 'deny', reden: decision.deny.join('; ') };
  if (decision.ask.length > 0) return { uitslag: 'ask', reden: decision.ask.join('; ') };
  return { uitslag: decision.allow === true ? 'allow' : 'context', reden: '' };
}

// De letterlijke aanvulling op de weigermelding (spec, "Hergebruik en UX").
const ZOEKREGEL = 'zonder losse OR, AND of NOT en zonder repo:, org: of user: (spec rolhek-herstel/AC-1)';

function isGeweigerdMetZoekregel(command: string): { geweigerd: boolean; metZoekregel: boolean; command: string } {
  const { uitslag, reden } = verdict(command);
  return { command, geweigerd: uitslag === 'deny', metZoekregel: reden.includes(ZOEKREGEL) };
}

describe('rolhek-herstel/AC-1: zoekopdracht van de reviewer', () => {
  test.each([
    'gh pr list --search "x OR is:private"',
    'gh pr list --search "x OR(is:private)"',
    'gh issue list --search "a and b"',
    'gh issue list --search "NOT x"',
  ])('rolhek-herstel/AC-1: reviewer wordt geweigerd met de zoekregel: %s', (command) => {
    expect(isGeweigerdMetZoekregel(command)).toEqual({ command, geweigerd: true, metZoekregel: true });
  });

  test.each([
    'gh api "search/issues?q=repo:{owner}/{repo}+x+OR+is:private"',
    'gh api "search/issues?q=repo:{owner}/{repo}+x+OR(is:private)"',
    'gh api "search/issues?q=repo:{owner}/{repo}+(x)AND(y)"',
    'gh api "search/issues?q=repo:{owner}/{repo}+not+x"',
  ])('rolhek-herstel/AC-1: gh api search/issues met losse operator: geweigerd met de zoekregel: %s', (command) => {
    expect(isGeweigerdMetZoekregel(command)).toEqual({ command, geweigerd: true, metZoekregel: true });
  });

  test.each([
    'gh issue list --search "leerpunt rolhek"',
    'gh pr list --search "fix ordening"',
    'gh issue list --search "operator"',
    'gh issue list --search "Notitie"',
    'gh pr list --search "-label:x"',
  ])('rolhek-herstel/AC-1: alleen het hele woord telt, dit gaat door: %s', (command) => {
    expect(verdict(command).uitslag).not.toBe('deny');
  });

  test('rolhek-herstel/AC-1: zoekScopeFout is een gedeelde toets op woorden', () => {
    const toets: unknown = Reflect.get(rolhek, 'zoekScopeFout');
    expect(typeof toets).toBe('function');
    if (typeof toets !== 'function') return;
    const fout = (woorden: string[]): unknown => Reflect.apply(toets, undefined, [woorden]);
    // Geweigerd: een los woord OR, AND of NOT (hoofdletterongevoelig), of een woord met repo:, org: of user:.
    for (const woorden of [['x', 'OR', 'y'], ['and'], ['Not', 'x'], ['repo:a/b'], ['x', 'ORG:foo'], ['user:me']])
      expect({ woorden, fout: Boolean(fout(woorden)) }).toEqual({ woorden, fout: true });
    // Door: woorden die er alleen op lijken, en een uitsluiting.
    for (const woorden of [['orde'], ['Notitie'], ['operator'], ['-label:x'], ['fix', 'ordening'], []])
      expect({ woorden, fout: Boolean(fout(woorden)) }).toEqual({ woorden, fout: false });
  });
});

// ---------- AC-2: één tabel met aanvallen tegen elke vorm uit ZOEKVORMEN ----------

/** Hoe een zoekvorm als commando wordt opgebouwd: `delen` zijn de zoekwoorden; gh api voegt ze samen met `+`. */
interface VormBouw {
  readonly herken: (vorm: string) => boolean;
  readonly maak: (delen: readonly string[]) => string;
  readonly api: boolean;
}

const BOUW: readonly VormBouw[] = [
  { herken: (v) => /gh pr list/.test(v), maak: (d) => `gh pr list --search "${d.join(' ')}"`, api: false },
  { herken: (v) => /gh issue list/.test(v), maak: (d) => `gh issue list --search "${d.join(' ')}"`, api: false },
  {
    herken: (v) => /search\/issues/.test(v),
    maak: (d) => `gh api "search/issues?q=repo:{owner}/{repo}+${d.join('+')}"`,
    api: true,
  },
];

/** `ZOEKVORMEN` is een lijst teksten: `gh issue list`, `gh pr list` en `search/issues`; een ander lid heeft geen rij in de tabel. */
const vormNaam = (vorm: string): string => vorm;

function zoekvormen(): readonly string[] {
  const vormen: unknown = Reflect.get(rolhek, 'ZOEKVORMEN');
  if (!Array.isArray(vormen)) return [];
  return vormen.map((vorm: unknown) => (typeof vorm === 'string' ? vorm : JSON.stringify(vorm)));
}

const OPERATOREN = ['OR', 'AND', 'NOT'] as const;
/** Alle hoofdlettervormen van een operator: elke combinatie van hoofd- en kleine letters. */
function hoofdlettervormen(operator: string): string[] {
  const aantal = 2 ** operator.length;
  return Array.from({ length: aantal }, (_, bits) =>
    Array.from({ length: operator.length }, (__, i) => {
      const letter = operator.charAt(i).toLowerCase();
      return bits & (1 << i) ? letter.toUpperCase() : letter;
    }).join(''),
  );
}

interface Aanval {
  readonly naam: string;
  /** De zoekwoorden na `repo:{owner}/{repo}`; gh api voegt ze samen met `+`, de lijstvormen met een spatie. */
  readonly delen: readonly string[];
  /** Alleen voor gh api (een query-eigenschap, geen woord). */
  readonly alleenApi?: boolean;
  /** Voor gh api: de ruwe staart in plaats van de samengevoegde delen. */
  readonly apiRuw?: string;
}

const AANVALLEN: readonly Aanval[] = [
  ...OPERATOREN.flatMap((operator) =>
    hoofdlettervormen(operator).flatMap((vorm): Aanval[] => [
      { naam: `los ${vorm} tussen woorden`, delen: ['x', vorm, 'is:private'] },
      { naam: `${vorm} vooraan`, delen: [vorm, 'x'] },
      { naam: `${vorm} achteraan`, delen: ['x', vorm] },
      { naam: `${vorm} direct voor een haakje`, delen: ['x', `${vorm}(is:private)`] },
      { naam: `${vorm} direct na een haakje`, delen: ['(x)', `${vorm}(y)`] },
      { naam: `${vorm} tussen haakjes zonder spaties`, delen: [`(x)${vorm}(y)`] },
    ]),
  ),
  { naam: 'tweede repo:', delen: ['x', 'repo:other/x'] },
  { naam: 'tweede REPO: hoofdletters', delen: ['x', 'REPO:other/x'] },
  { naam: 'org:', delen: ['x', 'org:foo'] },
  { naam: 'ORG: hoofdletters', delen: ['x', 'ORG:foo'] },
  { naam: 'user:', delen: ['x', 'user:bar'] },
  { naam: 'User: gemengd', delen: ['x', 'User:bar'] },
  { naam: 'user: direct na een haakje', delen: ['(user:bar)'] },
  { naam: 'org: vooraan', delen: ['org:foo', 'x'] },
  {
    naam: 'tweede q via &',
    delen: [],
    alleenApi: true,
    apiRuw: 'search/issues?q=repo:{owner}/{repo}+x&q=org:foo',
  },
  {
    naam: 'tweede q via & zonder operator',
    delen: [],
    alleenApi: true,
    apiRuw: 'search/issues?q=repo:{owner}/{repo}+x&q=y',
  },
  { naam: 'tweede q via =', delen: [], alleenApi: true, apiRuw: 'search/issues?q=repo:{owner}/{repo}+x=y' },
  {
    naam: 'advanced_search via &',
    delen: [],
    alleenApi: true,
    apiRuw: 'search/issues?q=repo:{owner}/{repo}+x&advanced_search=true',
  },
];

describe('rolhek-herstel/AC-2: ZOEKVORMEN en de aanvallentabel', () => {
  test('rolhek-herstel/AC-2: ZOEKVORMEN is een lijst met de lezers met --search en de gh api-vorm, elk met een rij in de tabel', () => {
    const vormen = zoekvormen();
    expect(vormen.length).toBeGreaterThanOrEqual(3);
    const namen = vormen.map(vormNaam);
    // Elke vorm uit ZOEKVORMEN heeft een bouwrij; een vorm zonder rij maakt deze test rood.
    const zonderRij = namen.filter((naam) => !BOUW.some((bouw) => bouw.herken(naam)));
    expect(zonderRij).toEqual([]);
    // En elke bouwrij is gedekt door een vorm (geen vorm verdwenen).
    const onbedekt = BOUW.filter((bouw) => !namen.some((naam) => bouw.herken(naam))).length;
    expect(onbedekt).toBe(0);
  });

  test('rolhek-herstel/AC-2: elke aanval wordt in elke vorm uit ZOEKVORMEN geweigerd', () => {
    const vormen = zoekvormen();
    expect(vormen.length).toBeGreaterThanOrEqual(3);
    const doorgelaten: string[] = [];
    for (const vorm of vormen) {
      const bouw = BOUW.find((kandidaat) => kandidaat.herken(vormNaam(vorm)));
      expect(bouw).toBeDefined();
      if (bouw === undefined) continue;
      for (const aanval of AANVALLEN) {
        if (aanval.alleenApi === true && !bouw.api) continue;
        const command = aanval.apiRuw === undefined ? bouw.maak(aanval.delen) : `gh api "${aanval.apiRuw}"`;
        if (verdict(command).uitslag !== 'deny') doorgelaten.push(command);
      }
    }
    expect(doorgelaten).toEqual([]);
  });

  test('rolhek-herstel/AC-2: een goede zoekopdracht gaat in elke vorm uit ZOEKVORMEN door (de tabel is geen vrijbrief)', () => {
    const vormen = zoekvormen();
    expect(vormen.length).toBeGreaterThanOrEqual(3);
    for (const vorm of vormen) {
      const bouw = BOUW.find((kandidaat) => kandidaat.herken(vormNaam(vorm)));
      if (bouw === undefined) continue;
      for (const delen of [['fix', 'ordening'], ['Notitie'], ['-label:x']]) {
        const command = bouw.maak(delen);
        expect({ command, uitslag: verdict(command).uitslag }).not.toEqual({ command, uitslag: 'deny' });
      }
    }
  });
});
