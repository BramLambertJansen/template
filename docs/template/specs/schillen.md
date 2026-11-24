---
status: goedgekeurd # voorstel | goedgekeurd | vervallen — architect of hoofdsessie zet de status in het voorstel, de merge door de eigenaar is het besluit (ADR 0046); gebouwd volgt uit de AC-dekking (ADR 0104)
namespace: schillen
---

# Schillen: sidebar en topbalk, meerdere per app, en eigen layouts

Tweede van drie specs voor "Designsystem → Appstyling" (besluiten van de eigenaar, 2026-11-15: de template levert twee schillen,
sidebar en topbalk; layouts kunnen per app worden aangepast of nieuw gemaakt). Zie ook [app-thema](app-thema.md) en
[stijlladder](stijlladder.md).

Stand nu: één schil, `AppShell` in `src/core/web/ui/app-shell.tsx` (sidebar met topbalk), die de app in
`src/web/features/layout/app-layout.tsx` vult. Een app die een andere indeling wil, kan alleen core wijzigen (verboden,
R-ARCH-07) of de schil overslaan en daarmee skip-link, focus na navigatie, offline-melding, toasts en printstijl opnieuw bouwen.

Deel A is functionele UI in core (R-WERK-18): spec, code, tests en gebruiksdocs in één PR. Deel A raakt daarnaast twee
gate-paden voor de contracttest (`.dependency-cruiser.mjs`, `eslint.config.js`); dat akkoord geeft de eigenaar met deze spec.
Deel B voegt een check aan `gate:fast` toe en raakt de skill `nieuw-scherm`: beschermde paden, risicowerk met een aparte
tester (R-WERK-04).

| Deel | Inhoud | AC's |
|---|---|---|
| **A — frame en twee schillen** | `ShellFrame` met de vaste garanties, `SidebarShell` (de huidige schil op het frame) en `TopbarShell`, schiltokens, de contracttest, één meldingenplek, voorbeelden op `/design-system` | AC-1 t/m AC-9, AC-15 t/m AC-19 |
| **B — eigen schillen en meerdere per app** | de check die elke schil aan de contracttest koppelt, het patroon voor een tweede layoutroute, sectie in het gouden pad | AC-10 t/m AC-14 |

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
  routewissel (`routeKey`), `OfflineNotice` precies één keer boven `main`, het lichte thema bij afdrukken en de
  `print:`-regels. Het frame heeft benoemde plekken: `header`, `nav`, `aside` (optioneel), `children`. Het frame bepaalt geen
  indeling: dat doet de schil met layout-klassen.
- **Focus bij een schilwissel**: één regel. Het frame zet bij zijn mount de focus op de `h1`, behalve bij de eerste
  weergave van het document; daarnaast, zoals nu, bij elke wissel van `routeKey`. Zo krijgt ook "inloggen → app" en
  "portaal → beheer" de focus op de `h1`, en blijft hij bij het laden van de pagina waar de browser hem zet. Nu gaat die
  focus verloren, omdat `useFocusOnRouteChange` in `src/core/web/ui/app-shell.tsx` alleen op een wijziging binnen één mount
  reageert.
- **Mechanisme**: `ShellSessionProvider` (core, `src/core/web/ui/shell-frame.tsx`; in `src/web/main.tsx` om de router)
  houdt een ref "er is al een scherm getoond". Niet de provider zet die, maar het eerste scherm zelf: `ShellFrame` en
  `CenteredCard` roepen `useMarkScreenShown()` aan. `ShellFrame` geeft een context "binnen een frame" door; binnen een frame,
  bij `CenteredCard preview` en zonder provider doet `useMarkScreenShown` niets. Zo kan een `CenteredCard` in een schil
  (zoals `src/web/features/account/email-confirm-page.tsx` onder `/_app`) de ref niet zetten voordat het frame hem leest:
  effecten van kinderen lopen vóór die van de ouder. Zo telt pas de commit van het eerste echte scherm als eerste weergave,
  ook als dat later komt dan de provider (de guard laadt de sessie async en `AppLayout` rendert `null` zolang die ontbreekt,
  `src/web/features/layout/app-layout.tsx`). Het frame leest de ref bij zijn eerste effect-run en legt de beslissing
  ("focus" of "niet") vast in een eigen ref, en zet daarna de gedeelde ref. Elke effect-run voert die vastgelegde
  beslissing uit met een eigen cleanup; zo verplaatst de extra run van `StrictMode` de focus bij het eerste scherm niet,
  en gaat de focus bij een latere mount niet verloren doordat de cleanup van de eerste run hem annuleert. Geen
  router-staat in core-UI, geen modulevariabele. Zonder provider gedraagt het frame zich als nu: alleen focus bij een
  wissel van `routeKey`.
