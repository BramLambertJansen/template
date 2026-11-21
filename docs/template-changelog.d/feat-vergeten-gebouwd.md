---
soort: toegevoegd
---

- `pnpm ratchet` meldt als "let op", nooit rood, wanneer een PR een testregel toevoegt met een AC-id van een spec die nog
  `goedgekeurd` is, of van een AC die in een gebouwde spec nog `(nog niet gebouwd)` draagt: de bouw-PR vergat dan
  waarschijnlijk `status: gebouwd` of het merkteken weg te halen (spec `gebouwd-zonder-nummer` AC-15,
  `scripts/kit/vergeten-gebouwd.mjs`).
