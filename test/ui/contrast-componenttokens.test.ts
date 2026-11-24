import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { contrast } from './oklch-contrast.ts';
import { resolveTokens, TOKEN_FILES, type Mode } from './token-resolve.ts';

// Spec app-thema/AC-5: elk kleurpaar van een component (`--<component>-bg` met `--<component>-fg`) haalt 4,5:1 en de
// focusring is minstens 2 px, in licht én donker, met het thema van de app (theme.css) erbij. Een thema dat een paar of
// de ring breekt, laat deze test falen met het paar of het token in de melding.
const read = (file: string) => readFileSync(path.join(import.meta.dirname, '../../src', file), 'utf8');
const BASE = TOKEN_FILES.map(read).join('\n');
const THEME = read('web/styles/theme.css');

const MIN_TEXT = 4.5;
const MIN_RING_PX = 2;
const REM_PX = 16;

// De kleurparen uit components.css: elk --<x>-bg met een --<x>-fg.
const PAIRS = Object.keys(resolveTokens(BASE, 'licht'))
  .filter((name) => name.endsWith('-bg'))
  .map((bg) => [bg.replace(/-bg$/, '-fg'), bg] as const);

// px of rem naar px; `max(a, b)` met beide meetbaar naar de grootste. Wat niet te meten is, telt als 0 (faalt dus).
function toPx(value: string): number {
  const max = /^max\((.+)\)$/.exec(value);
  if (max?.[1] !== undefined) return Math.max(...max[1].split(',').map((part) => toPx(part.trim())));
  const match = /^([\d.]+)(px|rem)$/.exec(value);
  if (match === null) return 0;
  return Number(match[1]) * (match[2] === 'rem' ? REM_PX : 1);
}

function problems(theme: string, mode: Mode): string[] {
  const tokens = resolveTokens(`${BASE}\n${theme}`, mode);
  const pairs = PAIRS.filter(([fg, bg]) => contrast(tokens[fg] ?? '', tokens[bg] ?? '') < MIN_TEXT).map(
    ([fg, bg]) => `${mode}: ${fg} op ${bg} < 4,5:1`,
  );
  const ring = toPx(tokens['--focus-ring-width'] ?? '');
  return ring < MIN_RING_PX ? [...pairs, `${mode}: --focus-ring-width ${String(ring)}px < 2px`] : pairs;
}

describe.each<Mode>(['licht', 'donker'])('componenttokens (%s)', (mode) => {
  test('app-thema/AC-5: de paren control en table-header staan in de test', () => {
    expect(PAIRS).toEqual(
      expect.arrayContaining([
        ['--control-fg', '--control-bg'],
        ['--table-header-fg', '--table-header-bg'],
      ]),
    );
  });

  test('app-thema/AC-5: elk componentkleurpaar haalt 4,5:1 en de focusring is minstens 2 px, met theme.css', () => {
    expect(problems(THEME, mode)).toStrictEqual([]);
  });

  test('app-thema/AC-5: een theme.css die een paar onder de grens zet, faalt en noemt het paar', () => {
    const weak = ':root, [data-app-theme] { --control-fg: var(--p-zinc-300); --control-bg: var(--p-white); }';
    expect(problems(weak, mode)).toStrictEqual([`${mode}: --control-fg op --control-bg < 4,5:1`]);
  });

  test('app-thema/AC-5: --focus-ring-width direct onder 2 px faalt; via --density-focus-ring houdt de max() het tegen', () => {
    expect(problems(':root { --focus-ring-width: 1px; }', mode)).toStrictEqual([
      `${mode}: --focus-ring-width 1px < 2px`,
    ]);
    expect(problems(':root { --density-focus-ring: 1px; }', mode)).toStrictEqual([]);
  });
});
