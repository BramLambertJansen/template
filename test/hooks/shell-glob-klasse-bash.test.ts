import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { decide, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';
import { globKlasseRegex, globTekstRegex } from '../../rails/hooks/lib/shell.mjs';

// Differentieel: `globKlasseRegex` en het echte pad `globTekstRegex` tegen echte bash (leerpunten #618/#622, spec
// rolhek-vooraf-krimp AC-3, AC-10 (c)); de differentiële test toetst `globTekstRegex`, via `codeRegex`.
// Eis: elke bash-treffer is ook een treffer van de code. De code mag strenger zijn (meer treffers), nooit nauwer: een
// glob die bash laat passen op `.git` en de code niet, is een sluiproute. De code werkt bewust onder vlag `i`.

// Bash draait onder `LC_ALL=C`. Onder UTF-8 met `globasciiranges` (standaard sinds bash 5) zijn bereiken voor ASCII-doelen
// gelijk aan die onder C, dus de uitkomst voor `.git` en `lefthook.yml` verschilt niet per locale.
const versie = spawnSync('bash', ['--version'], { encoding: 'utf8' });
const bashHoofdversie = versie.status === 0 ? Number(/version (\d+)\./.exec(versie.stdout)?.[1] ?? '0') : 0;
// De test gebruikt `mapfile` (bash 4+); macOS levert bash 3.2 en slaat hem dus over.
const bashAanwezig = bashHoofdversie >= 4;

// Elke groep heeft een stam; de namen zijn de stam plus een teken of niets, de patronen de stam plus een klasse.
const STAMMEN = ['.gi', 'lefthook.ym', 'g'];
const NA_STAM = [
  '',
  't',
  'T',
  'l',
  'L',
  'a',
  'z',
  'h',
  'H',
  '-',
  ']',
  '[',
  '^',
  '!',
  '.',
  ':',
  '=',
  '0',
  '5',
  ' ',
  'x',
];
const ATOMEN = [
  'a',
  'z',
  'l',
  't',
  'L',
  '-',
  '!',
  '^',
  ']',
  '[',
  '.',
  '0',
  '9',
  '[:digit:]',
  '[:alpha:]',
  '[:upper:]',
  '[:lower:]',
  '[:punct:]',
  '[:foo:]',
  '[=a=]',
  '[=-=]',
  '[.a.]',
  '[.z.]',
  '[.-.]',
  '[.l.]',
];
// Groep voor de drie-atoomlaag: alleen de beslissende namen, anders loopt de test te lang op.
const DRIE_ATOMEN = STAMMEN.length;
// Groep voor namen van twee tekens na de stam `.g` tegen patronen met twee benoemde delen (bash 5.2 slaat na een geslaagd
// benoemd deel een teken over: de klasse eindigt dan later of, bij een `[`, eerder).
const TWEE_DELEN = STAMMEN.length + 1;
const TWEE_DELEN_STAM = '.g';
const TWEE_DELEN_TEKENS = ['i', 't', 'z', 'm', 'l', ']', '[', '='];
const TWEE_DELEN_ATOMEN = ['[=i=]', '[=z=]', '[:alpha:]', '[.i.]', '[=x=]'];
const TWEE_DELEN_STAARTEN = ['', ']', '[t]', 'x]', '[x', ']]', '[=i=]', '[=z=]]'];
const DRIE_ATOMEN_NAMEN = ['.git', '.GIT', '.gi]', '.gi-', '.gi!', '.gi^', '.gi['];
const POSIX_NAMEN = [
  'alnum',
  'alpha',
  'ascii',
  'blank',
  'cntrl',
  'digit',
  'graph',
  'lower',
  'print',
  'punct',
  'space',
  'upper',
  'word',
  'xdigit',
];

function lengteTot(lengte: number): string[] {
  let laag: string[] = [''];
  const alle: string[] = [];
  for (let stap = 0; stap < lengte; stap += 1) {
    laag = laag.flatMap((voor) => ATOMEN.map((atoom) => voor + atoom));
    alle.push(...laag);
  }
  return alle;
}

function patronen(): { groep: number; patroon: string }[] {
  const lijst: { groep: number; patroon: string }[] = [];
  const zelfstandig = [
    '[',
    '[]',
    '[!]',
    '[^]',
    '[]]',
    '[!]]',
    '[]a]',
    '[]-a]',
    '[a-]',
    '[-a]',
    '[a-z]',
    '[z-a]',
    '[!z-a]',
    '[^z-a]',
    '[a-a]',
    '[[:alpha:]-z]',
    '[a-[:alpha:]]',
    '[[=a=]-z]',
    '[a-[=z=]]',
    '[[.a.]-z]',
    '[a-[.z.]]',
    '[[.a.]-[.z.]]',
    '[[.-.]]',
    '[[.-.]-z]',
    '[a-[.-.]]',
    '[[.].]]',
    '[[.[.]]',
    '[[:digit:]',
    '[[:digit:]]]',
    '[[:bogus:]]',
    '[[:',
    '[[:]',
    '[[.]',
    '[[=]',
    '[[=]=]]',
    '[[=ab=]]',
    '[[.ab.]]',
    '[[:digit:]-[:alpha:]]',
    '[!-]',
    '[--/]',
    '[+--]',
    '[a-c-e]',
    '[[.a.]-]',
    '[!]a]',
    '[!]]a]',
    '[\\]]',
    '[\\a]',
    '[a\\-z]',
    // Bash 5.2 slaat na een geslaagde `[=x=]` het volgende teken over (klasse sluit pas bij een latere `]`); 5.3 niet. Zelfde
    // vormen met `[:naam:]` en `[.x.]`, zodat een gelijk 5.2-gedrag daar in CI (Ubuntu 24.04, bash 5.2) zichtbaar wordt.
    '[[=t=]]x]',
    '[[=t=]]]',
    '[![=t=]]x]',
    '[[=t=]]x]y]',
    '[[:alpha:]]x]',
    '[[:alpha:]]]',
    '[![:alpha:]]x]',
    '[[:alpha:]]x]y]',
    '[[.t.]]x]',
    '[[.t.]]]',
    '[![.t.]]x]',
    '[[.t.]]x]y]',
  ];
  STAMMEN.forEach((stam, groep) => {
    for (const body of ['', ...lengteTot(2)])
      for (const voor of ['', '!', '^']) lijst.push({ groep, patroon: `${stam}[${voor}${body}]` });
    for (const kern of zelfstandig) lijst.push({ groep, patroon: stam + kern });
    for (const naam of POSIX_NAMEN) {
      lijst.push({ groep, patroon: `${stam}[[:${naam}:]]` });
      lijst.push({ groep, patroon: `${stam}[![:${naam}:]]` });
    }
  });
  // 3 atomen alleen voor de stam waar het om gaat (`.git`) en tegen de beslissende namen (groep DRIE_ATOMEN).
  for (const body of lengteTot(3).filter((tekst) => tekst.length > 0)) {
    for (const voor of ['', '!']) lijst.push({ groep: DRIE_ATOMEN, patroon: `.gi[${voor}${body}]` });
  }
  const paren = TWEE_DELEN_ATOMEN.flatMap((eerste) => TWEE_DELEN_ATOMEN.map((tweede) => eerste + tweede));
  for (const paar of paren) {
    for (const staart of TWEE_DELEN_STAARTEN) {
      for (const voor of ['', '!'])
        lijst.push({ groep: TWEE_DELEN, patroon: `${TWEE_DELEN_STAM}[${voor}${paar}${staart}` });
    }
  }
  return lijst;
}

function namen(): { groep: number; naam: string }[] {
  const lijst: { groep: number; naam: string }[] = [];
  STAMMEN.forEach((stam, groep) => {
    for (const na of NA_STAM) lijst.push({ groep, naam: stam + na });
  });
  // Hoofdletters en de volledige namen: `.git` en `gh` zitten al in de stam plus teken; `lefthook.yml` ook (`l`).
  lijst.push({ groep: 0, naam: '.GIT' }, { groep: 1, naam: 'LEFTHOOK.YML' }, { groep: 2, naam: 'gH' });
  for (const naam of DRIE_ATOMEN_NAMEN) lijst.push({ groep: DRIE_ATOMEN, naam });
  lijst.push({ groep: TWEE_DELEN, naam: TWEE_DELEN_STAM });
  for (const een of TWEE_DELEN_TEKENS) {
    lijst.push({ groep: TWEE_DELEN, naam: TWEE_DELEN_STAM + een });
    for (const twee of TWEE_DELEN_TEKENS) lijst.push({ groep: TWEE_DELEN, naam: TWEE_DELEN_STAM + een + twee });
  }
  return lijst;
}

// Eén bash-run per groep (patronen en namen van die groep), zodat bash niet over namen van andere groepen loopt.
const BASH_SCRIPT = `
mapfile -t P < "$1"
mapfile -t N < "$2"
for pi in "\${!P[@]}"; do
  patroon=\${P[pi]}
  uit=
  for ni in "\${!N[@]}"; do
    if [[ \${N[ni]} == $patroon ]]; then uit+="$ni,"; fi
  done
  printf '%s\\n' "$uit"
done
`;

function bashGroep(map: string, patronen: string[], namenLijst: string[]): Set<number>[] {
  writeFileSync(path.join(map, 'p.txt'), patronen.join('\n') + '\n');
  writeFileSync(path.join(map, 'n.txt'), namenLijst.join('\n') + '\n');
  writeFileSync(path.join(map, 'run.sh'), BASH_SCRIPT);
  const uit = spawnSync('bash', [path.join(map, 'run.sh'), path.join(map, 'p.txt'), path.join(map, 'n.txt')], {
    env: { PATH: process.env['PATH'] ?? '/usr/bin:/bin', LC_ALL: 'C' },
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  if (uit.status !== 0) throw new Error(`bash faalde: ${uit.stderr}`);
  return uit.stdout
    .split('\n')
    .slice(0, patronen.length)
    .map(
      (regel) =>
        new Set(
          regel
            .split(',')
            .filter((deel) => deel !== '')
            .map(Number),
        ),
    );
}

/** Per patroon de indexen (in `nms`) van de namen waar bash het patroon op laat passen. */
function bashTreffers(
  pats: { groep: number; patroon: string }[],
  nms: { groep: number; naam: string }[],
): Set<string>[] {
  const map = mkdtempSync(path.join(tmpdir(), 'glob-klasse-'));
  try {
    const uit: Set<string>[] = pats.map(() => new Set<string>());
    for (const groep of new Set(pats.map((item) => item.groep))) {
      const patIdx = pats.flatMap((item, index) => (item.groep === groep ? [index] : []));
      const naamIdx = nms.flatMap((item, index) => (item.groep === groep ? [index] : []));
      const treffers = bashGroep(
        map,
        patIdx.map((index) => pats[index]?.patroon ?? ''),
        naamIdx.map((index) => nms[index]?.naam ?? ''),
      );
      treffers.forEach((set, lokaal) => {
        const doel = uit[patIdx[lokaal] ?? 0];
        for (const lokaleNaam of set) doel?.add(String(naamIdx[lokaleNaam]));
      });
    }
    return uit;
  } finally {
    rmSync(map, { recursive: true, force: true });
  }
}

/**
 * Het hele glob-woord als regex via `globTekstRegex`, met dezelfde opties als `stukRegex` (zelfladend.mjs: `teken` voor `*`,
 * `?` en letterlijk; `elk` `[^/]`; `alles` `[\s\S]*`; `ruim: false`), maar zonder `(?!\.)`-voorvoegsel. Zo toetst de test het
 * echte pad en niet `globKlasseRegex` los.
 */
function codeRegex(patroon: string): RegExp {
  const teken = (char: string): string => {
    if (char === '*') return '[^/]*';
    if (char === '?') return '[^/]';
    return char.replace(/[.+^${}()|\\[\]]/g, '\\$&');
  };
  const { regex } = globTekstRegex(patroon, { teken, elk: '[^/]', alles: '[\\s\\S]*', ruim: false });
  return new RegExp(`^${regex}$`, 'i');
}

describe.skipIf(!bashAanwezig)(
  'globTekstRegex (het echte pad) en globKlasseRegex tegen bash: de code is nooit nauwer dan bash',
  () => {
    const pats = patronen();
    const nms = namen();

    test('elke bash-treffer is ook een treffer van de code', () => {
      const treffers = bashTreffers(pats, nms);
      const mis: string[] = [];
      let bashJa = 0;
      pats.forEach((item, index) => {
        const regex = codeRegex(item.patroon);
        for (const naamIndex of treffers[index] ?? []) {
          bashJa += 1;
          const naam = nms[Number(naamIndex)]?.naam ?? '';
          if (!regex.test(naam))
            mis.push(`patroon ${JSON.stringify(item.patroon)} naam ${JSON.stringify(naam)}: bash ja, code nee`);
        }
      });
      expect(bashJa).toBeGreaterThan(1000);
      const paren = pats.reduce((som, item) => som + nms.filter((naam) => naam.groep === item.groep).length, 0);
      expect(paren).toBeGreaterThan(300_000);
      const patronenMis = [...new Set(mis.map((regel) => regel.split(' naam ')[0]))];
      expect(patronenMis).toEqual([]);
      expect(mis).toEqual([]);
    }, 120_000);

    test('de bash-uitkomst voor de sluiproutes van de reviews is zoals verwacht (controle op het corpus zelf)', () => {
      const eigen = [
        { groep: 0, patroon: '.gi[a-[.z.]]' },
        { groep: 0, patroon: '.gi[[.a.]-z]' },
        { groep: 1, patroon: 'lefthook.ym[a-[:digit:]l]' },
        { groep: 0, patroon: '.g[[=i=][=z=][t]' },
        { groep: 1, patroon: 'lefthook.y[[=m=][=z=][l]' },
      ];
      const lijst = [
        { groep: 0, naam: '.git' },
        { groep: 1, naam: 'lefthook.yml' },
      ];
      const [een, twee, drie, vier, vijf] = bashTreffers(eigen, lijst);
      expect([...(een ?? [])]).toEqual(['0']);
      expect([...(twee ?? [])]).toEqual(['0']);
      expect([...(drie ?? [])]).toEqual([]);
      // Bash 5.2 (CI): ja, na een geslaagd `[=i=]` wordt de `[` van `[=z=]` overgeslagen en sluit de klasse bij `=]`; de rest
      // `[t]` is een nieuwe klasse. Bash 5.3 (lokaal): waarschijnlijk nee. Dus bash ja óf nee; de code zegt in beide gevallen ja.
      for (const bash of [vier, vijf]) expect(bash?.size ?? 0).toBeLessThanOrEqual(1);
      expect(codeRegex('.g[[=i=][=z=][t]').test('.git')).toBe(true);
      expect(codeRegex('lefthook.y[[=m=][=z=][l]').test('lefthook.yml')).toBe(true);
    });

    // `globKlasseRegex` zelf: de klasse dekt minstens de bash-5.3-lezing (`[[=a=]]` plus de rest als letterlijk).
    test('globKlasseRegex geeft voor `.gi[[=a=]]]` en `.gi[![=a=]]x]` een klasse die minstens de bash-5.3-lezing dekt', () => {
      const een = globKlasseRegex('.gi[[=a=]]]', 3);
      const twee = globKlasseRegex('.gi[![=a=]]x]', 3);
      // 5.3: klasse `[[=a=]]` (eind 8) en negatie `[![=a=]]` (eind 9); een klasse die verder reikt dekt dat ook.
      expect(een?.eind).toBeGreaterThanOrEqual(8);
      expect(twee?.eind).toBeGreaterThanOrEqual(9);
      expect(new RegExp(`^${een?.regex ?? '(?!)'}$`, 'i').test('a')).toBe(true);
      expect(new RegExp(`^${twee?.regex ?? '(?!)'}$`, 'i').test('t')).toBe(true);
    });

    // Op commandoniveau (review B3): de tokenizer haalt escapes en aanhalingen weg vóór de omzetting, bash leest ze als
    // klassetekens. Ruwe woorden met escapes en aanhalingen in een klasse, tegen `[[ naam == <ruw woord> ]]` in bash. Faalt
    // alleen als bash past op een zelfladende naam en `decide` voor de developer geen deny geeft. Valt onder de skip hierboven.
    describe('rolhek (decide): een klasse met escape of aanhaling die bash op een zelfladende naam laat passen', () => {
      const config = loadConfig(readFileSync('.claude/gates.json', 'utf8'));
      const ctx = {
        root: '/repo',
        cwd: '/repo',
        config,
        read: () => null,
        committed: () => false,
        isDir: () => false,
        branch: 'feat/x',
      };
      const deny = (command: string): boolean =>
        decide({ tool_name: 'Bash', tool_input: { command }, agent_type: 'developer' }, ctx).deny.length > 0;

      test.each(RUWE_STAMMEN)(
        '$naam: elk ruw woord waarop bash past is deny voor de developer',
        ({ stam, naam, commando }) => {
          const woorden = ruweKlassen().map((klasse) => stam + klasse);
          const treffers = bashRuwTreffers(naam, woorden);
          expect(treffers.size).toBeGreaterThan(100);
          const mis = [...treffers]
            .map((index) => woorden[index] ?? '')
            .filter((woord) => !deny(commando(woord)))
            .map((woord) => `${commando(woord)}: bash past op ${naam}, geen deny`);
          expect(mis).toEqual([]);
        },
        60_000,
      );

      test('de bash-uitkomst voor de B3-routes is zoals verwacht (controle op het corpus zelf)', () => {
        const woorden = [".gi[a'\\'-u]", '.gi[a\\]t]', '.gi[\\!t]'];
        expect([...bashRuwTreffers('.git', woorden)]).toEqual([0, 1, 2]);
      });
    });
  },
);

// Ruwe woorden voor de test hierboven; de bash-kant staat in `bashRuwTreffers`.
const RUWE_ATOMEN = [
  't',
  'a',
  'u',
  '!',
  '^',
  ']',
  '-',
  '\\!',
  '\\^',
  '\\]',
  '\\-',
  "'\\'",
  '"\\\\"',
  "'-'",
  "'!'",
  "'^'",
  "']'",
  '\\t',
];
const EXTRA_RUWE_KLASSEN = ['[a\\]t]', "[a'\\'-u]", '[\\!t]', '[!\\t]', '[\\^t]', '[a\\-u]'];
const RUWE_STAMMEN = [
  { stam: '.gi', naam: '.git', commando: (woord: string) => `echo x > ${woord}/config` },
  { stam: 'lefthook.ym', naam: 'lefthook.yml', commando: (woord: string) => `echo x > ${woord}` },
];

function ruweKlassen(): string[] {
  let laag = [''];
  const klassen = new Set<string>(EXTRA_RUWE_KLASSEN);
  for (let stap = 0; stap < 3; stap += 1) {
    laag = laag.flatMap((voor) => RUWE_ATOMEN.map((atoom) => voor + atoom));
    for (const body of laag) klassen.add(`[${body}]`);
  }
  return [...klassen];
}

/** Indexen van de woorden waarop bash `naam` laat passen (het woord staat ruw in een `[[ ]]`, zoals in een commando). */
function bashRuwTreffers(naam: string, woorden: string[]): Set<number> {
  const map = mkdtempSync(path.join(tmpdir(), 'glob-klasse-ruw-'));
  try {
    const script =
      woorden.map((woord, index) => `[[ $1 == ${woord} ]] && echo ${String(index)}`).join('\n') + '\nexit 0\n';
    writeFileSync(path.join(map, 'run.sh'), script);
    const uit = spawnSync('bash', [path.join(map, 'run.sh'), naam], {
      env: { PATH: process.env['PATH'] ?? '/usr/bin:/bin', LC_ALL: 'C' },
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    if (uit.status !== 0) throw new Error(`bash faalde: ${uit.stderr}`);
    return new Set(
      uit.stdout
        .split('\n')
        .filter((regel) => regel !== '')
        .map(Number),
    );
  } finally {
    rmSync(map, { recursive: true, force: true });
  }
}
