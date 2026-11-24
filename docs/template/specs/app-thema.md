---
status: voorstel # voorstel | goedgekeurd | vervallen — architect of hoofdsessie zet de status in het voorstel, de merge door de eigenaar is het besluit (ADR 0046); gebouwd volgt uit de AC-dekking (ADR 0104)
namespace: app-thema
---

# App-thema: componenttokens en meerdere thema's per app

Eerste van drie specs voor de opzet "Designsystem → Appstyling" (besluiten van de eigenaar, 2026-11-15): het designsystem zet de
basisstijl via variabelen, een app-laag past ze aan. De andere twee: [schillen](schillen.md) (twee schillen en eigen layouts) en
[stijlladder](stijlladder.md) (werkwijze en afdwinging). Vervolg op de specs [semantische-tokens](semantische-tokens.md) en
[klassenrail](klassenrail.md), beide gebouwd.

Stand nu: een app past alleen semantische tokens aan in `src/web/styles/theme.css` (R-UI-01). Daarmee verandert kleur, radius en
lettertype voor alles tegelijk; één component anders vormgeven (een hoekigere knop, een kaart zonder schaduw) kan alleen met een
nieuwe variant. En de kit zelf bevat nog maten buiten tokens (bijvoorbeeld `md:grid-cols-[16rem_1fr]` in
`src/core/web/ui/app-shell.tsx`), die een app dus niet kan bijstellen.

Wijzigt R-UI-01 (de componentlaag wordt ook een app-laag): de bouw-PR past de regel aan; dit is UI-werk, geen besluit-PR, tenzij
de reviewer het als kritiek aanmerkt.

Bouwen in drie delen, elk een eigen PR:

| Deel | Inhoud | AC's |
|---|---|---|
| **A — componenttokens** | tokens per recept in `src/core/web/styles/components.css`, recepten erop omgezet, grens van zes per component, contrasttest via de tokens, vindbaar in de feiten en op `/design-system`, nulmeting | AC-1 t/m AC-7, AC-5b, AC-18, AC-19 |
| **B — rail op de kit** | profiel `kit` van de lintregel `klassen` in `eslint.config.js` voor `src/core/web/ui` en `src/web/ui` | AC-8 t/m AC-10 |
| **C — thema's** | themaregister, `[data-app-theme]`, `ThemeScope`, contrast per thema, themakiezer op `/design-system` | AC-11 t/m AC-17 |

## Doel

Een app geeft elk basiscomponent en elk deel van de app een eigen uitstraling door alleen variabelen te zetten, in één of
meer thema's, zonder de kit te wijzigen en zonder losse styling in schermen.

## Rollen en wie wat ziet

Geen verschil per rol in productie: een thema is stijl, geen autorisatie, en mag nooit iets verbergen of tonen. De themakiezer
en het tokenoverzicht staan op `/design-system` achter `guard('design-system:read')` (R-WEB-08).

## Hergebruik en UX

**Deel A — componenttokens**

- **Niets gaat verloren** (eis van de eigenaar): elk token dat nu bestaat (`node scripts/kit/feiten.mjs tokens`), houdt zijn
  naam en standaardwaarde, en wat een app nu in `src/web/styles/theme.css` zet, werkt na de bouw hetzelfde. De bestaande
  basistokens in `components.css` (`--control-h`, `--focus-ring-width`, `--focus-ring-offset`, `--layer-*`, `--qr-*`) blijven
  zoals ze zijn.
- Elk component in de eerste set haalt vorm en kleur uit componenttokens `--<component>-<eigenschap>` in
  `src/core/web/styles/components.css`. Elk token heeft daar een standaard: een verwijzing naar een semantisch token of een
  ander componenttoken, of een letterlijke waarde als er geen semantisch token voor bestaat (schaduw, randdikte `1px`,
  `text-transform: none`, de huidige maximale breedte van de dialoog). De uitstraling zonder app-thema verandert niet.
