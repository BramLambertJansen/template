---
paths:
  - "src/web/**"
  - "src/core/web/**"
---

# Regels voor `src/web` en `src/core/web`

- `src/core/web` is van de template (ADR 0040): in een app niet wijzigen. Basiskit, `AsyncView`, `Form`, API- en auth-client
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
- Schermwerk is pas klaar na `pnpm ui:check` (375 en 1280 px + axe).
- Aanraakdoelen ≥ 44 px en zichtbare focusring zitten in de recepten; nooit uitschakelen.

## Waar het staat

- Componenten: de actuele lijst komt uit `pnpm check:catalogus` en `node scripts/kit/feiten.mjs componenten` (dezelfde bronindex als
  `/design-system`, ADR 0048); alles via `src/web/ui/index.ts`. Een nieuw component of variant volgt de skill `nieuw-component`.
- Router en guard: bestandsroutes in `src/web/routes` (`routeTree.gen.ts` is gegenereerd, `_app` = ingelogde layout met guard),
  `src/web/lib/router.ts` met `RouteError`/`NotFound` als ErrorBoundary, `guard('<permissie>')` uit `src/web/lib/session.ts` voor
  `beforeLoad`, `createQueryClient` (401 → `/login`). Foutteksten in `src/web/copy/errors.ts`. Voorbeeld door alle lagen: `docs/gouden-pad.md`.
- Tokens in drie lagen: `src/core/web/styles`, thema van de app in `src/web/styles/theme.css`. `Dialog` is native `<dialog>`, geen Radix (CSP).
- Toast: `useToast().success/error`; `Toaster` staat in de AppShell, `ToastProvider` in `main.tsx`.
- Env in web alleen via `readWebEnv`/`isDev` (`src/core/web/lib/env.ts`); de Sidebar toont menu-items per rol via `visibleNavItems`.
- `/design-system` staat achter `guard('design-system:read')`, alleen voorbeelddata; `src/web/dev/` alleen dynamisch importeren
  (leeg in de productiebundel).
- Een nieuwe Button-variant is een nieuwe rij in `test/ui/contrast.test.ts`. `scanAxe` (`e2e/support/axe.ts`) zonder uitzonderingen;
  twee lintregels in `eslint.config.js` houden die tegen. Componenttests in het Vitest-project `web` (jsdom); woordenlijsttest
  `src/web/copy/woordenlijst.test.ts`.
- Nog niet: screenshot-baselines van de catalogus in de Playwright-image (`docs/roadmap.md`, Geparkeerd).
