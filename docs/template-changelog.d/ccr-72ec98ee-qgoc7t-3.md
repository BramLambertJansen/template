---
soort: gewijzigd
---

- `main` bijhalen in een PR-branch gaat met `git merge --no-commit origin/main` en dan `git commit -F <bestand>`: een kale merge
  maakt de commit binnen de sandbox, waar ondertekenen in de cloud faalt. Wijzigt `main` iets onder `.claude/skills`,
  `.claude/agents`, `.claude/hooks` of de settings, dan merget de agent niet maar meldt hij het (skill `opleveren` stap 1,
  `docs/operations/recepten.md`, leerpunt #789).