- **Componentnamen**: een vaste lijst in `test/ui/componenttokens.test.ts`: `button`, `control`, `card`, `dialog`, `table`,
  `badge`, `tabs`, `notice`, `toast`, `shell` (spec [schillen](schillen.md)), plus de bestaande basisgroepen `focus-ring`,
  `layer` en `qr`, die buiten de grens van zes vallen. `--control-h` telt mee bij `control`.
- **Bronbestand per component** (dat de brontest van AC-4 leest): `src/core/web/ui/button-recipe.ts`, `input.tsx` (en de
  andere invoervelden), `card.tsx`, `dialog.tsx`, `table.tsx`, `status-badge.tsx`, `tabs.tsx`, `notice.tsx`, `toast.tsx`.
- **Afgeleide tokens rekenen mee in een deelthema** (eigenaar, 2026-11-24): een custom property met `var()` wordt uitgerekend
  op het element waar hij staat en erft daarna als vaste waarde. Daarom staan de standaarden in `components.css` op
  `:root, [data-app-theme]`, en zet een app haar componentoverrides in `theme.css` op dezelfde selector. Zo rekent
  `--control-bg: var(--background)` binnen een `ThemeScope` met de `--background` van dat thema, en geldt hetzelfde voor
  `--control-h: max(var(--density-control), 2.75rem)`.
- Een app overschrijft componenttokens in `src/web/styles/theme.css`, in het blok `:root, [data-app-theme]` of in een
  themablok (deel C), dat ná dat blok staat (gelijke specificiteit). Primitieve tokens (`--p-*`) blijven verboden als doel;
  als waarde mogen ze.
- **Klassen voor de tokens**: waar Tailwind een `@theme`-namespace heeft, krijgt het token een klasse via `@theme inline`
  (`--radius-button` → `rounded-button`, `--shadow-card` → `shadow-card`, `--font-weight-button`, `--spacing-button-x`,
  `--container-dialog`). Voor randdikte en hoofdletterstand bestaat geen namespace; daarvoor definieert core eigen klassen
  met `@utility` in `src/core/web/styles/` (zoals `border-button`, `border-control`, `case-button`) (eigenaar,
  2026-11-24). Geen nieuwe `[…]`- of `(…)`-waarde in de kit; bestaande staan in de baseline van deel B tot ze weg zijn.
- **Hooguit zes tokens per component** (test). Past de wens niet in zes, dan is het een variant (de [stijlladder](stijlladder.md)).
- **Gedeelde tokens voor invoer**: `Input`, `Select`, `Textarea`, `Combobox`, `DateInput` en `PasswordInput` delen één set
  `--control-*` (naast het bestaande `--control-h`), zodat velden onderling gelijk blijven.
- **Eerste set** (OV-1): `button` (radius, font-weight, padding-x, border-width, shadow, text-transform), `control` (h,
  radius, border-width, bg, fg, padding-x), `card` (radius, shadow, border-width, padding-y), `dialog` (radius, shadow,
  max-width), `table` (header-bg, header-fg, row-border, cell-padding-y), `badge` (radius, font-weight), `tabs`
  (indicator-width, radius), `notice` (radius, border-width), `toast` (radius, shadow). `--card-padding-y` vervangt de
  huidige `py-6` in `card.tsx` met dezelfde waarde. De schil krijgt haar tokens in de spec schillen.
- **Wat een componenttoken nooit kan**: een bediening lager dan 44 px (de bestaande `max()` in `--control-h` blijft), een
  focusring smaller dan 2 px, of een kleurpaar onder het contrast van R-UI-06. Voor de focusring komt er een invoertoken
  zoals bij de hoogte: een app zet `--density-focus-ring`, en `--focus-ring-width: max(var(--density-focus-ring), 2px)`
  (standaard `2px`, dus gelijk aan nu). Wie nu `--focus-ring-width` direct zet, houdt dat werkend (het token blijft bestaan),
  maar de contrasttest faalt als de waarde onder 2 px komt. Een kleurtoken van een component bestaat
  alleen als paar (`--<component>-bg` met `--<component>-fg`); de contrasttest rekent elk paar door.
