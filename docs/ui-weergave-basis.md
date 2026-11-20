# Avatar, Image en StatTile

Drie weergave-basiscomponenten uit [de spec](template/specs/ui-weergave-basis.md), met werkende voorbeelden op
`/design-system?vak=gegevens`. Importeer componenten en types uit de app-barrel `src/web/ui/index.ts`. De componenten
hebben geen eigen vaste tekst: naam, alt, fallbacktekst, label en link komen als prop uit de copy van de app.

## Avatar

`<Avatar name="Anna de Vries" src={profiel.foto} />` toont de foto, of de initialen als er geen (of een lege) `src` is.
Na een laadfout tonen ze de initialen; een andere `src` probeert opnieuw, dezelfde `src` niet
(`src/core/web/ui/avatar.tsx:38`). Alleen de laatst mislukte `src` wordt onthouden: gaat `src` van A (mislukt) naar een
werkende B en terug naar A, dan probeert A het niet opnieuw; mislukte B ook, dan wel. Image werkt net zo (`src/core/web/ui/image.tsx:32`). `size` is `sm`, `md` (standaard) of `lg`. De initialen komen uit `initials()`
(`src/core/web/ui/avatar.tsx:7`), dezelfde functie als de profielknop van Topbar.

Gebruik `decorative` wanneer de naam al als tekst naast de avatar staat: de avatar heeft dan geen toegankelijke naam.
Zonder `decorative` is een lege naam een programmeerfout en faalt hij met een assertion (`src/core/web/ui/avatar.tsx:39`).

## Image

`<Image src alt unavailableText ratio />` is een losse afbeelding met vaste beeldverhouding: `video` (standaard, 16:9),
`square` of `portrait` (3:4). Ze laadt lazy en vult de breedte van haar container. Bij een laadfout of een lege `src`
toont ze `unavailableText` in hetzelfde vlak, zodat de pagina niet verspringt.

Gebruik `decorative` met `alt=""` voor sierbeelden; de fallback is dan voor schermlezers verborgen. Een lege alt zonder
`decorative`, of `decorative` met een niet-lege alt, faalt met een assertion (`src/core/web/ui/image.tsx:29`). Dat is
alleen een runtimecontrole. Gallery blijft een aparte component met eigen gedrag (preview, elke alt).

## StatTile

`<StatTile label value description trend link />` is een KPI-tegel voor een dashboard. `value` is een string: maak de
waarde op met `format.number` of `format.cents` uit `src/core/web/lib/format.ts`. `trend` heeft een `direction`
(`up`, `down` of `flat`) en een `label`; de richting staat in icoon en tekst, in één neutrale kleur, omdat stijgen niet
altijd goed is. `link` (`href`, `label`) is een routerlink onder in de tegel (`src/core/web/ui/stat-tile.tsx:58`).

Lege teksten falen met een assertion (`src/core/web/ui/stat-tile.tsx:35`). Er is geen laadstaat: laden, leeg en fout
blijven in `AsyncView` rond het raster. Het raster is layout in de feature, bijvoorbeeld
`grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4`.

## Acceptatiecriteria en tests

| AC | Test |
|---|---|
| AC-1 t/m AC-5 Avatar, initialen en Topbar | `src/core/web/ui/avatar.test.tsx`; bestaande `topbar-initials.test.ts`, `app-shell.test.tsx` en `e2e/shell.spec.ts` |
| AC-6 t/m AC-10 Image en ongewijzigde Gallery | `src/core/web/ui/image.test.tsx`; bestaande `gallery.test.tsx` en `e2e/ui-data-display.spec.ts` |
| AC-11 t/m AC-15 StatTile | `src/core/web/ui/stat-tile.test.tsx` |
| AC-16 barrel, index en feiten | `pnpm check:catalogus`, `test/scripts/feiten-weergave-basis.test.ts` en `e2e/ui-weergave-basis.spec.ts` |
| AC-17 voorbeelden en Toon-knoppen | `e2e/ui-weergave-basis.spec.ts`; bestaande `e2e/design-system-coverage.spec.ts` |
| AC-18 375/1280 px, axe, fallbacks en raster | `e2e/ui-weergave-basis.spec.ts` |