- **Eén meldingenplek** (eigenaar, 2026-11-24): `ToastProvider` rendert de meldingen zelf, één keer voor de hele app, na
  zijn kinderen, zodat een melding een schilwissel overleeft. De lijst krijgt `data-toaster`, zodat tests hem kunnen tellen
  zonder een rol of `aria-live` die de dubbele aankondiging uit `src/core/web/ui/toast.tsx` zou veroorzaken. `Toaster` is daarna intern: geen export meer uit
  `src/core/web/ui/toast.tsx` en `src/web/ui/index.ts`. Een app die hem toch importeert, faalt bij de typecheck in plaats
  van stil dubbele meldingen te tonen. De acht tests die nu `<ToastProvider>` plus `<Toaster />` renderen, laten die tweede
  regel vallen (reden in de PR, R-TEST-02): `src/core/web/ui/toast.test.tsx`, `src/core/web/ui/toast-effect-timers.test.tsx`,
  `src/core/web/ui/app-shell-print.test.tsx` en vijf tests in `src/web/features/design-system/`. Het toastvoorbeeld op
  `/design-system` blijft. Gevolg: ook `/login` en `/uitnodiging` tonen nu meldingen. Meldingen volgen altijd het thema
  van het document, ook binnen een deel met een eigen `ThemeScope` (eigenaar, 2026-11-24).
- **`SidebarShell`**: de huidige `AppShell`, gebouwd op het frame, zelfde props en hetzelfde gedrag. `AppShell` blijft als
  export bestaan en verwijst ernaar, zodat bestaande apps niets hoeven te wijzigen.
- **`TopbarShell`** (nieuw): geen sidebar. Vanaf `md` staat de navigatie horizontaal in de topbalk, links de items, rechts
  `topbarActions` en het profielmenu. Past het aantal items niet (meer dan `TOPBAR_INLINE_ITEMS`, OV-1), dan staan de eerste
  items in de balk en de rest in een menu "Meer". Onder `md` toont de balk de menuknop met dezelfde sheet als de
  `SidebarShell`. Props gelijk aan `SidebarShell` (`nav`, `userName`, `menuItems`, `topbarActions`, `routeKey`, `children`).
- **Breakpoints in CSS**, geen `matchMedia` of breedtemeting in script (R-WEB-01); het aantal items in de balk is daarom een
  vast getal en geen gemeten breedte. Daarnaast heeft de balk een container query met een drempel in `rem`: is de balk
  smaller dan die drempel, dan toont hij de menuknop in plaats van de items. Een drempel in `rem` schaalt mee met de
  tekstgrootte, zodat de balk bij 200 % tekst niet overloopt.
- **Schiltokens** (componenttokens via het mechanisme van de spec app-thema deel A, hooguit zes): `--shell-sidebar-width`, `--shell-topbar-height`,
  `--shell-content-max`, `--shell-content-padding`, `--shell-nav-gap`, `--shell-border-width`. De vaste maat
  `md:grid-cols-[16rem_1fr]` verdwijnt. Standaardwaarden gelijk aan nu: `--shell-sidebar-width: 16rem`,
  `--shell-topbar-height: 3.5rem` (nu `min-h-14`), `--shell-content-max: none`.
