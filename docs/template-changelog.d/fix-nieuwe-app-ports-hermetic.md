---
soort: opgelost
---

- De poorttests van `nieuwe-app` en `dev.mjs` hangen niet meer af van wat er op de host draait (leerpunt #856): de
  testvariabele `NIEUWE_APP_BEZETTE_POORTEN` vervangt de echte bind in `scripts/kit/nieuwe-app.mjs` (`poorten`) en in de
  poortcontrole van `scripts/dev.mjs`. Zo faalt de pre-push niet meer als de eigen lokale stack draait, en racen de
  dev-tests niet meer met andere tests die een standaardpoort even bezetten (`test/scripts/nieuwe-app-poorten.test.ts`,
  `test/scripts/dev.test.ts`).
