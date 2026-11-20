---
status: gebouwd
namespace: offline-en-print
sjabloon: mini
scope: functionele-ui
---

# Offline-melding en printstijlen in de AppShell

## Doel

Elke nieuwe app uit de template meldt zonder eigen code dat het netwerk wegvalt en weer terug is, en drukt een scherm af
zonder navigatie, topbalk en meldingen, met de inhoud op volle breedte in lichte kleuren.

## Rollen en wie wat ziet

Alle ingelogde gebruikers op een scherm met de AppShell, ongeacht rol; geen nieuwe rol, permissie of `can()`-wijziging.
Schermen zonder AppShell (`/login`, `/uitnodiging`, CenteredCard) tonen de melding niet; een app kan daar zelf
`OfflineNotice` plaatsen (zie "Hergebruik en UX").

## Routes en foutcodes

N.v.t. — alleen bestaande UI-componenten in `src/core/web/ui` en vaste teksten in `src/core/web/copy`; geen route, API,
permissie, foutcode, migratie, provider of dependency. De melding leest alleen `navigator.onLine` en de events `online` en
`offline` van `window`; geen netwerkverzoek (geen ping), geen `matchMedia` of `userAgent` (R-WEB-01), geen globale store.

## Kopieer de vorm van

- `src/core/web/ui/toast.tsx` — statusmelding met `role="status"` zonder aria-live-container eromheen, timer van 5000 ms
  zoals `SUCCESS_MS`, timers opruimen bij unmount; teksten uit `uiTexts`.
- `src/core/web/ui/notice.tsx` — de kleurklassen per toon (`warning`, `success`) in één CVA-recept.
- `src/core/web/ui/app-shell.tsx` — plaats in de schil, skip-link, effect met opruimfunctie.
- `src/core/web/ui/notice.test.tsx` — vorm van een componenttest op rol en tekst.
- `e2e/shell.spec.ts` — inloggen als admin en de schil testen tegen de echte stack.

## Acceptatiecriteria

Offline-melding (`OfflineNotice`, eenheidstests met nagebootste `navigator.onLine` en `window`-events, nep-timers):

- **offline-en-print/AC-1** — Gegeven `navigator.onLine` is `true` bij het mounten, dan rendert `OfflineNotice` niets: geen
  element met `role="status"`, geen tekst "Je bent offline." en geen tekst "Weer online.".
  Toets: `src/core/web/ui/offline-notice.test.tsx`
- **offline-en-print/AC-2** — Gegeven online, wanneer `window` een `offline`-event krijgt (met `navigator.onLine` `false`), dan
  staat er precies één element met `role="status"` met de tekst "Je bent offline. Wijzigingen worden niet opgeslagen tot de
  verbinding terug is." en is `document.activeElement` onveranderd. Toets: `src/core/web/ui/offline-notice.test.tsx`
- **offline-en-print/AC-3** — Gegeven `navigator.onLine` is `false` bij het mounten, dan staat de offline-tekst er direct (zonder
  event) en verschijnt "Weer online." niet. Toets: `src/core/web/ui/offline-notice.test.tsx`
- **offline-en-print/AC-4** — Gegeven offline, wanneer een `online`-event komt, dan vervangt "Weer online." de offline-tekst in
  hetzelfde soort `role="status"`-element; na 4999 ms staat die tekst er nog, na 5000 ms rendert `OfflineNotice` niets meer.
  Toets: `src/core/web/ui/offline-notice.test.tsx`
- **offline-en-print/AC-5** — Gegeven online zonder voorafgaande offline-staat, wanneer een `online`-event komt (ook twee keer
  achter elkaar), dan verschijnt "Weer online." niet. Toets: `src/core/web/ui/offline-notice.test.tsx`
- **offline-en-print/AC-6** — Gegeven "Weer online." staat er, wanneer binnen 5000 ms een `offline`-event komt, dan staat de
  offline-tekst er direct en staat zij er ook na nog eens 5000 ms (de oude timer verwijdert haar niet). Een volgend
  `online`-event start een nieuwe periode van 5000 ms. Toets: `src/core/web/ui/offline-notice.test.tsx`
- **offline-en-print/AC-7** — Twee `offline`-events achter elkaar geven één element en de offline-tekst één keer.
  Toets: `src/core/web/ui/offline-notice.test.tsx`
- **offline-en-print/AC-8** — Na unmount zijn de listeners voor `online` en `offline` verwijderd (spy op
  `removeEventListener` met dezelfde handler) en loopt er geen timer meer (`vi.getTimerCount()` is 0); events daarna geven
  geen React-waarschuwing. Toets: `src/core/web/ui/offline-notice.test.tsx`
- **offline-en-print/AC-9** — De melding bevat geen knop, link of `tabindex`; de offline-staat heeft de klassen
  `border-warning` en `text-warning`, de herstelstaat `border-success` en `text-success` (gelijk aan Notice `warning` en
  `success`), en beide de klasse `print:hidden`. Toets: `src/core/web/ui/offline-notice.test.tsx`