- **Inhoudsbreedte**: `main` krijgt `--shell-content-max` als maximale breedte, gecentreerd; de standaard is geen maximum, zodat
  de huidige schermen niet veranderen.
- **Bestaande componenten**: `Sidebar`, `Topbar`, `NavLink`, `DropdownMenu` (voor "Meer" en het profielmenu), `Dialog` in
  de vorm `sheet`, `OfflineNotice`, `Avatar`. Nieuw: `ShellFrame` en `TopbarShell` (reden: de garanties en de tweede
  indeling bestaan nog nergens).
- **Voorbeelden** (eigenaar, 2026-11-24: echt wisselen): een schil binnen een schil kan niet (twee `main`, twee skip-links,
  axe faalt). Daarom toont `/design-system` geen verkleinde schillen, maar wisselt de hele pagina van schil. Het tabblad
  "Schillen" heeft een keuze "Sidebar" / "Topbalk" en een keuze "3 items" / "9 items", beide in de URL
  (`?schil=topbalk&items=9`, R-WEB-01); `src/web/routes/_app/design-system.tsx` valideert ze naast `q` en `vak`, met `.catch`
  naar de standaard. `AppLayout` rendert op `/design-system` met `schil=topbalk` de `TopbarShell` in plaats van
  `SidebarShell`, alleen als de actor `design-system:read` heeft; elders, of zonder dat recht, negeert hij de parameter.
  De voorbeeldnavigatie staat in `src/web/features/layout/schil-voorbeeld.ts` (niet in `features/design-system`, zodat de
  catalogus lazy blijft), met teksten in `src/web/copy/ui.ts`. Elk item wijst naar een vak en houdt de keuze vast
  (`/design-system?schil=topbalk&items=9&vak=formulieren`); de vak-ids staan er letterlijk, en een test vergelijkt ze met
  `src/web/features/design-system/vakken.ts`, zodat de layout niet uit de catalogus importeert. In `topbarActions` staat
  de link "Gewone navigatie" (naar `/design-system` zonder `schil`), niet als navigatie-item. Dit is voorbeelddata
  (R-WEB-08) en geen tweede schil van de app: een gevolg van het besluit "echt wisselen". `SidebarShell` en `ShellFrame`
  zijn zo ook bereikbaar via `AppLayout` (R-UI-07). `TopbarShell` en `SidebarShell` worden letterlijk in
  `src/web/features/layout/app-layout.tsx` gerenderd, want de catalogusdekking volgt dat bestand; `schil-voorbeeld.ts`
  bevat alleen data.
- **`NavLink` met zoekparameters**: heeft `href` een query, dan is de link actief als het pad gelijk is en elke parameter uit
  `href` dezelfde waarde in de URL heeft; zonder query blijft het gedrag zoals nu (pad of subpad). Zo is in de
  voorbeeldnavigatie precies het gekozen vak actief, ook als het in "Meer" staat.
- **Staten**: een schil heeft geen laden, leeg of fout van zichzelf; zonder `nav`-items toont hij geen lege balk of sheet maar
  laat de navigatie weg.
- **Alle zichtbare tekst letterlijk**: in `src/core/web/copy/ui.ts` menu "Meer" en de toegankelijke naam van de
  horizontale navigatie "Hoofdnavigatie"; in `src/web/features/design-system/vakken.ts` het vak "Schillen"; in
  `src/web/copy/ui.ts` de keuzes "Sidebar", "Topbalk", "3 items", "9 items", de link "Gewone navigatie" en de namen van
  de voorbeelditems. De bestaande teksten van skip-link en menuknop blijven.
