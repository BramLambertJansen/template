---
soort: toegevoegd
---

- `pnpm ratchet` toetst strikt dat een acceptatiecriterium dat tegenover de merge-base met `origin/main` nieuw of gewijzigd
  is, achter `Toets:` een testbestand noemt (spec `ac-toets`, `scripts/kit/ac-toets.mjs`). Ongewijzigde AC's, vervallen
  AC's en hernoemde specs tellen niet; alleen andere witruimte of een merkteken `(vervallen)`, `(nieuw)` of `(voorbeeld)` is
  geen wijziging.

### Bij een update

- Een PR die een AC toevoegt of inhoudelijk wijzigt, eindigt dat item met ``Toets: `<testbestand>` ``; zonder is
  `pnpm ratchet` rood. Bestaande specs hoeven niet mee.
