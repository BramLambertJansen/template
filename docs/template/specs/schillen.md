---
status: voorstel # voorstel | goedgekeurd | vervallen — architect of hoofdsessie zet de status in het voorstel, de merge door de eigenaar is het besluit (ADR 0046); gebouwd volgt uit de AC-dekking (ADR 0104)
namespace: schillen
---

# Schillen: sidebar en topbalk, meerdere per app, en eigen layouts

Tweede van drie specs voor "Designsystem → Appstyling" (besluiten van de eigenaar, 2026-11-15: de template levert twee schillen,
sidebar en topbalk; layouts kunnen per app worden aangepast of nieuw gemaakt). Zie ook [app-thema](app-thema.md) en
[stijlladder](stijlladder.md).

Stand nu: één schil, `AppShell` in `src/core/web/ui/app-shell.tsx` (sidebar met topbalk), die de app in
`src/web/features/layout/app-layout.tsx` vult. Een app die een andere indeling wil, kan alleen core wijzigen (verboden,
R-ARCH-07) of de schil overslaan en daarmee skip-link, focus na navigatie, offline-melding, toasts en printstijl opnieuw bouwen.

Deel A is functionele UI in core (R-WERK-18): spec, code, tests en gebruiksdocs in één PR. Deel B voegt een check aan
`gate:fast` toe en raakt de skill `nieuw-scherm`: beschermde paden, risicowerk met een aparte tester (R-WERK-04).

| Deel | Inhoud | AC's |
|---|---|---|
| **A — frame en twee schillen** | `ShellFrame` met de vaste garanties, `SidebarShell` (de huidige schil op het frame) en `TopbarShell`, schiltokens, voorbeelden op `/design-system` | AC-1 t/m AC-9 |
| **B — eigen schillen en meerdere per app** | de geëxporteerde contracttest, de check die elke schil eraan koppelt, het patroon voor een tweede layoutroute, sectie in het gouden pad | AC-10 t/m AC-14 |

## Doel

Een app kiest per deel van de app een schil (sidebar, topbalk of een eigen layout) en houdt daarbij zonder eigen code
dezelfde toegankelijkheid en hetzelfde gedrag als de bestaande schil.

## Rollen en wie wat ziet

Een schil toont navigatie die de app al per rol filtert (`visibleNavItems` met `can()`); de schil zelf autoriseert niets. De
voorbeelden op `/design-system` staan achter `guard('design-system:read')`.

## Hergebruik en UX

**Deel A**

- **`ShellFrame`** (nieuw, `src/core/web/ui/shell-frame.tsx`) bevat alles wat elke schil gemeen heeft en wat nu in `AppShell`
  zit: de skip-link als eerste Tab-stop, precies één `main` met het doel van de skip-link, focus naar de `h1` na een
  routewissel (`routeKey`), `OfflineNotice` precies één keer boven `main`, de `Toaster`, het lichte thema bij afdrukken en de
  `print:`-regels. Het frame heeft benoemde plekken: `header`, `nav`, `aside` (optioneel), `children`. Het frame bepaalt geen
  indeling: dat doet de schil met layout-klassen.
- **`SidebarShell`**: de huidige `AppShell`, gebouwd op het frame, zelfde props en hetzelfde gedrag. `AppShell` blijft als
  export bestaan en verwijst ernaar, zodat bestaande apps niets hoeven te wijzigen.
- **`TopbarShell`** (nieuw): geen sidebar. Vanaf `md` staat de navigatie horizontaal in de topbalk, links de items, rechts
  `topbarActions` en het profielmenu. Past het aantal items niet (meer dan `TOPBAR_INLINE_ITEMS`, OV-1), dan staan de eerste
  items in de balk en de rest in een menu "Meer". Onder `md` toont de balk de menuknop met dezelfde sheet als de
  `SidebarShell`. Props gelijk aan `SidebarShell` (`nav`, `userName`, `menuItems`, `topbarActions`, `routeKey`, `children`).
- **Breakpoints in CSS**, geen `matchMedia` of breedtemeting in script (R-WEB-01); het aantal items in de balk is daarom een
  vast getal en geen gemeten breedte.
- **Schiltokens** (componenttokens uit de spec app-thema, hooguit zes): `--shell-sidebar-width`, `--shell-topbar-height`,
  `--shell-content-max`, `--shell-content-padding`, `--shell-nav-gap`, `--shell-border-width`. De vaste maat
  `md:grid-cols-[16rem_1fr]` verdwijnt.
