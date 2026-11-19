---
status: goedgekeurd
namespace: proza-checks
---

# Proza-checks voor R-WEB-01 en R-TEST-05

## Doel

Drie lintregels maken R-WEB-01 (guard, ErrorBoundary, geen apparaatdetectie of globale store) afdwingbaar en een strikte
ratchetcheck de vorm van pgTAP-tests uit R-TEST-05 (reviewbevindingen G-01 en G-10, R-DOC-02).

## Rollen en wie wat ziet

n.v.t. — lintregels en een check voor ontwikkelaars, geen gedrag in de app.

## Kopieer de vorm van

- `eslint.config.js` — rails `fetch` en `kooi`: `restrict(rule, files, ignores, message, selectors)`, naam in
  `ruleNames`, `fromModule` voor imports, `WEB` en `TESTS` als bereik en uitsluiting.
- `test/rails/eslint-web.test.ts` — fixtures als `{ name, file, code, rule }` via `railsIn`.
- `scripts/kit/conflictmarkers.mjs` — check in het kanaal `strikt` van `scripts/kit/ratchet.mjs`: `Violation[]` met
  `key` en `message`, los gedraaid exitcode 1 met verwijzing naar `pnpm ratchet`.
- `test/rails/check-secdef.test.ts` — per overtreding een fixture in `test/rails/fixtures/secdef/` die faalt, plus een goede.

## Hergebruik en UX

- Bestaande componenten, staten, focus: n.v.t. — geen UI. De guard blijft `guard` uit `src/web/lib/session.ts`
  (`createGuard` in `src/core/web/lib/guard.ts`), de ErrorBoundary `RouteError` via `defaultErrorComponent` in
  `src/web/lib/router.ts`.
- Uitzonderingen letterlijk uit R-UIT-03: "Schermroute heeft `can()`-guard; uitzondering `/login`, `/uitnodiging`". In
  bestanden: alleen `src/web/routes/login.tsx` en `src/web/routes/uitnodiging.tsx`. `src/web/routes/__root.tsx` is geen
  schermroute (`createRootRouteWithContext`) en valt buiten de guardselector.
- Meldingen letterlijk:
  - `rails/route-guard`: "Elke schermroute in src/web/routes zet in createFileRoute(…)({ … }) `beforeLoad: guard('<permissie>')`,
    met guard uit '#web/lib/session.ts' (R-WEB-01, R-UIT-03); uitzondering alleen login.tsx en uitnodiging.tsx."
  - `rails/router`: "Routes alleen als bestandsroute in src/web/routes (geen createRoute, createLazyRoute of
    createLazyFileRoute); createRouter zet defaultErrorComponent en een route zet errorComponent niet uit (R-WEB-01)."
  - `rails/web-globaal`: "Geen matchMedia, userAgent, isMobile of store-library in de web-zone: breakpoints in CSS,
    UI-state in de URL, serverdata via queries.ts (R-WEB-01)."
  - `pgtap-vorm` (ratchet, strikt): "pgTAP-vorm (R-TEST-05): na `begin;` eerst `set search_path = tap, public;`, en
    `select plan(<n>);` vóór de eerste `set local role`; geen no_plan()." De sleutel is `db/tests/<bestand>: <reden>`, met
    reden `search_path`, `plan ontbreekt`, `plan na set local role` of `no_plan`.

## Acceptatiecriteria

Lintfixtures in `test/rails/eslint-route.test.ts`; per fixture is de verzameling rail-meldingen precies één van
`{'rails/route-guard'}`, `{'rails/router'}`, `{'rails/web-globaal'}` of leeg. Bereik: `rails/route-guard`
`src/web/routes/**/*.{ts,tsx}` zonder `src/web/routes/login.tsx` en `src/web/routes/uitnodiging.tsx`; `rails/router`
`WEB` zonder `TESTS`; `rails/web-globaal` heel `WEB`, ook tests.

