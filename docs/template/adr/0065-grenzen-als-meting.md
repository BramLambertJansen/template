# 0065 — Harde grenzen alleen op wat elke sessie laadt

Status: geaccepteerd

Herzien: 2026-11-03 (#469): gewijzigd door [0067](0067-krimp-op-normen.md) punt 6; [0070](0070-meting-die-stuurt.md)
punt 2 en 4
Herzien: 2026-11-16 (#744): ingekort tot wat nog geldt; de puntnummers zijn ongewijzigd, de oude tekst staat in git

Herziet [0064](0064-leesbudget-per-laag.md) punt 1 en 3 en [0063](0063-compacte-kennisbasis-en-lichtere-werkstraat.md) punt 3.
Uitwerking: spec [leesbudget](../specs/leesbudget.md).

## Context

0064 hield harde grenzen op een hoofdstuk van het regelboek (12 KB), een nieuwe spec (10 KB) en een nieuw ADR (6 KB). Op de dag
van de merge waren ze al vol: 26 van de 28 specs zijn groter dan 10 KB (echte features 30 tot 52 KB), §8 zat op 90 % en na het
herstel van verloren normen (#417) erboven. Een harde grens op zulke eenheden dwingt tot kunstmatig knippen. Dat bespaart geen
lezen: `pnpm leespad` en `feiten.mjs hoofdstuk 8` lezen §8a gewoon mee, en een spec in vier delen kost vier reviews. Bij
eerder inkorten op een plafond vielen bovendien 27 normen ongemerkt weg (#417). Herijken "bij elke release" vuurt nooit: de
template heeft geen releases. Eigenaarbesluit 2026-11-02: alleen `AGENTS.md` en `CLAUDE.md` blijven hard.

## Besluit

1. **Hard en rood alleen wat elke sessie volledig laadt:** `AGENTS.md` ≤ 9 KB en 100 regels, `CLAUDE.md` ≤ 50 regels. Over de
   grens: eerst verplaatsen naar een lagere laag (type, check, gouden pad, rules); lukt dat niet zonder verlies, dan ophogen als
   gate-wijziging met reden in de PR en eigenaarakkoord. Vanaf 85 % meldt `check-docs` het, zonder rode check. Ook hard: een
   levend ADR ≤ 6 KB (eigenaarbesluit 2026-11-17, R-DOC-01). Een bestaande overschrijding staat zonder grootte in
   `.kit/baseline.json` en groeit niet tegenover de merge-base; een nieuw ADR boven de grens is rood. Inkorten, niet splitsen
   (punt 3).
2. **Al het andere is een meting, nooit rood:** een hoofdstuk van het regelboek, het totaal van het regelboek, een spec,
   rules, skills en operations-docs. `pnpm leespad` toont ze tegenover hun streefwaarde, met "let op" erboven. De
   budget-ingangen voor deze eenheden verdwijnen uit `.kit/baseline.json`.
3. **Splitsen alleen op inhoud.** Een eenheid wordt gesplitst als een deel los gelezen kan worden, met de reden in de PR; nooit
   om onder een getal te komen. Groeien door eenheden toe te voegen (§13, §8a, een rule) blijft mogelijk; de ankers §1–§12
   blijven. Eén plek per norm en laagste laag eerst (0064 punt 3) blijven gelden.
4. **Sturen op wat gelezen wordt en op kwaliteit.** Het leespad per scenario (0064 punt 1) is
   de maat voor leeskosten. `pnpm meting --trend` meldt "let op" als reviewrondes, CI-rood of Codex-bevindingen over de
   laatste tien gemergde PR's hoger liggen dan over de tien daarvoor; de hoofdsessie noemt dat in `opleveren` en de eigenaar beslist.
5. **Herijken per roadmap-fase.** Bij het afsluiten van een fase in `docs/roadmap.md` draait de hoofdsessie `pnpm leespad` en
   `pnpm meting --trend` en stelt nieuwe streefwaarden voor in de PR die de fase afsluit.
6. *(vervallen, zie 0067)*

Ongewijzigd: 0064 punt 2 (lezen per hoofdstuk), 4 (ratchet op bestaande overschrijdingen van `AGENTS.md`), 5 (rolhek), 6
(teksttests) en 7 (schaalbaarheid).

## Alternatieven

- **0064 houden:** de volgende grote feature moet in delen, en §8 moet direct gesplitst zonder leeswinst.
- **Ook de hoofdstukgrens hard:** §8 groeit het snelst en wordt na elke nieuwe werkafspraak gesplitst; de lezer leest evenveel.
- **Grenzen ophogen:** lost het volgende volle plafond niet op.

## Gevolgen

- `check-docs` geeft voor hoofdstuk, regelboek en spec geen overtreding meer maar een melding; hun ingangen verdwijnen uit de
  baseline. Een levend ADR heeft sinds 2026-11-17 weer een harde grens (punt 1). `pnpm leespad` wordt de plek waar de metingen staan.