- **Inhoudsbreedte**: `main` krijgt `--shell-content-max` als maximale breedte, gecentreerd; de standaard is geen maximum, zodat
  de huidige schermen niet veranderen.
- **Bestaande componenten**: `Sidebar`, `Topbar`, `NavLink`, `DropdownMenu` (voor "Meer" en het profielmenu), `Dialog` in
  de vorm `sheet`, `OfflineNotice`, `Toaster`, `Avatar`. Nieuw: `ShellFrame` en `TopbarShell` (reden: de garanties en de tweede
  indeling bestaan nog nergens).
- **Voorbeelden**: een tabblad "Schillen" op `/design-system` toont beide schillen verkleind in een kader, met voorbeeld­navigatie
  van drie en van negen items (R-UI-07).
- **Staten**: een schil heeft geen laden, leeg of fout van zichzelf; zonder `nav`-items toont hij geen lege balk of sheet maar
  laat de navigatie weg.
- **Alle zichtbare tekst letterlijk** (`src/core/web/copy/ui.ts`): menu "Meer"; toegankelijke naam van de horizontale navigatie
  "Hoofdnavigatie"; tabblad "Schillen"; de bestaande teksten van skip-link en menuknop blijven.
- **Focusvolgorde en toetsenbord**: skip-link → navigatie (in `TopbarShell`: items van links naar rechts, dan "Meer") →
  `topbarActions` → profielmenu → `main`. "Meer" is een gewone `DropdownMenu` (pijltjes, Escape, focus terug op de knop). Het
  actieve item heeft `aria-current="page"`, ook als het in "Meer" staat; dan heeft de knop "Meer" de actieve stijl.

**Deel B**

- **Eigen schil**: een app bouwt een eigen layout in `src/web/ui/` op `ShellFrame` (bijvoorbeeld een volledig scherm zonder
  navigatie voor een vast opgesteld apparaat, of een schil met een tabbalk onderaan). De app vult de plekken en kiest de
  indeling met layout-klassen en schiltokens; de garanties komen uit het frame. Een eigen schil is de vijfde trede van de
  [stijlladder](stijlladder.md) en vraagt dus een akkoord van de eigenaar.
- **Contracttest**: core exporteert `shellContract(render)` voor Vitest (zoals `fileStorageContract` in de spec
  bestandsopslag). Hij eist: één `main`; de skip-link is de eerste Tab-stop en verplaatst de focus naar `main`; na een wissel
  van `routeKey` staat de focus op de `h1`; `OfflineNotice` staat er precies één keer; de `Toaster` staat er precies één keer;
  bij `print` zijn navigatie en balk verborgen.
- **Begrippen voor de check**: een *layoutroute* is een routebestand in `src/web/routes/` waarvan het route-id precies één
  segment heeft dat met `_` begint (`/_app`, `/_portaal`); kindroutes zoals `/_app/account` zijn geen layoutroute. Een
  *geregistreerde schil* is `SidebarShell`, `TopbarShell`, de export `AppShell`, of een component in `src/web/ui/` dat
  `ShellFrame` rendert en waarop een test `shellContract` draait.
- **Check**: `pnpm check:schillen` (in `gate:fast`) faalt als:
  1. een component in `src/core/web/ui/` of `src/web/ui/` `ShellFrame` rendert zonder een test die `shellContract` op dat
     component draait;
  2. het component van een layoutroute, of het layoutcomponent dat het rendert, geen geregistreerde schil rendert;
  3. `ShellFrame` wordt gerenderd buiten `src/core/web/ui/`, `src/web/ui/`, testbestanden en het catalogusvoorbeeld in
     `src/web/features/design-system/`.
  Elke melding noemt het bestand en verwijst naar de sectie "Een tweede schil" in het gouden pad. Falende fixtures: een schil
  zonder suite, een suite op een andere schil, een layoutroute met een rauwe `main`, een feature die `ShellFrame` rendert.
  Groene fixture: de bestaande kindroutes onder `/_app` laten de check niet falen.
- **`ShellFrame` in de catalogus** (eigenaar, 2026-11-24): het frame staat zoals elk UI-component in `src/web/ui/index.ts` en
  heeft een voorbeeld op het tabblad "Schillen" (R-UI-07, geen uitzondering). Dat een feature het frame niet als schil
  gebruikt, bewaakt punt 3 van de check, niet de importgrens.
