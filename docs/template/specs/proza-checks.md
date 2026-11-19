---
status: gebouwd
namespace: proza-checks
---

# Proza-checks voor R-WEB-01 en R-TEST-05

## Doel

Drie lintregels maken R-WEB-01 (guard, ErrorBoundary, geen apparaatdetectie of globale store) afdwingbaar en een strikte
ratchetcheck de vorm van pgTAP-tests uit R-TEST-05 (reviewbevindingen G-01 en G-10, R-DOC-02).

## Rollen en wie wat ziet

Lintregels en een check voor ontwikkelaars; geen gedrag in de app.

## Kopieer de vorm van

- `eslint.config.js` — rails `fetch` en `kooi`: `restrict()`, naam in `ruleNames`, `fromModule` voor imports, `WEB` en
  `TESTS` als bereik en uitsluiting.
- `test/rails/eslint-web.test.ts` — fixtures als `{ name, file, code, rule }` via `railsIn`.
- `scripts/kit/conflictmarkers.mjs` — check in het kanaal `strikt` van `scripts/kit/ratchet.mjs`: `Violation[]` met
  `key` en `message`; `pgtap-vorm` heeft geen eigen CLI-ingang, de ratchet draait hem.
- `test/rails/check-secdef.test.ts` — per overtreding een fixture die faalt, plus een goede.

## Hergebruik en UX

- Geen UI. Guard: `guard` uit `src/web/lib/session.ts`; ErrorBoundary: `RouteError` via `defaultErrorComponent` in
  `src/web/lib/router.ts`.
- Besluit eigenaar 2026-11-19: de guard staat letterlijk als `beforeLoad: guard('…')`, niet als eigen beforeLoad met
  `can()`; `no_plan()` is geweigerd; elke `set local role` telt, niet alleen `app_authenticated`.
- Meldingen letterlijk:
  - `rails/route-guard`: "Elke schermroute in src/web/routes zet in createFileRoute(…)({ … }) `beforeLoad: guard('<permissie>')`,
    met guard uit '#web/lib/session.ts' (R-WEB-01, R-UIT-03); uitzondering alleen login.tsx en uitnodiging.tsx."
  - `rails/router`: "Routes alleen als bestandsroute in src/web/routes (geen createRoute, createLazyRoute of
    createLazyFileRoute); createRouter zet defaultErrorComponent en een route zet errorComponent niet uit (R-WEB-01)."
  - `rails/web-globaal`: "Geen matchMedia, userAgent, isMobile of store-library in de web-zone: breakpoints in CSS,
    UI-state in de URL, serverdata via queries.ts (R-WEB-01)."
  - `pgtap-vorm` (ratchet, strikt): "pgTAP-vorm (R-TEST-05): na `begin;` eerst `set search_path = tap, public;`, en
    `select plan(<n>);` vóór de eerste `set local role`; geen no_plan()." Sleutel `db/tests/<bestand>: <reden>`, met
    reden `search_path`, `plan ontbreekt`, `plan na set local role` of `no_plan`.

## Acceptatiecriteria

Lintfixtures in `test/rails/eslint-route.test.ts`; per fixture is de verzameling rail-meldingen precies één van
`{'rails/route-guard'}`, `{'rails/router'}`, `{'rails/web-globaal'}` of leeg. Bereik: `rails/route-guard`
`src/web/routes/**/*.{ts,tsx}` zonder `src/web/routes/login.tsx` en `src/web/routes/uitnodiging.tsx` (R-UIT-03); `rails/router`
`WEB` zonder `TESTS`; `rails/web-globaal` heel `WEB`, ook tests. Zonder ander pad staat een fixture in
`src/web/routes/_app/x.tsx` (voorbeeld).

- **proza-checks/AC-1** — Gegeven `createFileRoute('/_app/x')({ component: X })`, of met
  `beforeLoad: async () => {}`, `beforeLoad: guard(p)` (geen tekstliteral), `beforeLoad: guard()`,
  `beforeLoad: guard('a', 'b')`, `beforeLoad: other('a')`, `beforeLoad: async () => can('a')`, of de opties als variabele
  (`createFileRoute('/_app/x')(opts)`), dan meldt `rails/route-guard`.
- **proza-checks/AC-2** — Gegeven een eigen guard (`const guard = (p: string) => async () => {}`,
  `function guard() {}`), `import { guard } from '#web/lib/other.ts'`, `import { guard } from '../../lib/session.ts'` of
  `import { other as guard } from '#web/lib/session.ts'`, dan meldt `rails/route-guard`.