AppShell en printstijlen (componenttests op klassen, e2e op berekende stijl):

- **offline-en-print/AC-10** — Gegeven de AppShell en een `offline`-event, dan staat de melding precies één keer in de DOM,
  na de `header` van de Topbar en vóór `main`; de skip-link "Naar de inhoud" blijft de eerste Tab-stop en de melding is geen
  Tab-stop. Online rendert de AppShell geen extra element met `role="status"`.
  Toets: `src/core/web/ui/app-shell-print.test.tsx`
- **offline-en-print/AC-11** — In de AppShell hebben de skip-link, de `aside` met de Sidebar en de melding de klasse
  `print:hidden`; de buitenste container heeft `print:block` en `main` heeft `print:p-0`. Afzonderlijk gerenderd hebben de
  `header` van `Topbar`, de `nav` van `Sidebar` en de buitenste container van `Toaster` de klasse `print:hidden`.
  Toets: `src/core/web/ui/app-shell-print.test.tsx`
- **offline-en-print/AC-12** — Gegeven `data-theme="dark"` op `<html>` en de AppShell gemount, wanneer `window` een
  `beforeprint`-event krijgt, dan is `data-theme` `light`; na `afterprint` is het weer `dark`. De localStorage-sleutel `thema`
  verandert in beide stappen niet. Toets: `src/core/web/ui/app-shell-print.test.tsx`
- **offline-en-print/AC-13** — Gegeven `data-theme="light"`, dan laten `beforeprint` en `afterprint` `data-theme` op `light`.
  Een `afterprint` zonder voorafgaande `beforeprint` verandert niets. Unmount tussen `beforeprint` en `afterprint` zet het
  oorspronkelijke thema terug en verwijdert beide listeners. Toets: `src/core/web/ui/app-shell-print.test.tsx`
- **offline-en-print/AC-14** — E2e tegen de echte stack, ingelogd als admin op een scherm met AppShell (1280 px): na
  `context.setOffline(true)` is de offline-tekst zichtbaar met rol `status`; na `context.setOffline(false)` verschijnt
  "Weer online.". Met `page.emulateMedia({ media: 'print' })` en offline hebben de skip-link, `aside`, de Topbar-`header`, de
  melding en de toastcontainer berekende `display: none`, en is de breedte van `main` gelijk aan de breedte van `body`
  (marge 1 px). Terug naar `media: 'screen'` is de Topbar weer zichtbaar. Op 375 px geldt dezelfde printcontrole.
  Toets: `e2e/offline-en-print.spec.ts`
- **offline-en-print/AC-15** — `OfflineNotice` is te importeren uit `src/web/ui/index.ts` en staat in
  `example-targets.ts` in het voorbeelddoel `example-layout`. Toets: `src/web/ui/offline-notice-index.test.ts`

## Hergebruik en UX

- Bestaande componenten: AppShell, Topbar, Sidebar, Toaster (`src/core/web/ui`); het CVA-recept van Notice levert de
  kleurklassen (`notice.tsx` exporteert daarvoor `noticeVariants`; het gedrag van `Notice` verandert niet). Nieuw publiek
  component `OfflineNotice` in `src/core/web/ui/offline-notice.tsx`, zonder props; het online-hookje erin wordt niet
  geëxporteerd. Geen `Notice` binnen `OfflineNotice` (dat zou een tweede `role="status"` nesten).
- Plaats: de AppShell rendert `OfflineNotice` één keer in de inhoudskolom, tussen Topbar en `main`, in de normale flow
  (niet `fixed`, niet `sticky`): de melding schuift de inhoud omlaag en dekt niets af. Een app rendert `OfflineNotice` alleen
  zelf op schermen zonder AppShell; binnen de AppShell niet (dan staat hij er twee keer). Dat staat in de gebruiksdoc.
- Staten van de melding: online (niets gerenderd), offline (waarschuwing, blijft tot herstel, niet te sluiten), hersteld
  (succes, 5000 ms, dan weg; geen pauze bij hover, het is alleen informatie). Laden, leeg, fout, bezig en verouderd: n.v.t. —
  de melding haalt niets op.
- Print: skip-link, sidebar, topbalk, toasts en melding verdwijnen; de buitenste grid wordt `block`, `main` zonder padding, dus
  de inhoud krijgt de volle paginabreedte. Lichte kleuren: de AppShell zet bij `beforeprint` `data-theme` tijdelijk op `light`
  en zet bij `afterprint` het vorige thema terug, zonder `setTheme` (de bewaarde keuze blijft). Alle print-klassen staan in
  `src/core/web/ui`, niet in `features/` (R-UI-04). Een geopende mobiele menusheet tijdens afdrukken: buiten scope.
