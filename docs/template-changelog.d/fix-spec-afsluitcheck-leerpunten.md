---
soort: opgelost
---

- De afsluitcheck van de skill `spec` (stap 6 in `.claude/skills/spec/SKILL.md`) heeft twee nieuwe punten. Het eerste:
  een nieuwe module krijgt vóór de tests een stub met de definitieve signaturen, zodat een test op een assertie faalt en
  niet op een import- of typefout (leerpunt #677). Het tweede: een verruiming van het rolhek wordt getoetst tegen R-ROL-10 en
  R-ROL-11, en een terugval moet een mechanisme noemen dat het gedrag echt verandert (leerpunt #956).
