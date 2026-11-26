# Gegevensweergave en navigatie

Deze componenten horen bij [de spec](template/specs/ui-data-display.md) en staan met werkende voorbeelden op de bestaande
adminpagina `/design-system`. Importeer componenten en types uit de app-barrel `src/web/ui/index.ts`.
Geen nieuwe dependency, netwerklaag, token of autorisatie is nodig.
De lokale voorbeeldafbeeldingen staan in `src/web/public/`, onder de Vite-root (`vite.config.ts:95`). Ze laden daardoor
via dezelfde origin in development en de productiebuild, zonder aanvullende configuratie.

## ID's en invoer

Gebruik niet-lege, unieke ID's voor de rijen en kolommen van `DataTable` en voor de items van `Tabs` en `Gallery`.
De rij-ID komt uit `getRowId`; kolommen en items hebben een eigen `id`. Een `DataTable` heeft minstens één kolom nodig.
De componenten weigeren invoer die hier niet aan voldoet; een lege lijst met rijen of items is wel toegestaan.

## DataTable

Geef rows, getRowId, columns en een label. Een kolom heeft id, header en cell(row); sortable maakt de header bedienbaar
wanneer ook sort/onSortChange zijn opgegeven. DataTable sorteert zelf geen data: de ouder verwerkt sortering lokaal of
in de query. Zonder sortprops blijft de tabel statisch. Gebruik AsyncView buiten de tabel voor laden/fout/leeg bij queries.

`selection` is optioneel en wordt door de ouder beheerd. Geef daarin `selectedIds`, `onSelectionChange`,
`selectionLabel` en `selectAllLabel` mee: de laatste twee benoemen de selectievakjes voor schermlezers.
`selectedIds` bevat stabiele ids, ook van andere pagina's. Select-all raakt uitsluitend de aangeleverde rijen;
bij geen rijen is het disabled en bij deels geselecteerd native indeterminate. De ouder beslist wanneer selectie reset
bij filteren. `rowActions` met `actionsLabel` blijft een aparte kolom; geef eigen acties disabled wanneer `busy`.
`busy` blokkeert sorteren, selecteren en meer laden en zet aria-busy. Het tabelvoorbeeld gebruikt lokale data.

`loadMore` ontvangt hasMore/loading/onLoadMore/label/loadingLabel; de ouder beheert cursor/data en laadstatus.
Geen paginanummers of totaal worden verzonnen. Zet loading zodra laden start om herhaalde acties te blokkeren.
De bestaande benoemde Table-regio scrolt intern op mobiel en blijft met het toetsenbord bereikbaar.

De exacte props en hun samenhang staan in [DataTableProps](../src/core/web/ui/data-table.tsx).

## CSV-export

Spec [csv-export](template/specs/csv-export.md). `ExportCsvButton` downloadt de rijen die je meegeeft als CSV-bestand,
volledig in de browser: geen route, permissie of dependency. Voorbeeld: de DataTable-sectie op `/design-system`.

- API: `rows`, `columns` (`CsvColumn<Row>`: `header` en `value(row)`), `filename` (getrimd, `.csv` erbij als het
  ontbreekt), optioneel `label`, `doneLabel`, `errorLabel` en `disabled`. `toCsv(rows, columns)` geeft dezelfde tekst
  zonder download (`src/core/web/ui/csv.ts`).
- Excel-formaat: UTF-8 met BOM, puntkomma als scheidingsteken en CRLF tussen regels, zodat Nederlandse Excel het bestand
  direct goed opent. Een cel met `;`, `"` of een regeleinde komt tussen aanhalingstekens.
- Formule-neutralisatie: een cel of kop die begint met `=`, `+`, `-`, `@`, tab of CR krijgt een apostrof vooraan, zodat
  Excel hem niet als formule uitvoert. Een negatief getal wordt daardoor tekst.
- Alleen geladen rijen: de knop exporteert precies de meegegeven `rows`, in die volgorde. Bij "Meer laden" of een cursor
  bevat een export van een deels geladen lijst alleen de geladen rijen; er komt geen totaal- of aantalregel bij.
- Formatteren: `value` geeft altijd een string. Formatteer getallen, bedragen en datums zelf via
  `src/core/web/lib/format.ts`, zodat het Nederlandse formaat in het bestand staat.
- Zet `disabled` zolang de lijst laadt. Lege `filename`, lege `columns` of een lege kop gooit tijdens render
  (ErrorBoundary); een fout bij het opbouwen of downloaden toont de foutregel onder de knop.

## Tabs

Tabs ontvangt label en items met id/label/content/disabled. Gebruik value/onValueChange voor controlled gedrag of
optioneel defaultValue. Left/Right/Home/End verplaatsen focus; Enter/Space activeert. Inactieve panelen blijven gemount
maar hidden, zodat invoer bewaard blijft. Een paneel met eigen focusbare inhoud krijgt geen extra Tab-stop.
Onbekende expliciete waarden worden niet vervangen; de eerste enabled tab blijft bereikbaar. Verdwijnt een actieve
uncontrolled tab, dan herstelt de eerste enabled tab zonder wijzigingscallback. Focusherstel steelt geen externe focus.
Ook als tabs later geladen worden of na een lege/volledig uitgeschakelde tussenstand terugkomen, wordt de eerste enabled
tab actief. Die keuze blijft daarna bij herschikken behouden. Een onbekende expliciete waarde wordt ook dan niet vervangen
(`src/core/web/ui/tabs-empty-recovery.test.tsx`).
Na bewust verlaten van een zichtbaar, bereikbaar veld wordt ook een blur zonder volgend focusdoel gerespecteerd
(`src/core/web/ui/tabs.tsx:87`); een latere ouderwissel trekt focus dan niet terug.