- **Meerdere schillen in één app**: elke schil hoort bij een eigen layoutroute (`src/web/routes/_app.tsx` is de bestaande; een
  tweede is bijvoorbeeld `_portaal.tsx`), met een eigen layoutcomponent in `src/web/features/layout/`, een eigen guard en
  desgewenst een `ThemeScope` (spec app-thema, deel C). De navigatie per schil is een eigen lijst in `src/web/lib/nav.ts`. De
  template levert zelf geen tweede layoutroute, schil of permissie in de app: hij maakt het mogelijk, bewijst het met een
  fixture in een testpad, en beschrijft hoe een app het bouwt.
- **Fixture "twee schillen"**: `src/web/features/layout/twee-schillen.test.tsx`, in de app-laag zodat ze het recept letterlijk
  volgt (`#web/lib/nav`, `guard`, `visibleNavItems`). Ze bouwt twee layoutroutes in code met `createRootRoute` en
  `createRoute` in een geheugenrouter, dus `routeTree` en `check:schillen` zien haar niet. De tweede route gebruikt een
  bestaande permissie (`accounts:read`), zodat er geen permissie bij komt.
- **Recept "Een tweede schil"** (nieuwe sectie in `docs/gouden-pad.md`): een app die vanuit de template start, kan zonder
  uitzoekwerk aansluiten. De sectie noemt in volgorde:
  1. de keuze: `SidebarShell`, `TopbarShell` of een eigen schil op `ShellFrame` in `src/web/ui/` (dan eerst akkoord van de
     eigenaar, trede vijf van de stijlladder);
  2. bij een eigen schil: een test die `shellContract` op die schil draait;
  3. de layoutroute in `src/web/routes/` met een id van één segment dat met `_` begint en een `guard()` in `beforeLoad`;
  4. de permissie in `src/shared/permissions.ts` met een test per verboden rol (R-TEST-03), of een bestaande permissie;
  5. het layoutcomponent in `src/web/features/layout/` dat de schil vult, met desgewenst een `ThemeScope`;
  6. de navigatielijst in `src/web/lib/nav.ts`, gefilterd met `visibleNavItems`;
  7. een e2e-spec met axe op 375 en 1280 px naar de vorm van `e2e/shell.spec.ts`; `ui:check` draait die spec mee, maar
     ontdekt een nieuwe layoutroute niet zelf.
  Bij elke stap staat het bestand uit de template waarvan de app de vorm kopieert, en de fixture als compleet voorbeeld. Het
  recept blijft kloppen doordat de test van AC-13 elk pad in de sectie tegen de repo toetst, en `check:schillen` en
  `shellContract` dezelfde eisen afdwingen die het recept noemt.
- **Vindbaar op het moment dat het nodig is**: de foutmelding van `check:schillen` verwijst naar de sectie in het gouden pad,
  en de skill `nieuw-scherm` vraagt bij een nieuw scherm in welke layoutroute het hoort en verwijst voor een nieuwe
  layoutroute naar dezelfde sectie.

## Kopieer de vorm van

- `src/core/web/ui/app-shell.tsx` — de huidige schil: skip-link, focus naar de `h1`, sheet, `usePrintInLightTheme`.
- `src/core/web/ui/app-shell.test.tsx` en `src/core/web/ui/app-shell-print.test.tsx` — de tests die de contracttest generaliseert.
- `src/core/web/ui/sidebar.tsx` en `src/core/web/ui/topbar.tsx` — navigatie en balk als losse delen.
- `src/web/features/layout/app-layout.tsx` — de app vult de schil met navigatie per rol en het profielmenu.
- `src/web/routes/_app.tsx` — layoutroute met guard.
- `src/web/lib/nav.ts` — de navigatielijst van de app.
- `e2e/shell.spec.ts` — e2e van de schil op 375 en 1280 px.

## Acceptatiecriteria

**Deel A**

- **schillen/AC-1** — Gegeven de bestaande tests van `AppShell`, dan slagen ze ongewijzigd tegen `SidebarShell` en tegen de
  export `AppShell`. Toets: `src/core/web/ui/app-shell.test.tsx`
- **schillen/AC-2** — Gegeven `TopbarShell` op 1280 px met drie items, dan staan alle drie in een `nav` met de naam
  "Hoofdnavigatie" in de balk, is er geen sidebar en geen knop "Meer". Toets: `src/core/web/ui/topbar-shell.test.tsx` (nieuw)
