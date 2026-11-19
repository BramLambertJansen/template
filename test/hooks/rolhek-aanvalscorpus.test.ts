import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { decide, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';
import {
  AANVAARD,
  BASISSEN,
  FRAGMENT,
  REGELS,
  ROLLEN,
  TOEGESTAAN,
  TOESTANDZETTERS,
  VORMEN,
  type Aanvaard,
  type Basis,
  type BasisCtx,
  type Rol,
  type Toestandzetter,
  type Uitkomst,
  type Vorm,
} from './rolhek-aanvalscorpus.ts';

// Spec rolhek-aanvalscorpus: één vast corpus van shellvormen draait tegen de weigerregels van het rolhek. Een weigering blijft
// staan, wat er ook om het geweigerde commando heen staat. Een falende test geeft per vorm (of basis) een lijst met afwijkingen,
// elk `<rol>: niet geweigerd: <commando>` of `<rol>: aanvaard gat is dicht: <commando>`.
const config = loadConfig(readFileSync(path.resolve(import.meta.dirname, '../../.claude/gates.json'), 'utf8'));
const ROOT = '/repo';
const GEEN_CTX: BasisCtx = { onderhoud: false, bestanden: {} };

type Uitslag = 'deny' | 'ask' | 'door';
interface Beslissing {
  readonly uitslag: Uitslag;
  readonly melding: string;
}

const rolNaam = (rol: Rol): string => (rol === '' ? 'hoofdsessie' : rol);
const toon = (commando: string): string => commando.replaceAll('\n', '⏎');

function beslis(commando: string, rol: Rol, ctx: BasisCtx = GEEN_CTX): Beslissing {
  const bestanden = ctx.bestanden;
  const d = decide(
    {
      tool_name: 'Bash',
      tool_input: { command: commando },
      ...(rol === '' ? {} : { agent_type: rol }),
    },
    {
      root: ROOT,
      cwd: ROOT,
      config,
      read: (rel: string) => (Object.hasOwn(bestanden, rel) ? (bestanden[rel] ?? null) : null),
      committed: (rel: string) => Object.hasOwn(bestanden, rel),
      isDir: () => false,
      branch: 'feat/x',
      ...(ctx.onderhoud ? { onderhoud: true } : {}),
    },
  );
  const melding = [...d.deny, ...d.ask].join('\n');
  if (d.deny.length > 0) return { uitslag: 'deny', melding };
  return { uitslag: d.ask.length > 0 ? 'ask' : 'door', melding };
}

/** Een afwijking op een basisrij of een vorm: de uitslag is niet een van `toegestaan`, of de melding mist het fragment. */
function weigerFout(
  geval: { rol: Rol; commando: string; basis: Basis },
  beslissing: Beslissing,
  toegestaan: readonly Uitkomst[],
): string | null {
  const { rol, commando, basis } = geval;
  if (beslissing.uitslag === 'door') return `${rolNaam(rol)}: niet geweigerd: ${toon(commando)}`;
  if (!toegestaan.includes(beslissing.uitslag))
    return `${rolNaam(rol)}: ${beslissing.uitslag} in plaats van ${toegestaan.join(' of ')}: ${toon(commando)}`;
  const fragmenten = FRAGMENT[basis.regel];
  if (fragmenten.some((fragment) => beslissing.melding.includes(fragment))) return null;
  const begin = beslissing.melding.slice(0, 110).replaceAll('\n', ' | ');
  return `${rolNaam(rol)}: geweigerd zonder het fragment van regel ${basis.regel} (${fragmenten.join(' of ')}): ${toon(commando)}; melding: ${begin}`;
}

/** Een vorm op een basis die `ask` geeft, geeft `ask` of `deny`, nooit door (randgeval); op een `deny`-basis `deny`. */
const toegestaneUitkomsten = (uitkomst: Uitkomst): readonly Uitkomst[] =>
  uitkomst === 'ask' ? ['ask', 'deny'] : ['deny'];

const isAanvaard = (basis: string, vorm: string, rol: Rol): boolean =>
  AANVAARD.some((rij) => rij.basis === basis && rij.vorm === vorm && rij.rol === rol);

// ---------- AC-1: de basissen ----------

describe('rolhek-aanvalscorpus/AC-1 basissen: decide weigert elke basisrij voor elk van zijn rollen, met het fragment van de regel', () => {
  test.each(BASISSEN)('rolhek-aanvalscorpus/AC-1 basis $regel: $commando', (basis) => {
    const afwijkingen = basis.rollen.flatMap(({ rol, uitkomst }) => {
      const fout = weigerFout({ rol, commando: basis.commando, basis }, beslis(basis.commando, rol, basis.ctx), [
        uitkomst,
      ]);
      return fout === null ? [] : [fout];
    });
    expect(afwijkingen).toStrictEqual([]);
  });

  test('rolhek-aanvalscorpus/AC-1 elk lid van de union Regel heeft minstens één basisrij en een fragment', () => {
    const zonderBasis = REGELS.filter((regel) => !BASISSEN.some((basis) => basis.regel === regel));
    expect(zonderBasis).toStrictEqual([]);
    const zonderFragment = REGELS.filter(
      (regel) => FRAGMENT[regel].length === 0 || FRAGMENT[regel].some((fragment) => fragment.trim() === ''),
    );
    expect(zonderFragment).toStrictEqual([]);
  });

  test('rolhek-aanvalscorpus/AC-1 elke basisrij noemt minstens één rol, uit de zeven rollen', () => {
    const afwijkingen = BASISSEN.filter(
      (basis) => basis.rollen.length === 0 || basis.rollen.some(({ rol }) => !ROLLEN.includes(rol)),
    ).map((basis) => basis.commando);
    expect(afwijkingen).toStrictEqual([]);
  });
});

// ---------- AC-2: de vormen ----------

interface Resultaat {
  readonly getoetst: number;
  readonly afwijkingen: string[];
}

const vormUitslagen = new Map<string, Resultaat>();

function toetsVormOpBasis(vorm: Vorm, basis: Basis): Resultaat {
  const commando = vorm.maak(basis.commando);
  const afwijkingen = basis.rollen.flatMap(({ rol, uitkomst }) => {
    if (isAanvaard(basis.commando, vorm.naam, rol)) return [];
    const fout = weigerFout({ rol, commando, basis }, beslis(commando, rol, basis.ctx), toegestaneUitkomsten(uitkomst));
    return fout === null ? [] : [fout];
  });
  return { getoetst: basis.rollen.length, afwijkingen };
}

/** Elke basis × elke rol van de basis voor deze vorm; het aantal getoetste gevallen telt mee voor de telling (AC-2). */
function toetsVorm(vorm: Vorm): Resultaat {
  const bekend = vormUitslagen.get(vorm.naam);
  if (bekend !== undefined) return bekend;
  const delen = BASISSEN.map((basis) => toetsVormOpBasis(vorm, basis));
  const resultaat = {
    getoetst: delen.reduce((som, deel) => som + deel.getoetst, 0),
    afwijkingen: delen.flatMap((deel) => deel.afwijkingen),
  };
  vormUitslagen.set(vorm.naam, resultaat);
  return resultaat;
}

describe('rolhek-aanvalscorpus/AC-2 vormen: een weigering blijft staan, wat er ook om het commando heen staat', () => {
  test.each(VORMEN)('rolhek-aanvalscorpus/AC-2 vorm $naam', (vorm) => {
    expect(toetsVorm(vorm).afwijkingen).toStrictEqual([]);
  });

  test('rolhek-aanvalscorpus/AC-2 het aantal getoetste gevallen is gelijk aan vormen × basissen × rollen', () => {
    const rollenPerBasis = BASISSEN.reduce((som, basis) => som + basis.rollen.length, 0);
    const getoetst = VORMEN.reduce((som, vorm) => som + toetsVorm(vorm).getoetst, 0);
    expect(getoetst).toBe(VORMEN.length * rollenPerBasis);
    expect(getoetst).toBeGreaterThan(0);
  });

  // Elke onzekere cd kan de mogelijke mappen verdubbelen; boven 32 is de map onbekend (`uniekeMappen` in rolhek.mjs).
  test('rolhek-aanvalscorpus/AC-2 boven 32 mogelijke mappen is de map onbekend en weigert de zelfladende toets', () => {
    const cds = (n: number): string => Array.from({ length: n }, (_, i) => `cd m${String(i)}; `).join('');
    expect(beslis(`${cds(4)}tee x`, 'developer').uitslag).toBe('door');
    const zes = beslis(`${cds(6)}tee x`, 'developer');
    expect(zes.uitslag).toBe('deny');
    expect(zes.melding).toContain('ziet het rolhek niet waar paden landen');
  });
});

// ---------- AC-3: de vormen voeren de basis uit ----------

// Zoals `bashOmgeving` in shell-glob-klasse-bash.test.ts: een schone omgeving, `LC_ALL=C`. `TMPDIR` erbij: `stdbuf` (uutils)
// maakt een tijdelijke map en faalt als `/tmp` niet schrijfbaar is (sandbox).
const bashOmgeving = { PATH: process.env['PATH'] ?? '/usr/bin:/bin', LC_ALL: 'C', TMPDIR: tmpdir() };
const AANVAL_BASIS = 'echo AANVAL >&2';

interface BashUitvoer {
  readonly stdout: string;
  readonly stderr: string;
  readonly fout: string;
  readonly bestanden: readonly string[];
}

/**
 * `bash --noprofile --norc <script>` met het commando als scriptbestand, in een nieuwe tijdelijke map (geen kooi: de basis is
 * `echo` naar stderr). Een scriptbestand en geen `-c`, zoals shell-glob-klasse-bash.test.ts: de lintregel `kooi` weigert een
 * shell met `-c` en een commandotekst buiten `inKooi`. Het script staat buiten de werkmap, zodat die leeg blijft.
 */
function draaiBash(commando: string): BashUitvoer {
  const map = mkdtempSync(path.join(tmpdir(), 'aanvalscorpus-'));
  const scriptMap = mkdtempSync(path.join(tmpdir(), 'aanvalscorpus-script-'));
  try {
    const script = path.join(scriptMap, 'vorm.sh');
    writeFileSync(script, `${commando}\n`);
    const uit = spawnSync('bash', ['--noprofile', '--norc', script], {
      cwd: map,
      env: bashOmgeving,
      encoding: 'utf8',
      timeout: 20_000,
    });
    return {
      stdout: uit.stdout,
      stderr: uit.stderr,
      fout: uit.error === undefined ? '' : uit.error.message,
      bestanden: readdirSync(map),
    };
  } finally {
    rmSync(map, { recursive: true, force: true });
    rmSync(scriptMap, { recursive: true, force: true });
  }
}

function uitvoerAfwijkingen(uit: BashUitvoer): string[] {
  const afwijkingen: string[] = [];
  if (uit.fout !== '') afwijkingen.push(`bash faalde: ${uit.fout}`);
  if (!uit.stderr.split('\n').includes('AANVAL'))
    afwijkingen.push(`de basis draaide niet: stderr is ${JSON.stringify(uit.stderr)}`);
  if (uit.stdout.trim() !== '') afwijkingen.push(`stdout is niet leeg: ${JSON.stringify(uit.stdout)}`);
  if (uit.bestanden.length > 0) afwijkingen.push(`schrijft bestanden: ${uit.bestanden.join(', ')}`);
  return afwijkingen;
}

describe('rolhek-aanvalscorpus/AC-3 vormen voeren de basis uit (echte bash als orakel)', () => {
  test.each(VORMEN)('rolhek-aanvalscorpus/AC-3 vorm $naam schrijft AANVAL naar stderr', (vorm) => {
    expect(uitvoerAfwijkingen(draaiBash(vorm.maak(AANVAL_BASIS)))).toStrictEqual([]);
  });

  test('rolhek-aanvalscorpus/AC-3 geen vorm stuurt stdout naar iets anders dan /dev/null of een pipe', () => {
    const metRedirect = VORMEN.filter((vorm) => vorm.maak('§').replaceAll('> /dev/null', '').includes('>')).map(
      (vorm) => vorm.naam,
    );
    expect(metRedirect).toStrictEqual([]);
  });

  test('rolhek-aanvalscorpus/AC-3 het orakel ziet een vorm die de basis niet uitvoert', () => {
    expect(uitvoerAfwijkingen(draaiBash(`false && ${AANVAL_BASIS}`))).not.toStrictEqual([]);
  });
});

// ---------- AC-4: de toestandzetters ----------

function toetsToegestaan(): string[] {
  return TOEGESTAAN.flatMap(({ commando, rollen }) =>
    rollen.flatMap((rol) =>
      beslis(commando, rol).uitslag === 'door'
        ? []
        : [`${rolNaam(rol)}: geweigerd, hoort door te gaan: ${toon(commando)}`],
    ),
  );
}

const zetterUitslagen = new Map<string, Resultaat>();

function toetsToestandzetter(zetter: Toestandzetter): Resultaat {
  const bekend = zetterUitslagen.get(zetter.naam);
  if (bekend !== undefined) return bekend;
  const gevallen = TOEGESTAAN.flatMap(({ commando, rollen }) => rollen.map((rol) => ({ commando, rol })));
  const afwijkingen = gevallen.flatMap(({ commando, rol }) => {
    if (isAanvaard(commando, zetter.naam, rol)) return [];
    const samen = zetter.voor + commando;
    return beslis(samen, rol).uitslag === 'door' ? [`${rolNaam(rol)}: niet geweigerd: ${toon(samen)}`] : [];
  });
  const resultaat = { getoetst: gevallen.length, afwijkingen };
  zetterUitslagen.set(zetter.naam, resultaat);
  return resultaat;
}

describe('rolhek-aanvalscorpus/AC-4 toestandzetters: een voorvoegsel dat de shelltoestand zet, maakt een leesuitzondering niet vrij', () => {
  test('rolhek-aanvalscorpus/AC-4 elke toegestane basis met een leesuitzondering gaat zelf door voor zijn rollen', () => {
    expect(toetsToegestaan()).toStrictEqual([]);
  });

  test.each(TOESTANDZETTERS.map((zetter) => ({ ...zetter, weergave: toon(zetter.naam) })))(
    'rolhek-aanvalscorpus/AC-4 toestandzetter $weergave',
    (zetter) => {
      expect(toetsToestandzetter(zetter).afwijkingen).toStrictEqual([]);
    },
  );

  test('rolhek-aanvalscorpus/AC-4 het aantal getoetste gevallen is gelijk aan toestandzetters × toegestane basissen × rollen', () => {
    const rollenPerBasis = TOEGESTAAN.reduce((som, basis) => som + basis.rollen.length, 0);
    const getoetst = TOESTANDZETTERS.reduce((som, zetter) => som + toetsToestandzetter(zetter).getoetst, 0);
    expect(getoetst).toBe(TOESTANDZETTERS.length * rollenPerBasis);
    expect(getoetst).toBeGreaterThan(0);
  });
});

// ---------- AC-5: de aanvaarde gaten ----------

/** Een basisrij met een vorm: open zolang AC-2 daarop rood is (door, of geweigerd zonder het fragment van de regel). */
function vormGat(rij: Aanvaard): { commando: string; open: boolean } | null {
  const basis = BASISSEN.find((kandidaat) => kandidaat.commando === rij.basis);
  const vorm = VORMEN.find((kandidaat) => kandidaat.naam === rij.vorm);
  const uitkomst = basis?.rollen.find((kandidaat) => kandidaat.rol === rij.rol)?.uitkomst;
  if (basis === undefined || vorm === undefined || uitkomst === undefined) return null;
  const commando = vorm.maak(basis.commando);
  const fout = weigerFout(
    { rol: rij.rol, commando, basis },
    beslis(commando, rij.rol, basis.ctx),
    toegestaneUitkomsten(uitkomst),
  );
  return { commando, open: fout !== null };
}

/** Een toegestane basis met een toestandzetter: open zolang het commando doorgaat (AC-4). */
function zetterGat(rij: Aanvaard): { commando: string; open: boolean } | null {
  const toegestaan = TOEGESTAAN.find((kandidaat) => kandidaat.commando === rij.basis);
  const zetter = TOESTANDZETTERS.find((kandidaat) => kandidaat.naam === rij.vorm);
  if (toegestaan === undefined || zetter === undefined || !toegestaan.rollen.includes(rij.rol)) return null;
  const commando = zetter.voor + toegestaan.commando;
  return { commando, open: beslis(commando, rij.rol).uitslag === 'door' };
}

const ROADMAP_ITEM = 'Bekende gaten in het rolhek';

function aanvaardFout(rij: Aanvaard): string | null {
  const wie = `${rolNaam(rij.rol)}: ${rij.basis} met ${rij.vorm}`;
  if (rij.reden.trim() === '') return `${wie}: de rij noemt geen reden`;
  if (!rij.roadmap.includes(ROADMAP_ITEM)) return `${wie}: de rij noemt het roadmap-item "${ROADMAP_ITEM}" niet`;
  const gevonden = vormGat(rij) ?? zetterGat(rij);
  if (gevonden === null) return `${wie}: basis, vorm of rol staat niet in het corpus`;
  if (gevonden.open) return null;
  return `${rolNaam(rij.rol)}: aanvaard gat is dicht: ${toon(gevonden.commando)} (haal de rij van de aanvaard-lijst)`;
}

const aanvaardFouten = (rijen: readonly Aanvaard[]): string[] =>
  rijen.flatMap((rij) => {
    const fout = aanvaardFout(rij);
    return fout === null ? [] : [fout];
  });

describe('rolhek-aanvalscorpus/AC-5 aanvaarde gaten: elke rij gaat op de head nog door en noemt reden en roadmap-item', () => {
  test('rolhek-aanvalscorpus/AC-5 elke rij op de aanvaard-lijst gaat nog door; een dicht gat moet van de lijst', () => {
    expect(aanvaardFouten(AANVAARD)).toStrictEqual([]);
  });

  test('rolhek-aanvalscorpus/AC-5 de controle meldt een dicht gat met de melding dat de rij weg moet', () => {
    const dicht: Aanvaard = {
      basis: 'git push --force',
      vorm: '( b )',
      rol: 'developer',
      reden: 'proef: dit gat is dicht',
      roadmap: ROADMAP_ITEM,
    };
    expect(aanvaardFouten([dicht])).toStrictEqual([
      'developer: aanvaard gat is dicht: ( git push --force ) (haal de rij van de aanvaard-lijst)',
    ]);
  });

  test('rolhek-aanvalscorpus/AC-5 de controle eist een reden, het roadmap-item en een bekende basis en vorm', () => {
    const basis: Aanvaard = {
      basis: 'git push --force',
      vorm: '( b )',
      rol: 'developer',
      reden: 'proef',
      roadmap: ROADMAP_ITEM,
    };
    const fouten = aanvaardFouten([
      { ...basis, reden: ' ' },
      { ...basis, roadmap: 'ergens' },
      { ...basis, vorm: 'bestaat niet' },
      { ...basis, basis: 'bestaat niet' },
    ]);
    expect(fouten).toHaveLength(4);
  });
});