- **Vindbaar**: `node scripts/kit/feiten.mjs tokens` toont per token de laag, het component en de standaard; het tabblad Tokens
  op `/design-system` krijgt een sectie "Componenttokens" met dezelfde lijst en de berekende waarde. De JSON-vorm krijgt die
  velden erbij; bestaande velden (`licht`, `donker`, `bron`) blijven, en `test/ui/tokens-catalogus.test.ts` gaat mee.
- **Nulmeting**: vóór deel A neemt de bouwer van `main` op: (1) elke tokendeclaratie uit
  `src/core/web/styles/primitives.css`, `semantic.css` en `components.css` met haar opgeloste waarde (licht en donker), in
  `test/ui/fixtures/tokens-voor-app-thema.json`; (2) de berekende stijl van elk component in de eerste set, in
  `e2e/fixtures/app-thema-baseline.json` (375 en 1280 px, licht en donker, zonder app-thema en met de stijlvariant uit
  AC-18). AC-1, AC-18 en AC-19 vergelijken daartegen.
- **Stijlvarianten in e2e**: een test die andere tokenwaarden nodig heeft (AC-2, AC-5b, AC-18), zet die niet in
  `theme.css` maar laadt een fixturebestand uit `e2e/fixtures/app-thema/` als extra stylesheet van dezelfde origin: hij
  serveert het met `page.route` en voegt het toe met `page.addStyleTag({ url })`. Geen inline-stijl, dus de CSP
  (`style-src 'self'`) blijft gelden; de nulmeting op `main` gebruikt dezelfde manier.

**Deel B — rail op de kit**

- Een eigen lintregel `rails/klassen-kit` (de bestaande regel `klassen` is één `no-restricted-syntax` met één vaste melding
  en blijft ongewijzigd) voor `src/core/web/ui` en `src/web/ui`. Hij leest classstrings in `className`, `cn(…)` en
  CVA-recepten. Verboden: arbitrary values (`w-[…]`, `grid-cols-[…]`, ook met een `var()` erin, en de vorm `border-(--x)`),
  hex- en `oklch`-kleuren, `style` met een vaste waarde, `!` en `dark:`. Toegestaan: elke token-klasse uit `@theme` en
  `@utility`, layout-klassen, en arbitrary variants (`[&_svg]:size-4`, `data-[active=true]:`, `aria-[invalid=true]:`).
- Een maat die nu arbitrary is, wordt een token en een klasse via `@theme` (bijvoorbeeld `--shell-sidebar-width` →
  `grid-cols-shell`). Bestaande overtredingen staan na de bouw op nul; lukt dat voor een bestand niet in deze PR, dan staat het
  in de ratchet-baseline met een roadmapregel (R-CI-02), nooit in een uitzonderingenlijst in de regel zelf.
  `src/core/web/ui/app-shell.tsx` is van de spec schillen (deel A): wordt die later gebouwd dan deel B, dan staat
  `md:grid-cols-[16rem_1fr]` tot dan in de baseline.

**Deel C — thema's**

- **Register**: `src/web/styles/themes.ts` exporteert `themes = defineThemes({ … })` (`defineThemes` uit
  `src/core/web/lib/theme.ts`). Elke sleutel is een themanaam (kebab-case); de waarde heeft `label` (Nederlands, voor een
  kiezer). `defineThemes` staat in core en krijgt het register als argument; `src/web/main.tsx` geeft het door aan
  `applyStoredTheme` en `setAppTheme` (R-LAAG-02), zodat core het register van de app niet importeert.
- **Twee voorbeeldthema's** (eigenaar, 2026-11-24): de template levert twee thema's mee, `strak` ("Strak": hoekig, geen
  schaduw) en `zacht` ("Zacht": ronder, zachtere schaduw), met een blok in `theme.css` voor licht en donker. Ze laten zien hoe
  een thema werkt en zijn de thema's waar de e2e en de contrasttest mee rekenen. Zonder keuze geldt `:root`: de standaard
  uitstraling blijft gelijk. Een app haalt ze weg of vervangt ze.
