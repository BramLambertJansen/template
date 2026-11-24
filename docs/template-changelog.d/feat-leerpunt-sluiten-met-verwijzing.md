---
soort: toegevoegd
---

- De hoofdsessie mag een leerpunt sluiten als opgelost (`gh issue close --repo <repo> <nr> --reason completed`, ook `-r`)
  na een comment `opgelost: <verwijzing>` (`#<pr>`, commit-SHA of `ADR <nnnn>`); de job `leerpunt` telt die sluiting als
  bewijs als elke genoemde PR gemerged is in de standaardbranch (spec `leerlus-bewijs` AC-16..AC-20, ADR 0109,
  `rails/hooks/lib/rolhek.mjs`, `scripts/kit/leerpunt-check.mjs`).
