import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { parseCommands } from '../../rails/hooks/lib/shell.mjs';
import { inKooi } from '../../scripts/kit/kooi.mjs';
import { vermogen } from '../setup/vermogen.ts';
import { BASISSEN } from './rolhek-aanvalscorpus.ts';
import { COMMENTAAR_RIJEN } from './shell-commentaar-rijen.ts';

// Spec rolhek-herstel/AC-5 en AC-6 (leerpunten #603 en #617): differentieel tegen echte bash. Elke rij van een vast corpus draait
// in bash, binnen de kooi (R-TOOL-03), in restricted mode met lege PATH en uitgezette builtins; wat bash als commandonaam
// probeert te starten, is de waarneming. Elke waargenomen naam moet ook het eerste woord van een segment van `parseCommands`
// zijn; de lezer mag meer zien dan bash, nooit minder.

/** Een rij van het corpus. `bashZiet`: de namen die bash zeker waarneemt (bij een aanvalsrij de gevaarlijke naam); nooit leeg. */
interface Rij {
  readonly naam: string;
  readonly tekst: string;
  readonly bashZiet: readonly string[];
}

const eersteTekenreeks = (commando: string): string => commando.split(' ')[0] ?? '';

// De rijen van AC-4 die bash uitvoert (zie `shell-commentaar-rijen.ts` voor de rij die bash als syntaxfout weigert) en elke
// basisrij uit `rolhek-aanvalscorpus.ts` met het eerste woord als `bashZiet`.
const RIJEN: readonly Rij[] = [
  ...COMMENTAAR_RIJEN.map((rij) => ({
    naam: `commentaar: ${rij.naam}`,
    tekst: rij.tekst,
    bashZiet: ['rm'],
  })),
  ...BASISSEN.map((basis) => ({
    naam: `basis: ${basis.regel}`,
    tekst: basis.commando,
    bashZiet: [eersteTekenreeks(basis.commando)],
  })),
];

/** AC-6: een rij die bash anders telt dan de lezer en die de bouw niet oplost, met per rij een reden van minstens drie woorden. */
const AANVAARD: Readonly<Record<string, string>> = {};

/** Rijen die de bouw van AC-4 moet oplossen: deze staan nooit op de aanvaard-lijst. */
const VERPLICHT: ReadonlySet<string> = new Set(COMMENTAAR_RIJEN.map((rij) => `commentaar: ${rij.naam}`));

// ---------- de toetsen, los van bash (draaien ook zonder kooi) ----------

type Oordeel = 'groen' | 'rood' | 'ongeldig';

/** Het eerste woord van een segment: na de toewijzingen vooraan. */
function eersteWoord(words: readonly string[]): string | undefined {
  return words.find((woord) => !/^[A-Za-z_][A-Za-z0-9_]*\+?=/.test(woord));
}

function lezerNamen(tekst: string): ReadonlySet<string> {
  return new Set(
    parseCommands(tekst).flatMap(({ words }) => {
      const naam = eersteWoord(words);
      return naam === undefined ? [] : [naam];
    }),
  );
}

/**
 * Ongeldig: een lege `bashZiet`, of bash neemt een naam uit `bashZiet` niet waar (syntaxfout, geweigerde redirect, vroege afbraak).
 * Rood: bash neemt een naam waar die de lezer niet als eerste woord heeft. Anders groen.
 */
function beoordeel(rij: Rij, waargenomen: ReadonlySet<string>, lezer: ReadonlySet<string>): Oordeel {
  if (rij.bashZiet.length === 0 || rij.bashZiet.some((naam) => naam === '')) return 'ongeldig';
  if (rij.bashZiet.some((naam) => !waargenomen.has(naam))) return 'ongeldig';
  return [...waargenomen].some((naam) => !lezer.has(naam)) ? 'rood' : 'groen';
}

