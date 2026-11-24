import { readFileSync } from 'node:fs';
import path from 'node:path';

// De themablokken van een app (spec app-thema, deel C) uit theme.css: per thema de declaraties van het lichte blok
// `[data-app-theme='<naam>']` en van het donkere blok (`[data-app-theme='<naam>'][data-theme='dark']` en/of
// `[data-theme='dark'] [data-app-theme='<naam>']`). Gedeeld door themas.test.ts en contrast-themas.test.ts.
export interface ThemeBlocks {
  readonly licht: ReadonlyMap<string, string>;
  readonly donker: ReadonlyMap<string, string>;
}

export const readSrc = (file: string) => readFileSync(path.join(import.meta.dirname, '../../src', file), 'utf8');

const LIGHT = [/^\[data-app-theme='([^']+)'\]$/];
const DARK = [
  /^\[data-app-theme='([^']+)'\]\[data-theme='dark'\]$/,
  /^\[data-theme='dark'\] \[data-app-theme='([^']+)'\]$/,
];

function rules(css: string): { selectors: string[]; body: string }[] {
  const plain = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...plain.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selectors: (match[1] ?? '').split(',').map((selector) => selector.trim().replace(/\s+/g, ' ').replace(/"/g, "'")),
    body: match[2] ?? '',
  }));
}

function declarations(body: string): [string, string][] {
  return [...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [
    m[1] ?? '',
    (m[2] ?? '').replace(/\s+/g, ' ').trim(),
  ]);
}

const nameFrom = (selector: string, patterns: readonly RegExp[]) =>
  patterns.map((pattern) => pattern.exec(selector)?.[1]).find((name) => name !== undefined);

export function themeBlocks(css: string): Map<string, ThemeBlocks> {
  const result = new Map<string, { licht: Map<string, string>; donker: Map<string, string> }>();
  const entry = (name: string) => {
    const found = result.get(name) ?? { licht: new Map<string, string>(), donker: new Map<string, string>() };
    result.set(name, found);
    return found;
  };
  const targetOf = (selector: string) => {
    const light = nameFrom(selector, LIGHT);
    if (light !== undefined) return entry(light).licht;
    const dark = nameFrom(selector, DARK);
    return dark === undefined ? undefined : entry(dark).donker;
  };
  for (const rule of rules(css)) {
    const tokens = declarations(rule.body);
    for (const target of rule.selectors.map(targetOf)) tokens.forEach(([token, value]) => target?.set(token, value));
  }
  return result;
}
