# 0070 — Meting die stuurt: verschil met main, echt leespad, herijken met trigger

Status: geaccepteerd

Vult [0064](0064-leesbudget-per-laag.md) en [0065](0065-grenzen-als-meting.md) aan; die blijven gelden.

## Context

De review van main op 2 november 2026 vond drie zwaktes in de meting (L5–L7). Een meting stuurt alleen als ze afgaat
wanneer er iets verandert, meet wat een agent echt leest, en op het afgesproken moment draait.

- **L5, meldingen die altijd afgaan.** `pnpm leespad` meldt bij elke run "let op: N erboven" (bij schrijven onder meer
  25 specs en 9 ADR's), ook waar 0065 de streefwaarde zelf onhaalbaar noemt. In `pnpm meting --trend` volstaat elke
  stijging, ook van 0,1; met drie maten gaat het alarm bijna altijd af. De meldingen van de ratchet staan alleen in een
  groene CI-log. Een melding die altijd afgaat, leert iedereen hem te negeren.
- **L6, leespad meet een vaste lijst.** Verplichte leesacties tellen niet mee: de uitvoer van
  `node scripts/kit/feiten.mjs gates specs fase` (bij schrijven ~6 KB) en de padregels in `.claude/rules/` (~22 KB samen),
  die Claude Code laadt zodra een agent een bestand in dat pad leest. De uitvoer van `feiten.mjs specs` en `fase` groeit
  met elke spec en elk open roadmap-item. Dat botst met R-DOC-09: wat een agent verplicht leest, groeit niet mee.
- **L7, herijken heeft geen trigger.** R-DOC-08 legt het herijken van streefwaarden bij het afsluiten van een
  roadmap-fase, maar niets roept het daar aan. 0065 noemde dezelfde zwakte bij "per release".

## Besluit

1. **"Let op" alleen bij verschil met main.** `pnpm leespad` vergelijkt met de basis (`origin/main`, zoals `--ref` al
   kan). "Let op" komt alleen als een scenario groeit of het aantal boven de streefwaarde stijgt; een gelijk gebleven
   overschrijding staat er neutraal ("N erboven, gelijk aan main"). Zonder basis blijft de meting zoals nu.
2. **De trend meldt alleen een echte stap.** "Let op: <maat> steeg" komt pas als het gemiddelde over de laatste tien
   minstens 0,5 en minstens 25 % hoger ligt dan over de tien daarvoor. Bij een gemiddelde van 0 over de tien daarvoor
   telt alleen de 0,5.
3. **Meldingen staan in de PR, niet alleen in de log.** De CI-job `gate:fast` schrijft de meldingen van de ratchet en
   van `pnpm leespad` tegen de basis naar de samenvatting van de job (`$GITHUB_STEP_SUMMARY`). De skill `opleveren` zet
   dezelfde regels, met die van de trend, in de PR-beschrijving. Geen PR-comment: dat vraagt schrijfrecht voor de
   workflow.
4. **Het leespad telt wat een agent verplicht leest.** Per scenario telt naast de bestanden de uitvoer van de
   verplichte `feiten.mjs`-aanroepen, en voor `nieuwe-feature` de padregels van `api`, `web` en `database` (het
   zwaarste geval). De uitvoer die met de repo groeit, krijgt een plafond: `feiten.mjs specs` toont de specs op
   `voorstel` en `goedgekeurd` met een telling van de rest, `feiten.mjs fase` alle items onder "Nu" en hoogstens vijf
   onder "Volgende" met een telling van de rest. `--alle` geeft de volledige lijst, zoals bij `adr`. Een test toetst
   dat het leespad met 200 extra specs en 50 extra roadmap-items hoogstens 1 KB groeit. De streefwaarden van 0064
   punt 1 gaan pas omhoog of omlaag in de bouw-PR, op basis van de eerlijke meting; de eigenaarmerge beslist.
5. **Herijken krijgt een trigger.** `pnpm check:roadmap` ziet dat een PR een fase sluit: op de basis had die fase
   minstens één open item, na de PR geen. Dan vraagt de check in dezelfde PR een regel
   `Herijking fase <n>: <datum> — leespad …; trend …` in `docs/roadmap-archief.md`. Zonder die regel is de check rood.
   Items met "fase onbekend" tellen niet. Zonder basis meldt de check het lokaal en is hij in CI rood, zoals de
   krimpcontrole.

## Alternatieven

- **Streefwaarden verhogen tot er niets meer boven zit:** het alarm zwijgt, maar ook bij echte groei. Verworpen.
- **Alleen een vaste drempel op de trend (bijvoorbeeld +1):** te grof bij kleine gemiddelden, te fijn bij grote.
  Verworpen; absoluut en relatief samen.
- **Een PR-comment door CI:** het zichtbaarst, maar de workflow krijgt dan schrijfrecht op PR's. Verworpen.
- **Padregels niet meetellen omdat de runtime ze laadt:** dat is precies het deel dat een agent niet kan overslaan.
  Verworpen.
- **Herijken via een stap in `docs/dod.md`:** proza zonder check werd al overgeslagen (0065). Verworpen.

## Gevolgen

- Een melding betekent weer iets: hij gaat af bij verandering. De eigenaar ziet hem op de PR.
- Het gemeten leespad voor `nieuwe-feature` stijgt fors (de padregels tellen mee). Dat is de echte kost; de bouw-PR
  stelt nieuwe streefwaarden voor.
- Een agent die een gebouwde spec of een later roadmap-item zoekt, gebruikt `--alle`.
- Een PR die de laatste open taak van een fase afvinkt, wordt groter: de herijking hoort erbij.
