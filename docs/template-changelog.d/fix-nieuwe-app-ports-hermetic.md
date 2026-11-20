---
soort: opgelost
---

- De poortentest van `nieuwe-app` faalt niet meer als de eigen lokale stack draait (leerpunt #856): de testvariabele
  `NIEUWE_APP_BEZETTE_POORTEN` vervangt in `scripts/kit/nieuwe-app.mjs` de echte bind, en de CLI-test "zonder bezette
  poorten" gebruikt die (`test/scripts/nieuwe-app-poorten.test.ts`).
