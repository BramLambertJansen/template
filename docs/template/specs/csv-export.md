---
status: goedgekeurd # keuze eigenaar in de sessie 2026-11-13 (pakket gekozen); merge is het besluit
namespace: csv-export
sjabloon: mini
scope: functionele-ui
---

# CSV-export van een lijst

## Doel

Elke app kan de rijen die een lijst op dat moment toont, zonder route of server, downloaden als CSV-bestand dat
Nederlandse Excel direct goed opent.

## Rollen en wie wat ziet

Geen nieuwe rollen of rechten. De export bevat uitsluitend de rijen en kolommen die de aanroeper meegeeft; wie de lijst
mag zien, mag dezelfde rijen exporteren. De catalogus toont het voorbeeld op de bestaande adminroute `/design-system`,
achter de bestaande guard, met de lokale voorbeeldgegevens van het DataTable-voorbeeld (R-WEB-08).

## Routes en foutcodes

N.v.t. — de export draait volledig in de browser: geen route, permissie, foutcode, migratie, provider of dependency.

## Kopieer de vorm van

- `src/core/web/ui/copy-button.tsx` — vorm van een actieknop in de kit: `Button variant="outline"`, labels als props met
  defaults uit `uiTexts`, altijd aanwezige `role="status"`- en `role="alert"`-regel, fout opvangen zonder te gooien.
- `src/core/web/ui/data-table.tsx` — generiek `<Row>`-type met readonly rijen en een kolomtype met `id`/`header`, en
  `assert()` op ongeldige invoer tijdens render.
- `src/web/features/design-system/data-display-examples.tsx` — plek en data van het catalogusvoorbeeld (DataTable-sectie).

## Acceptatiecriteria

Notatie: `﻿` is de BOM, `\r\n` is CRLF, `\n` LF, `\r` CR, `\t` tab. Voorbeeldkolommen: `Naam` (`row.name`) en
`Rol` (`row.roleLabel`).

- **csv-export/AC-1** — Gegeven rijen Anna de Vries/Gebruiker en Bert Jansen/Beheerder, wanneer `toCsv(rows, columns)`
  draait, dan is de uitvoer exact `﻿Naam;Rol\r\nAnna de Vries;Gebruiker\r\nBert Jansen;Beheerder`: BOM vooraan,
  koppen in kolomvolgorde, puntkomma als scheidingsteken, CRLF tussen regels en geen afsluitende CRLF.
- **csv-export/AC-2** — Gegeven een cel met `;`, `"`, `\r` of `\n`, dan staat de cel tussen dubbele aanhalingstekens en is
  elk `"` verdubbeld; regeleinden binnen de cel blijven ongewijzigd. Exact: `a;b` → `"a;b"`, `Zeg "hoi"` →
  `"Zeg ""hoi"""`, `regel1\nregel2` → `"regel1\nregel2"`, `a\r\nb` → `"a\r\nb"`. Een cel zonder die tekens krijgt geen
  aanhalingstekens (`Anna de Vries` → `Anna de Vries`).
- **csv-export/AC-3** — Gegeven een cel waarvan het eerste teken `=`, `+`, `-`, `@`, `\t` of `\r` is, dan krijgt die cel
  een apostrof vooraan, vóór het quoten. Exact: `=SOM(A1)` → `'=SOM(A1)`, `+31 6` → `'+31 6`, `-5` → `'-5`, `@x` → `'@x`,
  `\tx` → `'\tx`, `\rx` → `"'\rx"`, `=a;b` → `"'=a;b"`. Alleen het eerste teken telt: ` =1` (spatie eerst), `a=1` en
  `'x` blijven ongewijzigd; een lege cel blijft leeg. Koppen volgen dezelfde regels als cellen.
- **csv-export/AC-4** — Gegeven nul rijen, dan is de uitvoer exact `﻿` plus de koprij (`﻿Naam;Rol`). Gegeven
  nul kolommen of een kop die na trimmen leeg is, dan gooit `toCsv` via `assert()`; dubbele koppen zijn toegestaan.
