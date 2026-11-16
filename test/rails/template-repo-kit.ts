import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect } from 'vitest';

// Gedeelde hulpmiddelen voor de tests van spec template-repo (docs/template/specs/template-repo.md, AC-1 t/m AC-11); geen
// test zelf. De tests voor code die nog niet bestaat gaan via `exported` en `prop`: een ontbrekende export of sleutel is dan
// een mislukte assertie met een duidelijke melding in plaats van een import- of typefout.
export const ROOT = path.join(import.meta.dirname, '../..');
export const GATES = '.claude/gates.json';

/** De echte `.claude/gates.json`, als tekst. */
export function echteGates(): string {
  return readFileSync(path.join(ROOT, GATES), 'utf8');
}

/** Een object (geen lijst) of een fout. */
export function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('verwacht een object');
  return Object.fromEntries(Object.entries(value));
}

/** De waarde van een eigen sleutel, of undefined (ook als `value` geen object is). */
export function prop(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) return undefined;
  return Object.entries(value).find(([name]) => name === key)?.[1];
}

/** `template.repository` uit een gates-tekst, of undefined. */
export function templateRepositoryVan(text: string): unknown {
  return prop(prop(JSON.parse(text), 'template'), 'repository');
}

/**
 * De `template.repository` van de echte `.claude/gates.json`: de waarde waar elke andere test op steunt. Ontbreekt de sleutel,
 * dan faalt de test hier op een assertie (de implementatie van AC-1 voegt hem toe).
 */
export function echteTemplateRepository(): string {
  const value = templateRepositoryVan(echteGates());
  expect(value, '.claude/gates.json heeft geen template.repository').toEqual(expect.any(String));
  return String(value);
}

/**
 * De echte gates.json met `template` en/of `onderhoud` vervangen; `undefined` haalt de sleutel weg. Een sleutel die niet in
 * `wijziging` staat, blijft zoals hij in de echte gates.json staat.
 */
export function gatesMet(wijziging: { template?: unknown; onderhoud?: unknown }): string {
  const ruw = object(JSON.parse(echteGates()));
  const vervangen = new Set(Object.keys(wijziging));
  const behouden = Object.entries(ruw).filter(([sleutel]) => !vervangen.has(sleutel));
  const nieuw = Object.entries(wijziging).filter(([, waarde]) => waarde !== undefined);
  return JSON.stringify(Object.fromEntries([...behouden, ...nieuw]));
}

/** Een app: de echte gates.json zonder `onderhoud`, met `template` (of zonder, bij `repository` undefined). */
export function appGates(repository: string | undefined): string {
  return gatesMet({ onderhoud: undefined, template: repository === undefined ? undefined : { repository } });
}

type Functie = (...args: unknown[]) => unknown;

function isFunctie(value: unknown): value is Functie {
  return typeof value === 'function';
}

/** Een geëxporteerde functie van een module, of een mislukte assertie als hij (nog) niet bestaat. */
export function exported(module: object, name: string): Functie {
  const value: unknown = Reflect.get(module, name);
  expect(typeof value, `${name} is niet geëxporteerd (of geen functie)`).toBe('function');
  if (!isFunctie(value)) throw new Error(`${name} is geen functie`);
  return value;
}

/** De uitkomst van `fn`: `{ waarde }` of `{ fout }` met de melding, zodat een test op beide kan toetsen. */
export function probeer(fn: () => unknown): { waarde?: unknown; fout?: string } {
  try {
    return { waarde: fn() };
  } catch (error) {
    // Een mislukte assertie (bijvoorbeeld een ontbrekende export) is geen "gooit" van de code onder test.
    if (error instanceof Error && error.name === 'AssertionError') throw error;
    return { fout: error instanceof Error ? error.message : String(error) };
  }
}
