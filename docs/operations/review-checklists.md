# Review-checklists per risicoklasse

De reviewer bepaalt de klasse(n) van de diff en loopt alleen die lijsten af. Elke regel is een patroon dat eerder doorgleed; een nummer verwijst naar het leerpunt, zonder nummer naar de PR-review. Een nieuw patroon komt hier als regel, via een leerpunt.

## Werkwijze

- Doe één volledige review met alle klassen van de diff; daarna alleen `git diff <vorige-sha>..HEAD` op de fixes. De hoofdsessie geeft de vorige `## Bevindingen` mee; de delta toetst elke bevinding en loopt ook de lijsten van de klassen die de fixes openen.
- Raakt een fix een nieuw bestand, een beschermd pad of een rail (`rails/**`, `scripts/kit/**`, `test/rails/**`), dan volgt opnieuw een volledige review van dat deel, evenals als de vorige sha geen voorouder van HEAD is (rebase, merge van main). Lees de aanroepers van een gewijzigde export.
- Kritiek werk (R-WERK-05) in een app: spec eerst in een besluit-PR; een statusovergang naast een kritiek pad (padtabel: `besluit-pr`, `altijdVragen`) is daar een bevinding; geen check toetst dit meer (ADR 0089 punt 8).

## Rolhek en hooks

- gh lees je met `ghCommandWords`, niet op positie van groep en actie (#399).
- Opties per programma: afkortingen, `--optie=waarde` en schrijfopties zoals `git diff --output`, `sort -o`, `find -delete` (#395, #409).
- Elke schrijfvorm van elk toegelaten programma telt als schrijfdoel; de aanvalstests blijven ongewijzigd groen.
- Een weigering moet een echte aanval stoppen én een vals-positieve test hebben.
- Werking en bekende gaten: `node scripts/kit/feiten.mjs hoofdstuk 13`.

## Tests

- Een negatieve tabel loopt via `expectNegativeTable` (`rails/negatieve-tabel`, #401); een lus (`for … of`, `forEach`), een verwachtingskolom (`toBe(want)`), `null`, `[]`, `!x` of `assert` valt erbuiten: toets die zelf op een ware basis, en draai hem tegen de oude code.
- `testChangeRisk` (#424, #410, `rails/hooks/lib/testvoorwaarde.mjs`): skip-modifiers en meer voorwaardelijke tests tellen als skip. Zelf als skip zien: `test.extend`-alias, lus, netto gelijk aantal, `${…}`/JSX, voorwaardelijk aangeroepen helper, `describe.each(ok ? rows : [])`.
- Tests ruimen hun tmp-mappen op (#396); geen absolute milliseconden, wel een verhouding of ruime marge.
- Een toets op code leest de AST (`test/rails/kooi-voorwaarde.test.ts`), geen regex over de bron (R-CODE-01, #835).

## Tekstchecks

- Een afwezigheidstest loopt via `expectAbsent` (`rails/afwezigheid`, #402); kijk of `recognizes` elke vorm en taalvariant uit de bron noemt, ook het Nederlandse woord ("mandaat").
- Elke geschrapte norm houdt een R-id of een reden; normwoorden onder "Hoe (geen norm)" weigert `check-docs` (regel 12, #393).

## Schaal en scripts

- Geen `[...lijst, x]` in een lus en geen `Math.max(...lijst)` over onbegrensde invoer (#412).
- Een lege optiewaarde aan een externe CLI schakelt diens filter uit: weiger haar (`--branch=`).
- Opslag bevat alleen tellingen en sleutels, nooit prompts, commando-argumenten of bestandsinhoud.

## API en data

- Waar een route een waarde teruggeeft die zij zelf als invoer accepteert (cursor), moet de uitvoer door het eigen invoerschema (#411).
- Voor RLS, secdef, CSRF en foutuitvoer: skill `security-review`.

## App-logica

Uit de review van 19 oktober 2026 (`docs/reviews/2026-10-19-review-regressions.md`, R2, R3, R5 en R9): fouten in app-logica die doorgleden.

- Transactiegrens: één `withUser`-transactie per request (R-DB-03); een bijwerking buiten de database (mail, tokenopslag, sessies intrekken) volgt na de commit via `ctx.afterCommit` (`docs/gouden-pad.md`) en een fout daarin laat een herstelbare toestand achter.
- Uniekheid, geld of statusovergang: een racetest waarin precies één van twee gelijktijdige requests slaagt en de audit één regel schrijft (R-TEST-03).
- Cache: een mutatie invalideert de eigen resource plus wat de spec onder "Raakt ook" noemt (R-WEB-02); uitloggen en een 401 wissen de cache vóór de navigatie.
- Eigenaarscontrole in elke gewijzigde handler: de actor komt uit `ctx.actor`, niet uit de invoer; toegang tot een resource uit de invoer loopt via RLS (R-DB-04).

## Docs en instructies

- Gedrag, API of conventies gewijzigd: doc in dezelfde PR (R-WERK-15).
- Een omgezette test noemt reden en regel in de PR; verwijderen of skippen vraagt eigenaarakkoord.
- Wijzigt of verdwijnt een definitie `- **R-…**`: is de norm niet uitgehold, staat een verplaatste norm inhoudelijk bij de nieuwe R-id, is de schrapreden aanvaardbaar (`docs/normen-vervallen.md`, ADR 0067)? Mist er een norm zonder R-id? Die vangt geen check.
