import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { currentTokens, declaredTokens, resolveTokens, type Mode } from './token-resolve.ts';

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

// --- app-thema/AC-3: vaste lijst componentnamen, hooguit zes tokens per component ---------------------------------
const root = path.join(import.meta.dirname, '../..');
const read = (file: string) => readFileSync(path.join(root, file), 'utf8');

const COMPONENTS = [
  'button',
  'control',
  'card',
  'dialog',
  'table',
  'badge',
  'tabs',
  'notice',
  'toast',
  'shell',
] as const;
const BASE_GROUPS = ['focus-ring', 'layer', 'qr'] as const;
const MAX_TOKENS = 6;

// De langste naam wint (`--focus-ring-width` hoort bij focus-ring); `--control-h` telt bij control.
function componentOf(token: string): string | undefined {
  return [...COMPONENTS, ...BASE_GROUPS]
    .filter((name) => token.startsWith(`--${name}-`))
    .sort((a, b) => b.length - a.length)[0];
}

function componentTokenProblems(tokens: readonly string[]): string[] {
  const unknown = tokens
    .filter((token) => componentOf(token) === undefined)
    .map((token) => `onbekend voorvoegsel: ${token}`);
  const counts = new Map<string, number>();
  for (const token of tokens) {
    const name = componentOf(token);
    if (name !== undefined && !BASE_GROUPS.some((group) => group === name))
      counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const tooMany = [...counts]
    .filter(([, count]) => count > MAX_TOKENS)
    .map(([name, count]) => `${name} heeft ${String(count)} tokens (hooguit ${String(MAX_TOKENS)})`);
  return [...unknown, ...tooMany];
}

const componentTokens = [...declaredTokens(read('src/core/web/styles/components.css'), 'licht').keys()];

describe('app-thema/AC-3: componenttokens in components.css', () => {
  test('app-thema/AC-3: elk token hoort bij een component uit de lijst, hooguit zes per component', () => {
    expect(componentTokens).toContain('--button-radius');
    expect(componentTokenProblems(componentTokens)).toStrictEqual([]);
  });

  test('app-thema/AC-3: zeven tokens of een onbekend voorvoegsel faalt en noemt het component', () => {
    const seven = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((suffix) => `--card-${suffix}`);
    expect(componentTokenProblems(seven)).toStrictEqual(['card heeft 7 tokens (hooguit 6)']);
    expect(componentTokenProblems(['--knop-radius'])).toStrictEqual(['onbekend voorvoegsel: --knop-radius']);
  });

  test('app-thema/AC-3: de basisgroepen focus-ring, layer en qr tellen niet mee voor de zes', () => {
    const layers = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((suffix) => `--layer-${suffix}`);
    expect(componentTokenProblems([...layers, '--focus-ring-width', '--qr-dark'])).toStrictEqual([]);
  });
});

// --- app-thema/AC-4: de recepten gebruiken voor hun tokeneigenschappen alleen de componenttoken-klasse --------------
// Brontest op de recepttekst: de klassen staan als losse woorden; een variant (`aria-…:`, `[&_tr]:`) telt niet mee.
const RADIUS = /^rounded(-(none|xs|sm|md|lg|xl|2xl|3xl|full))?$/;
const SHADOW = /^shadow(-(2xs|xs|sm|md|lg|xl|2xl|none))?$/;
const WEIGHT = /^font-(thin|light|normal|medium|semibold|bold)$/;
const BORDER = /^border(-\d+)?$/;
const CASE = /^(uppercase|lowercase|capitalize|normal-case)$/;
const PX = /^px-([1-9][\d.]*|px)$/;
const PY = /^py-([1-9][\d.]*|px)$/;
const MAX_W = /^max-w-(3xs|2xs|xs|sm|md|lg|xl|[2-7]xl)$/;

interface Recipe {
  readonly file: string;
  readonly required: readonly string[];
  readonly forbidden: readonly RegExp[];
}

const CONTROL_FORBIDDEN = [RADIUS, BORDER, PX, /^bg-background$/, /^text-foreground$/];
const RECIPES: readonly Recipe[] = [
  {
    file: 'button-recipe.ts',
    required: ['rounded-button', 'font-button', 'px-button-x', 'border-button', 'shadow-button', 'case-button'],
    forbidden: [RADIUS, WEIGHT, PX, BORDER, SHADOW, CASE],
  },
  {
    file: 'input.tsx',
    required: ['min-h-control', 'rounded-control', 'border-control', 'bg-control', 'text-control', 'px-control-x'],
    forbidden: CONTROL_FORBIDDEN,
  },
  { file: 'select.tsx', required: ['inputBase'], forbidden: CONTROL_FORBIDDEN },
  { file: 'textarea.tsx', required: ['inputBase'], forbidden: CONTROL_FORBIDDEN },
  // Deze velden renderen <Input> (en daarmee inputBase); hun overige klassen horen bij de optielijst of de knop ernaast.
  { file: 'combobox.tsx', required: ['<Input'], forbidden: [] },
  { file: 'date-input.tsx', required: ['<Input'], forbidden: [] },
  { file: 'password-input.tsx', required: ['<Input'], forbidden: [] },
  {
    file: 'card.tsx',
    required: ['rounded-card', 'shadow-card', 'border-card-width', 'py-card-y'],
    forbidden: [RADIUS, SHADOW, BORDER, PY],
  },
  {
    file: 'dialog.tsx',
    required: ['rounded-dialog', 'shadow-dialog', 'max-w-dialog'],
    forbidden: [RADIUS, SHADOW, MAX_W],
  },
  {
    file: 'table.tsx',
    required: ['bg-table-header', 'text-table-header', 'border-table-row', 'py-table-cell-y'],
    forbidden: [/^bg-muted$/, /^text-muted-foreground$/, /^border-b(-\d+)?$/, PY],
  },
  { file: 'status-badge.tsx', required: ['rounded-badge', 'font-badge'], forbidden: [RADIUS, WEIGHT] },
  { file: 'tabs.tsx', required: ['rounded-tabs', 'border-tabs-indicator'], forbidden: [RADIUS] },
  { file: 'notice.tsx', required: ['rounded-notice', 'border-notice'], forbidden: [RADIUS, BORDER] },
  { file: 'toast.tsx', required: ['rounded-toast', 'shadow-toast'], forbidden: [RADIUS, SHADOW] },
];

function classWords(source: string): string[] {
  const code = source.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  return code.split(/[\s'"`,()]+/).map((word) => word.split(':').at(-1) ?? word);
}

function recipeProblems(recipe: Recipe, source: string): string[] {
  const words = classWords(source);
  const missing = recipe.required.filter((name) => !words.includes(name)).map((name) => `mist ${name}`);
  const fixed = words
    .filter((word) => recipe.forbidden.some((pattern) => pattern.test(word)))
    .map((word) => `vaste klasse ${word}`);
  return [...missing, ...fixed];
}

describe('app-thema/AC-4: recepten van de eerste set', () => {
  test.each(RECIPES)('app-thema/AC-4: $file gebruikt alleen componenttoken-klassen', (recipe) => {
    expect(recipeProblems(recipe, read(`src/core/web/ui/${recipe.file}`))).toStrictEqual([]);
  });

  test('app-thema/AC-4: een vaste radius of een semantische kleur in een recept faalt', () => {
    const card = RECIPES.find((recipe) => recipe.file === 'card.tsx');
    const table = RECIPES.find((recipe) => recipe.file === 'table.tsx');
    if (card === undefined || table === undefined) throw new Error('recepten ontbreken');
    expect(recipeProblems(card, "cn('rounded-lg border-card-width shadow-card py-card-y')")).toStrictEqual([
      'mist rounded-card',
      'vaste klasse rounded-lg',
    ]);
    expect(recipeProblems(table, "'bg-muted text-table-header border-table-row py-table-cell-y'")).toStrictEqual([
      'mist bg-table-header',
      'vaste klasse bg-muted',
    ]);
  });
});

// --- app-thema/AC-6: een primitief token is nooit het doel van een toewijzing in theme.css ----------------------------
function primitiveTargets(css: string): string[] {
  const code = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...code.matchAll(/(--p-[\w-]+)\s*:/g)].map((match) => match[1] ?? '');
}

describe('app-thema/AC-6: theme.css', () => {
  test('app-thema/AC-6: theme.css zet geen primitief token (--p-*); als waarde mag het wel', () => {
    expect(primitiveTargets(read('src/web/styles/theme.css'))).toStrictEqual([]);
    expect(primitiveTargets(':root { --primary: var(--p-blue-600); }')).toStrictEqual([]);
  });

  test('app-thema/AC-6: een theme.css met --p-blue-700 als doel faalt en noemt het token', () => {
    expect(primitiveTargets(':root { --p-blue-700: oklch(0.5 0.2 260); }')).toStrictEqual(['--p-blue-700']);
  });
});
