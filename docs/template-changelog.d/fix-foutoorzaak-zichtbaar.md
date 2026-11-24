---
soort: opgelost
---

- `gate:fast` sluit bij een rode `test:unit` af met een blok `Falende tests:` dat alleen de namen van de falende tests noemt,
  zodat ze ook zichtbaar blijven als een tool de lange uitvoer in het midden afkapt (leerpunt #957). De formatterhook meldt
  nu een mislukte Prettier in plaats van niets, en de tester-SubagentStop noemt bij een ontbrekend of onleesbaar
  vitest-rapport ook de oorzaak uit de procesuitvoer (leerpunt #817).
