---
soort: toegevoegd
---

- `pnpm pr:log <nr>` toont per rode CI-job van een PR alleen de regels rond elke `##[error]`, lokaal en in de cloud. Het script
  leest alleen en draait buiten de sandbox onder de ankertoets van het rolhek (alleen de hoofdsessie, alleen precies die vorm,
  scripts, rails en hostbestanden gelijk aan het anker); de permissie staat in `ask` (spec `ci-log`, ADR 0102).

### Bij een update

- `.claude/settings.json` krijgt `Bash(pnpm pr:log *)` in `ask` en `pnpm pr:log *` in `sandbox.excludedCommands`; neem ze over als
  de app eigen settings heeft. Het rolhek geeft het script pas vrij als het anker van de sessie deze versie heeft.