- **schillen/AC-3** — Gegeven `TopbarShell` met meer dan `TOPBAR_INLINE_ITEMS` items, dan staan de eerste
  `TOPBAR_INLINE_ITEMS` in de balk en de rest in "Meer", in dezelfde volgorde; is het actieve item er een uit "Meer", dan heeft
  dat item `aria-current="page"`. Toets: `src/core/web/ui/topbar-shell.test.tsx` (nieuw)
- **schillen/AC-4** — Gegeven `TopbarShell` op 375 px, dan toont de balk de menuknop en opent die een sheet met alle items; een
  klik op een item sluit de sheet. Toets: `e2e/schillen.spec.ts` (nieuw)
- **schillen/AC-5** — Gegeven beide schillen, dan slaagt `shellContract` op elk. Toets: `src/core/web/ui/shell-contract.test.tsx` (nieuw)
- **schillen/AC-6** — Gegeven `--shell-sidebar-width`, `--shell-topbar-height` en `--shell-content-max` in `theme.css`, dan
  hebben sidebar, balk en `main` die berekende maten; met de standaardwaarden zijn de maten gelijk aan die van vóór deze spec. Toets: `e2e/schillen.spec.ts` (nieuw)
- **schillen/AC-7** — Gegeven een schil zonder `nav`-items, dan staat er geen `nav`, geen menuknop en geen lege sheet. Toets: `src/core/web/ui/topbar-shell.test.tsx` (nieuw)
- **schillen/AC-8** — Gegeven beide schillen op 375 en 1280 px, licht en donker, dan is er geen horizontale scroll, vindt axe
  niets, en is elk item in de balk minstens 44 px hoog. Toets: `e2e/schillen.spec.ts` (nieuw)
- **schillen/AC-9** — Gegeven het tabblad "Schillen" op `/design-system`, dan toont het beide schillen met drie en met negen
  items en slaagt `pnpm check:catalogus`. Toets: `e2e/schillen.spec.ts` (nieuw)

**Deel B**

- **schillen/AC-10** — Gegeven een eigen schil op `ShellFrame` in een fixture, dan slaagt `shellContract`; een fixture die de
  skip-link weglaat, een tweede `main` rendert of `OfflineNotice` zelf nog eens plaatst, laat de suite falen. Toets: `src/core/web/ui/shell-contract.test.tsx` (nieuw)
- **schillen/AC-11** — Gegeven een component met `ShellFrame` zonder test met `shellContract`, een suite op een andere schil,
  of een layoutroute met een rauwe `main`, dan faalt `pnpm check:schillen`, noemt hij het bestand en verwijst hij naar de
  sectie "Een tweede schil" in het gouden pad; gegeven de bestaande kindroutes onder `/_app`, dan slaagt hij. Toets: `test/rails/check-schillen.test.ts` (nieuw)
- **schillen/AC-12** — Gegeven de fixture `src/web/features/layout/twee-schillen.test.tsx` met twee layoutroutes in een
  geheugenrouter, elk met een eigen schil, navigatielijst en `ThemeScope`, wanneer de test van de ene naar de andere route
  navigeert, dan wisselen schil en thema, staat de focus op de `h1` en staat er steeds precies één `main`, één
  `OfflineNotice` en één `Toaster`; en een rol zonder `accounts:read` wordt door de guard van de tweede route geweigerd en ziet
  in de eerste schil geen link ernaartoe. De template-app krijgt geen tweede route of permissie. Toets: `src/web/features/layout/twee-schillen.test.tsx` (nieuw)
- **schillen/AC-13** — Gegeven de sectie "Een tweede schil" in `docs/gouden-pad.md`, dan noemt die `ShellFrame`,
  `shellContract`, `src/shared/permissions.ts`, `src/web/features/layout/`, `src/web/lib/nav.ts`, `e2e/shell.spec.ts` en de
  fixture uit AC-12, bestaat elk pad in backticks in die sectie, en verwijst de skill `nieuw-scherm` ernaar; ontbreekt een
  verwijzing of pad, dan faalt de test. Toets: `test/rails/check-schillen.test.ts` (nieuw)
