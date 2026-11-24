import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { currentTokens, resolveTokens, type Mode } from './token-resolve.ts';

// Spec app-thema, deel A. De nulmeting (test/ui/fixtures/tokens-voor-app-thema.json) is op main opgenomen vóór de bouw:
// elk token van de drie lagen met zijn opgeloste waarde, licht en donker. Nieuwe tokens mogen erbij; een bestaand token
// houdt naam en opgeloste waarde, ook als de tekst van de declaratie verandert.
const fixture: unknown = JSON.parse(
  readFileSync(path.join(import.meta.dirname, 'fixtures/tokens-voor-app-thema.json'), 'utf8'),
);

function baseline(mode: Mode): Record<string, string> {
  if (typeof fixture !== 'object' || fixture === null || !(mode in fixture)) throw new Error(`nulmeting mist ${mode}`);
  const values: unknown = Object.entries(fixture).find(([key]) => key === mode)?.[1];
  if (typeof values !== 'object' || values === null) throw new Error(`nulmeting ${mode} is geen object`);
  return Object.fromEntries(Object.entries(values).map(([name, value]) => [name, String(value)]));
}

const current = currentTokens();

describe.each<Mode>(['licht', 'donker'])('nulmeting tokens (%s)', (mode) => {
  test('app-thema/AC-19: elk token uit de nulmeting bestaat nog met dezelfde naam en opgeloste waarde', () => {
    const expected = baseline(mode);
    const actual = Object.fromEntries(
      Object.keys(expected).map((name) => [name, current[mode][name] ?? '(ontbreekt)']),
    );
    expect(actual).toStrictEqual(expected);
  });

  test('app-thema/AC-19: de nulmeting dekt alle drie de lagen, ook --control-h, --focus-ring-* en --qr-*', () => {
    const names = Object.keys(baseline(mode));
    for (const name of [
      '--p-white',
      '--primary',
      '--control-h',
      '--focus-ring-width',
      '--focus-ring-offset',
      '--qr-dark',
    ])
      expect(names).toContain(name);
  });
});

describe('de oplosser zelf', () => {
  test('app-thema/AC-19: max(var(--density-focus-ring), 2px) met 2px lost op tot 2px, gelijk aan de huidige waarde', () => {
    const css = ':root { --density-focus-ring: 2px; --focus-ring-width: max(var(--density-focus-ring), 2px); }';
    expect(resolveTokens(css, 'licht')['--focus-ring-width']).toBe('2px');
  });

  test('donker overschrijft licht, ook via een var()-keten en op een gedeelde selector', () => {
    const css = ":root, [data-app-theme] { --a: var(--b); --b: red; } [data-theme='dark'] { --b: blue; }";
    expect(resolveTokens(css, 'licht')['--a']).toBe('red');
    expect(resolveTokens(css, 'donker')['--a']).toBe('blue');
  });

  test('een andere functie of gemengde eenheden blijven letterlijk staan', () => {
    const css = ':root { --x: 1rem; --y: max(var(--x), 44px); --z: calc(var(--x) * 2); }';
    expect(resolveTokens(css, 'licht')).toMatchObject({ '--y': 'max(1rem, 44px)', '--z': 'calc(1rem * 2)' });
  });
});
