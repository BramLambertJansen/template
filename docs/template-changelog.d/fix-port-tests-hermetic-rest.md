---
soort: opgelost
---

- De overige poorttests hangen niet meer af van wat er op de host draait (vervolg op leerpunt #856): `scripts/dev.mjs`
  gebruikt in zijn poortcontrole ook de testvariabele `NIEUWE_APP_BEZETTE_POORTEN`, zodat de dev-tests niet meer racen
  met andere tests die een standaardpoort even bezetten; de AC-5- en AC-7-tests van `poorten` verwachten +10 zonder een
  echte listener (`test/scripts/dev.test.ts`, `test/scripts/nieuwe-app-poorten.test.ts`).