- **Contracttest** (in deel A, omdat AC-5 en AC-16 hem gebruiken): core levert `shellContract(Schil, opties)` voor Vitest
  (zoals `fileStorageContract` in de spec bestandsopslag) in `src/core/web/ui/testing.tsx`, volgens de bestaande conventie
  `<map>/testing.ts`. Het eerste argument is het schilcomponent als identifier, zodat `check:schillen` statisch ziet welke
  schil een suite toetst; `opties` geeft de props en of er een `ShellSessionProvider` met een eerder weergegeven document
  omheen staat. Het bestand importeert Vitest en Testing Library en exporteert geen componenten (fixtures staan in
  `*.test.tsx`), dus de catalogus vraagt er niets voor. Het staat niet in de barrel; de regel `testing-alleen-in-tests` in
  `.dependency-cruiser.mjs` en de bijbehorende lijst in `eslint.config.js` krijgen dit pad erbij, zodat alleen testbestanden
  het importeren. Hij eist: één `main`; de skip-link is de eerste Tab-stop en verplaatst de focus naar `main`; na een wissel
  van `routeKey`, en bij een mount nadat het document al is weergegeven, staat de focus op de `h1`; bij de eerste weergave
  verplaatst de schil de focus niet, ook niet onder `StrictMode`; `OfflineNotice` staat er precies één keer; de schil
  rendert geen meldingen (geen `[data-toaster]` binnen de schil); bij `print` zijn navigatie en balk verborgen.
- **Focusvolgorde en toetsenbord**: skip-link → navigatie (in `TopbarShell`: items van links naar rechts, dan "Meer") →
  `topbarActions` → profielmenu → `main`. "Meer" is een gewone `DropdownMenu` (pijltjes, Escape, focus terug op de knop). Het
  actieve item heeft `aria-current="page"`, ook als het in "Meer" staat; dan heeft de knop "Meer" de actieve stijl.

**Deel B**

- **Eigen schil**: een app bouwt een eigen layout in `src/web/ui/` op `ShellFrame` (bijvoorbeeld een volledig scherm zonder
  navigatie voor een vast opgesteld apparaat, of een schil met een tabbalk onderaan). De app vult de plekken en kiest de
  indeling met layout-klassen en schiltokens; de garanties komen uit het frame. Een eigen schil is de vijfde trede van de
  [stijlladder](stijlladder.md) en vraagt dus een akkoord van de eigenaar.
- **Begrippen voor de check**: een *layoutroute* is een routebestand in `src/web/routes/` waarvan het route-id precies één
  segment heeft dat met `_` begint (`/_app`, `/_portaal`); kindroutes zoals `/_app/account` en de root-route (`__root.tsx`)
  zijn geen layoutroute. Geneste layouts zonder pad (`/_app/_stap`) vallen bewust buiten de check: ze horen binnen de schil
  van hun ouder en renderen geen eigen frame. Een
  *geregistreerde schil* is `SidebarShell`, `TopbarShell`, de export `AppShell`, of een component in `src/web/ui/` dat
  `ShellFrame` rendert en waarop een test `shellContract` draait.
- **Check**: `pnpm check:schillen` (in `gate:fast`) faalt als:
  1. een component in een niet-testbestand in `src/core/web/ui/` of `src/web/ui/` `ShellFrame` rendert zonder een test die
     `shellContract` op dat component draait;
  2. het component van een layoutroute, of het layoutcomponent dat het rendert, geen geregistreerde schil rendert;
  3. `ShellFrame` wordt gerenderd buiten `src/core/web/ui/`, `src/web/ui/` en testbestanden.
  Elke melding noemt het bestand en verwijst naar de sectie "Een tweede schil" in het gouden pad. Falende fixtures: een schil
  zonder suite, een suite op een andere schil, een layoutroute met een rauwe `main`, een feature die `ShellFrame` rendert.
  Groene fixture: de bestaande kindroutes onder `/_app` laten de check niet falen.
- **`ShellFrame` in de catalogus** (eigenaar, 2026-11-24): het frame staat zoals elk UI-component in `src/web/ui/index.ts` en
  is bereikbaar via `AppLayout` (R-UI-07, geen uitzondering). Dat een feature het frame niet als schil gebruikt, bewaakt
  punt 3 van de check, niet de importgrens.
