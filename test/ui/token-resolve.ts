import { readFileSync } from 'node:fs';
import path from 'node:path';

// Leest de tokendeclaraties van de drie lagen (primitief, component, semantisch) uit de CSS en lost ze op, voor licht en
// donker (spec app-thema, nulmeting en AC-19). Licht = elke regel waarvan de selectorlijst `:root` bevat (dus ook
// `:root, [data-app-theme]`); donker = licht plus de regels met `[data-theme='dark']`. Volgorde = die van index.css.
export const TOKEN_FILES = [
  'core/web/styles/primitives.css',
  'core/web/styles/components.css',
  'core/web/styles/semantic.css',
] as const;

export type Mode = 'licht' | 'donker';
export type Tokens = Readonly<Record<string, string>>;

const DARK = "[data-theme='dark']";
const MAX_DEPTH = 20;

const readSource = (file: string) => readFileSync(path.join(import.meta.dirname, '../../src', file), 'utf8');

function rules(css: string): { selectors: string[]; body: string }[] {
  const plain = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...plain.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selectors: (match[1] ?? '').split(',').map((selector) => selector.trim().replace(/"/g, "'")),
    body: match[2] ?? '',
  }));
}

function declarations(body: string): [string, string][] {
  return [...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [
    m[1] ?? '',
    (m[2] ?? '').replace(/\s+/g, ' ').trim(),
  ]);
}

// De ruwe declaraties per modus; een latere declaratie wint, zoals in de cascade bij gelijke specificiteit.
export function declaredTokens(css: string, mode: Mode): Map<string, string> {
  const result = new Map<string, string>();
  const parsed = rules(css);
  const apply = (selector: string) => {
    for (const rule of parsed)
      if (rule.selectors.includes(selector))
        for (const [name, value] of declarations(rule.body)) result.set(name, value);
  };
  apply(':root');
  if (mode === 'donker') apply(DARK);
  return result;
}

// Vereenvoudigt `max(…)`/`min(…)` als alle argumenten gelijk zijn, of allemaal een getal met dezelfde eenheid: zo is
// `max(var(--density-focus-ring), 2px)` met `--density-focus-ring: 2px` opgelost gelijk aan `2px`, net als nu
// `--focus-ring-width: 2px`. Andere functies (`calc()`, gemengde eenheden) blijven letterlijk staan.
function simplify(value: string): string {
  let current = value;
  for (let depth = 0; depth < MAX_DEPTH; depth += 1) {
    const next = current.replace(/\b(max|min)\(([^()]*)\)/g, (whole, fn: string, args: string) => {
      const parts = args.split(',').map((part) => part.trim());
      if (parts.every((part) => part === parts[0])) return parts[0] ?? whole;
      const numbers = parts.map((part) => /^(-?[\d.]+)([a-z%]*)$/.exec(part));
      const unit = numbers[0]?.[2];
      if (numbers.some((match) => match === null || match[2] !== unit)) return whole;
      const values = numbers.map((match) => Number(match?.[1]));
      return `${String(fn === 'max' ? Math.max(...values) : Math.min(...values))}${unit ?? ''}`;
    });
    if (next === current) return current;
    current = next;
  }
  return current;
}

// Lost elke `var(--x)` (ook `var(--x, terugval)`) in een waarde op, tot er geen meer over is.
export function resolveValue(values: ReadonlyMap<string, string>, value: string): string {
  let current = value;
  for (let depth = 0; depth < MAX_DEPTH; depth += 1) {
    const next = current.replace(
      /var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*))?\)/g,
      (_whole, name: string, fallback?: string) => {
        const found = values.get(name) ?? fallback?.trim();
        if (found === undefined) throw new Error(`token ${name} ontbreekt`);
        return found;
      },
    );
    if (next === current) return simplify(current);
    current = next;
  }
  throw new Error(`var()-keten te diep of rond: ${value}`);
}

export function resolveTokens(css: string, mode: Mode): Record<string, string> {
  const declared = declaredTokens(css, mode);
  const names = [...declared.keys()].sort();
  return Object.fromEntries(names.map((name) => [name, resolveValue(declared, declared.get(name) ?? '')]));
}

// De opgeloste tokens uit de huidige CSS in src/, licht en donker.
export function currentTokens(): Record<Mode, Record<string, string>> {
  const css = TOKEN_FILES.map(readSource).join('\n');
  return { licht: resolveTokens(css, 'licht'), donker: resolveTokens(css, 'donker') };
}