/** AC-6: wat er mis is met de aanvaard-lijst zelf. */
function lijstFouten(
  aanvaard: Readonly<Record<string, string>>,
  rijen: readonly Rij[],
  verplicht: ReadonlySet<string>,
): string[] {
  return Object.entries(aanvaard).flatMap(([naam, reden]) => {
    const fouten: string[] = [];
    if (!rijen.some((rij) => rij.naam === naam)) fouten.push(`${naam}: staat niet in het corpus`);
    if (reden.trim().split(/\s+/).filter(Boolean).length < 3) fouten.push(`${naam}: reden korter dan drie woorden`);
    if (verplicht.has(naam)) fouten.push(`${naam}: een verplichte rij (AC-4) staat op de lijst`);
    return fouten;
  });
}

/** AC-5 en AC-6: de uitslag van alle rijen tegen de aanvaard-lijst. Elke lijst hoort leeg te zijn. */
function uitslagFouten(oordelen: Readonly<Record<string, Oordeel>>, aanvaard: Readonly<Record<string, string>>) {
  const namen = Object.keys(oordelen);
  return {
    ongeldig: namen.filter((naam) => oordelen[naam] === 'ongeldig'),
    roodNietAanvaard: namen.filter((naam) => oordelen[naam] === 'rood' && !(naam in aanvaard)),
    groenOpLijst: namen.filter((naam) => oordelen[naam] === 'groen' && naam in aanvaard),
  };
}

const LEEG = { ongeldig: [], roodNietAanvaard: [], groenOpLijst: [] };

describe('rolhek-herstel/AC-5: het corpus', () => {
  test('rolhek-herstel/AC-5: elke rij heeft een niet-lege bashZiet met niet-lege namen', () => {
    const leeg = RIJEN.filter((rij) => rij.bashZiet.length === 0 || rij.bashZiet.some((naam) => naam.trim() === ''));
    expect(leeg.map((rij) => rij.naam)).toEqual([]);
    expect(RIJEN.length).toBeGreaterThan(0);
  });

  test('rolhek-herstel/AC-5: het corpus bevat de AC-4-rijen die bash uitvoert en elke basisrij uit het aanvalscorpus', () => {
    const namen = new Set(RIJEN.map((rij) => rij.naam));
    expect(namen.size).toBe(RIJEN.length);
    for (const rij of COMMENTAAR_RIJEN)
      expect({ rij: rij.naam, erin: namen.has(`commentaar: ${rij.naam}`) }).toEqual({ rij: rij.naam, erin: true });
    expect(COMMENTAAR_RIJEN.length).toBe(12);
    for (const basis of BASISSEN)
      expect({ regel: basis.regel, erin: namen.has(`basis: ${basis.regel}`) }).toEqual({
        regel: basis.regel,
        erin: true,
      });
  });

  test('rolhek-herstel/AC-5: een lege bashZiet of een naam die bash niet waarneemt maakt de rij ongeldig, een ontbrekende lezernaam rood', () => {
    const rij: Rij = { naam: 'x', tekst: 'rm x', bashZiet: ['rm'] };
    const zien = (...namen: string[]) => new Set(namen);
    expect(beoordeel({ ...rij, bashZiet: [] }, zien('rm'), zien('rm'))).toBe('ongeldig');
    expect(beoordeel(rij, zien(), zien('rm'))).toBe('ongeldig');
    expect(beoordeel(rij, zien('rm'), zien())).toBe('rood');
    expect(beoordeel(rij, zien('rm', 'E'), zien('rm'))).toBe('rood');
    expect(beoordeel(rij, zien('rm'), zien('rm', 'meer'))).toBe('groen');
  });

  test('rolhek-herstel/AC-5: de lezer neemt het eerste woord na toewijzingen als naam', () => {
    expect([...lezerNamen('X=1 ./foo/bar a; rm x')].sort()).toEqual(['./foo/bar', 'rm']);
  });
});