- **Meerdere schillen in één app**: elke schil hoort bij een eigen layoutroute (`src/web/routes/_app.tsx` is de bestaande; een
  tweede is bijvoorbeeld `_portaal.tsx`), met een eigen layoutcomponent in `src/web/features/layout/`, een eigen guard en
  desgewenst een `ThemeScope` (spec app-thema, deel C). Een app zet de navigatie per schil als eigen export in
  `src/web/lib/nav.ts`; de template houdt daar één lijst (`navItems`). De template levert zelf geen tweede layoutroute,
  schil, navigatielijst of permissie in de app: hij maakt het mogelijk, bewijst het met een fixture in een testpad, en
  beschrijft hoe een app het bouwt.
- **Fixture "twee schillen"**: `src/web/features/layout/twee-schillen.test.tsx`, in de app-laag zodat ze dezelfde bouwstenen
  gebruikt als het recept (`guard`, `visibleNavItems`, `navItems` uit `#web/lib/nav` voor de eerste schil). De navigatielijst
  van de tweede schil staat in de test zelf. Ze bouwt twee layoutroutes in code met `createRootRoute` en `createRoute` in een
  geheugenrouter (vorm: `src/web/features/design-system/account-links.test.tsx`), dus `routeTree`, de catalogus en
  `check:schillen` zien haar niet. De tweede route gebruikt een bestaande permissie (`accounts:read`), en de thema's zijn
  de twee voorbeeldthema's die de template volgens de spec app-thema meelevert (`strak` en `zacht`).
- **Recept "Een tweede schil"** (nieuwe sectie in `docs/gouden-pad.md`): een app die vanuit de template start, kan zonder
  uitzoekwerk aansluiten. De sectie noemt in volgorde:
  1. de keuze: `SidebarShell`, `TopbarShell` of een eigen schil op `ShellFrame` in `src/web/ui/` (dan eerst akkoord van de
     eigenaar, trede vijf van de stijlladder);
  2. bij een eigen schil: een test met `shellContract(MijnSchil, …)`;
  3. de layoutroute in `src/web/routes/` met een id van één segment dat met `_` begint en een `guard()` in `beforeLoad`
     (de guard bewaakt de lintregel `route-guard`, R-WEB-01; dat de route een geregistreerde schil rendert, bewaakt regel 2
     van `check:schillen`; de fixture bouwt routes in code en bewijst deze stap niet);
  4. de permissie in `src/shared/permissions.ts` met een test per verboden rol (R-TEST-03), of een bestaande permissie;
  5. het layoutcomponent in `src/web/features/layout/` dat de schil vult, met desgewenst een `ThemeScope`;
  6. een eigen navigatielijst als export in `src/web/lib/nav.ts`, gefilterd met `visibleNavItems`;
  7. een e2e-spec met axe op 375 en 1280 px naar de vorm van `e2e/shell.spec.ts`; `ui:check` draait die spec mee, maar
     ontdekt een nieuwe layoutroute niet zelf.
  Bij elke stap staat het bestand uit de template waarvan de app de vorm kopieert, en de fixture als compleet voorbeeld.
  Voorbeeldnamen die de app zelf kiest, schrijft het recept met een plaatshouder (`src/web/routes/_<naam>.tsx`). Het recept
  blijft kloppen doordat de test van AC-13 elk pad in de sectie tegen de repo toetst, en `check:schillen` en
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

- **schillen/AC-1** — Gegeven de bestaande tests van `AppShell`, dan slagen ze zonder gedragswijziging (alleen het
  commentaar dat de schil de `Toaster` rendert, gaat mee), en is de export `AppShell` hetzelfde component als
  `SidebarShell`. Toets: `src/core/web/ui/app-shell.test.tsx`
- **schillen/AC-2** — Gegeven `TopbarShell` op 1280 px met drie items, dan staan alle drie in een `nav` met de naam
  "Hoofdnavigatie" in de balk, is er geen sidebar en geen knop "Meer"; een item met een lange naam heeft die volledige naam als
  toegankelijke naam. Toets: `src/core/web/ui/topbar-shell.test.tsx` (nieuw)
