---
soort: gewijzigd
---

- Procesbewijs is geen acceptatiecriterium (ADR 0100): een CI- of CodeQL-uitslag, docs in de bouw-PR, een volgorde van
  bouwstappen of uitvoer in een thread hoort in het Testplan of de PR-beschrijving. Acht AC's van gebouwde specs zijn
  daardoor vervallen; de zes die in `.kit/baseline.json` stonden, zijn eruit (leerpunt #828).
- Het spec-sjabloon vraagt per acceptatiecriterium het testbestand (#834, leerpunt #793): elk criterium eindigt met `Toets:`
  en het bestand dat `<namespace>/AC-n` noemt, met `(nieuw)` zolang het niet bestaat (`docs/specs/_template.md`,
  `docs/specs/_mini.md`, `scripts/kit/templates/spec.md.tmpl`, skill `spec` stap 2 en 6). Bewijs dat alleen een CI-uitslag
  is, gaat naar het Testplan. Bestaande specs hoeven niet mee. Deze regel stond eerst ten onrechte in de uitgebrachte
  sectie 0.2.0.
