---
soort: toegevoegd
---

- Bewaking van de toolchain (spec `toolchain-bewaking`, R-PROV-04): `pnpm check:toolchain`
  (`scripts/kit/check-toolchain.mjs`) meldt als Node, pnpm of TypeScript achterloopt op "hoogste binnen de vertrouwde
  major", of als de volgende major klaar is. De workflow `.github/workflows/toolchain.yml` draait hem wekelijks en houdt
  één issue bij; `pnpm template:status` verwijst ernaar. `dependency-achterstand` meldt nu ook een update-PR met rode CI
  op zijn head (`CI rood (<check>)`), ongeacht de leeftijd.

### Bij een update

- De nieuwe workflow `toolchain` draait wekelijks (dinsdag 06:41 UTC) en mag in de app één issue aanmaken, bijwerken en
  sluiten (`issues: write`, titel `Toolchain: achterstand of volgende major`). Wil de app die bewaking niet, verwijder dan
  `.github/workflows/toolchain.yml`; `pnpm check:toolchain` blijft lokaal werken.
