---
soort: toegevoegd
---

- Drie lintregels maken R-WEB-01 afdwingbaar: `rails/route-guard` (elke schermroute zet `beforeLoad: guard('…')` uit
  `#web/lib/session.ts`), `rails/router` (alleen bestandsroutes, `defaultErrorComponent` verplicht) en `rails/web-globaal`
  (geen `matchMedia`, `userAgent`, `isMobile` of store-library); de strikte ratchet-check `pgtap-vorm` toetst de vorm van
  pgTAP-tests uit R-TEST-05 (spec `proza-checks`).

### Bij een update

- Draai `pnpm lint` en `pnpm ratchet`: een schermroute zonder `beforeLoad: guard('<permissie>')`, een eigen `createRoute`,
  apparaatdetectie of een store-library in de web-zone, en een pgTAP-test zonder `set search_path = tap, public` of met
  `select plan(n)` na de eerste `set local role` worden nu rood. Pas de code aan; er is geen onderdrukking voor.
