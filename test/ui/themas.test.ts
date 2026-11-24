import { describe, expect, test } from 'vitest';
import { themes } from '../../src/web/styles/themes.ts';
import { readSrc, themeBlocks } from './app-themes.ts';
import { currentTokens } from './token-resolve.ts';

// Spec app-thema/AC-11: register (src/web/styles/themes.ts) en themablokken (theme.css) zijn gelijk, en een themablok zet
// alleen tokens die bestaan (de drie lagen in src/core/web/styles). Elke fout noemt het thema.
const KNOWN = new Set(Object.keys(currentTokens().licht));
const THEME = readSrc('web/styles/theme.css');

function themeProblems(register: Readonly<Record<string, unknown>>, css: string): string[] {
  const blocks = themeBlocks(css);
  const registered = Object.keys(register);
  return [
    ...registered.filter((name) => !blocks.has(name)).map((name) => `thema ${name}: geen blok in theme.css`),
    ...[...blocks.keys()]
      .filter((name) => !registered.includes(name))
      .map((name) => `thema ${name}: blok zonder registratie in themes.ts`),
    ...[...blocks].flatMap(([name, { licht, donker }]) =>
      [...new Set([...licht.keys(), ...donker.keys()])]
        .filter((token) => !KNOWN.has(token))
        .map((token) => `thema ${name}: token ${token} bestaat niet`),
    ),
  ];
}

describe('app-thema/AC-11: register en themablokken', () => {
  test('app-thema/AC-11: strak en zacht staan in het register en in theme.css, zonder onbekend token', () => {
    expect(Object.keys(themes)).toStrictEqual(['strak', 'zacht']);
    expect(themeProblems(themes, THEME)).toStrictEqual([]);
  });

  test('app-thema/AC-11: elk meegeleverd thema heeft een licht en een donker blok', () => {
    const blocks = [...themeBlocks(THEME)].map(([name, { licht, donker }]) => [name, licht.size > 0, donker.size > 0]);
    expect(blocks).toStrictEqual([
      ['strak', true, true],
      ['zacht', true, true],
    ]);
  });

  test('app-thema/AC-11: een thema in het register zonder blok faalt en noemt de naam', () => {
    expect(themeProblems({ ...themes, warm: { label: 'Warm' } }, THEME)).toStrictEqual([
      'thema warm: geen blok in theme.css',
    ]);
  });

  test('app-thema/AC-11: een blok zonder registratie faalt en noemt de naam, ook als alleen het donkere blok er is', () => {
    const extra = [
      THEME,
      "[data-app-theme='koel'] { --radius: 0.25rem; }",
      "[data-theme='dark'] [data-app-theme='nacht'] { --radius: 0; }",
    ].join('\n');
    expect(themeProblems(themes, extra)).toStrictEqual([
      'thema koel: blok zonder registratie in themes.ts',
      'thema nacht: blok zonder registratie in themes.ts',
    ]);
  });

  test('app-thema/AC-11: een themablok dat een onbekend token zet, faalt met thema en token', () => {
    const typo = [THEME, "[data-app-theme='zacht'][data-theme='dark'] { --primairy: red; }"].join('\n');
    expect(themeProblems(themes, typo)).toStrictEqual(['thema zacht: token --primairy bestaat niet']);
  });
});
