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

// Geen vaste themanamen: een app die de voorbeelden strak en zacht weghaalt of vervangt, houdt deze test groen. De
// faalgevallen rekenen met een eigen fixture, los van het register van de app.
const FIXTURE_CSS = [
  "[data-app-theme='a'] { --radius: 0; }",
  "[data-theme='dark'] [data-app-theme='a'] { --radius: 0; }",
];
const FIXTURE = { a: { label: 'A' } };

describe('app-thema/AC-11: register en themablokken', () => {
  test("app-thema/AC-11: register en theme.css hebben dezelfde thema's, zonder onbekend token", () => {
    expect([...themeBlocks(THEME).keys()].sort()).toStrictEqual(Object.keys(themes).sort());
    expect(themeProblems(themes, THEME)).toStrictEqual([]);
  });

  test('app-thema/AC-11: elk thema in het register heeft een licht blok', () => {
    const blocks = themeBlocks(THEME);
    expect(Object.keys(themes).filter((name) => (blocks.get(name)?.licht.size ?? 0) === 0)).toStrictEqual([]);
  });

  test('app-thema/AC-11: de fixture zelf is in orde', () => {
    expect(themeProblems(FIXTURE, FIXTURE_CSS.join('\n'))).toStrictEqual([]);
  });

  test('app-thema/AC-11: een thema in het register zonder blok faalt en noemt de naam', () => {
    expect(themeProblems({ ...FIXTURE, warm: { label: 'Warm' } }, FIXTURE_CSS.join('\n'))).toStrictEqual([
      'thema warm: geen blok in theme.css',
    ]);
  });

  test('app-thema/AC-11: een blok zonder registratie faalt en noemt de naam, ook als alleen het donkere blok er is', () => {
    const extra = [
      ...FIXTURE_CSS,
      "[data-app-theme='koel'] { --radius: 0.25rem; }",
      "[data-theme='dark'] [data-app-theme='nacht'] { --radius: 0; }",
    ].join('\n');
    expect(themeProblems(FIXTURE, extra)).toStrictEqual([
      'thema koel: blok zonder registratie in themes.ts',
      'thema nacht: blok zonder registratie in themes.ts',
    ]);
  });

  test('app-thema/AC-11: een themablok dat een onbekend token zet, faalt met thema en token', () => {
    const typo = [...FIXTURE_CSS, "[data-app-theme='a'][data-theme='dark'] { --primairy: red; }"].join('\n');
    expect(themeProblems(FIXTURE, typo)).toStrictEqual(['thema a: token --primairy bestaat niet']);
  });
});
