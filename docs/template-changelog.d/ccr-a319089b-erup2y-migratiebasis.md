---
soort: opgelost
---

- Het rolhek telt een migratie als gecommit als hij op de tip van origin/main of het anker staat, los van HEAD. Met
  `git checkout --orphan` of `git reset --soft` kon een developer een gecommitte migratie anders toch wijzigen. Zijn
  origin/main en het anker allebei onleesbaar, dan telt elke bestaande migratie als gecommit (leerpunt #927,
  `rails/hooks/lib/rolhek-context.mjs`).
