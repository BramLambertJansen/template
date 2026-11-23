---
soort: opgelost
---

- Een bewijstest met `expectAbsent` of `expectNegativeTable` telt in `leerpunt-bewijs` als rood in plaats van als laadfout
  (leerpunt #875): een gevonden match of een rijfout is nu een `AssertionError` (`test/support/absence.ts`,
  `test/support/negative-table.ts`); een fout in de opzet (patroon te smal of te breed, geen voorbeelden, lege tabel,
  onware basis) blijft een gewone `Error`.
