---
soort: opgelost
---

- `leerpunt-bewijs` is rood bij een regel in `## Leerpunt` voor een issue dat de PR niet sluit (geen sluitwoord of
  koppeling), met de uitweg `Closes #<nr>`. Zonder die fout bleef de job groen zonder proef en sloot het issue niet bij de
  merge (leerpunt #717, `scripts/kit/leerpunt.mjs`, randgeval in spec `leerlus-bewijs`).
