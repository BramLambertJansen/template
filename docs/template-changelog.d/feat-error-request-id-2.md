---
soort: toegevoegd
---

- Foutreferentie (spec `foutreferentie`): bij een serverfout (≥ 500) tonen `RouteError`, `AsyncView` en `Form` onder de
  foutzin "Referentie: <id>" met de knop "Referentie kopiëren"; de id is de `requestId` uit de foutbody. `ApiError` heeft
  daarvoor `requestId` (alleen een veilige korte id, `safeRequestId`, anders `null`), `supportReference()` is de
  beslisregel en `ErrorReference` staat in `src/web/ui/index.ts` voor eigen foutweergaven. Zie
  `docs/ui-error-reference.md`.

### Bij een update

- Een eigen test die bij een 5xx-antwoord met `requestId` het exacte aantal knoppen of alerts telt, ziet in `RouteError`,
  `AsyncView` en `Form` één knop ("Referentie kopiëren") meer; pas het verwachte aantal aan. Verder hoeft een app niets te
  doen.