- **schillen/AC-3** — Gegeven `TopbarShell` met meer dan `TOPBAR_INLINE_ITEMS` items, dan staan de eerste
  `TOPBAR_INLINE_ITEMS` in de balk en de rest in "Meer", in dezelfde volgorde; is het actieve item er een uit "Meer", dan heeft
  dat item `aria-current="page"`. Toets: `src/core/web/ui/topbar-shell.test.tsx` (nieuw)
- **schillen/AC-4** — Gegeven `TopbarShell` op 375 px, dan toont de balk de menuknop en opent die een sheet met alle items; een
  klik op een item sluit de sheet. Toets: `e2e/schillen.spec.ts` (nieuw)
- **schillen/AC-5** — Gegeven beide schillen, dan slaagt `shellContract` op elk. Toets: `src/core/web/ui/shell-contract.test.tsx` (nieuw)
- **schillen/AC-6** — Gegeven `--shell-sidebar-width`, `--shell-topbar-height` en `--shell-content-max` in `theme.css`, dan
  hebben sidebar, balk en `main` die berekende maten; met de standaardwaarden is de sidebar 256 px breed, de balk minstens
  56 px hoog en heeft `main` geen maximale breedte. Toets: `e2e/schillen.spec.ts` (nieuw)
- **schillen/AC-7** — Gegeven een schil zonder `nav`-items, dan staat er geen `nav`, geen menuknop en geen lege sheet. Toets: `src/core/web/ui/topbar-shell.test.tsx` (nieuw)
- **schillen/AC-8** — Gegeven beide schillen op 375 en 1280 px, licht en donker, dan is er geen horizontale scroll, vindt axe
  niets, en is elk item in de balk minstens 44 px hoog; op 1280 px met `html { font-size: 200% }` (via `page.addStyleTag`)
  toont `TopbarShell` met negen items de menuknop en is er geen horizontale scroll. Toets: `e2e/schillen.spec.ts` (nieuw)
- **schillen/AC-9** — Gegeven `/design-system?schil=topbalk&items=9`, dan staat de pagina in `TopbarShell` met negen
  voorbeelditems, precies één `main` en één skip-link, en vindt axe niets; gegeven `?schil=sidebar&items=3`, dan in
  `SidebarShell` met drie; op een andere route verandert `schil` niets; na een
  klik op een voorbeelditem blijven `schil` en `items` staan en heeft precies dat item `aria-current="page"`. Toets: `e2e/schillen.spec.ts` (nieuw)
- **schillen/AC-17** — Gegeven de productiebuild, dan bevat de entry-chunk de catalogus van `/design-system` niet en past de
  bundel binnen `src/web/bundle-budget.ts`. Toets: `test/ui/bundle.test.ts`
- **schillen/AC-18** — Gegeven een `NavLink` met `href` `/design-system?vak=formulieren`, dan is hij actief bij
  `/design-system?vak=formulieren&schil=topbalk` en niet bij `/design-system?vak=basis`; zonder query in `href` is het gedrag
  gelijk aan nu. Toets: `src/core/web/ui/nav-link.test.tsx` (nieuw)
- **schillen/AC-19** — Gegeven de vak-ids in `src/web/features/layout/schil-voorbeeld.ts`, dan bestaat elk als vak in
  `src/web/features/design-system/vakken.ts`. Toets: `src/web/features/layout/schil-voorbeeld.test.ts` (nieuw)
- **schillen/AC-15** — Gegeven `ToastProvider` met een kind dat na een toast wisselt van `SidebarShell` naar `TopbarShell`,
  dan staat de toast na de wissel nog in beeld en is er precies één `[data-toaster]`; `Toaster` is geen export van
  `src/core/web/ui/toast.tsx` of `src/web/ui/index.ts` meer. Toets: `src/core/web/ui/toast.test.tsx`
- **schillen/AC-16** — Gegeven `ShellSessionProvider` onder `StrictMode`: mount de schil in een latere commit dan de
  provider (zoals na een async guard), ook met een `CenteredCard` als kind in dezelfde commit, dan blijft de focus op
  `body`; gegeven een `CenteredCard` en daarna een schil, of een
  schil die een andere vervangt, dan staat de focus op de `h1`; zonder provider alleen bij een wissel van `routeKey`. Toets: `src/core/web/ui/shell-contract.test.tsx` (nieuw)