- **CSS**: een thema is een blok `[data-app-theme='<naam>'] { … }` in `src/web/styles/theme.css`, met optioneel
  `[data-theme='dark'] [data-app-theme='<naam>'], [data-app-theme='<naam>'][data-theme='dark'] { … }` voor donker. Licht en
  donker (`data-theme`) blijven een eigen as: elk thema werkt in beide.
- **Toepassen**: op het hele document met `setAppTheme(naam | null)` (bewaard in `localStorage` onder `app-thema`, naast de
  bestaande `thema`; onbekende of verwijderde naam valt terug op geen thema), of op een deel van de app met het nieuwe
  component `ThemeScope` (`<ThemeScope theme="…">`), dat alleen een `div` met `data-app-theme` en `display: contents` rendert.
  Zo krijgt bijvoorbeeld een tweede schil een eigen thema.
- **Geen kiezer voor eindgebruikers**: de template levert geen themakiezer voor eindgebruikers. `/design-system` krijgt een kiezer die
  de voorbeelden in een gekozen thema toont (alleen die pagina, niet bewaard).
- **Bestaande componenten**: `Select` voor de kiezer op `/design-system`, `TokenSwatch`, `Tabs`. Nieuw: `ThemeScope` (reden:
  een thema op een deelboom zetten kan anders alleen met een rauwe `div` en een `data-`-attribuut in een feature).
- **Staten per scherm**: geen data, dus geen laden, leeg of fout; de kiezer wisselt direct.
- **Alle zichtbare tekst letterlijk** (`src/core/web/copy/ui.ts`): kiezerlabel "Thema"; eerste optie "Standaard"; sectiekop
  "Componenttokens"; kolomkoppen "Token" / "Component" / "Standaard" / "Waarde".
- **Focusvolgorde en toetsenbord**: de kiezer is een gewone `Select` vóór de tabbladen; een themawissel verplaatst de focus niet.

## Kopieer de vorm van

- `src/core/web/styles/components.css` — laag 3 met `--control-h`: token met een ondergrens via `max()`.
- `src/core/web/styles/semantic.css` — `:root` en `[data-theme='dark']` als blokken die de contrasttest leest.
- `src/web/styles/theme.css` — de app-laag die standaardwaarden overschrijft.
- `src/core/web/ui/button-recipe.ts` — één CVA-recept per component.
- `src/core/web/lib/theme.ts` — bewaren in `localStorage` met terugval als opslag ontbreekt.
- `test/ui/contrast.test.ts` — paren lezen uit de CSS en per receptvariant doorrekenen.
- `test/ui/tokens-catalogus.test.ts` — elk token vindbaar op `/design-system`.
- `src/web/ui/token-swatch.tsx` — voorbeeld van een token op `/design-system`.

## Acceptatiecriteria

**Deel A**

- **app-thema/AC-1** — Gegeven geen gekozen app-thema en geen stijlvariant, dan is de berekende stijl van elk component in de eerste
  set gelijk aan de nulmeting in `e2e/fixtures/app-thema-baseline.json` (radius, schaduw, gewicht, padding, randdikte en
  kleuren op 375 en 1280 px, licht en donker). Toets: `e2e/app-thema.spec.ts` (nieuw)
- **app-thema/AC-2** — Gegeven `--button-radius` in `theme.css`, dan heeft elke `Button`-variant die radius en verandert geen
  ander component; gegeven `--control-radius`, dan hebben `Input`, `Select`, `Textarea`, `Combobox`, `DateInput` en
  `PasswordInput` dezelfde radius. Toets: `e2e/app-thema.spec.ts` (nieuw)
- **app-thema/AC-3** — Gegeven een component met meer dan zes tokens in `components.css`, of een token waarvan het voorvoegsel
  niet in de lijst met componentnamen staat, dan faalt de test en noemt hij het component; de basisgroepen `focus-ring`,
  `layer` en `qr` tellen niet mee voor de zes. Toets: `test/ui/componenttokens.test.ts` (nieuw)
- **app-thema/AC-4** — Gegeven een recept in de eerste set, dan gebruikt het voor de eigenschappen uit zijn tokenlijst geen
  semantisch token of vaste klasse meer, alleen het componenttoken (brontest op de recepttekst). Toets: `test/ui/componenttokens.test.ts` (nieuw)
