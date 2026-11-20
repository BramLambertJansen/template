---
soort: toegevoegd
---

- `pnpm ratchet` weigert een gewijzigd changelogfragment dat al op de merge-base met `origin/main` staat (leerpunt #877,
  sleutel `docs:fragment-behoud:<bestand>`, `scripts/kit/check-docs.mjs` regel 17): een PR op een hergebruikte branchnaam
  overschreef zo stil het item van een eerdere PR. Verwijderen en toevoegen blijven mogen.