**Deel B**

- **schillen/AC-10** — Gegeven een eigen schil op `ShellFrame` in een fixture, dan slaagt `shellContract`; een fixture die de
  skip-link weglaat, een tweede `main` rendert of `OfflineNotice` zelf nog eens plaatst, laat de suite falen. Toets: `src/core/web/ui/shell-contract.test.tsx` (nieuw)
- **schillen/AC-11** — Gegeven een component met `ShellFrame` zonder test met `shellContract`, een suite op een andere schil,
  of een layoutroute met een rauwe `main`, dan faalt `pnpm check:schillen`, noemt hij het bestand en verwijst hij naar de
  sectie "Een tweede schil" in het gouden pad; gegeven de bestaande kindroutes onder `/_app`, dan slaagt hij. Toets: `test/rails/check-schillen.test.ts` (nieuw)
- **schillen/AC-12** — Gegeven de fixture `src/web/features/layout/twee-schillen.test.tsx` met twee layoutroutes in een
  geheugenrouter, elk met een eigen schil, navigatielijst en `ThemeScope` met een fixturethema, wanneer de test van de ene
  naar de andere route navigeert, dan wisselen de schil en `data-app-theme` op de wrapper, staat de focus op de `h1` en staat
  er steeds precies één `main`, één `OfflineNotice` en één `[data-toaster]`; en een rol zonder `accounts:read` wordt door de guard van de tweede route geweigerd en ziet
  in de eerste schil geen link ernaartoe. De template-app krijgt geen tweede route of permissie. Toets: `src/web/features/layout/twee-schillen.test.tsx` (nieuw)
- **schillen/AC-13** — Gegeven de sectie "Een tweede schil" in `docs/gouden-pad.md`, dan noemt die `ShellFrame`,
  `shellContract`, `src/shared/permissions.ts`, `src/web/features/layout/`, `src/web/lib/nav.ts`, `e2e/shell.spec.ts` en de
  fixture uit AC-12, bestaat elk pad in backticks in die sectie (tekst die begint met `src/`, `e2e/`, `test/`, `docs/` of
  `.claude/` en geen `<` bevat), en verwijst de skill `nieuw-scherm` ernaar; ontbreekt een
  verwijzing of pad, dan faalt de test. Toets: `test/rails/check-schillen.test.ts` (nieuw)
- **schillen/AC-14** — Gegeven een bestand buiten `src/core/web/ui/`, `src/web/ui/` en testbestanden dat `ShellFrame`
  rendert, dan faalt `pnpm check:schillen`. Toets: `test/rails/check-schillen.test.ts` (nieuw)

## Randgevallen

| Situatie | Gedrag |
|---|---|
| Lange itemnaam in de topbalk | breekt niet af en verdringt geen acties: de naam kort af met een ellips, de volledige naam blijft de toegankelijke naam |
| Tekst op 200 % op 1280 px | de container query (drempel in `rem`) toont de menuknop zodra de items niet meer passen (AC-8) |
| Een schil binnen een schil | de contracttest faalt op twee `main`-elementen |
| Afdrukken vanuit `TopbarShell` | balk en navigatie verborgen, inhoud op volle breedte, licht thema |
| Schermen zonder schil (`/login`, `/uitnodiging`) | ongewijzigd: `CenteredCard`, geen frame; meldingen verschijnen er nu ook, via `ToastProvider` |
| Melding vlak voor een schilwissel | blijft staan: `ToastProvider` rendert de meldingen boven alle schillen (AC-15) |
| Inloggen en dan de app | focus op de `h1` van het eerste scherm in de app (AC-16) |
| Eerste scherm na laden, ook onder `StrictMode` en met een `CenteredCard` in de schil | de schil verplaatst de focus niet (AC-16) |
| Melding binnen een deel met een eigen `ThemeScope` | volgt het thema van het document, niet dat van het deel |
| Wissel naar een andere layoutroute | focus op de `h1` van het nieuwe scherm (AC-16) |