- **proza-checks/AC-1** — Gegeven in `src/web/routes/_app/x.tsx` `createFileRoute('/_app/x')({ component: X })`, of met
  `beforeLoad: async () => {}`, `beforeLoad: guard(p)` (geen tekstliteral), `beforeLoad: guard()`,
  `beforeLoad: guard('a', 'b')`, `beforeLoad: other('a')`, of de opties als variabele (`createFileRoute('/_app/x')(opts)`),
  dan meldt `rails/route-guard`.
- **proza-checks/AC-2** — Gegeven in `src/web/routes/_app/x.tsx` een eigen guard (`const guard = (p: string) => async () => {}`,
  `function guard() {}`), `import { guard } from '#web/lib/other.ts'` of `import { other as guard } from
  '#web/lib/session.ts'`, dan meldt `rails/route-guard`.
- **proza-checks/AC-3** — Gegeven de inhoud van `src/web/routes/uitnodiging.tsx` (zonder guard) in
  `src/web/routes/_app/x.tsx`, `src/web/routes/login/index.tsx` of `src/web/routes/uitnodiging-nieuw.tsx`, dan meldt
  `rails/route-guard`; in `src/web/routes/login.tsx` en `src/web/routes/uitnodiging.tsx` meldt hij niets.
- **proza-checks/AC-4** — Gegeven `import { guard } from '#web/lib/session.ts'; export const Route =
  createFileRoute('/_app/x')({ beforeLoad: guard('accounts:read'), component: X });` in `src/web/routes/_app/x.tsx`, of
  dezelfde code met `validateSearch` en `loaderDeps` erbij, dan meldt geen rail iets.
- **proza-checks/AC-5** — Gegeven in `src/web/lib/x.ts` `createRouter({ routeTree })` of
  `createRouter({ routeTree, defaultErrorComponent: undefined })`, of in `src/web/routes/_app/x.tsx` een route met
  `errorComponent: false`, `errorComponent: null` of `errorComponent: undefined`, dan meldt `rails/router`;
  `src/web/lib/router.ts` zoals hij nu is en `createRouter({ routeTree })` in `src/web/lib/x.test.tsx` zwijgen.
- **proza-checks/AC-6** — Gegeven in `src/web/features/a/x.tsx` of `src/core/web/ui/x.tsx` een import van
  `createRoute`, `createLazyRoute` of `createLazyFileRoute` uit `'@tanstack/react-router'` (ook als namespace-import met
  `rr.createRoute(…)`), dan meldt `rails/router`; in een `*.test.tsx` zwijgt hij. `createFileRoute` buiten
  `src/web/routes` hoeft geen rail: de routerplugin neemt alleen bestanden uit `src/web/routes` op in `routeTree.gen.ts`.
- **proza-checks/AC-7** — Gegeven in `src/web/features/a/x.tsx`, `src/core/web/ui/x.tsx` of `src/web/features/a/x.test.tsx`
  `window.matchMedia('(min-width: 1px)')`, `matchMedia('x')`, `window['matchMedia']('x')`, `navigator.userAgent`,
  `window.navigator.userAgent`, `navigator['userAgent']`, `navigator.userAgentData`, `const { userAgent } = navigator;`,
  `const isMobile = true;`, `useIsMobile()` of `{ isMobileDevice: 1 }`, dan meldt `rails/web-globaal`.
- **proza-checks/AC-8** — Gegeven in `src/web/features/a/x.tsx` een import (statisch, `export … from` of `import()`) uit
  `zustand`, `zustand/middleware`, `jotai`, `valtio`, `recoil`, `mobx`, `mobx-react-lite`, `redux`, `react-redux`,
  `@reduxjs/toolkit`, `nanostores`, `@nanostores/react`, `effector`, `@tanstack/store` of `@tanstack/react-store`, dan
  meldt `rails/web-globaal`.
