---
soort: opgelost
---

- Het rolhek behandelt een testbestand pas als bestaande test als het op de tip van origin/main of het anker staat, los
  van HEAD. Een developer mag zijn eigen nieuwe testbestand dus bewerken en verwijderen, ook als het al op de branch is
  gecommit. Zijn origin/main en het anker allebei onleesbaar, dan telt elk testbestand als bestaand. Dat geldt ook voor
  nieuwe fixtures en setup: alleen wat op main staat, is vergrendeld (leerpunt #887, `rails/hooks/lib/rolhek-context.mjs`).
