---
soort: opgelost
---

- Een crash van `rails/hooks/werkstraat.mjs` in `post-edit`, `stop` of `subagent-stop` (bijvoorbeeld een laadfout vóór de
  eigen foutafhandeling van het script, exit 1) laat de poort niet meer door: `.claude/hooks/laden.mjs` maakt van elke
  exitcode anders dan 0 of 2 een 2, zoals al voor het rolhek gold. `session-start` laat een fout bewust door en blijft
  ongewijzigd (leerpunt #995; tests in `test/hooks/hooks-van-main.test.ts`).
