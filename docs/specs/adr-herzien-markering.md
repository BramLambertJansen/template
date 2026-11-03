---
status: voorstel
namespace: adr-herzien
---

# Herziene ADR-punten gemarkeerd in het oude ADR

## Doel

Wie een geaccepteerd ADR opent, ziet bij elk punt dat een later ADR heeft gewijzigd een markering
`(herzien door [MMMM](…))`, en `check-docs` faalt als die ontbreekt ([ADR 0073](../adr/0073-herziene-adr-punten-gemarkeerd.md)).

## Rollen en wie wat ziet

n.v.t. — documentatiecheck voor template-ADR's; geen app-gebruikers.

## Datawijzigingen (met grants)

n.v.t. — geen database.

## Routes en foutcodes

n.v.t. — geen routes.

## Kopieer de vorm van

- `scripts/kit/adr-numbers.mjs` — een pure ADR-functie in een eigen module, aangeroepen vanuit `scripts/kit/check-docs.mjs`
- `scripts/kit/check-docs.mjs` — melding per overtreding als `pad: wat ontbreekt` met het R-id

## Hergebruik en UX

n.v.t. — geen UI. Melding (één regel per ontbrekende markering):
`docs/adr/<oud>.md punt <N>: markering "(herzien door <MMMM>)" ontbreekt; <MMMM> wijzigt dit punt (R-CI-05, ADR 0073)`;
zonder punt: `docs/adr/<oud>.md: geen markering "(herzien door <MMMM>)"; <MMMM> wijzigt dit ADR (R-CI-05, ADR 0073)`.

## Acceptatiecriteria

- **adr-herzien/AC-1** — Gegeven een geaccepteerd ADR B met in de kopregel (alles vóór `## Context`) `Wijzigt`, `Herziet` of
  `Vervangt` gevolgd door `[A](A-….md) punt N` en een geaccepteerd ADR A, wanneer punt N van A (de regel `N. ` aan het begin tot
  het volgende genummerde punt of de volgende kop) geen `(herzien door [B](B-….md))` bevat, dan meldt `check-docs` dat en is
  rood.
- **adr-herzien/AC-2** — Gegeven dezelfde kopregel met `punt N, M en K` of `punt N–M` (ook `N-M`), dan geldt AC-1 voor elk
  genoemd punt afzonderlijk.
- **adr-herzien/AC-3** — Gegeven een kopregel die naar geaccepteerd ADR A linkt zonder leesbaar puntnummer, wanneer A nergens
  `(herzien door [B](…))` bevat, dan is `check-docs` rood met de melding zonder punt.
- **adr-herzien/AC-4** — Gegeven A met een `Herzien:`-regel die B noemt (link of nummer), dan telt dat als markering voor elk
  punt dat B in A wijzigt.
- **adr-herzien/AC-5** — Gegeven dat A de status `vervangen door …` of `vervallen` heeft, of in `docs/adr/archief/` staat, of B
  zelf niet geaccepteerd is, dan eist de check niets.
- **adr-herzien/AC-6** — De clausule loopt van `Wijzigt`/`Herziet`/`Vervangt` tot de eerste puntkomma of het eerste zinseinde
  buiten een link; een link in "vult [A] aan" of in een andere zin telt niet.
- **adr-herzien/AC-7** — Een fixture-repository met één ontbrekende markering maakt `check-docs` rood; dezelfde fixture met de
  markering is groen.
- **adr-herzien/AC-8** — Na de bouw-PR is `check-docs` op `main` groen: alle bestaande gevallen hebben een markering, en R-CI-05
  zegt dat een markering geen herschrijving is en in de PR van het nieuwe ADR staat.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Punt N bestaat niet in A | Melding "punt N bestaat niet in A" | n.v.t. |
| Markering staat bij een ander punt dan genoemd | Telt niet voor punt N (AC-1) | n.v.t. |
| B noemt A twee keer (twee clausules) | Punten worden samengevoegd, één melding per punt | n.v.t. |
| Markering zonder link, alleen `herzien door 0069` | Telt (nummer is genoeg), de link is de vorm voor nieuwe markeringen | n.v.t. |

## Raakt ook

- `docs/framework.md` R-CI-05 (zin over de markering), `.claude/rules/*` alleen als R-CI-05 daar letterlijk staat.
- De markeringen in elk geaccepteerd ADR dat een kopregel van een ander geaccepteerd ADR noemt (veertien gevallen volgens
  de review van 3 november 2026; de check levert de exacte lijst).

## Buiten scope

- Een samenvatting per ADR in `feiten.mjs adr` (alternatief in ADR 0073; kan later).
- Consolideren van 0045 en 0046 tot een nieuw ADR.
- Vrije formuleringen in kopregels omzetten naar puntnummers.

## Testplan

Unit: tabeltest op de parser van de kopregel (vormen uit AC-2 en AC-6, de echte kopregels van 0054, 0062, 0069 en 0071 als
gevallen) en op het zoeken van punt N. Fixture onder `test/rails/fixtures/` met één ADR-paar, rood zonder en groen met
markering (AC-7). `check-docs` op de repo zelf groen na het bijwerken (AC-8).

## Open vragen

- **OV-1** — Moet de check ook `Vult [A] aan` meenemen? Aanbeveling: nee; aanvullen laat de tekst van A geldig.
