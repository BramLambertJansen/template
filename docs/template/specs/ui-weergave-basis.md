---
status: goedgekeurd
namespace: ui-weergave-basis
sjabloon: mini
scope: functionele-ui
---

# Avatar, Image en StatTile

## Doel

Geef elke nieuwe app drie weergave-basiscomponenten in de kit: een Avatar (foto of initialen), een losse Image met vaste
beeldverhouding en fout-fallback, en een StatTile (KPI-tegel) voor dashboards, met voorbeelden op `/design-system`.

## Rollen en wie wat ziet

Geen nieuwe rollen of rechten. De componenten kennen geen accounts of sessie; de app geeft naam, bron, tekst en link als
props. De voorbeelden staan op de bestaande route `/design-system` achter de bestaande guard `design-system:read`, met
alleen lokale voorbeelddata (R-WEB-08).

## Routes en foutcodes

| Methode | Pad | Permissie | Foutcodes |
|---|---|---|---|

N.v.t. — uitsluitend UI-componenten in de kit; geen route, API, contract, permissie of foutcode.

## Kopieer de vorm van

- `src/core/web/ui/gallery.tsx` — de afbeeldingsfout via state met de mislukte `src` (nieuwe `src` probeert opnieuw, geen
  retryloop), `loading="lazy"`, `object-cover`, `rounded-lg` en de fallback `<p role="status">` met aangeleverde tekst.
- `src/core/web/ui/topbar.tsx` — de initialen-functie `initials()` en de ronde vorm met `bg-secondary`/`text-secondary-foreground`.
- `src/core/web/ui/status-badge.tsx` — één CVA-recept met eindige stringvarianten en `cn()` voor `className`.
- `src/core/web/ui/breadcrumbs.tsx` — een interne link via `NavLink` met `aria-current={undefined}` en lucide-icoon met `aria-hidden`.
- `src/core/web/ui/description-list.tsx` — `assert()` op ongeldige invoer in plaats van stil leeg renderen.
- `src/web/features/design-system/data-display-examples.tsx` — catalogusvoorbeelden in een `Section` met `id`, `description` en `framed`.

## Acceptatiecriteria

Randgevallen zijn ook criteria. Alle componenten komen uit de app-barrel `src/web/ui/index.ts`.

**Avatar**

- **ui-weergave-basis/AC-1** — Gegeven `<Avatar name="Anna de Vries" />` zonder `src`, dan staat er één element met
  `role="img"` en toegankelijke naam "Anna de Vries", met zichtbare tekst "AV" die zelf `aria-hidden="true"` is; er is
  geen `<img>` in de DOM. Een lege `src` (`""`) gedraagt zich gelijk aan geen `src`. Toets: `src/core/web/ui/avatar.test.tsx`
- **ui-weergave-basis/AC-2** — Gegeven `src="/a.svg"` en `name="Anna de Vries"`, dan rendert een `<img>` met
  `src="/a.svg"` en `alt="Anna de Vries"`, zonder initialen in de DOM. Na een `error`-event op de `<img>` verdwijnt de
  `<img>` en verschijnt de initialen-fallback uit AC-1; na een rerender met `src="/b.svg"` staat er weer een `<img>` met
  de nieuwe bron. Na een `error` rendert geen nieuwe `<img>` zolang `src` gelijk blijft (rerender met dezelfde `src`
  toont de initialen; geen retryloop). Toets: `src/core/web/ui/avatar.test.tsx`
- **ui-weergave-basis/AC-3** — Gegeven `decorative`, dan heeft de Avatar geen toegankelijke naam: met afbeelding
  `alt=""`, zonder afbeelding of na een fout heeft de wortel `aria-hidden="true"` en geen `role="img"`. Toets: `src/core/web/ui/avatar.test.tsx`