- **app-thema/AC-5** — Gegeven een `theme.css` die een componentkleurpaar onder de contrastgrens zet, dan faalt de
  contrasttest en noemt hij het paar; gegeven `--focus-ring-width` direct onder 2 px, dan faalt dezelfde test. Toets: `test/ui/contrast-componenttokens.test.ts` (nieuw)
- **app-thema/AC-5b** — Gegeven `--density-control: 2rem` of `--density-focus-ring: 1px` in `theme.css`, dan is de berekende
  hoogte van een `Button` 44 px en de focusring 2 px. `--density-focus-ring` staat in `semantic.css`, naast
  `--density-control`. Toets: `e2e/app-thema.spec.ts` (nieuw)
- **app-thema/AC-6** — Gegeven `theme.css` met een primitief token (`--p-*`) als doel van een toewijzing, dan faalt de test. Toets: `test/ui/componenttokens.test.ts` (nieuw)
- **app-thema/AC-7** — Gegeven `node scripts/kit/feiten.mjs tokens --json`, dan heeft elk componenttoken `laag`, `component` en
  `standaard`, en staat elk token in de sectie "Componenttokens" op `/design-system`. Toets: `test/ui/tokens-catalogus.test.ts`
- **app-thema/AC-18** — Gegeven een stijlvariant die alleen bestaande semantische tokens op `:root` zet (`--radius`,
  `--primary`, `--density-control`, `--font-family-sans`), zoals een app nu in `theme.css` doet, dan is de berekende stijl
  gelijk aan de nulmeting met diezelfde variant. Toets: `e2e/app-thema.spec.ts` (nieuw)
- **app-thema/AC-19** — Gegeven de tokendeclaraties uit de nulmeting (`test/ui/fixtures/tokens-voor-app-thema.json`, alle
  drie de lagen, ook `--control-h`, `--focus-ring-*` en `--qr-*`), dan bestaat elk token na de bouw nog met dezelfde naam
  en dezelfde opgeloste waarde, licht en donker; de tekst van de declaratie mag veranderen (zoals
  `--focus-ring-width: max(var(--density-focus-ring), 2px)`, opgelost nog steeds `2px`). Toets: `test/ui/componenttokens.test.ts` (nieuw)

**Deel B**

- **app-thema/AC-8** — Gegeven een bestand in `src/core/web/ui` of `src/web/ui` met `w-[13rem]`, `grid-cols-[16rem_1fr]`,
  `bg-[var(--x)]`, `border-(--x)`, `text-[#fff]`, `!mt-0`, `dark:bg-card` of `style={{ width: 240 }}`, in `className`, `cn(…)`
  of een CVA-recept, dan meldt `rails/klassen-kit` elk geval; `[&_svg]:size-4`, `data-[active=true]:bg-accent` en een `style`
  met alleen een berekende waarde uit props (zoals een voortgangsbreedte) zijn toegestaan. Toets: `test/rails/eslint-klassen-kit.test.ts` (nieuw)
- **app-thema/AC-9** — Gegeven de kit na de bouw, dan geeft de rail nul meldingen in `src/core/web/ui` en `src/web/ui`, of
  staat elk resterend paar (bestand, regel) in `eslint-suppressions.json` met een roadmapregel. Toets: `test/rails/eslint-klassen-kit.test.ts` (nieuw)
- **app-thema/AC-10** — Gegeven de bestaande regel `klassen` voor `features/` en `routes/`, dan is zijn gedrag ongewijzigd
  (de bestaande fixtures blijven groen). Toets: `test/rails/eslint-klassen-kit.test.ts` (nieuw)

**Deel C**

- **app-thema/AC-11** — Gegeven een thema in het register zonder blok in `theme.css`, een blok zonder registratie, of een
  themablok dat een token zet dat niet bestaat, dan faalt de test en noemt hij de naam. Toets: `test/ui/themas.test.ts` (nieuw)