- **csv-export/AC-5** — Gegeven een cel met `é`, `ë`, `€` en een emoji, dan bevat het gedownloade bestand die tekens als
  UTF-8 en beginnen de bytes met `EF BB BF`; er wordt niets vervangen of weggelaten.
- **csv-export/AC-6** — Gegeven `ExportCsvButton` met rows, columns en `filename="voorbeeldgegevens"`, wanneer de
  gebruiker klikt, dan ontstaat precies één `Blob` met type `text/csv;charset=utf-8` en inhoud gelijk aan
  `toCsv(rows, columns)`, wordt één ankerelement met `download="voorbeeldgegevens.csv"` en de object-URL als `href`
  aangeklikt, staat dat anker daarna niet meer in het document en wordt dezelfde object-URL uiterlijk in de volgende
  macrotaak met `URL.revokeObjectURL` vrijgegeven.
- **csv-export/AC-7** — Bestandsnaam: `filename` wordt getrimd; eindigt hij niet op `.csv` (hoofdletterongevoelig), dan
  wordt `.csv` toegevoegd. Exact: `rapport` → `rapport.csv`, ` rapport.csv ` → `rapport.csv`, `Rapport.CSV` →
  `Rapport.CSV`. Een `filename` die na trimmen leeg is, of een lege `columns`, gooit via `assert()` tijdens render.
- **csv-export/AC-8** — Gegeven het DataTable-voorbeeld op `/design-system` met twee getoonde rijen, wanneer de gebruiker
  "CSV exporteren" kiest, dan bevat het bestand de koprij plus exact die twee rijen in de getoonde volgorde (filter en
  sortering toegepast), zonder totaalregel, aantalregel of rijen die niet geladen zijn; na "Meer laden" bevat een nieuwe
  export drie rijen.
- **csv-export/AC-9** — Na een geslaagde export toont de `role="status"`-regel "CSV-bestand aangemaakt." en is de
  `role="alert"`-regel leeg. Gooit het opbouwen (bijvoorbeeld een `value`-functie) of het downloaden (bijvoorbeeld
  `URL.createObjectURL`), dan toont de alert "Exporteren is niet gelukt. Probeer het opnieuw.", blijft de status leeg,
  wordt geen anker aangeklikt en bereikt de fout geen ErrorBoundary. Elke nieuwe klik maakt beide regels eerst leeg.
  Eigen `label`, `doneLabel` en `errorLabel` vervangen de drie standaardteksten.
- **csv-export/AC-10** — Met `disabled` is de knop native disabled en ontstaat bij klikken geen Blob en geen download.
  Enter en Spatie op de gefocuste knop starten de export; na de export blijft de focus op de knop.
- **csv-export/AC-11** — `ExportCsvButton`, `ExportCsvButtonProps`, `toCsv` en `CsvColumn` zijn te importeren uit
  `src/web/ui/index.ts`; het catalogusvoorbeeld staat binnen `#example-data-table`; `pnpm check:catalogus` en de
  bestaande index-naar-voorbeeldtest blijven groen zonder uitzondering; geen bestaande test is gewijzigd of overgeslagen.
- **csv-export/AC-12** — Op de echte lokale stack levert de knop in het DataTable-voorbeeld een download met de naam
  `voorbeeldgegevens.csv` waarvan de bytes met `EF BB BF` beginnen en waarvan de eerste regel `Naam;Rol` is; `scanAxe`
  op 375 en 1280 px meldt geen overtredingen, licht en donker, zonder pagina-overflow.

## Hergebruik en UX

- Bestaande componenten: `Button` (variant `outline`) voor de knop, `assert()` uit `src/core/shared` voor ongeldige
  invoer, `uiTexts` uit `src/core/web/copy/ui.ts` voor de standaardteksten; in het voorbeeld `DataTable`, `ListToolbar`
  en `Section`. Geen nieuw token, geen nieuwe variant, geen rauwe elementen in JSX; het downloadanker wordt alleen
  programmatisch gemaakt (`document.createElement('a')`) en nooit gerenderd.