- **ui-weergave-basis/AC-4** — `size` is `sm`, `md` (standaard) of `lg` en geeft respectievelijk `size-6`, `size-9` en
  `size-12`; elke maat is rond (`rounded-full`). Initialen volgen `initials()`: "  ada   van   dijk " geeft "AD",
  "Élodie" geeft "É". Een lege naam `""` en een naam van alleen spaties `"   "` falen zonder `decorative` allebei met een
  assertion; met `decorative` tonen ze allebei "?". Toets: `src/core/web/ui/avatar.test.tsx`
- **ui-weergave-basis/AC-5** — `initials()` woont in `src/core/web/ui/avatar.tsx` en `topbar.tsx` her-exporteert hem:
  het bestaande `src/core/web/ui/topbar-initials.test.ts` blijft ongewijzigd groen, en de profielknop van Topbar rendert
  dezelfde DOM als vóór deze wijziging (bestaande `app-shell.test.tsx` en `e2e/shell.spec.ts` ongewijzigd groen). Toets: `src/core/web/ui/avatar.test.tsx`

**Image**

- **ui-weergave-basis/AC-6** — Gegeven `<Image src="/a.svg" alt="Groene bergen" unavailableText="Afbeelding niet beschikbaar." />`,
  dan rendert één `<img>` met `alt="Groene bergen"`, `loading="lazy"`, `w-full`, `object-cover` en `aspect-video`
  (standaardverhouding). Toets: `src/core/web/ui/image.test.tsx`
- **ui-weergave-basis/AC-7** — `ratio="square"` geeft `aspect-square`, `ratio="video"` `aspect-video` en
  `ratio="portrait"` `aspect-3/4`; de fallback krijgt dezelfde aspect-klasse als de `<img>`, zodat de ruimte bij een
  fout niet verspringt. Toets: `src/core/web/ui/image.test.tsx`
- **ui-weergave-basis/AC-8** — Na een `error`-event toont Image `<p role="status">` met de tekst "Afbeelding niet beschikbaar."
  (de aangeleverde `unavailableText`) en geen `<img>`; een rerender met een andere `src` toont weer een `<img>`. Een lege
  `src` toont direct de fallback zonder `<img>`. Toets: `src/core/web/ui/image.test.tsx`
- **ui-weergave-basis/AC-9** — Een lege of alleen-spaties `alt` zonder `decorative` faalt met een assertion; `decorative`
  met een niet-lege `alt` faalt ook. Met `decorative` en `alt=""` rendert `<img alt="">`; de fallback heeft dan
  `aria-hidden="true"` en geen `role="status"`. Deze controle is alleen runtime (assertion); het type dwingt haar niet af,
  omdat `''` gewoon een `string` is. Toets: `src/core/web/ui/image.test.tsx`
- **ui-weergave-basis/AC-10** — `src/core/web/ui/gallery.tsx` en `src/core/web/ui/gallery.test.tsx` blijven ongewijzigd;
  Gallery gedraagt zich als voorheen (bestaande Gallery-tests en `e2e/ui-data-display.spec.ts` ongewijzigd groen). Toets: `src/core/web/ui/image.test.tsx`

**StatTile**

- **ui-weergave-basis/AC-11** — Gegeven `<StatTile label="Actieve accounts" value="1.234" />`, dan is er een `role="group"`
  met toegankelijke naam "Actieve accounts" (via `aria-labelledby` naar het zichtbare label), met daarin de zichtbare
  tekst "Actieve accounts" vóór "1.234" in de DOM-volgorde; zonder `description`, `trend` of `link` rendert geen leeg
  element ervoor. Toets: `src/core/web/ui/stat-tile.test.tsx`
- **ui-weergave-basis/AC-12** — Met `trend={{ direction: 'up', label: '12% meer dan vorige maand' }}` staat de tekst
  "12% meer dan vorige maand" zichtbaar met een icoon met `aria-hidden="true"`: `up` een pijl omhoog, `down` een pijl
  omlaag, `flat` een liggend streepje (drie verschillende iconen). De trendtekst heeft voor alle drie richtingen dezelfde
  kleurklasse (`text-muted-foreground`); de richting wordt dus nooit alleen met kleur overgebracht. Toets: `src/core/web/ui/stat-tile.test.tsx`