- **proza-checks/AC-9** — Gegeven `const css = '@media (min-width: 640px)';`, `const userAgentLabel = 'x';`,
  `const thisMobile = 1;` of `import { useQuery } from '@tanstack/react-query'` in `src/web/features/a/queries.ts`, en
  `navigator.userAgent` in `src/api/x.ts`, dan meldt `rails/web-globaal` niets.
- **proza-checks/AC-10** — Gegeven een pgTAP-fixture in `test/rails/fixtures/pgtap-vorm/`, dan geeft de check precies de
  genoemde reden: `goed.sql` (psql-metaregels `\set …`, commentaar, `begin;`, `set search_path = tap, public;`,
  `select plan(3);`, `set local role app_authenticated;`) geen; `zonder-begin.sql` (zonder `begin;`, verder goed) geen;
  `search-path-ontbreekt.sql`, `search-path-anders.sql` (`set search_path = public, tap;`) en `search-path-later.sql`
  (eerst een `insert`) `search_path`; `plan-ontbreekt.sql` `plan ontbreekt`; `plan-na-rol.sql` `plan na set local role`;
  `no-plan.sql` (`select no_plan();`) `no_plan`. Hoofdletters en extra spaties (`SET search_path=tap,public;`) tellen als goed.
- **proza-checks/AC-11** — Gegeven een fixture-root zonder map `db/tests`, dan geeft de check geen overtreding en geen fout.
- **proza-checks/AC-12** — Gegeven een pgTAP-overtreding in `db/tests/`, dan is `pnpm ratchet` rood met de melding van
  `pgtap-vorm` en komt de sleutel niet in `.kit/baseline.json`, ook niet met `pnpm ratchet:update`.
- **proza-checks/AC-13** — Gegeven de huidige repo, dan zijn `pnpm lint` en `pnpm ratchet` groen zonder nieuwe regels in
  `eslint-suppressions.json` of `.kit/baseline.json`. Proef bij het schrijven: alle zeven routes onder `src/web/routes/_app*`
  hebben `beforeLoad: guard('…')` inline; `matchMedia`, `userAgent` en `isMobile` komen in `src/web` en `src/core/web`
  alleen in een commentaar voor (`src/core/web/ui/app-shell.tsx`); alle vijftien bestanden in `db/tests/` hebben de vorm
  (`schrijfbaarheid.sql` begint met twee `\set`-regels).

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| guard-aanroep in een helper (`beforeLoad: (c) => guard('a')(c)`) | geweigerd; schrijf hem inline | n.v.t. |
| opties via spread (`{ ...base, beforeLoad: guard('a') }`) | zwijgt als `beforeLoad: guard('<tekst>')` er letterlijk in staat; anders geweigerd | n.v.t. |
| alias van `window`/`navigator` (`const n = navigator; n['user' + 'Agent']`) | niet gezien (bekend gat); review | n.v.t. |
| globale store zonder library (module-level `let`, eigen `createStore`) | niet gezien (bekend gat); review | n.v.t. |
| `set role` zonder `local` of `set_config('role', …)` in pgTAP | niet door `pgtap-vorm`; R-CODE-08 en review | n.v.t. |
| `plan(` binnen een `$$`-blok of commentaar | telt niet; alleen een regel die met `select plan(` begint | n.v.t. |
| `-- set local role` in commentaar vóór de plan | telt niet; commentaar gaat eraf vóór de toets | n.v.t. |

## Raakt ook

- `eslint.config.js`: drie namen in `ruleNames` (`route-guard`, `router`, `web-globaal`) en drie `restrict()`-blokken;
  voorReview-pad, besluit eigenaar. Regex in een selector zonder `/` (esquery): `[/]` of `[.]`.
- `scripts/kit/check-policies.mjs`: export `pgTapVormViolations(root)` naast `pgTapBronnen`, met de bestandsnaam per bron;
  `scripts/kit/ratchet.mjs`: `pgtap-vorm` in `strikt`.