- API (bron `src/core/web/ui/csv.ts` en `src/core/web/ui/export-csv-button.tsx`):
  - `interface CsvColumn<Row> { readonly header: string; readonly value: (row: Row) => string }` — de waarde is altijd
    een string: getallen, bedragen en datums formatteert de aanroeper zelf via `lib/format.ts` (R-CODE-07), zodat het
    Nederlandse formaat (komma als decimaalteken) in het bestand staat.
  - `toCsv<Row>(rows: readonly Row[], columns: readonly CsvColumn<Row>[]): string` — puur, zonder DOM.
  - `ExportCsvButton<Row>` met props `rows`, `columns`, `filename`, optioneel `label`, `doneLabel`, `errorLabel`,
    `disabled`.
- Wat er geëxporteerd wordt: precies de meegegeven `rows`, in die volgorde. De component haalt niets op, voegt geen
  totaal-, aantal- of samenvattingsregel toe en verzint geen rijen die (nog) niet geladen zijn. Bij "Meer laden" of een
  cursor bepaalt de ouder welke rijen hij meegeeft; de gebruiksdoc zegt dat een export van een deels geladen lijst
  alleen de geladen rijen bevat.
- Staten:
  - laden: n.v.t. in de component; de ouder zet `disabled` zolang de lijst laadt of `busy` is.
  - leeg: knop blijft bruikbaar; het bestand bevat alleen de koprij (AC-4).
  - bezig: n.v.t. — opbouwen en downloaden zijn synchroon in één klik, er is geen busy-staat.
  - gelukt: status "CSV-bestand aangemaakt." (AC-9).
  - fout: alert "Exporteren is niet gelukt. Probeer het opnieuw." (AC-9).
  - verouderd: n.v.t. — elke klik exporteert de rijen van dat moment; een oude melding blijft staan tot de volgende klik.
- Alle zichtbare tekst letterlijk:
  - standaardlabel knop: "CSV exporteren" (`uiTexts.exportCsv`)
  - gelukt: "CSV-bestand aangemaakt." (`uiTexts.exportCsvDone`)
  - fout: "Exporteren is niet gelukt. Probeer het opnieuw." (`uiTexts.exportCsvFailed`)
  - catalogus, DataTable-sectie: knop met het standaardlabel, `filename="voorbeeldgegevens"`, en de bestaande
    kolomkoppen "Naam" en "Rol"; catalogusinstructie (`example-targets.ts`) wordt: "Zoek, filter, sorteer, selecteer en
    laad lokale rijen; exporteer de getoonde rijen als CSV."
- Focusvolgorde en toetsenbord: de knop is één Tab-stop, in het voorbeeld direct na de ListToolbar en vóór de tabel.
  Enter en Spatie activeren (native knop); de focus blijft na de export op de knop; de status- en alertregel nemen
  geen focus. Geen extra sneltoets.

## Randgevallen

| Situatie | Gedrag | Foutcode |
| --- | --- | --- |
| Nul rijen | Alleen BOM + koprij | n.v.t. |
| Nul kolommen, lege kop of lege bestandsnaam | `assert()` gooit (programmeerfout, ErrorBoundary) | n.v.t. |
| Cel begint met `=` `+` `-` `@` tab of CR | Apostrof vooraan, daarna quoten indien nodig | n.v.t. |
| Negatief getal als tekst (`-5`) | Wordt `'-5` (tekst in Excel); veiligheid boven rekenbaarheid | n.v.t. |
| `value` gooit of `createObjectURL` faalt | Alertmelding, geen download, geen ErrorBoundary | n.v.t. |
| Deels geladen lijst | Alleen de meegegeven rijen; geen totaal | n.v.t. |
| Dubbel klikken | Elke klik is een eigen, volledige download | n.v.t. |

## Raakt ook

Bouw-PR (functionele UI in de template, R-WERK-18), exact deze bestanden:

- bron: `src/core/web/ui/csv.ts` (nieuw: `CsvColumn`, `toCsv`), `src/core/web/ui/export-csv-button.tsx` (nieuw:
  `ExportCsvButton`, `ExportCsvButtonProps`), `src/core/web/copy/ui.ts` (drie nieuwe sleutels `exportCsv`,
  `exportCsvDone`, `exportCsvFailed`; bestaande sleutels ongewijzigd);