- **ui-weergave-basis/AC-13** — Met `description="Taken zonder eigenaar tellen niet mee."` staat die tekst zichtbaar na de waarde. Toets: `src/core/web/ui/stat-tile.test.tsx`
- **ui-weergave-basis/AC-14** — Met `link={{ href: '/admin/accounts', label: 'Bekijk accounts' }}` is er precies één link
  met naam "Bekijk accounts" en `href="/admin/accounts"`, zonder `aria-current`; een gewone klik navigeert via de router
  (NavLink), en de tegel zelf is geen link of knop. De link heeft de klassen `text-card-foreground`, `underline`,
  `underline-offset-4`, `hover:bg-transparent`, `hover:text-card-foreground`, `aria-[current=page]:bg-transparent` en
  `aria-[current=page]:text-card-foreground`, en na `cn()` blijft geen enkele klasse met `sidebar` over, ook niet met een
  variantprefix (`hover:`, `aria-[current=page]:`), ook als de huidige route `/admin/accounts` is. Toets: `src/core/web/ui/stat-tile.test.tsx`
- **ui-weergave-basis/AC-15** — Een lege of alleen-spaties `label`, `value`, `trend.label` of `link.label`, of een lege of
  alleen-spaties `link.href`, faalt met een assertion. Een waarde van 40 tekens zonder spatie breekt af binnen de tegel (`break-words`,
  `min-w-0` op de waarde). Dat de tegel geen horizontale overflow geeft op 375 px, toetst de e2e (AC-18). Toets: `src/core/web/ui/stat-tile.test.tsx`

**Catalogus en kwaliteit**

- **ui-weergave-basis/AC-16** — `Avatar`, `Image` en `StatTile` met de types `AvatarProps`, `ImageProps`, `StatTileProps`,
  `StatTileTrend` en `StatTileLink` staan in `src/web/ui/index.ts`;
  `node scripts/kit/feiten.mjs componenten` toont ze als publiek, met `size=lg|md|sm` voor Avatar en `ratio=portrait|square|video`
  voor Image; `pnpm check:catalogus` is groen zonder uitzondering. Toets: `test/scripts/feiten-weergave-basis.test.ts`
- **ui-weergave-basis/AC-17** — Op `/design-system?vak=gegevens` staan de secties "Avatar", "Image" en "StatTile" met de
  voorbeelden uit "Hergebruik en UX"; de knop "Toon Avatar", "Toon Image" en "Toon StatTile" in de Componentenindex opent
  dat tabblad en zet de focus op de sectie (bestaande `e2e/design-system-coverage.spec.ts` ongewijzigd groen). Toets: `e2e/ui-weergave-basis.spec.ts`
- **ui-weergave-basis/AC-18** — De nieuwe e2e op 375 en 1280 px: geen pagina-overflow op het tabblad Gegevens tonen,
  `scanAxe(page)` zonder bevindingen in licht en donker, binnen `#example-image` (eerst in beeld gescrold met
  `scrollIntoViewIfNeeded()`, omdat Image lazy laadt, zoals bij het Gallery-voorbeeld) toont het foutvoorbeeld van Image
  "Afbeelding niet beschikbaar.", binnen `#example-avatar` toont het foutvoorbeeld van Avatar "BJ" (tekstcontroles alleen
  binnen de eigen sectie: het Gallery-voorbeeld op hetzelfde tabblad gebruikt ook `/gallery-missing.svg`), binnen
  `#example-stat-tile` toont tegel 2 de waarde `€\u00a012.345,67` (harde spatie), geen tegel geeft horizontale overflow
  op 375 px, en het grid toont vier tegels in één kolom op 375 px en vier kolommen op 1280 px. Toets: `e2e/ui-weergave-basis.spec.ts`

## Hergebruik en UX

