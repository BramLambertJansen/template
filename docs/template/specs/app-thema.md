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
| **A — componenttokens** | tokens per recept in `src/core/web/styles/components.css`, recepten erop omgezet, grens van zes per component, contrasttest via de tokens, vindbaar in de feiten en op `/design-system` | AC-1 t/m AC-7 |
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

- Elk recept in `src/core/web/ui` haalt vorm en kleur uit componenttokens `--<component>-<eigenschap>` in
  `src/core/web/styles/components.css`. Elk token heeft daar een standaard die naar een semantisch token of een ander
  componenttoken wijst; de uitstraling zonder app-thema verandert niet.
- Een app overschrijft componenttokens in `src/web/styles/theme.css`, in hetzelfde `:root`-blok als de semantische tokens of in
  een themablok (deel C). Primitieve tokens (`--p-*`) blijven verboden als doel; als waarde mogen ze.
- **Hooguit zes tokens per component** (test). Past de wens niet in zes, dan is het een variant (de [stijlladder](stijlladder.md)).
- **Gedeelde tokens voor invoer**: `Input`, `Select`, `Textarea`, `Combobox`, `DateInput` en `PasswordInput` delen één set
  `--control-*` (naast het bestaande `--control-h`), zodat velden onderling gelijk blijven.
- **Eerste set** (OV-1): `button` (radius, font-weight, padding-x, border-width, shadow, text-transform), `control` (radius,
  border-width, bg, padding-x), `card` (radius, shadow, border-width, padding), `dialog` (radius, shadow, max-width), `table`
  (header-bg, row-border, cell-padding-y), `badge` (radius, font-weight), `tabs` (indicator-width, radius), `notice` (radius,
  border-width), `toast` (radius, shadow). De schil krijgt haar tokens in de spec schillen.
- **Wat een componenttoken nooit kan**: de focusring smaller dan `--focus-ring-width`, een bediening lager dan 44 px (de bestaande
  `max()` in `--control-h` blijft), of een kleurpaar onder het contrast van R-UI-06. Een kleurtoken van een component bestaat
  alleen als paar (`--<component>-bg` met `--<component>-fg`); de contrasttest rekent elk paar door.
- **Vindbaar**: `node scripts/kit/feiten.mjs tokens` toont per token de laag, het component en de standaard; het tabblad Tokens
  op `/design-system` krijgt een sectie "Componenttokens" met dezelfde lijst en de berekende waarde.

**Deel B — rail op de kit**

- De lintregel `klassen` in `eslint.config.js` krijgt een tweede profiel `kit` voor `src/core/web/ui` en `src/web/ui`. Verboden: arbitrary values
  (`w-[…]`, `grid-cols-[…]`, ook met een `var()` erin), hex- en `oklch`-kleuren, `style` met een vaste waarde, en `!`.
  Toegestaan: elke token-klasse uit `@theme`, layout-klassen, `dark:` niet (dark loopt via tokens).
- Een maat die nu arbitrary is, wordt een token en een klasse via `@theme` (bijvoorbeeld `--shell-sidebar-width` →
  `grid-cols-shell`). Bestaande overtredingen staan na de bouw op nul; lukt dat voor een bestand niet in deze PR, dan staat het
  in de ratchet-baseline met een roadmapregel (R-CI-02), nooit in een uitzonderingenlijst in de regel zelf.

**Deel C — thema's**

- **Register**: `src/web/styles/themes.ts` exporteert `themes = defineThemes({ … })` (`defineThemes` uit
  `src/core/web/lib/theme.ts`). Elke sleutel is een themanaam (kebab-case); de waarde heeft `label` (Nederlands, voor een
  kiezer). De template levert `defineThemes({})`: zonder thema geldt `:root`.
- **CSS**: een thema is een blok `[data-app-theme='<naam>'] { … }` in `src/web/styles/theme.css`, met optioneel
  `[data-theme='dark'] [data-app-theme='<naam>'], [data-app-theme='<naam>'][data-theme='dark'] { … }` voor donker. Licht en
  donker (`data-theme`) blijven een eigen as: elk thema werkt in beide.
- **Toepassen**: op het hele document met `setAppTheme(naam | null)` (bewaard in `localStorage` onder `app-thema`, naast de
  bestaande `thema`; onbekende of verwijderde naam valt terug op geen thema), of op een deel van de app met het nieuwe
  component `ThemeScope` (`<ThemeScope theme="…">`), dat alleen een `div` met `data-app-theme` en `display: contents` rendert.
  Zo krijgt bijvoorbeeld een tweede schil een eigen thema.
- **Alleen het mechanisme**: de template levert geen themakiezer voor eindgebruikers. `/design-system` krijgt een kiezer die
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

