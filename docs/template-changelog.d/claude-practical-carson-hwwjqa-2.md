---
soort: gewijzigd
---

- `gate:fast` zet bij een rode gate de regel `✗ gate:fast rood: …` en het blok `Falende tests:` ook bovenaan de uitvoer,
  vóór de volledige uitvoer van de rode gates; het slot blijft gelijk (leerpunt #1000, `scripts/kit/gate-fast.mjs`). Een
  pre-push waarvan de uitvoer wordt afgekapt, zoals in een cloudsessie, toont zo toch welke gates en tests rood zijn.

### Bij een update

- Niets te doen.