- Bestaande componenten: `NavLink` (link in StatTile), `Section`, `Stack`, `Inline`, `Text` (voorbeelden),
  `cn()` en `class-variance-authority` (recepten), lucide-iconen `ArrowUp`, `ArrowDown` en `Minus` (al een dependency),
  `assert()` uit `#core/shared/assert.ts`. Geen nieuwe tokens of dependency. Kleuren alleen bestaande paren:
  Avatar-initialen `bg-secondary`/`text-secondary-foreground` (zoals Topbar), Image-fallback `bg-muted`/`text-muted-foreground`
  (zoals Gallery), StatTile `bg-card`/`text-card-foreground` met rand en `shadow-sm` (zoals Card), label en trend
  `text-muted-foreground` (paar muted-foreground op card), link `text-card-foreground` (paar card-foreground op card).
  De link overschrijft de sidebar-kleuren van NavLink (zie StatTile hieronder); er ontstaat geen nieuw kleurpaar.
- Hergebruik Gallery: niet zonder gedragswijziging. Gallery accepteert elke `alt` (ook spaties) en heeft een vergrote
  modus met `object-contain`; laten we GalleryImage op Image leunen, dan verandert de assertion op `alt` het gedrag. Daarom
  blijft `gallery.tsx` ongewijzigd en neemt Image het patroon over (AC-10). Hergebruik Topbar: alleen `initials()` verhuist;
  de profielknop houdt zijn eigen markup (AC-5).
- API (props):
  - `Avatar`: `name: string`, `src?: string`, `size?: 'sm' | 'md' | 'lg'`, `decorative?: boolean`, `className?: string`.
    Afbeelding `object-cover`, geen `loading`-attribuut (standaard eager: avatars staan vaak boven de vouw).
    Initialen-tekst: `sm` `text-xs`, `md` `text-sm`, `lg` `text-base`, `font-semibold`.
  - `Image`: `src: string`, `unavailableText: string`, `ratio?: 'square' | 'video' | 'portrait'` (standaard `video`),
    `className?: string`, `alt: string`, `decorative?: boolean`. Zonder `decorative` moet `alt` niet leeg zijn, met
    `decorative` moet `alt` `''` zijn; beide alleen via `assert()` (AC-9), geen type-union. Altijd `rounded-lg`.
  - `StatTile`: `label: string`, `value: string` (de app maakt de waarde op met `format.number` of `format.cents`),
    `description?: string`, `trend?: { direction: 'up' | 'down' | 'flat'; label: string }`,
    `link?: { href: string; label: string }`. Geen eigen grid-component: het raster is layout in de feature
    (`grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4`).
    Vorm: wortel `flex min-w-0 flex-col gap-2 rounded-lg border bg-card p-6 text-card-foreground shadow-sm`. Label
    `text-sm font-medium text-muted-foreground`; waarde `text-2xl font-semibold min-w-0 break-words`; toelichting en
    trend `text-sm text-muted-foreground`, trend als `flex items-center gap-1` met icoon `size-4`. Link als laatste
    element: NavLink met `className="self-start px-0 text-card-foreground underline underline-offset-4 hover:bg-transparent hover:text-card-foreground aria-[current=page]:bg-transparent aria-[current=page]:text-card-foreground"`
    en `aria-current={undefined}` (zoals Breadcrumbs, maar met het card-paar); `nav-link.tsx` zet sidebar-kleuren voor
    zowel `hover:` als `aria-[current=page]:`, dus elke variant krijgt een eigen overschrijving; bij hover blijven tekstkleur, onderstreping
    en achtergrond gelijk, alleen de cursor verandert (standaard voor een link). `cn()` (tailwind-merge) laat deze klassen
    winnen van de sidebar-klassen van NavLink.