- **app-thema/AC-12** — Gegeven twee thema's, dan slaagt de contrasttest alleen als elk kleurpaar in elk thema voldoet, licht
  én donker; een thema dat één paar breekt, faalt met thema, modus en paar in de melding. Toets: `test/ui/contrast-themas.test.ts` (nieuw)
- **app-thema/AC-13** — Gegeven `setAppTheme('a')`, dan heeft `<html>` `data-app-theme="a"` en is de keuze na herladen terug;
  `setAppTheme(null)` haalt het attribuut weg; een bewaarde naam die niet in het register staat, wordt genegeerd en gewist. Toets: `src/core/web/lib/theme-app.test.ts` (nieuw)
- **app-thema/AC-14** — Gegeven `ThemeScope` met `zacht` binnen een document met `strak`, dan rekenen componenten erbinnen
  met de tokens van `zacht` en erbuiten met die van `strak`, ook een `Dialog` die binnen de scope geopend wordt; een
  scopethema dat alleen een semantisch token zet (`--background`, `--radius`), verandert ook de afgeleide componenttokens
  in de scope; tokens die het scopethema niet zelf zet, erven van het document; `ThemeScope` voegt geen box toe aan de layout. Toets: `e2e/app-thema.spec.ts` (nieuw)
- **app-thema/AC-15** — Gegeven licht en donker, dan werkt de bestaande `ThemeToggle` ongewijzigd in elk thema en blijft de
  sleutel `thema` los van `app-thema`. Toets: `src/core/web/lib/theme-app.test.ts` (nieuw)
- **app-thema/AC-16** — Gegeven `/design-system` met de twee meegeleverde thema's, dan toont de kiezer "Standaard", "Strak"
  en "Zacht", wisselen de voorbeelden mee (behalve meldingen, die het documentthema volgen) en verandert `<html>` niet. Toets: `e2e/app-thema.spec.ts` (nieuw)
- **app-thema/AC-17** — Gegeven een register zonder thema's (`defineThemes({})`), dan rendert de catalogus geen kiezer en zet
  `applyStoredTheme` geen `data-app-theme`. Toets: `src/core/web/lib/theme-app.test.ts` (nieuw)

## Randgevallen

| Situatie | Gedrag |
|---|---|
| `Toaster` (één voor de hele app, in `ToastProvider`) en de offline-melding (in de schil) staan buiten een `ThemeScope` in de inhoud | de `Toaster` volgt altijd het thema van het document (spec [schillen](schillen.md), eigenaar 2026-11-24); de offline-melding volgt het document of de scope om de schil |
| Afdrukken | het lichte thema, zoals nu; het app-thema blijft staan |
| Een thema zet een token dat niet bestaat | de test van AC-11 faalt op het onbekende token |
| `localStorage` ontbreekt of weigert | het thema geldt tot herladen, zoals bij licht en donker |
| Een lettertype per thema | mag: `--font-family-sans` is een semantisch token; het bestand staat in de app (spec semantische-tokens) |
| Een app zet nu `--focus-ring-width` of `--density-control` | blijft werken; onder de ondergrens houdt de `max()` of de contrasttest het tegen (AC-5, AC-5b) |
| Een app had componentoverrides alleen op `:root` | werken voor het hele document; binnen een `ThemeScope` gelden ze pas als ze op `:root, [data-app-theme]` staan (gouden pad en changelog noemen dat) |

## Raakt ook

- `docs/framework.md`: R-UI-01 (componentlaag is ook app-laag, grens van zes), R-UI-04 en R-UI-05 (rail geldt ook voor de kit).
- `test/ui/contrast.test.ts`, `test/ui/semantische-tokens-3b.test.ts` en `test/ui/semantische-tokens.test.ts`: wijzigen mag
  omdat deze spec het getoetste gedrag uitbreidt; de tester doet het en de PR noemt het (R-TEST-02).