- tests (nieuw): `src/core/web/ui/csv.test.ts` (AC-1 t/m AC-5), `src/core/web/ui/export-csv-button.test.tsx` (AC-6,
  AC-7, AC-9, AC-10), `e2e/csv-export.spec.ts` (AC-8, AC-12);
- barrel: `src/web/ui/index.ts` (exports van AC-11);
- catalogus: `src/web/features/design-system/data-display-examples.tsx` (knop in de DataTable-sectie met de getoonde
  rijen) en `src/web/features/design-system/example-targets.ts` (`ExportCsvButton` in de groep `example-data-table`,
  tekst zoals hierboven);
- gebruiksdoc: `docs/ui-data-display.md` (sectie "CSV-export": API, Excel-formaat, formule-neutralisatie, alleen
  geladen rijen, formatteren via `lib/format.ts`).

Checks die dit raakt: `pnpm check:catalogus`, `src/web/copy/woordenlijst.test.ts` (nieuwe teksten), de bestaande
index-naar-voorbeeldtest, `check-docs` (AC-traceerbaarheid naar tests) en `pnpm ui:check`. N.v.t.: `check:migrations`,
`check:secdef`, `test:db`/policies, `test/security/resources.ts` en permissietests — geen tabel, route of permissie.

## Buiten scope

Server-side export of een exportroute, het ophalen van alle pagina's vóór export, totalen of samenvattingsregels,
XLSX of andere formaten, een keuze voor scheidingsteken of encoding, kolomkeuze door de gebruiker, streaming of een
rijlimiet, automatisch getal- of datumformatteren in `toCsv`, en het toevoegen van exports aan bestaande schermen
(accountbeheer). Geen nieuwe dependency, token, variant, gate, regel of wijziging van bestaande tests.

## Testplan

- Unit (`csv.test.ts`): exacte strings van AC-1 t/m AC-4, inclusief alle voorbeelden uit AC-2 en AC-3; bytes van de
  Blob voor AC-5.
- Component (`export-csv-button.test.tsx`, jsdom): `URL.createObjectURL`/`revokeObjectURL` en de ankerklik bespied;
  Blob-type en -inhoud, `download`-naam per AC-7-voorbeeld, anker weg uit het document, revoke na timers, status- en
  alerttekst, eigen labels, disabled, Enter/Spatie en focusbehoud, assert bij lege bestandsnaam of kolommen.
- E2e (`e2e/csv-export.spec.ts`, echte lokale stack): Playwright-download op `/design-system`, naam en bytes, export
  vóór en na "Meer laden", `scanAxe` op 375 en 1280 px.
- Format, lint, typecheck, ratchet, `check:catalogus` en de bestaande tests ongewijzigd groen.

## Open vragen

- **OV-1** — Standaardteksten van de knop en meldingen. Aanbeveling: "CSV exporteren", "CSV-bestand aangemaakt." en
  "Exporteren is niet gelukt. Probeer het opnieuw." (infinitief volgens de woordenlijst; de browser meldt de download
  zelf, dus "gedownload" zou niet te controleren zijn).
- **OV-2** — Een cel die met `-` begint, zoals een negatief getal, wordt tekst in Excel. Aanbeveling: zo laten, zoals de
  eigenaar vroeg; neutraliseren van formule-injectie weegt zwaarder dan rekenen met negatieve getallen in de export.
- **OV-3** — Gedrag bij nul rijen. Aanbeveling: knop blijft bruikbaar en levert alleen de koprij; een disabled knop
  zonder uitleg is onduidelijker, en de ouder kan `disabled` zelf zetten.
- **OV-4 ✅ besloten** — Alleen meegegeven/geladen rijen, geen fictieve totalen; volledig in de browser, in
  `src/core/web/ui`, voorbeeld bij de DataTable-voorbeelden (opdracht eigenaar 2026-11-13).
