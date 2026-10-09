---
paths:
  - "src/web/**"
  - "src/core/web/**"
---

# Regels voor `src/web` en `src/core/web`

- `src/core/web` is van de template (ADR 0008): in een app niet wijzigen. Basiskit, `AsyncView`, `Form`, API- en auth-client
  en tokens staan daar; de app importeert ze via `src/web/ui` (barrel) en `src/web/lib/api.ts`.
- Eerst zoeken wat er is: componenten in `src/web/ui` (her-exporteert core), voorbeelden op `/design-system`. Bestaand recept uitbreiden,
  geen nieuw component ernaast. Een variant leid je af in `src/web/ui` uit de basis en variantkaart van core. Past niets: stop en stel een variant voor.
- Route: bestandsroute in `routes/`, met `beforeLoad`-guard die `can()` controleert en een ErrorBoundary.
  Alleen inlog-, aanmeld- en resetschermen zijn publiek (framework §3).
- Inloggen alleen via `src/core/web/lib/auth.ts` (Better Auth-client). Bij 401 van de API naar het inlogscherm.
- Data per resource in `features/<resource>/queries.ts` (key-factory, hooks, mutaties). Een mutatie invalideert
  haar eigen resource plus wat de spec onder "raakt ook" noemt. Optimistisch alleen als de spec het vraagt.
- Laden, leeg en fout altijd via `<AsyncView>`. Formulieren via `<Form>`/`<FormField>` met het gedeelde zod-schema;
  verzendknop uit tijdens de mutatie; serverveldfouten via `setError`.
- UI-state (filters, tabs, paginering) in de URL. Geen globale store.
- Styling in `features/`: alleen layout-utilities (flex, grid, gap, padding, breedte) of `Stack`/`Inline`/`Container`.
  Kleur, radius, schaduw en typografie komen uit componenten.
- Responsive met breakpoints en container queries. Wat echt per formaat verschilt: één gedeelde hook, niet per component.
- Alle zichtbare tekst in `src/web/copy`, Nederlands, volgens de woordenlijst ("Annuleren", niet "Annuleer").
- Datums en bedragen alleen via `lib/format.ts`.
- Schermwerk is pas klaar na `pnpm ui:check <route>` (375 en 1280 px + axe) zodra dat script bestaat.
- Aanraakdoelen ≥ 44 px en zichtbare focusring zitten in de recepten; nooit uitschakelen.

## Besloten, nog niet gebouwd

De basiskit, tokens, `AsyncView`, `<Form>`, de API- en auth-client, `/design-system`, `check:catalogus` en `ui:check` bestaan nog niet
(roadmap fase 1, stuk 1 en 3). Bouw geen eigen vervanger; staat een component niet in `node scripts/kit/feiten.mjs componenten`, vraag het.
