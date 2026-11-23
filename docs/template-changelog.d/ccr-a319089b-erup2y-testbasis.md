---
soort: opgelost
---

- Het rolhek behandelt een testbestand pas als bestaande test als het op origin/main of het anker staat (de merge-base).
  Een developer mag zijn eigen nieuwe testbestand dus bewerken en verwijderen, ook als het al op de branch is gecommit;
  is origin/main onleesbaar, dan telt het bestand als bestaand (leerpunt #887, `rails/hooks/lib/rolhek.mjs`).
