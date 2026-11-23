---
soort: opgelost
---

- `pnpm meting *` staat in `sandbox.excludedCommands` van `.claude/settings.json`, zodat `pnpm meting --trend` in een
  cloudsessie de PR-lijst en de CI-runs via `gh` kan ophalen in plaats van altijd "trend onbekend" te melden. Zoals bij elke
  netwerkvorm weigert het rolhek `pnpm meting` in een pipe of keten (leerpunt #899, `docs/ENVIRONMENT.md`).

### Bij een update

- Een app die `.claude/settings.json` zelf beheert, neemt `"pnpm meting *"` op in `sandbox.excludedCommands`; anders blijft
  `pnpm meting --trend` in de cloud "onbekend".
