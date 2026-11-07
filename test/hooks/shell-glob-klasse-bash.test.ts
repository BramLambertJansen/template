import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { globKlasseRegex } from '../../rails/hooks/lib/shell.mjs';

// Differentieel: `globKlasseRegex` tegen echte bash (leerpunten #618/#622, spec rolhek-vooraf-krimp AC-3, AC-10 (c)).
// Eis: elke bash-treffer is ook een treffer van de code. De code mag strenger zijn (meer treffers), nooit nauwer: een
// glob die bash laat passen op `.git` en de code niet, is een sluiproute. De code werkt bewust onder vlag `i`.

const bashAanwezig = spawnSync('bash', ['--version']).status === 0;

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
  // 3 atomen alleen voor de stam waar het om gaat: `.git`.
  for (const body of lengteTot(3).filter((tekst) => tekst.length > 0)) {
    for (const voor of ['', '!']) lijst.push({ groep: 0, patroon: `.gi[${voor}${body}]` });
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
  return lijst;
}

const BASH_SCRIPT = `
mapfile -t P < "$1"
mapfile -t N < "$2"
for pi in "\${!P[@]}"; do
  groep=\${P[pi]%%$'\\t'*}
  patroon=\${P[pi]#*$'\\t'}
  uit=
  for ni in "\${!N[@]}"; do
    [[ \${N[ni]%%$'\\t'*} == "$groep" ]] || continue
    naam=\${N[ni]#*$'\\t'}
    if [[ $naam == $patroon ]]; then uit+="$ni,"; fi
  done
  printf '%s\\n' "$uit"
done
`;

function bashTreffers(
  pats: { groep: number; patroon: string }[],
  nms: { groep: number; naam: string }[],
): Set<string>[] {
  const map = mkdtempSync(path.join(tmpdir(), 'glob-klasse-'));
  try {
    writeFileSync(
      path.join(map, 'p.txt'),
      pats.map((item) => `${String(item.groep)}\t${item.patroon}`).join('\n') + '\n',
    );
    writeFileSync(path.join(map, 'n.txt'), nms.map((item) => `${String(item.groep)}\t${item.naam}`).join('\n') + '\n');
    writeFileSync(path.join(map, 'run.sh'), BASH_SCRIPT);
    const uit = spawnSync('bash', [path.join(map, 'run.sh'), path.join(map, 'p.txt'), path.join(map, 'n.txt')], {
      env: { PATH: process.env['PATH'] ?? '/usr/bin:/bin', LC_ALL: 'C' },
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    });
    if (uit.status !== 0) throw new Error(`bash faalde: ${uit.stderr}`);
    return uit.stdout
      .split('\n')
      .slice(0, pats.length)
      .map((regel) => new Set(regel.split(',').filter((deel) => deel !== '')));
  } finally {
    rmSync(map, { recursive: true, force: true });
  }
}

/** Het hele glob-woord (letterlijk en klassen) als regex, zoals `stukRegex` het opbouwt, maar zonder `(?!\.)`-voorvoegsel. */
function codeRegex(patroon: string): RegExp {
  let uit = '';
  for (let index = 0; index < patroon.length; index += 1) {
    const teken = patroon[index] ?? '';
    const klasse = teken === '[' ? globKlasseRegex(patroon, index) : null;
    if (klasse !== null) {
      uit += klasse.regex;
      index = klasse.eind;
    } else uit += teken.replace(/[.+^${}()|\\[\]*?]/g, '\\$&');
  }
  return new RegExp(`^${uit}$`, 'i');
}

describe.skipIf(!bashAanwezig)('globKlasseRegex tegen bash: de code is nooit nauwer dan bash', () => {
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
    expect(paren).toBeGreaterThan(100_000);
    const patronenMis = [...new Set(mis.map((regel) => regel.split(' naam ')[0]))];
    expect(patronenMis).toEqual([]);
    expect(mis).toEqual([]);
  }, 120_000);

  test('de bash-uitkomst voor de sluiproutes van de reviews is zoals verwacht (controle op het corpus zelf)', () => {
    const eigen = [
      { groep: 0, patroon: '.gi[a-[.z.]]' },
      { groep: 0, patroon: '.gi[[.a.]-z]' },
      { groep: 1, patroon: 'lefthook.ym[a-[:digit:]l]' },
    ];
    const lijst = [
      { groep: 0, naam: '.git' },
      { groep: 1, naam: 'lefthook.yml' },
    ];
    const [een, twee, drie] = bashTreffers(eigen, lijst);
    expect([...(een ?? [])]).toEqual(['0']);
    expect([...(twee ?? [])]).toEqual(['0']);
    expect([...(drie ?? [])]).toEqual([]);
  });
});
