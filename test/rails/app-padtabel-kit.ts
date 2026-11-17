import { expect } from 'vitest';
import type { loadConfig } from '../../rails/hooks/lib/rolhek.mjs';
import { unsafeCast } from '../../src/core/shared/unsafe-cast.ts';
import { object, tekstLijst } from './padtabel-kit';

// Gedeelde hulpmiddelen voor de tests van spec app-padtabel (het app-bestand `.claude/gates.app.json`). De nieuwe exports worden
// dynamisch geladen: ontbreekt er een, dan faalt de test op een assertie met de naam van de export en niet op een importfout.
type Functie = (...args: unknown[]) => unknown;
const isFunctie = (waarde: unknown): waarde is Functie => typeof waarde === 'function';

async function exportVan(laden: () => Promise<object>, module: string, naam: string): Promise<Functie> {
  const geladen: object | null = await laden().catch(() => null);
  const gevonden: unknown =
    geladen === null ? undefined : Object.entries(geladen).find(([sleutel]) => sleutel === naam)?.[1];
  if (!isFunctie(gevonden)) return expect.fail(`${module} exporteert geen ${naam}`);
  return gevonden;
}

/** `samengevoegd(ruw, app)` uit rails/hooks/lib/padtabel.mjs; gooit wat de functie gooit. */
export async function laadSamengevoegd(): Promise<(ruw: unknown, app: unknown) => Record<string, unknown>> {
  const functie = await exportVan(
    () => import('../../rails/hooks/lib/padtabel.mjs'),
    'rails/hooks/lib/padtabel.mjs',
    'samengevoegd',
  );
  return (ruw, app) => object(functie(ruw, app));
}

/** `appGlobs(app)` uit rails/hooks/lib/padtabel.mjs. */
export async function laadAppGlobs(): Promise<(app: unknown) => string[]> {
  const functie = await exportVan(
    () => import('../../rails/hooks/lib/padtabel.mjs'),
    'rails/hooks/lib/padtabel.mjs',
    'appGlobs',
  );
  return (app) => tekstLijst(functie(app));
}

/** `loadConfig(tekst, appTekst)` uit rails/hooks/lib/rolhek.mjs: de bestaande functie met de nieuwe tweede parameter. */
export async function laadLoadConfig(): Promise<
  (tekst: string, appTekst?: string | null) => ReturnType<typeof loadConfig>
> {
  const functie = await exportVan(
    () => import('../../rails/hooks/lib/rolhek.mjs'),
    'rails/hooks/lib/rolhek.mjs',
    'loadConfig',
  );
  return (tekst, appTekst) =>
    unsafeCast<ReturnType<typeof loadConfig>>(
      appTekst === undefined ? functie(tekst) : functie(tekst, appTekst),
      'test: dynamisch geladen loadConfig met de bestaande returnvorm',
    );
}

export type Optioneel = string | { afwezig: true };

/** `vertrouwdeTekstOptioneel(root, sha, pad)` uit rails/hooks/lib/objecten.mjs; gooit wat de functie gooit. */
export async function laadVertrouwdeTekstOptioneel(): Promise<(root: string, sha: string, pad: string) => Optioneel> {
  const functie = await exportVan(
    () => import('../../rails/hooks/lib/objecten.mjs'),
    'rails/hooks/lib/objecten.mjs',
    'vertrouwdeTekstOptioneel',
  );
  return (root, sha, pad) => optioneel(functie(root, sha, pad));
}

/** Een string, of precies `{ afwezig: true }`; elke andere vorm is een mislukte assertie. */
export function optioneel(waarde: unknown): Optioneel {
  if (typeof waarde === 'string') return waarde;
  const sleutels = typeof waarde === 'object' && waarde !== null ? Object.entries(waarde) : [];
  if (sleutels.length === 1 && sleutels[0]?.[0] === 'afwezig' && sleutels[0][1] === true) return { afwezig: true };
  return expect.fail(`verwacht een tekst of { afwezig: true }, kreeg ${JSON.stringify(waarde)}`);
}

/** Het app-bestand uit de spec (AC-1): een betaalmodule met voorReview en besluit-pr. */
export const APP_PAYMENTS = {
  paden: { 'payments/**': { schrijven: 'voorReview', besluit: 'besluit-pr' } },
};

/** Een paden-object uit een samengevoegd resultaat. */
export function padenVan(ruw: Record<string, unknown>): Record<string, unknown> {
  return object(ruw['paden']);
}
