---
soort: toegevoegd
---

- `pnpm ratchet` weigert een nieuwe regel `GEWIJZIGD (… <ns>/AC-n …)` in een testbestand als dat AC op `main` al gebouwd was
  en zijn lijstitem in de spec gelijk is aan dat op de merge-base met `origin/main` (leerpunt #940, sleutel `docs:ac-tekst:<spec>:<AC-n>`,
  `scripts/kit/check-docs.mjs` regel 20, `scripts/kit/ac-tekst.mjs`): een test die voor een AC verandert, liet zo de
  AC-tekst onwaar staan. Klopt de tekst nog (bijvoorbeeld alleen een nieuwe testnaam), zet dan `AC-tekst klopt` in het
  commentaar.