- **app-thema/AC-1** — Gegeven een lege `src/web/styles/theme.css`, dan is de berekende stijl van elk recept in de eerste set
  gelijk aan die van vóór deze spec (zelfde radius, schaduw, gewicht, padding en kleuren op 375 en 1280 px, licht en donker). Toets: `e2e/app-thema.spec.ts` (nieuw)
- **app-thema/AC-2** — Gegeven `--button-radius` in `theme.css`, dan heeft elke `Button`-variant die radius en verandert geen
  ander component; gegeven `--control-radius`, dan hebben `Input`, `Select`, `Textarea`, `Combobox`, `DateInput` en
  `PasswordInput` dezelfde radius. Toets: `e2e/app-thema.spec.ts` (nieuw)
- **app-thema/AC-3** — Gegeven een component met meer dan zes tokens in `components.css`, of een token waarvan het voorvoegsel
  geen bestaand recept is, dan faalt de test en noemt hij het component. Toets: `test/ui/componenttokens.test.ts` (nieuw)
- **app-thema/AC-4** — Gegeven een recept in de eerste set, dan gebruikt het voor de eigenschappen uit zijn tokenlijst geen
  semantisch token of vaste klasse meer, alleen het componenttoken (brontest op de recepttekst). Toets: `test/ui/componenttokens.test.ts` (nieuw)
- **app-thema/AC-5** — Gegeven een `theme.css` die een componentkleurpaar onder de contrastgrens zet, `--focus-ring-width`
  verkleint of `--density-control` onder 44 px zet, dan faalt de contrasttest respectievelijk blijft de berekende maat op de
  ondergrens. Toets: `test/ui/contrast-componenttokens.test.ts` (nieuw)
- **app-thema/AC-6** — Gegeven `theme.css` met een primitief token (`--p-*`) als doel van een toewijzing, dan faalt de test. Toets: `test/ui/componenttokens.test.ts` (nieuw)
- **app-thema/AC-7** — Gegeven `node scripts/kit/feiten.mjs tokens --json`, dan heeft elk componenttoken `laag`, `component` en
  `standaard`, en staat elk token in de sectie "Componenttokens" op `/design-system`. Toets: `test/ui/tokens-catalogus.test.ts`

**Deel B**

- **app-thema/AC-8** — Gegeven een bestand in `src/core/web/ui` of `src/web/ui` met `w-[13rem]`, `grid-cols-[16rem_1fr]`,
  `bg-[var(--x)]`, `text-[#fff]`, `!mt-0`, `dark:bg-card` of `style={{ width: 240 }}`, dan meldt de rail elk geval met de naam
  van het token of de helper die het vervangt; een `style` met alleen een berekende waarde uit props (zoals een
  voortgangsbreedte) is toegestaan. Toets: `test/rails/eslint-klassen-kit.test.ts` (nieuw)
- **app-thema/AC-9** — Gegeven de kit na de bouw, dan geeft de rail nul meldingen in `src/core/web/ui` en `src/web/ui`, of
  staat elk resterend paar (bestand, regel) in `eslint-suppressions.json` met een roadmapregel. Toets: `test/rails/eslint-klassen-kit.test.ts` (nieuw)
- **app-thema/AC-10** — Gegeven het profiel `features` van dezelfde rail, dan is zijn gedrag ongewijzigd (de bestaande
  fixtures blijven groen). Toets: `test/rails/eslint-klassen-kit.test.ts` (nieuw)

**Deel C**

- **app-thema/AC-11** — Gegeven een thema in het register zonder blok in `theme.css`, of een blok zonder registratie, dan
  faalt de test en noemt hij de naam. Toets: `test/ui/themas.test.ts` (nieuw)
- **app-thema/AC-12** — Gegeven twee thema's, dan slaagt de contrasttest alleen als elk kleurpaar in elk thema voldoet, licht
  én donker; een thema dat één paar breekt, faalt met thema, modus en paar in de melding. Toets: `test/ui/contrast-themas.test.ts` (nieuw)
- **app-thema/AC-13** — Gegeven `setAppTheme('a')`, dan heeft `<html>` `data-app-theme="a"` en is de keuze na herladen terug;
  `setAppTheme(null)` haalt het attribuut weg; een bewaarde naam die niet in het register staat, wordt genegeerd en gewist. Toets: `src/core/web/lib/theme-app.test.ts` (nieuw)
- **app-thema/AC-14** — Gegeven `ThemeScope` met thema `a` binnen een document met thema `b`, dan rekenen componenten erbinnen
  met de tokens van `a` en erbuiten met die van `b`, ook een `Dialog` die binnen de scope geopend wordt; `ThemeScope` voegt
  geen box toe aan de layout. Toets: `e2e/app-thema.spec.ts` (nieuw)
