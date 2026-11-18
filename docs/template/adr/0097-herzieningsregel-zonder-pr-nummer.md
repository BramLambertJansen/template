# 0097 — De herzieningsregel heeft geen PR-nummer meer

Status: geaccepteerd

Wijzigt [0074](0074-herziene-adr-punten-gemarkeerd.md) punt 2 (de vorm van de regel). Drempel: A4 (afspraak over
geaccepteerde ADR's). Besluiten van de eigenaar, 2026-11-18.

## Context

Een herschreven of door een later ADR gewijzigd ADR krijgt bovenin `Herzien: JJJJ-MM-DD (#NNN): wat`, met het nummer van de
eigen PR (R-CI-05, 0074 punt 2). Dat nummer bestaat pas na het openen van de PR. De agent raadt het, opent de PR en doet een
extra commit en push als het niet klopt; issues en PR's delen één teller, dus raden mislukt geregeld (#804 werd #805 op
2026-11-18). In de git-log staan zo'n tien commits die alleen dat nummer zetten.

Geen check gebruikt het nummer. Het rolhek eist de vorm alleen om een herschrijving `herzien` te noemen in plaats van `a4`, en
behandelt die twee gelijk; de herzieningscheck in `check-docs` verdween met 0089 punt 5. Wie de PR zoekt, vindt hem via de
commit op main, die het nummer draagt (`git log --first-parent -S '<regel>' -- <adr>` of `git blame`).

## Besluit

1. **Vorm:** `Herzien: JJJJ-MM-DD: wat`. Wijzigt een later ADR het punt, dan noemt de regel dat ADR en de punten
   (`gewijzigd door <link naar B> punt N, M`), zoals 0074 punt 2 al vraagt; dat maakt een regel uniek, ook naast een andere
   regel op dezelfde datum.
2. **Een PR-nummer mag nog** (`Herzien: JJJJ-MM-DD (#NNN): wat`): bestaande regels blijven geldig en niemand zet ze om.
3. **Bron van de PR** is de git-geschiedenis: de commit op main die de regel toevoegde.

## Alternatieven

- **Het nummer verbieden in nieuwe regels:** vraagt een check die het verschil tussen oud en nieuw ziet, voor geen winst.
- **De branchnaam in plaats van het nummer:** zelfde werk, minder waarde; een branch verdwijnt na de merge.
- **Een plaatshouder die CI invult:** CI mag niet naar main pushen; invullen vóór de merge geeft weer een commit en een
  nieuwe CI-run.

## Gevolgen

- Geen commit meer na het openen van de PR om een nummer te zetten.
- Op GitHub staat de PR niet meer direct in de regel; `git blame` of `git log -S` vindt hem.
- R-CI-05, de meldtekst in `rails/hooks/lib/document-state.mjs` en `docs/operations/agent-doorloop.md` noemen de nieuwe vorm.
