---
soort: gewijzigd
---

- Een leerpunt met trede Skill, Padregel of `AGENTS.md` sluit met een gedragsbaseline (ADR 0107, spec `gedragsbaseline`):
  `bewijs baseline: zonder <a>/3, met 3/3 (<model>)` met een blok `### Scenario #<nr>`, of `bewijs geen baseline: <reden>`.
  De job `leerpunt-bewijs` (`scripts/kit/leerpunt.mjs`) toetst de vorm en weigert bij die treden een testpad of
  `geen test:`. Recept: `docs/operations/gedragsbaseline.md`.

### Bij een update

- Een open PR die een leerpunt met trede Skill, Padregel of `AGENTS.md` sluit met `bewijs geen test: <reden>`, wordt rood:
  zet er `bewijs baseline: …` met scenarioblok of `bewijs geen baseline: <reden>` voor in de plaats.