- **app-thema/AC-15** — Gegeven licht en donker, dan werkt de bestaande `ThemeToggle` ongewijzigd in elk thema en blijft de
  sleutel `thema` los van `app-thema`. Toets: `src/core/web/lib/theme-app.test.ts` (nieuw)
- **app-thema/AC-16** — Gegeven `/design-system` met twee geregistreerde thema's, dan toont de kiezer "Standaard" en beide
  labels, wisselen de voorbeelden mee en verandert `<html>` niet. Toets: `e2e/app-thema.spec.ts` (nieuw)
- **app-thema/AC-17** — Gegeven een app zonder thema's (`defineThemes({})`), dan staat er geen kiezer en geen
  `data-app-theme` in de DOM. Toets: `e2e/app-thema.spec.ts` (nieuw)

## Randgevallen

| Situatie | Gedrag |
|---|---|
| `Toaster` (één voor de hele app, in `ToastProvider`) en de offline-melding (in de schil) staan buiten een `ThemeScope` in de inhoud | de `Toaster` volgt altijd het thema van het document (spec [schillen](schillen.md), eigenaar 2026-11-24); de offline-melding volgt het document of de scope om de schil |
| Afdrukken | het lichte thema, zoals nu; het app-thema blijft staan |
| Een thema zet een token dat niet bestaat | de test van AC-11 faalt op het onbekende token |
| `localStorage` ontbreekt of weigert | het thema geldt tot herladen, zoals bij licht en donker |
| Een lettertype per thema | mag: `--font-sans` is een semantisch token; het bestand staat in de app (spec semantische-tokens) |

## Raakt ook

- `docs/framework.md`: R-UI-01 (componentlaag is ook app-laag, grens van zes), R-UI-04 en R-UI-05 (rail geldt ook voor de kit).
- `test/ui/contrast.test.ts` en `test/ui/semantische-tokens-3b.test.ts`: wijzigen mag omdat deze spec het getoetste gedrag
  uitbreidt; de tester doet het en de PR noemt het (R-TEST-02).
- `docs/design-system-catalogue.md`, `docs/ui-kit-basics.md` en de skill `ontwerp-overnemen` (de tabel "Tokens" in
  `docs/ontwerp/_template.md` krijgt een kolom voor de laag); `.claude/rules/web.md`. Skill en regels zijn beschermde paden.
- `pnpm check:catalogus`, `pnpm ui:check`, het bundelbudget (`src/web/bundle-budget.ts`): `themes.ts` telt mee in de startbundel.

## Buiten scope

- Een themakiezer voor eindgebruikers en een thema per gebruiker op de server.
- Een thema dat automatisch het systeemthema volgt (`matchMedia` is uitgesloten, R-WEB-01).
- Componenttokens voor elk component: alleen de eerste set; de rest op aanleiding via de stijlladder.
- Schillen en layouts (spec schillen); wie welke trede mag nemen (spec stijlladder).

## Testplan

- Deel A: brontests op `components.css` en de recepten, contrasttest, e2e met berekende stijlen vóór en na.
- Deel B: tabeltests voor de rail met falende fixtures per verboden vorm (R-PRINC-04), daarna de kit zelf.
- Deel C: eenheidstests voor het register en de opslag, contrasttest per thema, e2e met twee testthema's uit een fixture.
- `pnpm gate:fast`, `pnpm ui:check`, `pnpm check:catalogus` en `pnpm ratchet` groen; uitslag in de PR.

## Open vragen

Een vraag zonder aanbeveling (de eigenaar kiest) blokkeert `goedgekeurd`; een vraag met aanbeveling mag blijven staan. `check-docs` telt elke regel in deze sectie met het waarschuwingsteken en "open" (ook met U+FE0F of hoofdletter, ook zonder opsommingsteken).

- **OV-1** — Welke componenten en eigenschappen in de eerste set. Aanbeveling: de negen uit "Hergebruik en UX"; het zijn de
  componenten die een merkstijl het eerst raakt, en elk blijft onder de zes.
- **OV-2 ✅ besloten** — De grens van zes componenttokens per component is een test, geen afspraak (eigenaar, 2026-11-15).
- **OV-3 ✅ besloten** — Meerdere thema's per app: nu alleen het mechanisme (eigenaar, 2026-11-15).
- **OV-4 ✅ besloten** — De UI-rail geldt ook voor de eigen kit van de template (eigenaar, 2026-11-15).
- **OV-5** — Een thema op een deel van de app via `ThemeScope`, naast het hele document. Aanbeveling: ja; zonder kan een app
  met twee schillen ze niet elk een eigen uitstraling geven.
- **OV-6** — Of `bg-[var(--token)]` in de kit mag blijven. Aanbeveling: nee; elke maat of kleur die de kit nodig heeft, krijgt
  een klasse via `@theme`, zodat de rail geen uitzondering op inhoud hoeft te beoordelen.