- **proza-checks/AC-3** — Gegeven de inhoud van `src/web/routes/uitnodiging.tsx` (zonder guard) in
  `src/web/routes/_app/x.tsx` (voorbeeld), `src/web/routes/login/index.tsx` (voorbeeld) of `src/web/routes/uitnodiging-nieuw.tsx` (voorbeeld), dan meldt
  `rails/route-guard`; in `src/web/routes/login.tsx` en `src/web/routes/uitnodiging.tsx` meldt hij niets.
  `src/web/routes/__root.tsx` zoals hij nu is en `src/web/routes/-delen/x.tsx` (voorbeeld) met alleen een component (geen
  `createFileRoute`) zwijgen; de selectors haken aan op een `createFileRoute`-aanroep.
- **proza-checks/AC-4** — Gegeven `import { guard } from '#web/lib/session.ts'; export const Route =
  createFileRoute('/_app/x')({ beforeLoad: guard('accounts:read'), component: X });`, of dezelfde code met `validateSearch` en `loaderDeps` erbij, dan meldt geen rail iets.
- **proza-checks/AC-5** — Gegeven in `src/web/lib/x.ts` (voorbeeld) `createRouter({ routeTree })`,
  `createRouter({ routeTree, defaultErrorComponent: undefined })` of `createRouter(opts)` (opties als variabele), of een route met `errorComponent: false`, `null` of `undefined`, dan meldt `rails/router`;
  `src/web/lib/router.ts` zoals hij nu is en `createRouter({ routeTree })` in `src/web/lib/x.test.tsx` (voorbeeld) zwijgen.
- **proza-checks/AC-6** — Gegeven in `src/web/features/a/x.tsx` (voorbeeld) of `src/core/web/ui/x.tsx` (voorbeeld) een import van
  `createRoute`, `createLazyRoute` of `createLazyFileRoute` uit `'@tanstack/react-router'` (ook als namespace-import met
  `rr.createRoute(…)`), dan meldt `rails/router`; in een `*.test.tsx` zwijgt hij (`createFileRoute` buiten
  `src/web/routes` neemt de routerplugin niet op).
- **proza-checks/AC-7** — Gegeven in `src/web/features/a/x.tsx` (voorbeeld), `src/core/web/ui/x.tsx` (voorbeeld) of `src/web/features/a/x.test.tsx` (voorbeeld)
  `window.matchMedia('(min-width: 1px)')`, `matchMedia('x')`, `window['matchMedia']('(min-width: 1px)')`, `navigator.userAgent`,
  `window.navigator.userAgent`, `navigator['userAgent']`, `navigator.userAgentData`, `const { userAgent } = navigator;`,
  `const isMobile = true;`, `useIsMobile()` of `{ isMobileDevice: 1 }`, dan meldt `rails/web-globaal`.
- **proza-checks/AC-8** — Gegeven in `src/web/features/a/x.tsx` (voorbeeld) een import (statisch, `export … from` of `import()`) uit
  `zustand`, `zustand/middleware`, `jotai`, `valtio`, `recoil`, `mobx`, `mobx-react-lite`, `redux`, `react-redux`,
  `@reduxjs/toolkit`, `nanostores`, `@nanostores/react`, `effector`, `@tanstack/store` of `@tanstack/react-store`, dan
  meldt `rails/web-globaal`.
- **proza-checks/AC-9** — Gegeven `const css = '@media (min-width: 640px)';`, `const userAgentLabel = 'x';`,
  `const thisMobile = 1;`, `session.userAgent` (ander object dan `navigator`/`window.navigator`) of
  `import { useQuery } from '@tanstack/react-query'` in `src/web/features/a/queries.ts` (voorbeeld), en `navigator.userAgent` in
  `src/api/x.ts` (voorbeeld), dan meldt `rails/web-globaal` niets.
- **proza-checks/AC-10** — Gegeven een pgTAP-fixture in `test/rails/fixtures/pgtap-vorm/`, dan geeft de check precies de
  genoemde reden: `goed.sql` (psql-metaregels `\set …`, commentaar, `begin;`, `set search_path = tap, public;`,
  `select plan(3);`, `set local role app_authenticated;`) geen; `zonder-begin.sql` (zonder `begin;`, verder goed) geen;
  `search-path-ontbreekt.sql`, `search-path-anders.sql` (`set search_path = public, tap;`) en `search-path-later.sql`
  (eerst een `insert`) `search_path`; `plan-ontbreekt.sql` `plan ontbreekt`; `plan-na-rol.sql` en `plan-na-definer.sql`
  (`set local role app_definer;` vóór de plan) `plan na set local role`; `no-plan.sql` (`select no_plan();`) `no_plan`.
  Hoofdletters en extra spaties (`SET search_path=tap,public;`) tellen als goed.