## Raakt ook

- `docs/framework.md` §7 (schillen en frame bij R-UI-02), R-WEB-01 (elke layoutroute een guard); `docs/gouden-pad.md`;
  `docs/ui-ux-patterns.md`; `docs/offline-en-print.md` (de melding zit in het frame, niet meer in `AppShell`).
- `scripts/kit/gates.mjs` (nieuwe check in `gate:fast`: gate-pad, eigenaarakkoord), `pnpm check:catalogus`, `pnpm ui:check`.
- `src/web/bundle-budget.ts`: `TopbarShell` zit in de startbundel, omdat `AppLayout` hem voor het catalogusvoorbeeld kan
  renderen (keuze eigenaar: echt wisselen); de toename moet binnen het bestaande budget passen.
- `src/web/features/layout/app-layout.tsx` (keuze van de schil op `/design-system`), `src/web/routes/_app/design-system.tsx`
  (zoekparameters `schil` en `items`), `src/web/features/design-system/vakken.ts` (vak "Schillen"),
  `src/core/web/ui/nav-link.tsx` (actief met zoekparameters), `src/web/main.tsx` (`ShellSessionProvider`),
  `test/ui/bundle.test.ts` (AC-17).
- Meldingen: `src/core/web/ui/toast.tsx` (provider rendert de meldingen, `Toaster` intern, commentaar bovenin),
  `src/web/ui/index.ts` (export weg), de acht tests met `<Toaster />` (reden in de PR), `docs/gouden-pad.md` regel 9,
  `.claude/rules/web.md` ("plaatsing van `Toaster`"), `docs/template-changelog.md` (nieuwe regel: "`Toaster` is geen export
  meer; verwijder een eigen `<Toaster />`"), `docs/roadmap.md` (toastitem noemt de AppShell).
- `.dependency-cruiser.mjs` en `eslint.config.js`: `src/core/web/ui/testing.tsx` bij de testing-regels (gate-paden,
  eigenaarakkoord met deze spec).
- De spec [app-thema](app-thema.md), randgeval over de `Toaster`: meldingen volgen het documentthema; wordt in deze PR
  aangepast (al gedaan).
- `package.json` (script `check:schillen`), `src/web/ui/index.ts` (export van `ShellFrame`, `SidebarShell`, `TopbarShell`,
  `ShellSessionProvider`), `src/core/web/ui/centered-card.tsx` (`useMarkScreenShown`),
  `src/web/features/design-system/example-targets.ts` (vak layout noemt `ShellSessionProvider`),
  `src/core/web/copy/ui.ts` (teksten "Meer", "Hoofdnavigatie"), `src/web/copy/ui.ts` (keuzes en voorbeelditems).
- De skill `nieuw-scherm` noemt de keuze van de layoutroute en verwijst naar het recept (beschermd pad; `.claude/skills/` is
  niet schrijfbaar vanuit de Bash-sandbox: Edit in de hoofdsessie met akkoord van de eigenaar).
- Volgorde: deel A na app-thema deel A (het mechanisme voor componenttokens); deel B na app-thema deel C, omdat AC-12
  `ThemeScope` gebruikt.

## Buiten scope

- Een schil met navigatie onderaan, een schil voor een vast opgesteld apparaat of een schil met twee kolommen in de inhoud: dat
  zijn eigen schillen van een app op het frame, geen deel van de template tot twee apps dezelfde nodig hebben (leerpunt).
- Breadcrumbs en paginakoppen (bestaande componenten binnen `main`).
- Een instelling waarmee een eindgebruiker de schil kiest.

## Testplan

- Deel A: de bestaande tests van `AppShell` ongewijzigd groen; de acht toasttests zonder eigen `<Toaster />` groen; de
  focus bij een mount, ook onder `StrictMode`; `NavLink` met zoekparameters; eenheidstests voor `TopbarShell`; de
  contracttest op beide; de bundeltest; e2e met de tekstvergroting.
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
