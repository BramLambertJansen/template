# Offline-melding en afdrukken

Hoort bij [de spec](template/specs/offline-en-print.md). Elke app met de AppShell krijgt beide zonder eigen code; deze
uitbreiding voegt geen dependency, route, permissie, migratie, token of stylesheet toe.

## Offline-melding

`OfflineNotice` (`src/core/web/ui/offline-notice.tsx`, via `src/web/ui/index.ts`) leest alleen `navigator.onLine` en de
events `online` en `offline` van `window`; er gaat geen verzoek naar de server. Na het koppelen van de listeners leest hij
`navigator.onLine` één keer opnieuw, zodat een wisseling vóór het koppelen niet verloren gaat. Er zijn drie staten:

- online: niets gerenderd;
- offline: waarschuwing "Je bent offline. Wijzigingen worden niet opgeslagen tot de verbinding terug is.", blijft tot herstel
  en is niet te sluiten;
- hersteld: succesmelding "Weer online.", na 5000 ms weg (gelijk aan een succes-toast). Valt het netwerk binnen die tijd
  opnieuw weg, dan staat de waarschuwing er direct weer.

De melding heeft `role="status"` (beleefd voorgelezen), is geen Tab-stop en verplaatst de focus niet. De kleuren komen uit het
recept van Notice (`noticeVariants` in `src/core/web/ui/notice.tsx`, tonen `warning` en `success`); de teksten staan in
`uiTexts` (`src/core/web/copy/ui.ts`).

De AppShell rendert de melding al één keer, tussen de topbalk en `main`, in de normale flow: hij schuift de inhoud omlaag en
dekt niets af. Plaats `OfflineNotice` daarom niet zelf binnen de AppShell (dan staat hij er twee keer). Op een scherm zonder
AppShell (`/login`, `/uitnodiging`, CenteredCard) toont de template geen melding; wil de app hem daar, dan zet hij
`<OfflineNotice />` zelf in dat scherm.

`navigator.onLine` zegt alleen of het apparaat een netwerk heeft, niet of de API bereikbaar is. Mislukte verzoeken blijven
gewoon via de foutafhandeling van de API-client lopen; er is geen wachtrij of opnieuw versturen.

## Afdrukken

Afdrukken gaat met Ctrl+P / Cmd+P of het browsermenu; er is geen printknop. Bij afdrukken (`print:`-varianten in
`src/core/web/ui`, niet in `features/`, R-UI-04):

- verdwijnen de skip-link, de sidebar (`aside` in `app-shell.tsx` en de `nav` in `sidebar.tsx`), de topbalk (`topbar.tsx`),
  de offline-melding en de toasts (`toast.tsx`);
- wordt de buitenste grid van de AppShell `block` en verliest `main` zijn padding: de inhoud krijgt de volle paginabreedte;
- drukt de app af in het lichte thema: de AppShell zet bij `beforeprint` `data-theme` tijdelijk op `light` en bij
  `afterprint` het vorige thema terug (`usePrintInLightTheme` in `src/core/web/ui/app-shell.tsx`). De bewaarde themakeuze
  (`thema` in localStorage) verandert niet.

Een printvoorbeeld via `page.emulateMedia({ media: 'print' })` in Playwright vuurt geen `beforeprint`: daar zie je de
layout, niet het lichte thema. Printstijlen voor Dialog, DataTable-scrollregio's en de menusheet vallen buiten deze spec.

## Acceptatiecriteria en tests

| AC | Test |
|---|---|
| AC-1 t/m AC-9 melding: staten, timer, opruimen, klassen | `src/core/web/ui/offline-notice.test.tsx` |
| AC-10 plaats in de AppShell, Tab-volgorde | `src/core/web/ui/app-shell-print.test.tsx` |
| AC-11 print-klassen op schil, topbar, sidebar, toaster | `src/core/web/ui/app-shell-print.test.tsx` |
| AC-12, AC-13 licht thema bij afdrukken | `src/core/web/ui/app-shell-print.test.tsx` |
| AC-14 echte stack: offline, herstel, printlayout op 375/1280 px | `e2e/offline-en-print.spec.ts` |
| AC-15 export uit de barrel, voorbeelddoel `example-layout` | `src/web/ui/offline-notice-index.test.ts` |
| Regressie: netwerkwissel tussen render en koppelen van de listeners | `src/core/web/ui/offline-notice-sync.test.tsx` |

Testdekking is geen geslaagde checkuitslag; die staat in de oplevering.
