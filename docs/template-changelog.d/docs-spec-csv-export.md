---
soort: toegevoegd
---

- CSV-export (spec `csv-export`): het kitcomponent `ExportCsvButton` en `toCsv` met `CsvColumn` in `src/core/web/ui/`,
  via `src/web/ui/index.ts`. De knop downloadt de meegegeven rijen in de browser als CSV voor Nederlandse Excel (UTF-8
  met BOM, puntkomma, CRLF) en zet een apostrof voor cellen die met `=`, `+`, `-`, `@`, tab of CR beginnen. Voorbeeld in
  de DataTable-sectie op `/design-system`, gebruiksdoc in `docs/ui-data-display.md`. Geen dependency, route of
  permissie; bestaande lijsten krijgen pas een export als een app de knop zelf toevoegt.