- `src/core/web/styles/index.css` (`@theme inline` voor de nieuwe klassen, `@utility` voor randdikte en hoofdletterstand),
  `src/core/web/lib/theme.ts` (`defineThemes`, `setAppTheme`), `src/web/main.tsx` (register doorgeven),
  `src/web/styles/themes.ts` en `src/web/styles/theme.css` (de twee voorbeeldthema's), `scripts/kit/feiten.mjs`
  (sectie tokens), `eslint.config.js` en `rails/` (nieuwe regel; gate-paden, eigenaarakkoord).
- `docs/framework.md` (beschermd pad): de wijziging van R-UI-01 gaat langs de eigenaar.
- `docs/design-system-catalogue.md`, `docs/ui-kit-basics.md` en de skill `ontwerp-overnemen` (de tabel "Tokens" in
  `docs/ontwerp/_template.md` krijgt een kolom voor de laag); `.claude/rules/web.md`. Skill en regels zijn beschermde paden.
- `pnpm check:catalogus`, `pnpm ui:check`, het bundelbudget (`src/web/bundle-budget.ts`): `themes.ts` en de twee themablokken
  tellen mee in de startbundel.
- De spec [schillen](schillen.md): de fixture "twee schillen" kan de meegeleverde thema's gebruiken.
- `docs/template-changelog.md`: de voorbeeldthema's staan in `src/web/styles/theme.css` en `themes.ts`, de app-zone; een app
  die `theme.css` al aanpaste, krijgt bij de template-merge een conflict en kiest zelf of ze de voorbeelden houdt.

## Buiten scope

- Een themakiezer voor eindgebruikers en een thema per gebruiker op de server.
- Een thema dat automatisch het systeemthema volgt (`matchMedia` is uitgesloten, R-WEB-01).
- Componenttokens voor elk component: alleen de eerste set; de rest op aanleiding via de stijlladder.
- Schillen en layouts (spec schillen); wie welke trede mag nemen (spec stijlladder).

## Testplan

- Deel A: eerst de nulmeting (tokenlijst en berekende stijlen van `main`), dan brontests op `components.css` en de
  componenten, contrasttest, e2e tegen de nulmeting.
- Deel B: tabeltests voor de rail met falende fixtures per verboden vorm (R-PRINC-04), daarna de kit zelf.
- Deel C: eenheidstests voor het register en de opslag, contrasttest per thema, e2e met de twee meegeleverde thema's.
- `pnpm gate:fast`, `pnpm ui:check`, `pnpm check:catalogus` en `pnpm ratchet` groen; uitslag in de PR.

## Open vragen

Een vraag zonder aanbeveling (de eigenaar kiest) blokkeert `goedgekeurd`; een vraag met aanbeveling mag blijven staan. `check-docs` telt elke regel in deze sectie met het waarschuwingsteken en "open" (ook met U+FE0F of hoofdletter, ook zonder opsommingsteken).

- **OV-1** — Welke componenten en eigenschappen in de eerste set. Aanbeveling: de negen uit "Hergebruik en UX"; het zijn de
  componenten die een merkstijl het eerst raakt, en elk blijft onder de zes.
- **OV-2 ✅ besloten** — De grens van zes componenttokens per component is een test, geen afspraak (eigenaar, 2026-11-15).
- **OV-3 ✅ besloten** — Meerdere thema's per app: het mechanisme plus twee voorbeeldthema's (eigenaar, 2026-11-15 en
  2026-11-24).
- **OV-7 ✅ besloten** — Afgeleide tokens rekenen mee in een deelthema via de selector `:root, [data-app-theme]`; randdikte
  en hoofdletterstand via `@utility` in core; schaduw en andere waarden zonder semantisch token als letterlijke standaard in
  `components.css` (eigenaar, 2026-11-24).
- **OV-4 ✅ besloten** — De UI-rail geldt ook voor de eigen kit van de template (eigenaar, 2026-11-15).
- **OV-5** — Een thema op een deel van de app via `ThemeScope`, naast het hele document. Aanbeveling: ja; zonder kan een app
  met twee schillen ze niet elk een eigen uitstraling geven.
- **OV-6** — Of `bg-[var(--token)]` in de kit mag blijven. Aanbeveling: nee; elke maat of kleur die de kit nodig heeft, krijgt
  een klasse via `@theme`, zodat de rail geen uitzondering op inhoud hoeft te beoordelen.
