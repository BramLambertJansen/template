---
soort: opgelost
---

- `leerpunt-bewijs` aanvaardt een typetest niet meer als rood bewijs als `tsc` op de basis niet startte, geen
  `error TS`-diagnose gaf of alleen een configuratiefout (TS5058, TS5083, TS18003); dat telt nu als laadfout (leerpunt #814).
  De laadfoutmelding zegt erbij dat een bewijstest alleen importeert wat al op de basis staat en dat een nieuwe helper in het
  testbestand zelf hoort (leerpunt #892). `scripts/kit/leerpunt.mjs`, spec `leerlus-bewijs` (randgevallen).