describe('rolhek-herstel/AC-6: de aanvaard-lijst', () => {
  test('rolhek-herstel/AC-6: de lijst is geldig: reden van minstens drie woorden, geen verplichte rij, alleen rijen uit het corpus', () => {
    expect(lijstFouten(AANVAARD, RIJEN, VERPLICHT)).toEqual([]);
  });

  test('rolhek-herstel/AC-6: de zes vormen en de varianten uit AC-4 zijn verplicht, elke rij ervan staat in VERPLICHT', () => {
    expect(COMMENTAAR_RIJEN.length).toBe(12);
    expect(COMMENTAAR_RIJEN.filter((rij) => !VERPLICHT.has(`commentaar: ${rij.naam}`))).toEqual([]);
  });

  // `shell-commentaar.test.ts` heeft een eigen kopie van de rijen (leerpunt-bewijs: geen import die op de basis ontbreekt);
  // elke rij hier staat daar letterlijk als naam, zodat de lezertest en de bashtest dezelfde rijen toetsen.
  test('rolhek-herstel/AC-6: de lezertest van AC-4 heeft dezelfde rijen', () => {
    const lezertest = readFileSync('test/hooks/shell-commentaar.test.ts', 'utf8');
    const ontbreekt = COMMENTAAR_RIJEN.filter((rij) => !lezertest.includes(rij.naam));
    expect(ontbreekt.map((rij) => rij.naam)).toEqual([]);
  });

  test('rolhek-herstel/AC-6: een reden korter dan drie woorden, een verplichte rij en een onbekende rij op de lijst zijn fouten', () => {
    const rijen: readonly Rij[] = [
      { naam: 'a', tekst: 'a', bashZiet: ['a'] },
      { naam: 'b', tekst: 'b', bashZiet: ['b'] },
    ];
    expect(lijstFouten({ a: 'bash leest dit anders' }, rijen, new Set())).toEqual([]);
    expect(lijstFouten({ a: 'te kort' }, rijen, new Set())).toEqual(['a: reden korter dan drie woorden']);
    expect(lijstFouten({ a: '   ' }, rijen, new Set())).toEqual(['a: reden korter dan drie woorden']);
    expect(lijstFouten({ b: 'bash leest dit anders' }, rijen, new Set(['b']))).toEqual([
      'b: een verplichte rij (AC-4) staat op de lijst',
    ]);
    expect(lijstFouten({ z: 'bash leest dit anders' }, rijen, new Set())).toEqual(['z: staat niet in het corpus']);
  });

  test('rolhek-herstel/AC-6: een rij die groen wordt en op de lijst staat, is rood (de lijst krimpt mee)', () => {
    expect(uitslagFouten({ a: 'groen', b: 'rood', c: 'rood' }, { b: 'bash leest dit anders' })).toEqual({
      ...LEEG,
      roodNietAanvaard: ['c'],
    });
    expect(uitslagFouten({ a: 'groen' }, { a: 'bash leest dit anders' })).toEqual({ ...LEEG, groenOpLijst: ['a'] });
    expect(uitslagFouten({ a: 'ongeldig' }, {})).toEqual({ ...LEEG, ongeldig: ['a'] });
    expect(uitslagFouten({ a: 'groen', b: 'rood' }, { b: 'bash leest dit anders' })).toEqual(LEEG);
  });
});

// ---------- de differentiële test tegen echte bash, in de kooi ----------

const bashVersie = spawnSync('bash', ['--version'], { encoding: 'utf8' }).stdout.split('\n')[0] ?? 'bash onbekend';
const bashHoofdversie = Number(/version (\d+)\./.exec(bashVersie)?.[1] ?? '0');

/**
 * De prelude is een databestand dat bash zelf leest vóór restricted mode ingaat (BASH_ENV). Hij zet elke builtin uit behalve
 * `builtin`, `enable`, `trap`, `set`, `shopt`, `return` en `printf`, en vangt elke commandonaam zonder `/` op in
 * `command_not_found_handle` (de handlerstatus komt uit `HANDLER_STATUS`); een DEBUG-trap (`set -T`) vult aan met de namen met
 * `/`. De waarnemingen gaan naar bestandsdescriptor 3, niet naar stdout: de uitvoer van een commandosubstitutie
 * (`$(…)`, backticks) gaat naar de aanroeper en verliest de NUL-tekens, zodat een naam daarbinnen stdout nooit haalt.
 */
