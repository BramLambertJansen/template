import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, test } from 'vitest';
import { unsafeCast } from '../../src/core/shared/unsafe-cast.ts';
import { decide, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';
import { heredocsBeide, parseCommands } from '../../rails/hooks/lib/shell.mjs';
import { BASISSEN, TOEGESTAAN } from './rolhek-aanvalscorpus.ts';
import { PADCORPUS, type Rij } from './rolhek-padcorpus.ts';
import { COMMENTAAR_RIJEN } from './shell-commentaar-rijen.ts';

// Spec rolhek-leerpunten/AC-1 en AC-2 (leerpunt #955): een nieuwe lezer ziet op elke ingang minstens wat de lezer van
// `origin/main` zag. De test kopieert `rails/hooks/lib/*.mjs` van `origin/main` naar een tijdelijke map, laadt daar de oude
// `decide`, `parseCommands` en `heredocsBeide` en laat de vergelijkers uit `shell.mjs` (AC-3) oud en nieuw vergelijken.
// Geen uitzonderingslijst: een rij laten vallen of overslaan mag niet (spec, Randgevallen). Is `origin/main` onleesbaar, dan
// faalt een `expect` met `draai git fetch origin` (OV-7), geen throw en geen skip.
const REPO = path.resolve(import.meta.dirname, '../..');
const config = loadConfig(readFileSync(path.join(REPO, '.claude/gates.json'), 'utf8'));
const ROOT = '/repo';
const SCHEIDER = '␟';
const LIB = 'rails/hooks/lib';

type Decide = typeof decide;
type Context = Parameters<Decide>[1];
type ParseCommands = typeof parseCommands;
type HeredocsBeide = typeof heredocsBeide;
type Uitslag = 'deny' | 'ask' | 'context' | 'allow';

interface Lezers {
  readonly decide: Decide;
  readonly parseCommands: ParseCommands;
  readonly heredocsBeide: HeredocsBeide;
}

// ---------- de oude lezer: origin/main naar een tijdelijke map ----------

const TMP: string[] = [];
afterAll(() => {
  for (const map of TMP.splice(0)) rmSync(map, { recursive: true, force: true });
});

function git(args: string[]): string {
  return execFileSync('git', args, {
    cwd: REPO,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    maxBuffer: 64 << 20,
  });
}

function functie(module: unknown, naam: string): unknown {
  return typeof module === 'object' && module !== null ? Reflect.get(module, naam) : undefined;
}

interface OudResultaat {
  readonly lezers: Lezers | null;
  /** De boodschap van de falende expect: `draai git fetch origin` bij een git-fout, anders de fout van de oude lib. */
  readonly oorzaak: string;
}

/** Alleen een falende `git ls-tree` of `git show` betekent een onleesbare `origin/main`. */
function kopieerOud(): string | null {
  try {
    const bestanden = git(['ls-tree', '-r', '--name-only', 'origin/main', '--', LIB])
      .split('\n')
      .filter((bestand) => bestand.endsWith('.mjs'));
    if (!bestanden.includes(`${LIB}/rolhek.mjs`) || !bestanden.includes(`${LIB}/shell.mjs`)) return null;
    const map = mkdtempSync(path.join(tmpdir(), 'lezer-oud-'));
    TMP.push(map);
    for (const bestand of bestanden) {
      const doel = path.join(map, path.relative(LIB, bestand));
      mkdirSync(path.dirname(doel), { recursive: true });
      writeFileSync(doel, git(['show', `origin/main:${bestand}`]));
    }
    return map;
  } catch {
    return null;
  }
}

async function laadOud(): Promise<OudResultaat> {
  const map = kopieerOud();
  if (map === null) return { lezers: null, oorzaak: 'draai git fetch origin' };
  try {
    const rolhek: unknown = await import(/* @vite-ignore */ pathToFileURL(path.join(map, 'rolhek.mjs')).href);
    const shell: unknown = await import(/* @vite-ignore */ pathToFileURL(path.join(map, 'shell.mjs')).href);
    const [d, p, h] = [functie(rolhek, 'decide'), functie(shell, 'parseCommands'), functie(shell, 'heredocsBeide')];
    if (typeof d !== 'function' || typeof p !== 'function' || typeof h !== 'function')
      return {
        lezers: null,
        oorzaak: 'de oude lib (origin/main) exporteert decide, parseCommands of heredocsBeide niet als functie',
      };
    return {
      lezers: {
        decide: unsafeCast<Decide>(d, 'zelfde signatuur op origin/main'),
        parseCommands: unsafeCast<ParseCommands>(p, 'zelfde signatuur op origin/main'),
        heredocsBeide: unsafeCast<HeredocsBeide>(h, 'zelfde signatuur op origin/main'),
      },
      oorzaak: '',
    };
  } catch (fout) {
    return {
      lezers: null,
      oorzaak: `de oude lib (origin/main) laadt niet: ${fout instanceof Error ? fout.message : String(fout)}`,
    };
  }
}

const { lezers: OUD, oorzaak: OUD_OORZAAK } = await laadOud();

// De nieuwe vergelijkers, als namespace geladen: op `main` bestaan ze niet (spec, Acceptatiecriteria).
const ns: Record<string, unknown> = await import('../../rails/hooks/lib/shell.mjs');

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

// ---------- rijen, omhulsels en rollen ----------

interface Invoer {
  readonly rij: string;
  readonly tekst: string;
  readonly ctx: Context;
}

const toon = (tekst: string): string => tekst.replaceAll('\n', '⏎');
const rijNaam = (groep: string, index: number, tekst: string): string =>
  `${groep}[${String(index)}] ${toon(tekst).slice(0, 90)}`;

/** De vaste ctx uit de meettabel van de spec (die van rolhek-pr-merge.test.ts), plus `netwerkvormen`. */
function vasteCtx(cwd = ROOT, isDir = false): Context {
  return {
    root: ROOT,
    cwd,
    config,
    read: () => null,
    committed: () => false,
    isDir: () => isDir,
    branch: 'feat/x',
    mergeTrusted: true,
    kitTrusted: true,
    netwerkvormen: ['git commit *', 'git push origin HEAD'],
  };
}

/** Zoals `beslis` in rolhek-aanvalscorpus.test.ts: een BASISSEN-rij met `ctx`. */
function basisCtx(ctx: NonNullable<(typeof BASISSEN)[number]['ctx']>): Context {
  const bestanden = ctx.bestanden;
  return {
    root: ROOT,
    cwd: ROOT,
    config,
    read: (rel: string) => (Object.hasOwn(bestanden, rel) ? (bestanden[rel] ?? null) : null),
    committed: (rel: string) => Object.hasOwn(bestanden, rel),
    isDir: () => false,
    branch: 'feat/x',
    ...(ctx.onderhoud ? { onderhoud: true } : {}),
    ...(ctx.netwerkvormen === undefined ? {} : { netwerkvormen: [...ctx.netwerkvormen] }),
  };
}

/** Zoals `voorafCtx` in rolhek-padcorpus-vooraf.test.ts; `na` en `tmp` vallen weg. */
function voorafCtx(rij: Rij): Context {
  const { bestanden, lijsten, gevolgd } = rij;
  return {
    root: ROOT,
    cwd: ROOT,
    config,
    read: (rel: string) => bestanden[rel] ?? null,
    committed: (rel: string) => rij.gecommit?.includes(rel) ?? false,
    isDir: (rel: string) => rij.mappen?.includes(rel) ?? false,
    ...(lijsten === undefined ? {} : { files: (rel: string) => [...(lijsten[rel] ?? [])] }),
    ...(gevolgd === undefined
      ? {}
      : {
          gevolgd: (paden: readonly string[]) =>
            new Set(paden.filter((pad) => gevolgd.includes(pad.replace(/^\/repo\//, '')))),
        }),
    branch: rij.branch ?? 'feat/x',
    ...(rij.onderhoud === true ? { onderhoud: true } : {}),
  };
}

const LOS = 'rm -rf .claude/hooks';
// De vaste ctx heeft `isDir` false. Alleen de rij met `cd .. && cd ..` (cwd /repo/a/b) krijgt `isDir` true: het rolhek volgt een
// `cd` alleen naar een map die bestaat, en zonder werkmapvolg meet de rij niets.
const RIJEN_955: readonly { readonly tekst: string; readonly cwd: string }[] = [
  { tekst: `((true) ); #<<E\n${LOS}\nE`, cwd: ROOT },
  { tekst: `echo \${x:-"}"}; ${LOS}`, cwd: ROOT },
  { tekst: `echo \${x:-"}"" <<'E'\n$(${LOS})\nE\n"}`, cwd: ROOT },
  { tekst: 'cd .. && cd .. && printf x > lefthook.yml # c', cwd: `${ROOT}/a/b` },
];

const GROEPEN: readonly { readonly naam: string; readonly rijen: () => Invoer[] }[] = [
  {
    naam: 'BASISSEN en TOEGESTAAN',
    rijen: () => [
      ...BASISSEN.map((basis, i) => ({
        rij: rijNaam('BASISSEN', i, basis.commando),
        tekst: basis.commando,
        ctx: basis.ctx === undefined ? vasteCtx() : basisCtx(basis.ctx),
      })),
      ...TOEGESTAAN.map((geval, i) => ({
        rij: rijNaam('TOEGESTAAN', i, geval.commando),
        tekst: geval.commando,
        ctx: vasteCtx(),
      })),
    ],
  },
  {
    naam: 'COMMENTAAR_RIJEN',
    rijen: () =>
      COMMENTAAR_RIJEN.map(({ tekst }, i) => ({ rij: rijNaam('COMMENTAAR_RIJEN', i, tekst), tekst, ctx: vasteCtx() })),
  },
  {
    naam: 'PADCORPUS',
    rijen: () =>
      PADCORPUS.map((rij, i) => ({
        rij: rijNaam('PADCORPUS', i, rij.commando),
        tekst: rij.commando,
        ctx: voorafCtx(rij),
      })),
  },
  {
    naam: 'de vier #955-rijen',
    rijen: () =>
      RIJEN_955.map(({ tekst, cwd }, i) => ({
        rij: rijNaam('#955', i, tekst),
        tekst,
        ctx: vasteCtx(cwd, cwd !== ROOT),
      })),
  },
];

const OMHULSELS: readonly { readonly naam: string; readonly maak: (x: string) => string }[] = [
  { naam: 'X', maak: (x) => x },
  { naam: 'X # c', maak: (x) => `${x} # c` },
  { naam: 'true && X', maak: (x) => `true && ${x}` },
  { naam: '(X)', maak: (x) => `(${x})` },
  { naam: 'echo $(X)', maak: (x) => `echo $(${x})` },
  { naam: 'cat <<E⏎$(X)⏎E', maak: (x) => `cat <<E\n$(${x})\nE` },
  { naam: "': <<'E'⏎E⏎X'", maak: (x) => `: <<'E'\nE\n${x}` },
];

/** Architect, developer, tester, reviewer en docs (`SUBAGENT_ROLES`), de hoofdsessie (geen `agent_type`) en een onbekende rol. */
const ROLLEN: readonly { readonly naam: string; readonly agent: string | undefined }[] = [
  ...['architect', 'developer', 'tester', 'reviewer', 'docs'].map((agent) => ({ naam: agent, agent })),
  { naam: 'hoofdsessie', agent: undefined },
  { naam: 'onbekend', agent: 'onbekend' },
];

// ---------- uitslagen (AC-1) en eerste woorden per lezing (AC-2) ----------

function uitslagVan(decision: ReturnType<Decide>): Uitslag {
  if (decision.deny.length > 0) return 'deny';
  if (decision.ask.length > 0) return 'ask';
  return decision.context.length > 0 ? 'context' : 'allow';
}

function uitslagen(lezers: Lezers, invoer: readonly Invoer[]): Map<string, Uitslag> {
  const kaart = new Map<string, Uitslag>();
  for (const { rij, tekst, ctx } of invoer)
    for (const omhulsel of OMHULSELS)
      for (const rol of ROLLEN) {
        const payload = {
          tool_name: 'Bash',
          tool_input: { command: omhulsel.maak(tekst) },
          ...(rol.agent === undefined ? {} : { agent_type: rol.agent }),
        };
        kaart.set([rij, omhulsel.naam, rol.naam].join(SCHEIDER), uitslagVan(lezers.decide(payload, ctx)));
      }
  return kaart;
}

/** `parseCommands(s)` en `parseCommands(s, true)`, elk ook op elke body uit `heredocsBeide(s)`: per lezing de eerste woorden. */
function lezingen(lezers: Lezers, tekst: string): string[][] {
  const bodies = lezers
    .heredocsBeide(tekst)
    .flat()
    .map(({ start, end }) => tekst.slice(start, end));
  return [tekst, ...bodies].flatMap((deel) =>
    [lezers.parseCommands(deel), lezers.parseCommands(deel, true)].map((segmenten) =>
      segmenten.map(({ words }) => words[0] ?? ''),
    ),
  );
}

function woorden(lezers: Lezers, invoer: readonly Invoer[]): Map<string, string[][]> {
  const kaart = new Map<string, string[][]>();
  for (const { rij, tekst } of invoer)
    for (const omhulsel of OMHULSELS)
      kaart.set([rij, omhulsel.naam].join(SCHEIDER), lezingen(lezers, omhulsel.maak(tekst)));
  return kaart;
}

const NIEUW: Lezers = { decide, parseCommands, heredocsBeide };
const noem = (sleutel: string): string => sleutel.split(SCHEIDER).join(' | ');

describe('rolhek-leerpunten/AC-1 de nieuwe lezer ziet op elke ingang minstens wat de lezer van origin/main zag', () => {
  test.each(GROEPEN)(
    'rolhek-leerpunten/AC-1: uitslag per rij, omhulsel en rol niet zwakker dan op origin/main: $naam',
    (groep) => {
      expect(OUD !== null, OUD_OORZAAK).toBe(true);
      if (OUD === null) return;
      expect(typeof ns['vergelijkUitslagen']).toBe('function');
      const vergelijk = unsafeCast<VergelijkUitslagen>(ns['vergelijkUitslagen'], 'typeof hierboven gecontroleerd');
      const invoer = groep.rijen();
      expect(invoer.length).toBeGreaterThan(0);
      const bevindingen = vergelijk(uitslagen(OUD, invoer), uitslagen(NIEUW, invoer));
      expect(
        bevindingen.map(({ sleutel, oud, nieuw }) => `${noem(sleutel)}: ${oud} -> ${String(nieuw)}`),
      ).toStrictEqual([]);
    },
    120_000,
  );
});

describe('rolhek-leerpunten/AC-2 de nieuwe lezer ziet van elk eerste woord minstens zo vaak als de lezer van origin/main', () => {
  test.each(GROEPEN)(
    'rolhek-leerpunten/AC-2: eerste woorden per rij en omhulsel, maximum over de lezingen: $naam',
    (groep) => {
      expect(OUD !== null, OUD_OORZAAK).toBe(true);
      if (OUD === null) return;
      expect(typeof ns['vergelijkWoorden']).toBe('function');
      const vergelijk = unsafeCast<VergelijkWoorden>(ns['vergelijkWoorden'], 'typeof hierboven gecontroleerd');
      const invoer = groep.rijen();
      expect(invoer.length).toBeGreaterThan(0);
      const bevindingen = vergelijk(woorden(OUD, invoer), woorden(NIEUW, invoer));
      expect(
        bevindingen.map(
          ({ sleutel, woord, oud, nieuw }) => `${noem(sleutel)}: ${woord} ${String(oud)} -> ${String(nieuw)}`,
        ),
      ).toStrictEqual([]);
    },
    120_000,
  );
});
