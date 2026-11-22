---
soort: toegevoegd
---

- `check-docs` (in `pnpm ratchet`, strikt) faalt als een PR een uitgebrachte sectie `## [x.y.z]` van
  `docs/template-changelog.md` wijzigt of verwijdert tegenover de merge-base met `origin/main`
  (`docs:changelog-behoud:<versie>`, regel 19 in `scripts/kit/check-docs.mjs`, leerpunt #837). Zo'n regel kwam in geen
  enkele release; zet de wijziging als fragment in `docs/template-changelog.d/`.