- Staten per scherm: Avatar — afbeelding, initialen (geen `src`), fout (initialen), nieuwe `src` na fout. Image — geladen
  (browser), fout/lege `src` (fallback met tekst), decoratief. StatTile — basis, met trend (drie richtingen), met
  toelichting, met link, lange waarde. Laden, leeg en fout van data blijven in `AsyncView` buiten de componenten; er is
  geen eigen laadstaat (geen skeleton).
- Alle zichtbare tekst letterlijk. De componenten hebben geen eigen vaste tekst; alles komt als prop. Geen wijziging in
  `src/core/web/copy/ui.ts`. Teksten van de catalogusvoorbeelden (tabblad Gegevens tonen):
  - Sectie "Avatar", beschrijving "Profielfoto of initialen, in drie maten." Voorbeelden: "Anna de Vries" in `sm`, `md` en
    `lg` zonder afbeelding (initialen "AV"); "Élodie" (initialen "É"); "Anna de Vries" met afbeelding `/gallery-architecture.svg`;
    "Bert Jansen" met de ontbrekende afbeelding `/gallery-missing.svg` (fallback "BJ"); een decoratieve Avatar van
    "Anna de Vries" in een `Inline` naast de tekst "Anna de Vries".
  - Sectie "Image", beschrijving "Losse afbeelding met vaste beeldverhouding." Drie afbeeldingen `/gallery-landscape.svg`
    met alt "Groene bergen met een gele zon" en daaronder de tekst "Vierkant", "Breed (16:9)" en "Staand (3:4)";
    een foutvoorbeeld `/gallery-missing.svg` met alt "Ontbrekend voorbeeld" en `unavailableText` "Afbeelding niet beschikbaar.";
    een decoratieve `/gallery-architecture.svg` met daaronder de tekst "Decoratief (lege alt)".
  - Sectie "StatTile", beschrijving "KPI-tegels voor een dashboard, in een raster." Vier tegels:
    1. label "Actieve accounts", waarde `format.number(1234)` ("1.234"), trend `up` "12% meer dan vorige maand",
       link "Bekijk accounts" naar `/admin/accounts`;
    2. label "Omzet deze maand", waarde `format.cents(cents(1234567))` met `cents()` uit `#core/shared/money.ts`
       ("€ 12.345,67", met een harde spatie U+00A0 na het euroteken; een test vergelijkt met `'€\u00a012.345,67'`),
       trend `flat` "Gelijk aan vorige maand";
    3. label "Openstaande taken", waarde `format.number(8)` ("8"), trend `down` "3 minder dan vorige week", toelichting
       "Taken zonder eigenaar tellen niet mee.";
    4. label "Langste wachtrij", waarde "Klantenservice-Noordoost-Nederland" (lange waarde zonder spatie), zonder trend.
  - Vindplaatsteksten in `example-targets.ts`: Avatar "Initialen in drie maten, een foto en een mislukte foto.";
    Image "Drie beeldverhoudingen, een ontbrekende en een decoratieve afbeelding."; StatTile "Vier KPI-tegels met trend,
    toelichting en link; versmal het venster voor één kolom."
- Focusvolgorde en toetsenbord: Avatar en Image zijn niet focusbaar (geen `tabIndex`). In StatTile is alleen de link
  focusbaar, met de focusring en het aanraakdoel van NavLink (`min-h-control`, 44 px); Tab gaat in DOM-volgorde door de
  links van het grid. Enter op de link navigeert. Geen eigen toetsenafhandeling.
- Responsief: geen `matchMedia`; maten via klassen. Afbeeldingen zijn `w-full` binnen hun container en houden de verhouding.
  Reduced motion: geen animatie of transitie.

## Raakt ook

Bron (nieuw):

- `src/core/web/ui/avatar.tsx` — `Avatar`, `AvatarProps`, en `initials()` (verplaatst uit `topbar.tsx`).
- `src/core/web/ui/image.tsx` — `Image`, `ImageProps`.
- `src/core/web/ui/stat-tile.tsx` — `StatTile`, `StatTileProps`, `StatTileTrend`, `StatTileLink`.

