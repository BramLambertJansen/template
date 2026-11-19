# 0099 — De leeslijst van het rolhek wordt ruimer; schrijven blijft even streng, op een vervallen spec na

Status: geaccepteerd

Herziet [0087](0087-reviewer-zoekt-met-git-grep.md) punt 5, [0064](0064-leesbudget-per-laag.md) punt 5 (de zin "pipes en
`git grep` komen er niet bij") en [0091](0091-effecttoets-vervalt.md) punt 3 ("de toets vooraf wordt niet verder
uitgekleed"), voor lezen en voor de inhoud van een vervallen spec (punt 4); en [0046](0046-werkstraat-en-beslisroute.md) punt 6 voor de inhoud van een vervallen spec.
De zin in R-ROL-10 die hierdoor een uitzondering krijgt, heeft twee bronnen: "geen nieuwe regel per programma meer" komt uit
het vervallen [0066](0066-schrijfgrens-op-effect.md) punt 3, "niet verder uitgekleed" uit 0091 punt 3. Drempel: A3 (het
rolhek wordt ruimer) en A4. Eigenaarbesluit 18 november 2026; de open vragen OV-2 tot OV-6 besloot de eigenaar op
19 november 2026. Aanleiding: leerpunten #736, #753 en #757. Uitwerking: [spec rolhek-lezen](../specs/rolhek-lezen.md) AC-11
tot AC-20.

## Context

Een reviewer en een ad-hoc leessubagent (een onbekende subagent telt als reviewer) kregen onschuldig leeswerk geweigerd:
`wc`, `head`, `sed -n`, `ls`, `git worktree list`, `git branch -r`, `git tag --list`, `git ls-tree`, `git cat-file -s`,
`git rev-parse`, `git -C <werkmap>`, `gh pr list`, `gh issue list --search` en pipes tussen lezers. Een triage bleef daardoor
onvolledig, of de hoofdsessie moest vooraf alles aanleveren. Voor elke rol weigert het rolhek elke tekst met de naam van het
mergescript, ook in een zoekpatroon, `git add`, een commitbericht of een branchglob. Een subagent kreeg een zoekpatroon met
`gh pr list` geweigerd. Voor de andere rollen laat het rolhek de leescommando's uit #753 al door. #757 bleek een juiste
weigering met een verkeerde melding: het ging om een vervallen spec, niet om een gebouwde.

## Besluit

1. **De reviewer krijgt meer leesvormen, elk met een vaste optielijst en met de gevaarlijke buren uitdrukkelijk dicht.** Het
   gaat om bestandslezers (`wc`, `head`, `tail`, `sed -n '<a>,<b>p'`, `ls`) die alleen bestanden lezen die git volgt en
   waarvan het echte pad in de werkmap ligt, om pipes tussen lezers zonder redirect, om leesvormen van `git worktree`,
   `branch`, `tag`, `ls-tree`, `cat-file` en `rev-parse`, om `git -C` naar de root van de repo of van een eigen werkmap, en om
   `gh pr list` en `--search`. Een leesvorm komt erbij met een leerpunt en een tabeltest; dat is geen regel per programma
   voor schrijven.
2. **Het vangnet op de mergescriptnaam weigert alleen een segment dat iets kan starten.** Een naam als pad, patroon of
   berichttekst in een lezer of in `git add|commit|…` telt niet. Een lezer telt alleen in de vorm die de reviewer mag, voor
   elke rol dezelfde toets. Een naam telt wel in een segment met een uitvoerredirect, of in een lezer die zijn uitvoer via
   een pipe doorgeeft aan iets dat start. Bij een substitutie of een onzekere lezing blijft de regel van nu gelden.
3. **Het subagentvangnet op `gh` in tekst wijkt alleen voor zeker gelezen lezers** die binnen de repo lezen, zodat
   `~/.config/gh` dicht blijft. Het vangnet op mergen en goedkeuren (WS-04) blijft voor elke rol.
4. **Schrijven blijft even streng, met één uitzondering.** Geen schrijfregel vervalt. Architect en hoofdsessie mogen de
   inhoud van een vervallen spec wijzigen (OV-2; de merge door de eigenaar beslist); een vervallen ADR blijft onwijzigbaar
   (A4). Een weigering bij een documentovergang noemt de echte regel.

## Alternatieven

- **Alles wat leest toestaan, zonder lijst:** `sed`, `sort` en `uniq` schrijven, `find`, `awk` en `sed e` starten iets; zonder
  lijst ziet het rolhek dat verschil niet.
- **De naamweigering voor het mergescript schrappen:** dan opent een pipe naar `node` of `xargs` het mergescript buiten de
  ankertoets (ADR 0069).
- **Niets doen:** dan blijven triage en review afhankelijk van wat de hoofdsessie aanlevert, en dat ondermijnt de
  onafhankelijkheid (R-ROL-05).

## Gevolgen

- R-ROL-10 krijgt de uitzondering "behalve leesvormen volgens rolhek-lezen (0099)", en R-ROL-11 krijgt
  `gh pr list --search "merge"` als vals-positief.
- `git ls-files -- 'scripts/kit/pr-mer*' | xargs node` gaat nu ook voor de hoofdsessie dicht; tot nu toe ging het door.
- Het `w`- en `e`-commando van `sed` blijft voor de andere rollen een bekend gat (zelfde klasse als `node -e`); het komt op de
  roadmap.