- Alle zichtbare tekst letterlijk (nieuw in `uiTexts` in `src/core/web/copy/ui.ts`):
  - `offline`: "Je bent offline. Wijzigingen worden niet opgeslagen tot de verbinding terug is."
  - `backOnline`: "Weer online."
  - Catalogustekst voor `example-layout` wordt: "Bekijk de echte navigatie en topbalk rondom deze pagina; open op mobiel het
    hoofdmenu. Zet het netwerk uit (ontwikkelhulpmiddelen, Offline) voor de offlinemelding, of druk af voor de printweergave."
- Focusvolgorde en toetsenbord: de melding is geen Tab-stop en verplaatst de focus niet; de schermlezer leest haar beleefd
  voor via `role="status"`. Skip-link blijft de eerste Tab-stop. Afdrukken via Ctrl+P / Cmd+P of het browsermenu; geen eigen
  printknop.

## Raakt ook

Bron (kit en tekst):

- `src/core/web/ui/offline-notice.tsx` (nieuw: `OfflineNotice`)
- `src/core/web/ui/app-shell.tsx` (melding plaatsen, print-klassen, `beforeprint`/`afterprint`)
- `src/core/web/ui/topbar.tsx`, `src/core/web/ui/sidebar.tsx`, `src/core/web/ui/toast.tsx` (alleen `print:hidden`)
- `src/core/web/ui/notice.tsx` (alleen export van `noticeVariants`)
- `src/core/web/copy/ui.ts` (`offline`, `backOnline`)

Barrel en catalogus:

- `src/web/ui/index.ts` (export `OfflineNotice`)
- `src/web/features/design-system/example-targets.ts` (`OfflineNotice` bij `example-layout`, tekst hierboven)

Tests (nieuw; bestaande tests niet wijzigen of skippen):

- `src/core/web/ui/offline-notice.test.tsx` (AC-1 t/m AC-9)
- `src/core/web/ui/offline-notice-sync.test.tsx` (regressie bij AC-3/AC-4: `navigator.onLine` opnieuw lezen na het
  koppelen van de listeners)
- `src/core/web/ui/app-shell-print.test.tsx` (AC-10 t/m AC-13)
- `e2e/offline-en-print.spec.ts` (AC-14)
- `src/web/ui/offline-notice-index.test.ts` (AC-15)

Buiten de AC's, als bewijs in de PR: `pnpm check:catalogus` groen, bestaande tests (o.a. `app-shell.test.tsx`,
`toast.test.tsx`) ongewijzigd groen, geen nieuwe dependency, token of stylesheetwijziging.

Gebruiksdoc: `docs/offline-en-print.md` (wat de melding doet, waar je hem zelf plaatst, hoe afdrukken werkt, AC's naar tests).

Checks: `pnpm check:catalogus`, `check-docs` (AC-traceerbaarheid na `gebouwd`), `pnpm ui:check` (375/1280, axe licht en
donker), lint/typecheck/format. Niet geraakt: `check:migrations`, `check:secdef`, `test:db`/policies,
`test/security/resources.ts`, permissietests (geen resource, route of permissie).

Kan een bestaande test niet ongewijzigd groen blijven, of vraagt de bouw een ander pad (stylesheets in
`src/core/web/styles`, tokens, `src/core/web/lib/theme.ts`), dan stopt de bouwer en meldt het; geen omweg via app-code.

## Buiten scope

Echte verbindingscontrole (ping naar de API), wachtrij of opnieuw versturen van mislukte wijzigingen, service worker of
offline-cache, de melding door de template plaatsen op schermen zonder AppShell, printknop, printkop/-voettekst, paginaeinden per component, printstijlen
voor Dialog, DataTable-scrollregio's of de menusheet, wijzigingen aan tokens of `src/core/web/styles`. Geen roadmap-item
wordt hiermee afgevinkt.

## Open vragen

- **OV-1** — Lichte kleuren bij afdrukken in donker thema: (a) `data-theme` tijdelijk op `light` via `beforeprint`/`afterprint`
  in de AppShell, (b) een `@media print`-blok in `src/core/web/styles/semantic.css` (buiten de UI-scope van deze mini-spec),
  (c) niets doen (lichte tekst op wit papier). Aanbeveling: (a); blijft binnen `src/core/web/ui`, raakt de bewaarde keuze
  niet en werkt met Ctrl+P. Nadeel: een printvoorbeeld met `emulateMedia` vuurt geen `beforeprint`, daarom toetst AC-12 de
  events en AC-14 alleen layout.
- **OV-2** — Plaats van de melding: (a) in de flow onder de Topbar, (b) `sticky` bovenaan, (c) `fixed` onderaan zoals toasts.
  Aanbeveling: (a); dekt geen inhoud af en vraagt geen nieuwe z-laag. Wie ver gescrold is, hoort de melding wel via
  `role="status"` maar ziet haar pas bovenaan.
- **OV-3** — Duur van "Weer online.": Aanbeveling: 5000 ms, gelijk aan een succes-toast.