Bron (gewijzigd):

- `src/core/web/ui/topbar.tsx` — alleen: de definitie van `initials()` vervangen door import plus her-export uit `./avatar.tsx`.
- `src/web/ui/index.ts` — exports van de drie componenten en de types `AvatarProps`, `ImageProps`, `StatTileProps`,
  `StatTileTrend` en `StatTileLink`.
- `src/web/features/design-system/example-targets.ts` — drie vindplaatsen (`example-avatar`, `example-image`,
  `example-stat-tile`, vak `gegevens`) met de teksten hierboven.
- `src/web/features/design-system/vak-panels.tsx` — de drie secties in het tabblad Gegevens tonen.
- `src/web/features/design-system/display-basics-examples.tsx` (nieuw) — de drie voorbeeldsecties.

Tests (nieuw; elk noemt de AC-id's die het dekt):

- `src/core/web/ui/avatar.test.tsx` (AC-1 t/m AC-5), `src/core/web/ui/image.test.tsx` (AC-6 t/m AC-10),
  `src/core/web/ui/stat-tile.test.tsx` (AC-11 t/m AC-15), `test/scripts/feiten-weergave-basis.test.ts` (AC-16),
  `e2e/ui-weergave-basis.spec.ts` (AC-16 t/m AC-18).
- Bestaande tests worden niet gewijzigd of overgeslagen, ook niet `topbar-initials.test.ts`, `gallery.test.tsx`,
  `component-index.test.tsx` en `e2e/design-system-coverage.spec.ts`. Vraagt een bestaande test toch een wijziging:
  stoppen en de eigenaar voorleggen (R-TEST-02).

Gebruiksdocumentatie:

- `docs/ui-weergave-basis.md` (nieuw) — gebruik van de drie componenten met `bestand:regel`-verwijzingen, wanneer
  `decorative`, en dat de app de waarde van StatTile met `format` opmaakt; link naar deze spec.
- `docs/design-system-catalogue.md` — één zin met link naar `docs/ui-weergave-basis.md`, naast de bestaande link naar
  Gegevensweergave en navigatie.

Checks: `pnpm check:catalogus`, `pnpm ratchet` (met check-docs), lint/typecheck/format, `pnpm test:unit` (web-project), `pnpm test:e2e`,
`pnpm ui:check` (375/1280 px, axe), `test/ui/contrast.test.ts` ongewijzigd (alleen bestaande kleurparen: secondary-foreground
op secondary, muted-foreground op muted en op card, card-foreground op card; de StatTile-link gebruikt bewust geen
sidebar-paar, AC-14). Datawijzigingen: geen (kop weggelaten volgens het mini-sjabloon). Niet geraakt:
`check:migrations`, `check:secdef`, `test:db`/policies, `test/security/resources.ts` en permissietests (geen tabel,
route of permissie).

## Buiten scope

Gallery-gedrag en `gallery.tsx`; Topbar-markup; avatar-groepen/stapels, statusbolletje op de avatar, upload of bijsnijden
van een profielfoto; `srcset`/responsive bronnen, zoom of lightbox voor Image; grafieken, sparklines, skeleton of laadstaat
in StatTile, een aparte grid-component; nieuwe tokens, copybestanden, dependencies, routes, API of database; roadmapstatus.

## Open vragen

- **OV-1 ✅ besloten** — Kleur van de trend in StatTile: de richting zegt niet of het goed of slecht is (meer kosten is
  dalend gewenst). Daarom één neutrale kleur voor alle richtingen, met icoon en tekst (AC-12); een `tone`-prop is een
  latere uitbreiding als een app erom vraagt.
- **OV-2 ✅ besloten** — Componentnaam `Image`, zoals in de opdracht van de eigenaar. Botst de naam bij de bouw met een
  lintregel (globale `Image`; de bouwer controleert dat met `pnpm lint`), dan stopt de bouw en legt de eigenaar een andere naam voor; geen lint-uitzondering.
