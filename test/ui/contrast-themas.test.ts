import { describe, expect, test } from 'vitest';
import { themes } from '../../src/web/styles/themes.ts';
import { readSrc, themeBlocks, type ThemeBlocks } from './app-themes.ts';
import { contrast } from './oklch-contrast.ts';
import { resolveTokens, TOKEN_FILES, type Mode } from './token-resolve.ts';

// Spec app-thema/AC-12: elk kleurpaar haalt het contrast in elk thema uit theme.css, licht én donker. Een thema rekent als
// thema op het document: de basis (core plus :root uit theme.css), dan het lichte themablok, in donker ook het donkere blok
// (dat wint, hogere specificiteit). Een thema dat een paar breekt, faalt met thema, modus en paar in de melding.
const BASE = TOKEN_FILES.map(readSrc).join('\n');
const THEME = readSrc('web/styles/theme.css');
const MODES: readonly Mode[] = ['licht', 'donker'];
type Pair = readonly [string, string];

const block = (selector: string, tokens: ReadonlyMap<string, string>) =>
  [selector, '{', ...[...tokens].map(([name, value]) => [name, ': ', value, ';'].join('')), '}'].join(' ');

function themed(theme: ThemeBlocks, mode: Mode): Record<string, string> {
  const parts = [BASE, THEME, block(':root', theme.licht)];
  if (mode === 'donker') parts.push(block("[data-theme='dark']", theme.donker));
  return resolveTokens(parts.join('\n'), mode);
}

// Tekst op vlak (4,5:1): elk semantisch `--x` met `--x-foreground`, de paren uit contrast.test.ts die die vorm niet hebben,
// en elk componentpaar `--<component>-fg` op `--<component>-bg`. UI-randen en de focusring (3:1) zoals in contrast.test.ts.
function textPairs(tokens: Record<string, string>): Pair[] {
  const names = Object.keys(tokens).filter((name) => !name.startsWith('--p-'));
  const named = names
    .filter((bg) => tokens[`${bg}-foreground`] !== undefined)
    .map((bg): Pair => [`${bg}-foreground`, bg]);
  const components = names
    .filter((bg) => bg.endsWith('-bg') && tokens[bg.replace(/-bg$/, '-fg')] !== undefined)
    .map((bg): Pair => [bg.replace(/-bg$/, '-fg'), bg]);
  const extra: Pair[] = [
    ['--foreground', '--background'],
    ['--muted-foreground', '--background'],
    ['--muted-foreground', '--card'],
    ['--destructive', '--background'],
    ['--destructive', '--card'],
  ];
  return [...named, ...components, ...extra];
}

const UI_PAIRS: readonly Pair[] = [
  ['--input', '--background'],
  ['--input', '--card'],
  ['--ring', '--background'],
  ['--ring', '--card'],
];

function modeProblems(name: string, theme: ThemeBlocks, mode: Mode): string[] {
  const tokens = themed(theme, mode);
  const check = (pairs: readonly Pair[], min: number, shown: string) =>
    pairs
      .filter(([fg, bg]) => contrast(tokens[fg] ?? '', tokens[bg] ?? '') < min)
      .map(([fg, bg]) => `thema ${name} (${mode}): ${fg} op ${bg} < ${shown}`);
  return [...check(textPairs(tokens), 4.5, '4,5:1'), ...check(UI_PAIRS, 3, '3:1')];
}

function contrastProblems(css: string): string[] {
  return [...themeBlocks(css)].flatMap(([name, theme]) => MODES.flatMap((mode) => modeProblems(name, theme, mode)));
}

describe('app-thema/AC-12: contrast per thema', () => {
  // Geen vaste themanamen (een app haalt de voorbeelden weg of vervangt ze); de faalgevallen gebruiken een eigen thema `x`.
  test('app-thema/AC-12: de test rekent elk thema uit het register door en kent de paren', () => {
    expect([...themeBlocks(THEME).keys()].sort()).toStrictEqual(Object.keys(themes).sort());
    expect(textPairs(themed({ licht: new Map(), donker: new Map() }, 'licht'))).toEqual(
      expect.arrayContaining([
        ['--foreground', '--background'],
        ['--primary-foreground', '--primary'],
        ['--card-foreground', '--card'],
        ['--control-fg', '--control-bg'],
        ['--table-header-fg', '--table-header-bg'],
      ]),
    );
  });

  test('app-thema/AC-12: elk kleurpaar haalt het contrast in elk thema, licht én donker', () => {
    expect(contrastProblems(THEME)).toStrictEqual([]);
  });

  test('app-thema/AC-12: een thema dat één paar breekt, faalt met thema, modus en paar', () => {
    const broken = "[data-app-theme='x'][data-theme='dark'] { --background: var(--p-zinc-400); }";
    const problems = contrastProblems(broken);
    expect(problems).toContain('thema x (donker): --foreground op --background < 4,5:1');
    expect(problems.every((problem) => problem.startsWith('thema x (donker):'))).toBe(true);
  });

  test('app-thema/AC-12: een componentpaar dat in één modus van een thema breekt, faalt alleen daar', () => {
    // zinc-300 op de lichte --control-bg breekt; op de donkere haalt het 4,5:1 wel.
    const broken = "[data-app-theme='x'] { --control-fg: var(--p-zinc-300); }";
    expect(contrastProblems(broken)).toStrictEqual(['thema x (licht): --control-fg op --control-bg < 4,5:1']);
  });
});