- `scripts/kit/gates.mjs` (besluit-pr-pad; in de template beslist de eigenaarmerge, ADR 0090): `bewaakt` van `ratchet`
  eindigt op "…, geen conflictmarker in een getrackt tekstbestand en elk pgTAP-bestand in db/tests in de vorm van
  R-TEST-05"; `bewaakt` van `lint` noemt de rails al.
- `docs/framework.md` en de spiegels `.claude/rules/web.md` en `.claude/rules/database.md` (woordelijk gelijk):
  - R-WEB-01: na "…`isMobile`" komt "(lintregels `rails/route-guard`, `rails/router`, `rails/web-globaal`)".
  - R-TEST-05: "pgTAP begint met `set search_path = tap, public`, `plan()` vóór `set local role app_authenticated`" wordt
    "pgTAP begint (na `begin;` en psql-metaregels) met `set search_path = tap, public`, `select plan(n)` vóór de eerste
    `set local role`, geen `no_plan()` (strikt in `pnpm ratchet`)".
- `docs/roadmap.md`, item "Geclaimde checks die niet bestaan": niet afvinken; "de lintregels op een route zonder
  `can()`-guard, op store-libraries en " gaat eruit, de eisen voor `unsafeCast` en `.isLoading`/`.isError` blijven.
- `pnpm lint`, `pnpm test:unit`, `pnpm ratchet`, `pnpm typecheck`, `pnpm format:check`.
- Niet geraakt: `check:migrations`, `check:secdef`, `test:db`/policies (de bestaande `policiesZonderTest` blijft gelijk),
  `test/security/resources.ts`, permissietests (geen route of permissie).

## Buiten scope

UI-state in de URL (R-WEB-01, niet syntactisch toetsbaar); de `unsafeCast`-telling en `.isLoading`/`.isError` uit hetzelfde
roadmap-item; `AGENTS.md` regel "Geen globale store …" inkorten (zie OV-3); de CSRF-matrix en tabeltests uit R-TEST-05;
het einde van een pgTAP-bestand (`finish()`, `rollback;`).

## Testplan

- **Unit** (`test/rails/eslint-route.test.ts`, vorm van `eslint-web.test.ts`): AC-1 tot en met AC-9 als `test.each`, met
  een fixture per melding die de letterlijke meldingstekst controleert.
- **Unit** (`test/rails/pgtap-vorm.test.ts` met `test/rails/fixtures/pgtap-vorm/`): AC-10 en AC-11 per fixture; AC-12 met
  de pure functie in een tijdelijke root en een controle dat `pgtap-vorm` in `strikt` van `ratchet.mjs` staat.
- **Regressie**: AC-13 met `pnpm lint` en `pnpm ratchet` op de hele repo. Geen integratietest; geen database nodig.

## Open vragen

- **OV-1** — `no_plan()` weigeren? R-TEST-05 noemt `plan()`, maar zegt niets over `no_plan`. Aanbeveling: weigeren;
  zonder vast aantal valt een overgeslagen assert niet op, en geen bestand gebruikt het nu.
- **OV-2** — Elke `set local role` of alleen `app_authenticated` (de regeltekst)? Aanbeveling: elke; een test die eerst
  `app_anon` zet en dan pas `plan()`, heeft hetzelfde probleem.
- **OV-3** — `AGENTS.md` regel 43 inkorten nu een lintregel het afdwingt (R-DOC-02)? Aanbeveling: niet in deze PR;
  agentinstructies zijn een eigen onderwerp met eigenaarakkoord (R-WERK-18).
- **OV-4** — Moet de guard letterlijk `guard('<permissie>')` zijn, of mag een eigen beforeLoad die `can()` aanroept?
  Aanbeveling: letterlijk `guard`; een eigen beforeLoad is precies wat de rail niet kan beoordelen, en alle zeven routes
  gebruiken het al.
