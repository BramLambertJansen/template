import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, test } from 'vitest';
import { expectNegativeTable } from '../support/negative-table.ts';

// Gedragsherstel leerpunt #604: `tokenize` (rails/hooks/lib/shell.mjs) sloeg tussen woorden alleen spatie en tab over, terwijl
// `readWord` stopt op elke `\s`: een leeg woord zonder voortgang, een eindeloze lus. Gewenst gedrag = bash: woorden splitsen
// alleen op spatie, tab, `\n` (operator) en `;&|<>()`. `\r`, `\v`, `\f`, NBSP, U+2028 en U+2029 horen bij het woord. Een `#`
// na zo'n teken is dus geen commentaarbegin, en een heredoc-scheidingsteken met CRLF is `EOF\r`. Een `#` midden in een woord
// (`a#b`) is geen commentaar.
//
// De hang wordt opgevangen door elke aanroep in een kindproces te draaien met een harde timeout (spawnSync): een hangende
// implementatie faalt dan op een assertie in plaats van de suite te blokkeren.
const SHELL = pathToFileURL(fileURLToPath(new URL('../../rails/hooks/lib/shell.mjs', import.meta.url))).href;
const TIMEOUT_MS = 3000;

// De tekens staan als code-eenheid, zodat de bron geen onzichtbare letterlijke tekens bevat.
const NBSP = String.fromCharCode(0x00a0);
const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);

type Functie = 'tokenize' | 'parseCommands' | 'tmpdirLetterlijk';

const KINDPROCES = `
const lib = await import(process.argv[1]);
const script = process.argv[3];
let uit;
if (process.argv[2] === 'tokenize') uit = lib.tokenize(script).map((token) => [token.kind, token.value]);
else if (process.argv[2] === 'parseCommands') uit = lib.parseCommands(script).map((command) => command.words);
else uit = lib.tmpdirLetterlijk(script);
process.stdout.write(JSON.stringify(uit));
`;

// Een hang (timeout) of crash in het kindproces faalt hier op een assertie, met de functie en het script in de melding.
function draai(functie: Functie, script: string): unknown {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', KINDPROCES, SHELL, functie, script], {
    encoding: 'utf8',
    timeout: TIMEOUT_MS,
  });
  const melding = `${functie}(${JSON.stringify(script)}) hangt of crasht: ${result.stderr}`;
  expect(result.error, melding).toBeUndefined();
  expect(result.status, melding).toBe(0);
  const uit: unknown = JSON.parse(result.stdout);
  return uit;
}

function eerste(woorden: unknown): unknown {
  if (!Array.isArray(woorden)) return undefined;
  const woord: unknown = woorden[0];
  return woord;
}

function programmas(script: string): unknown[] {
  const uit = draai('parseCommands', script);
  if (!Array.isArray(uit)) throw new Error('parseCommands gaf geen lijst');
  return uit.map(eerste);
}

// Andere witruimte dan spatie, tab en `\n`: hoort in bash bij het woord.
const ZONDER_SCHEIDING: readonly (readonly [string, string])[] = [
  ['\\r (CR)', '\r'],
  ['\\v (VT)', '\v'],
  ['\\f (FF)', '\f'],
  ['U+00A0 (NBSP)', NBSP],
  ['U+2028 (LINE SEPARATOR)', LS],
  ['U+2029 (PARAGRAPH SEPARATOR)', PS],
];
const MET_SCHEIDING: readonly (readonly [string, string])[] = [
  ['spatie', ' '],
  ['tab', '\t'],
];

describe('tokenize: witruimte', () => {
  test.each(ZONDER_SCHEIDING)('%s scheidt geen woorden', (_naam, teken) => {
    const uit = draai('tokenize', `ls${teken}a`);
    expect(uit).toEqual([['word', `ls${teken}a`]]);
  });

  test.each(MET_SCHEIDING)('%s scheidt woorden', (_naam, teken) => {
    const uit = draai('tokenize', `ls${teken}a`);
    expect(uit).toEqual([
      ['word', 'ls'],
      ['word', 'a'],
    ]);
  });

  test('\\n blijft een op-token', () => {
    const uit = draai('tokenize', 'ls\na');
    expect(uit).toEqual([
      ['word', 'ls'],
      ['op', '\n'],
      ['word', 'a'],
    ]);
  });
});

describe('parseCommands: commentaar en heredoc', () => {
  test.each(ZONDER_SCHEIDING)('`#` na %s is geen commentaarbegin: rm blijft zichtbaar', (_naam, teken) => {
    expect(programmas(`true${teken}#; rm -rf src`)).toContain('rm');
  });

  test('`#` na een spatie is wel commentaar: geen rm', () => {
    expect(programmas('true #x; rm y')).not.toContain('rm');
  });

  test('`#` na een tab is wel commentaar: geen rm', () => {
    expect(programmas('true\t#x; rm y')).not.toContain('rm');
  });

  test('heredoc met CRLF: scheidingsteken is `EOF\\r`, het commando erna blijft zichtbaar', () => {
    expect(programmas('cat <<EOF\r\nbody\nEOF\r\nrm -rf src\n')).toContain('rm');
  });

  test('`#` midden in een woord is geen commentaar', () => {
    const uit = draai('tokenize', 'echo a#b');
    expect(uit).toEqual([
      ['word', 'echo'],
      ['word', 'a#b'],
    ]);
  });
});

describe('tmpdirLetterlijk: andere witruimte', () => {
  const letterlijk = (script: string): boolean => draai('tmpdirLetterlijk', script) === true;

  test('`$TMPDIR` gevolgd door `\\v` is niet letterlijk en hangt niet', () => {
    expectNegativeTable({
      base: 'ls $TMPDIR',
      check: letterlijk,
      cases: [{ name: '`\\v` achter `$TMPDIR`', change: (base) => `${base}\v` }],
    });
  });

  test('`\\v` voor `$TMPDIR/a` is niet letterlijk en hangt niet', () => {
    expectNegativeTable({
      base: 'ls x $TMPDIR/a',
      check: letterlijk,
      cases: [{ name: '`\\v` in plaats van de spatie voor `$TMPDIR/a`', change: (base) => base.replace('x ', 'x\v') }],
    });
  });
});
