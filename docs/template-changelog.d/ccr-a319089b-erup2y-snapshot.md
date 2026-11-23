---
soort: opgelost
---

- `check:snapshot` geeft bij een mislukte bouw op volgorde van binnenkomst niet meer het advies van een nieuwe migratie
  achteraan, want dbmate bereikt die niet. Het noemt de eerste fout in de runneruitvoer als vertrekpunt: een eigen migratie die
  nog niet op `main` staat krijgt een nieuwer tijdstempel, een update uit een templaterelease blijft ongemerged tot een
  release het herstelt. Bij twee complete, verschillende schema's blijft het advies van een nieuwe
  migratie. `scripts/check-snapshot.sh`, fouttabel in `docs/nieuwe-app.md` (leerpunt #810).