## Gallery

Gallery-items bevatten id/src/alt en optioneel caption/description. Benoem de lijst met label en geef unavailableText.
Afbeeldingen laden lazy. Een fout toont een placeholder; een andere src wordt opnieuw geprobeerd. Voor decoratieve beelden
mag alt leeg zijn. Geef voor de preview `preview.previewLabel` en `preview.closeLabel` mee; beide horen bij het
optionele `preview`-object ([GalleryProps](../src/core/web/ui/gallery.tsx)). Een caption wordt de
Dialogtitel, anders de previewlabel. De bestaande Dialog bewaakt focus/Escape; verwijderen van de geopende kaart sluit
preview en focust de gallerycontainer. De previewinhoud heeft interne verticale scrolling. Geen remote voorbeeldmedia.
Previewknoppen breken lange labels binnen de kaart af (`src/core/web/ui/gallery.tsx:87`), zodat ze de pagina niet verbreden.

## ListToolbar

Bestaande Select-filters en props blijven bruikbaar. `searchable` op een filter gebruikt Combobox; een lege Select-optie
wordt de placeholder en wordt niet aan Combobox doorgegeven. De wisactie kiest de lege waarde. Disabled opties zijn
alleen actief in searchable-modus; het Select-contract verandert niet.

`showActiveFilters` toont verwijderbare chips voor committed zoekterm en filterwaarden. Filterchip wissen verandert één
filter en focust dat veld; zoekchip/alles wissen annuleert de pending zoekdebounce. De ouder beheert URL/query/sortering.
Filter-id's krijgen een eigen prefix, ook wanneer hun waarde zoeken of sorteren is. Geen chips voor sortering.
Een lopende zoekdebounce gebruikt bij afloop de actuele `onQueryChange`, ook als de ouder intussen een filter of sortering
wijzigt. Alleen een nieuwe callback herstart de wachttijd niet en verstuurt geen extra zoekopdracht.

## Carousel

Vervallen uit deze tranche op verzoek van de eigenaar (2026-10-15): de touchregressie (tik op een dia-actie na een swipe)
bleef in `gate:slow` falen. Component, voorbeeld en tests zijn verwijderd; AC-7 vervalt door
[ADR 0114](template/adr/0114-carousel-uit-ui-data-display.md). Een Carousel komt alleen terug met een nieuwe spec.

## Acceptatiebewijs

| Criterium | Tests |
| --- | --- |
| AC-1 exports/types/defaultcompatibiliteit | `src/web/ui/data-display-barrel.test.tsx`, typecheck, check:catalogus |
| AC-2 tabel/sortering/ids | `src/core/web/ui/data-table.test.tsx`, `e2e/ui-data-display.spec.ts` |
| AC-3 selectie/busy/leeg/meer laden | `src/core/web/ui/data-table.test.tsx`, `e2e/ui-data-display.spec.ts` |
| AC-4 tabs/keyboard/staat/focus | `src/core/web/ui/tabs.test.tsx`, `src/core/web/ui/tabs-blur.test.tsx`, `src/core/web/ui/tabs-empty-recovery.test.tsx`, `e2e/ui-data-display.spec.ts` |
| AC-5 gallery/fout/preview | `src/core/web/ui/gallery.test.tsx`, `e2e/ui-data-display.spec.ts` |
| AC-6 toolbar/adaptatie/chips/debounce | `src/core/web/ui/list-toolbar-filters.test.tsx`, `e2e/ui-data-display.spec.ts` |
| AC-7 carousel/controlled/swipe | vervallen door [ADR 0114](template/adr/0114-carousel-uit-ui-data-display.md) |
| AC-8 structurele wijzigingen/id-fouten | `src/core/web/ui/data-table.test.tsx`, `src/core/web/ui/tabs.test.tsx`, `src/core/web/ui/tabs-empty-recovery.test.tsx`, `src/core/web/ui/gallery.test.tsx`, `src/core/web/ui/list-toolbar-filters.test.tsx` |
| AC-9 bronindex en voorbeelden | `e2e/design-system-coverage.spec.ts`, `e2e/ui-data-display.spec.ts`, check:catalogus |
| AC-10 responsive/touch/axe/CSP/thema/reduced motion | `e2e/ui-data-display.spec.ts` |

Elk testbestand noemt het criterium als `ui-data-display/AC-n` boven de test die het toetst.

Testbestanden staan naast corecomponenten; de browserflows gebruiken echte login/API op 375 en 1280 px. Bestaande tests
kregen alleen het AC-commentaar; geen gate, timeout of runnerinstelling wordt aangepast. De tabel-/filter-/gallerycombinatie heeft uitsluitend lokale data.