- **proza-checks/AC-11** — Gegeven een fixture-root zonder map `db/tests`, dan geeft de check geen overtreding en geen fout.
- **proza-checks/AC-12** — Gegeven een pgTAP-overtreding in `db/tests/`, dan is `pnpm ratchet` rood met de melding van
  `pgtap-vorm` en komt de sleutel niet in `.kit/baseline.json`, ook niet met `pnpm ratchet:update`.
- **proza-checks/AC-13** — Gegeven de huidige repo, dan zijn `pnpm lint` en `pnpm ratchet` groen zonder nieuwe regels in
  `eslint-suppressions.json` of `.kit/baseline.json`: alle bestanden in `db/tests/` en alle routes onder
  `src/web/routes/_app*` voldoen nu.

## Randgevallen

| Situatie | Gedrag |
|---|---|
| `beforeLoad: (c) => guard('a')(c)` | geweigerd; schrijf hem inline |
| spread (`{ ...base, beforeLoad: guard('a') }`) | zwijgt als `beforeLoad: guard('<tekst>')` er letterlijk staat |
| alias (`const n = navigator; n['user' + 'Agent']`) | bekend gat; review |
| store zonder library (module-level `let`, eigen `createStore`) | bekend gat; review |
| `set role` zonder `local`, `set_config('role', …)` | niet door `pgtap-vorm`; R-CODE-08 en review |
| `plan(` in een `$$`-blok of commentaar | telt niet; alleen een regel die met `select plan(` begint |
| `set local role` in commentaar, in een `$$`-blok of in `execute '…'` | telt niet; alleen aan het begin van een regel (na witruimte) buiten een `$$`-blok |
| `$$` in een `--`-commentaar (eigen regel of achter code) | opent of sluit geen blok |
| dollar-quote met tag (`$x$`), of `--` binnen `$$`-tekst gevolgd door een `$$` op dezelfde regel | bekend gat; plan en `search_path` staan in de praktijk bovenaan |

## Raakt ook

- `eslint.config.js`: drie namen in `ruleNames` (`route-guard`, `router`, `web-globaal`) en drie `restrict()`-blokken;
  voorReview-pad, besluit eigenaar. Regex in een selector zonder `/` (esquery): `[/]` of `[.]`.
- `scripts/kit/check-policies.mjs`: export `pgTapVormViolations(root)` naast `pgTapBronnen`, met de bestandsnaam per bron;
  `scripts/kit/ratchet.mjs`: `pgtap-vorm` in `strikt`.
- `scripts/kit/gates.mjs` (besluit-pr-pad, ADR 0090): `bewaakt` van `ratchet`
  eindigt op "… en elk pgTAP-bestand in db/tests in de vorm van R-TEST-05".
- `docs/framework.md` en de spiegels `.claude/rules/web.md` en `.claude/rules/database.md` (woordelijk gelijk):
  - R-WEB-01: na "…`isMobile`" komt "(lintregels rails/route-guard, rails/router, rails/web-globaal)", zonder backticks: check-docs leest een
    identifier tussen backticks in `.claude/rules` als pad.
  - R-TEST-05: de pgTAP-zin wordt "pgTAP begint (na `begin;` en psql-metaregels) met `set search_path = tap, public`, `select plan(n)` vóór de eerste
    `set local role`, geen `no_plan()` (strikt in `pnpm ratchet`)".
- `docs/roadmap.md`, item "Geclaimde checks die niet bestaan": "de lintregels op een route zonder `can()`-guard, op
  store-libraries en " gaat eruit; `unsafeCast` en `.isLoading`/`.isError` blijven, dus niet afvinken.
- `pnpm lint`, `pnpm test:unit`, `pnpm ratchet`, `pnpm typecheck`, `pnpm format:check`.

## Buiten scope

UI-state in de URL (R-WEB-01, niet syntactisch toetsbaar); de `unsafeCast`-telling en `.isLoading`/`.isError` uit hetzelfde
roadmap-item; `AGENTS.md` regel "Geen globale store …" inkorten (eigen onderwerp, R-WERK-18); de CSRF-matrix en tabeltests uit R-TEST-05; het einde van een pgTAP-bestand (`finish()`, `rollback;`).

## Testplan

- Unit `test/rails/eslint-route.test.ts`: AC-1 tot en met AC-9 als `test.each`, per melding één fixture die de letterlijke
  tekst toetst.
- Unit `test/rails/pgtap-vorm.test.ts`: AC-10 en AC-11 per fixture; AC-12 met de pure functie in een tijdelijke root en
  `pgtap-vorm` in `strikt` van `ratchet.mjs`.
- Regressie: AC-13 met `pnpm lint` en `pnpm ratchet`. Geen database nodig.

## Open vragen

Geen.
