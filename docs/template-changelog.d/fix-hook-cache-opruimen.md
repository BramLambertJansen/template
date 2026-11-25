---
soort: opgelost
---

- De hook-lader ruimt zijn cache op: na `werkstraat session-start` wist `.claude/hooks/laden.mjs` elke uitgepakte versie
  in `.claude/hooks/.cache/` die niet bij het anker hoort en langer dan een dag niet gebruikt is, plus achtergebleven
  tijdelijke mappen. Elk hergebruik zet de mtime van de versie op nu. Voorheen groeide de cache met elke wijziging van
  `rails/hooks` op main (in de template 41 versies, 12 MB in vijf weken). Opruimen gebeurt pas na de hook en elke fout
  wordt ingeslikt, dus uitvoer en exitcode van een hook veranderen niet; het anker en symlinks blijven staan (tests in
  `test/hooks/hooks-van-main.test.ts`).