const PRELUDE = `for __n in $(compgen -b); do
  case $__n in
    builtin|enable|trap|set|shopt|return|printf) ;;
    *) enable -n "$__n" ;;
  esac
done
command_not_found_handle() {
  if [[ -n $__nf ]]; then return 127; fi
  __nf=1
  printf '%s\\0' "$1" >&3
  return "$HANDLER_STATUS"
}
__dbg() {
  __c=$BASH_COMMAND
  while [[ $__c =~ ^[A-Za-z_][A-Za-z_0-9]*=[^[:space:]]*[[:space:]]+(.*)$ ]]; do __c=\${BASH_REMATCH[1]}; done
  __c=\${__c%%[[:space:]]*}
  if [[ $__c == */* ]]; then printf '%s\\0' "$__c" >&3; fi
  return 0
}
trap __dbg DEBUG
set -T
`;

const STATUSSEN = ['0', '1'] as const;
const EXTGLOB = ['-O', '+O'] as const;

/** Het commando dat de kooi draait: elke rij vier keer, met een lege PATH alleen in de omgeving van de binnenste aanroep. */
function driver(map: string): string {
  return [
    'BASHPAD=$(command -v bash)',
    `for rij in ${map}/rijen/*; do`,
    '  n=${rij##*/}',
    `  for status in ${STATUSSEN.join(' ')}; do`,
    `    for ext in ${EXTGLOB.join(' ')}; do`,
    `      env -i PATH=${map}/leeg BASH_ENV=${map}/prelude.sh HANDLER_STATUS=$status "$BASHPAD" --restricted --noprofile --norc $ext extglob "$rij" 3> "${map}/uit/$n.$status$ext" > /dev/null 2>&1 < /dev/null`,
    '    done',
    '  done',
    'done',
    'exit 0',
  ].join('\n');
}

/** Per rij de vereniging van de vier runs: elke commandonaam die bash probeerde te starten. */
function bashNamen(rijen: readonly Rij[]): ReadonlyMap<string, ReadonlySet<string>> {
  const map = mkdtempSync(path.join(tmpdir(), 'shell-woorden-'));
  try {
    for (const submap of ['rijen', 'uit', 'leeg']) mkdirSync(path.join(map, submap));
    writeFileSync(path.join(map, 'prelude.sh'), PRELUDE);
    rijen.forEach((rij, index) => {
      writeFileSync(path.join(map, 'rijen', `r${String(index).padStart(3, '0')}.sh`), `${rij.tekst}\n`);
    });
    inKooi(driver(map), { werkmap: map, timeout: 120_000 });
    const uit = new Map<string, Set<string>>();
    rijen.forEach((rij, index) => {
      const namen = new Set<string>();
      for (const status of STATUSSEN)
        for (const ext of EXTGLOB) {
          const bestand = path.join(map, 'uit', `r${String(index).padStart(3, '0')}.sh.${status}${ext}`);
          for (const naam of readFileSync(bestand, 'utf8').split('\u0000').slice(0, -1)) namen.add(naam);
        }
      uit.set(rij.naam, namen);
    });
    return uit;
  } finally {
    rmSync(map, { recursive: true, force: true });
  }
}

describe('rolhek-herstel/AC-5: differentieel tegen echte bash (kooi)', () => {
  test(`rolhek-herstel/AC-5: elke commandonaam die bash waarneemt is ook een eerste woord van de lezer (${bashVersie})`, (ctx) => {
    ctx.skip(vermogen('kooi').ontbreekt, vermogen('kooi').melding);
    ctx.skip(bashHoofdversie < 5, `bash ouder dan versie 5 (${bashVersie})`);
    const waargenomen = bashNamen(RIJEN);
    const oordelen = Object.fromEntries(
      RIJEN.map((rij): [string, Oordeel] => [
        rij.naam,
        beoordeel(rij, waargenomen.get(rij.naam) ?? new Set(), lezerNamen(rij.tekst)),
      ]),
    );
    const fouten = uitslagFouten(oordelen, AANVAARD);
    // Bij een rode rij: welke namen de lezer mist, zodat de melding de oorzaak toont.
    const mist = Object.fromEntries(
      fouten.roodNietAanvaard.map((naam) => {
        const rij = RIJEN.find((kandidaat) => kandidaat.naam === naam);
        const lezer = lezerNamen(rij?.tekst ?? '');
        return [naam, [...(waargenomen.get(naam) ?? [])].filter((bashNaam) => !lezer.has(bashNaam))];
      }),
    );
    expect({ ...fouten, mist }).toEqual({ ...LEEG, mist: {} });
  });
});