- **schillen/AC-14** — Gegeven een feature buiten `src/web/features/design-system/` die `ShellFrame` rendert, dan faalt
  `pnpm check:schillen`; het catalogusvoorbeeld op `/design-system` laat hem niet falen. Toets: `test/rails/check-schillen.test.ts` (nieuw)

## Randgevallen

| Situatie | Gedrag |
|---|---|
| Lange itemnaam in de topbalk | breekt niet af en verdringt geen acties: de naam kort af met een ellips, de volledige naam blijft de toegankelijke naam |
| Tekst op 200 % zoom op 1280 px | de balk gedraagt zich als onder `md` zodra de items niet meer passen (container query op de balk) |
| Een schil binnen een schil | de contracttest faalt op twee `main`-elementen |
| Afdrukken vanuit `TopbarShell` | balk en navigatie verborgen, inhoud op volle breedte, licht thema |
| Schermen zonder schil (`/login`, `/uitnodiging`) | ongewijzigd: `CenteredCard`, geen frame |

## Raakt ook

- `docs/framework.md` §7 (schillen en frame bij R-UI-02), R-WEB-01 (elke layoutroute een guard); `docs/gouden-pad.md`;
  `docs/ui-ux-patterns.md`; `docs/offline-en-print.md` (de melding zit in het frame, niet meer in `AppShell`).
- `scripts/kit/gates.mjs` (nieuwe check in `gate:fast`: gate-pad, eigenaarakkoord), `pnpm check:catalogus`, `pnpm ui:check`.
- `src/web/bundle-budget.ts`: `TopbarShell` zit niet in de startbundel; in de template laadt alleen de lazy
  `/design-system`-chunk hem.
- `package.json` (script `check:schillen`), `src/web/ui/index.ts` (export van `ShellFrame`, `SidebarShell`, `TopbarShell`),
  `src/core/web/copy/ui.ts` (teksten "Meer", "Hoofdnavigatie", "Schillen").
- De skill `nieuw-scherm` noemt de keuze van de layoutroute en verwijst naar het recept (beschermd pad).
- Volgorde: deel A kan meteen; deel B na de spec [app-thema](app-thema.md) deel C, omdat AC-12 `ThemeScope` gebruikt.

## Buiten scope

- Een schil met navigatie onderaan, een schil voor een vast opgesteld apparaat of een schil met twee kolommen in de inhoud: dat
  zijn eigen schillen van een app op het frame, geen deel van de template tot twee apps dezelfde nodig hebben (leerpunt).
- Breadcrumbs en paginakoppen (bestaande componenten binnen `main`).
- Een instelling waarmee een eindgebruiker de schil kiest.

## Testplan

- Deel A: de bestaande tests van `AppShell` ongewijzigd groen; eenheidstests voor `TopbarShell`; de contracttest op beide; e2e.
- Deel B: falende en groene fixtures voor de check (R-PRINC-04); de fixture "twee schillen" als componenttest in een
  geheugenrouter, zodat de template-app geen tweede route of permissie meedraagt; de railstest op het recept.
- `pnpm gate:fast`, `pnpm ui:check`, `pnpm check:catalogus` en `pnpm ratchet` groen; uitslag in de PR.

## Open vragen

Een vraag zonder aanbeveling (de eigenaar kiest) blokkeert `goedgekeurd`; een vraag met aanbeveling mag blijven staan. `check-docs` telt elke regel in deze sectie met het waarschuwingsteken en "open" (ook met U+FE0F of hoofdletter, ook zonder opsommingsteken).

- **OV-1** — `TOPBAR_INLINE_ITEMS`, het aantal items in de balk vóór "Meer". Aanbeveling: vijf; meer past op 1280 px niet
  betrouwbaar naast acties en profielmenu, en een app met veel items kiest de sidebar.
- **OV-2 ✅ besloten** — De template levert twee schillen: sidebar en topbalk (eigenaar, 2026-11-15).
- **OV-3** — `AppShell` als naam laten bestaan naast `SidebarShell`. Aanbeveling: ja, als export die doorverwijst; een
  hernoeming dwingt elke bestaande app tot een wijziging bij de template-update zonder winst.
- **OV-4** — Of een eigen schil altijd een eigenaarakkoord vraagt. Aanbeveling: ja (trede vijf van de stijlladder); een schil
  raakt elke pagina eronder.
- **OV-5** — Standaard van `--shell-content-max`. Aanbeveling: geen maximum, zodat bestaande schermen gelijk blijven; een app
  zet hem in haar thema.
