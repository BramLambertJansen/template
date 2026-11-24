import { z } from 'zod';
import type { Permission } from '#shared/permissions.ts';
import { copy } from '#web/copy/ui.ts';
import type { NavItem } from '#web/ui/index.ts';

// Voorbeelddata voor de schilwissel op /design-system (spec schillen, R-WEB-08): de keuze staat in de URL
// (?schil=topbalk&items=9), AppLayout rendert dan de gekozen schil met deze voorbeeldnavigatie. Alleen data; de schillen
// zelf staan letterlijk in app-layout.tsx. Hier en niet in features/design-system, zodat de catalogus lazy blijft; de
// vak-ids staan er daarom letterlijk en schil-voorbeeld.test.ts vergelijkt ze met vakken.ts (AC-19).

export const SCHIL_PATH = '/design-system';

// Zoekparameters naast q en vak in src/web/routes/_app/design-system.tsx; een onbekende waarde valt weg (.catch). items
// staat als getal in de URL (de router leest "9" als getal).
export const schilSearch = {
  schil: z.enum(['sidebar', 'topbalk']).optional().catch(undefined),
  items: z.coerce
    .number()
    .pipe(z.union([z.literal(3), z.literal(9)]))
    .optional()
    .catch(undefined),
};

const schilSearchSchema = z.object(schilSearch);

export interface SchilKeuze {
  readonly schil: 'sidebar' | 'topbalk';
  readonly items: 3 | 9;
}

// De keuze op /design-system, alleen voor wie de catalogus mag zien; elders of zonder schil: null (gewone navigatie).
export function schilKeuze(pathname: string, search: unknown, magCatalogus: boolean): SchilKeuze | null {
  if (pathname !== SCHIL_PATH || !magCatalogus) return null;
  const parsed = schilSearchSchema.safeParse(search);
  if (!parsed.success || parsed.data.schil === undefined) return null;
  return { schil: parsed.data.schil, items: parsed.data.items ?? 3 };
}

// Negen items op acht tabbladen: Tabellen en Kaarten wijzen allebei naar Gegevens tonen en verschillen in q, zodat elk
// item een eigen href heeft en precies één item actief is (NavLink met zoekparameters, AC-18). De eerste drie vormen de
// keuze "3 items".
export const VOORBEELD_ITEMS = [
  { vak: 'schillen', label: copy.schillen.voorbeeld.schillen },
  { vak: 'basis', label: copy.schillen.voorbeeld.basis },
  { vak: 'acties', label: copy.schillen.voorbeeld.acties },
  { vak: 'formulieren', label: copy.schillen.voorbeeld.formulieren },
  { vak: 'meldingen', label: copy.schillen.voorbeeld.meldingen },
  { vak: 'gegevens', q: 'Table', label: copy.schillen.voorbeeld.tabellen },
  { vak: 'gegevens', q: 'Card', label: copy.schillen.voorbeeld.kaarten },
  { vak: 'layout', label: copy.schillen.voorbeeld.layout },
  { vak: 'patronen', label: copy.schillen.voorbeeld.patronen },
] as const satisfies readonly { readonly vak: string; readonly q?: string; readonly label: string }[];

// De href houdt de keuze vast: /design-system?schil=topbalk&items=9&vak=formulieren.
export function voorbeeldHref(keuze: SchilKeuze, item: { readonly vak: string; readonly q?: string }): string {
  const params = new URLSearchParams({ schil: keuze.schil, items: String(keuze.items), vak: item.vak });
  if (item.q !== undefined) params.set('q', item.q);
  return `${SCHIL_PATH}?${params.toString()}`;
}

export function voorbeeldNav(keuze: SchilKeuze): NavItem<Permission>[] {
  return VOORBEELD_ITEMS.slice(0, keuze.items).map((item) => ({
    label: item.label,
    href: voorbeeldHref(keuze, item),
    permission: 'design-system:read',
  }));
}
