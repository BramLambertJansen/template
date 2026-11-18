# 0095 — `gebouwd` zonder PR-nummer in de bouw-PR; `docs:status` vervalt

Status: geaccepteerd

Wijzigt [0054](0054-gebouwd-in-de-bouw-pr.md) punt 1 en 5, [0080](0080-specarchief-en-bouwvorm.md) punt 4, 5, 6 en 8,
[0062](0062-spec-en-bouw-in-een-pr.md) punt 4, [0046](0046-werkstraat-en-beslisroute.md) punt 6 en 10,
[0063](0063-compacte-kennisbasis-en-lichtere-werkstraat.md) punt 5 (alleen: "de developer `gebouwd` via `docs:status`") en
[0068](0068-samenhang-checks-en-rollen.md) punt 4 (alleen de uitzondering "een statusregel met geldig bewijs") en het eerste
Gevolgen-punt (het `gebouwd`-bewijs van `docs:status`). Drempel: A3 (een check vervalt: de bewijstoets van `pnpm docs:status`
en de eis van een PR-nummer in `check-roadmap`) en A4. Uitwerking: [spec](../specs/gebouwd-zonder-nummer.md). Besluiten van de
eigenaar, 2026-11-18.

## Context

Een spec gaat naar `gebouwd` met de regel `status: gebouwd # #<PR>`. Het nummer bestaat pas als de PR open is, dus kost elke
gebouwde spec een extra commit na het openen ("set PR number"), of een aparte status-PR na de merge via `pnpm docs:status`.
Sinds 25 oktober 2026 zijn 34 van de 799 commits op `main` (zonder mergecommits) een `docs(spec): mark … built`; het
overnameplan (PR #794, punt 4a) telt met de PR-nummers in herzieningsregels ongeveer 10%.

Status-PR #800 kostte drie omwegen. `docs:status` weigert in een sandbox-werkmap (het eist een schone werkmap en leest PR en
check-runs bij GitHub), dus moest het in een schone kloon draaien. `check:roadmap` werd rood omdat de spec een roadmap-id noemde
(leerpunt #791). `check-docs` werd rood op een dood pad omdat het merkteken "(vervallen)" op de volgende regel stond. Die twee
checks gaan pas af bij `gebouwd`; staat `gebouwd` niet in de bouw-PR, dan ziet de bouwer ze nooit.

Het nummer voegt weinig toe: de ruleset laat een merge alleen toe met groene verplichte checks, de AC-dekking van `check-docs`
eist een test per AC zodra de spec `gebouwd` is, en de bouw-PR is in git terug te vinden. Sinds ADR 0089 punt 8 is `gebouwd`
in de bouw-PR al een afspraak, geen guardtoets.

## Besluit

1. **Eén vorm: `status: gebouwd`, zonder PR-nummer.** De hoofdsessie of de architect zet die regel in een gewone commit van de
   bouw-PR, ook vóór het openen van de PR; er komt geen commit na het openen voor het nummer. Een roadmapvinkje van dezelfde PR
   verwijst naar een testpad of checknaam (dat mocht al), zodat ook daar geen nummer nodig is.
2. **De checks op een gebouwde spec draaien in de bouw-PR:** de AC-dekking, de dood-padcheck en de roadmap-id-regel van
   `check-roadmap` blijven zoals ze zijn. `check-roadmap` eist geen PR-nummer meer in de statusregel.
3. **`pnpm docs:status` vervalt helemaal**, met de route na de merge, de status-PR en spec `gebouwd-na-merge`. Vergeet een
   bouw-PR de status, dan zet een latere PR de regel met de hand; de AC-dekking toetst die PR zoals elke andere.
4. **Bestaande regels `gebouwd # #<n>` blijven staan.** Het nummer is commentaar; niemand zet ze om. De oude vorm met
   `; gevalideerd: <sha>` blijft in `check-docs` geweigerd.
5. **Vervolgbouw** (0080 punt 4): de bouw-PR haalt het merkteken `(nog niet gebouwd)` weg en laat de statusregel staan.
   Een gebouwde spec blijft gebouwd: het commentaar achter de status telt niet meer; nieuwe inhoud is een besluit, een
   weggehaald merkteken is bouw, en een nieuwe `; gevalideerd: <sha>` blijft geweigerd.
6. **Een vervallen AC** krijgt de vorm `**<ns>/AC-n** — Vervallen door ADR <nummer> … Was: …`. De AC-dekking slaat haar
   alleen over als dat ADR in de ADR-map naast de specmap bestaat en `geaccepteerd` is; de reviewer legt elke nieuwe
   vervallen-AC naast dat ADR. Het AC-id blijft staan (0080 punt 3).
7. **Alleen hoofdsessie en architect zetten `gebouwd`.** De developer had alleen de route via `docs:status`; die verdwijnt
   en komt niet terug als Edit (R-WERK-08).

## Alternatieven

- **Afleiden uit git** (de spec blijft `goedgekeurd`; feiten en checks berekenen "gebouwd" uit mergecommits of een trailer): in
  de bouw-PR staat de spec nog niet op `main`, dus de AC-dekking en de dood-padcheck gaan pas op `main` af. "Code geraakt" is
  geen "af" bij deelbouw of vervolgbouw, en elke lezer krijgt een git-walk te onderhouden (zie ook 0054, Alternatieven).
- **De checks op een gebouwde spec al vanaf `goedgekeurd` laten gelden:** vóór de bouw bestaan de genoemde paden en tests nog
  niet; elke nieuwe spec wordt rood of vol merktekens. Met punt 2 is het niet nodig.
- **De route na de merge houden** (`docs:status` alleen voor achteraf): houdt een script met GitHub-toegang, een schone
  werkmap en twee testbestanden in stand voor een geval dat met punt 1 zelden voorkomt en dat de AC-dekking ook dekt.

## Gevolgen

- Aanvaard risico: een latere PR die alleen de statusregel zet, toetst niet meer bij GitHub of de bouw-PR gemerged was met
  groene checks. Wat blijft: de AC-dekking in die PR, de ruleset (alleen via een PR met groene verplichte checks) en de review.
  Op een branch blijft `gebouwd` een claim; sluit de eigenaar de PR, dan komt de claim niet op `main` (0054, Gevolgen).
- Aanvaard risico, tweede geval: bij vervolgbouw haalt een PR zonder code het merkteken `(nog niet gebouwd)` weg. Staat er al
  een test die het AC-id noemt, dan ziet geen check het; alleen de review.
- Aanvaard risico: een AC in de vervallen-vorm met een bestaand, geaccepteerd ADR dat haar niet echt laat vervallen, ziet geen
  check; de reviewer legt haar naast dat ADR.
- Eén commit minder per gebouwde spec, en geen status-PR; meten zoals 0046 punt 36.
- Geen GitHub-aanroep en geen schone werkmap meer nodig om een status te zetten, dus ook niet in een sandbox of de cloud.
- De bouw-PR waarin een spec `gebouwd` werd, vind je met `git log --first-parent -S 'status: gebouwd' -- <spec>`.
- Buiten dit besluit: de PR-nummers in `Herzien:`-regels van ADR's, een apart voorstel.
