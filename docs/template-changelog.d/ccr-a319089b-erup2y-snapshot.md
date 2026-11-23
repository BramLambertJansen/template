---
soort: opgelost
---

- `check:snapshot` geeft bij een mislukte bouw op volgorde van binnenkomst niet meer het advies van een nieuwe migratie
  achteraan, want dbmate bereikt die niet. Het noemt de eerste fout van de runner of dbmate als vertrekpunt en houdt de update
  tegen tot die een uitvoerbaar herstel heeft. Bij twee complete, verschillende schema's blijft het advies van een nieuwe
  migratie. `scripts/check-snapshot.sh`, fouttabel in `docs/nieuwe-app.md` (leerpunt #810).
