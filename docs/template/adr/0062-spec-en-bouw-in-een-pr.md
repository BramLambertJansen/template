# 0062 — Spec en bouw in één PR

Status: geaccepteerd

Herzien: 2026-10-30 (#379): punt 4 geldt ook na de merge; voor een gemergde PR vervalt "de PR open is" uit 0046 punt 10 en
volgt het bouwbewijs uit de mergecommit (spec `gebouwd-na-merge` (vervallen)).
Herzien: 2026-10-30 (#385): in punt 2 vervallen "gate-label" en "of mandaat"
([0063](0063-compacte-kennisbasis-en-lichtere-werkstraat.md)).
Herzien: 2026-11-04 (#535): gewijzigd door [0079](0079-een-padtabel.md) punt 2, de kritieke paden komen uit de kolom
`besluit: besluit-pr` van de padtabel in `.claude/gates.json`, niet meer uit een lijst in `scripts/kit/lane.mjs`
Herzien: 2026-11-05 (#541): gewijzigd door [0080](0080-specarchief-en-bouwvorm.md) punt 4, ook voor een gemergde PR vervalt de vorm met SHA;
`gebouwd # #<PR>` noemt dan de gemergde bouw-PR
Herzien: 2026-11-12 (#692): door ADR 0089 punt 1 en 3, in de template deels: punt 2 en 5, vervalt: kritiek werk en elk ADR eerst in een aparte besluit-PR; blijft: spec-review, spec vóór code, eigenaarmerge
Herzien: 2026-11-12 (#696): door ADR 0089 punt 5 en 8, de vorige regel vervalt: geen lane in de template; zodra de GitHub App bewezen is, verdwijnt `check-document-status`; punt 2 en 5 (kritiek werk eerst in een besluit-PR) en de volgorde uit punt 3 worden afspraken die de eigenaar met zijn goedkeuring op de PR beslist; de spec-review blijft
Herzien: 2026-11-12 (#703): punt 2 en 5, in de template gaat ook kritiek werk in één PR; de besluit-PR blijft een afspraak in een app (ADR 0090 punt 4)
Herzien: 2026-11-16 (#744): ingekort tot wat nog geldt; de puntnummers zijn ongewijzigd, de oude tekst staat in git
Herzien: 2026-11-18 (#805): gewijzigd door [0095](0095-gebouwd-zonder-pr-nummer.md) punt 1 en 3, punt 4: `status: gebouwd`
zonder PR-nummer; de toets van `docs:status` na de merge vervalt, en daarmee de eerste regel hierboven
Herzien: 2026-11-19: verwijzingen naar verwijderde documenten wijzen naar de opvolger of zijn weg (spec vervallen-documenten-weg)
Herzien: 2026-11-22: gewijzigd door [0104](0104-gebouwd-uit-ac-dekking.md) punt 1, 2 en 7, punt 4: de spec gaat niet meer met de hand naar `gebouwd`; ze is gebouwd zodra elk levend AC een test op `main` heeft; geldt vanaf de bouw-PR

Wijzigt [0046](0046-werkstraat-en-beslisroute.md) punt 5, 10, 12, 14 en 15. Drempel: A3 (de lanetoets in
`check-document-status` laat meer toe) en A4 (afspraken uit een geaccepteerd ADR). Uitwerking: [spec gebouwd-zonder-nummer](../specs/gebouwd-zonder-nummer.md), gebouwd-zonder-nummer/AC-13 en gebouwd-zonder-nummer/AC-14.

## Context

De eigenaar wil spec en bouw in één PR (opdracht 2026-10-29): de aparte spec-PR en de statuscommit achteraf houden de flow op.
Gemeten wrijving (P1, P6): elk volledig stuk templatewerk kostte twee PR's met elk een eigen CI-lus, bijvoorbeeld #362 en #346
(app-init-proef) en #371 en #372 (sandbox). Daarna kost `gebouwd` nog een extra CI-ronde op een statuscommit, die bovendien
rood wordt na een `git merge origin/main` (leerpunt #314).

De oorzaak is de smalle feature-lane uit 0046 punt 14: alleen één nieuwe mini-spec, en geen `src/core`, geen pad uit
`voorReview` en geen gewijzigde bestaande test. Vrijwel al het templatewerk valt erbuiten. Het vroege stopmoment dat de aparte
spec-PR gaf, is voor gewoon werk weinig waard: een afgekeurde PR kost alleen agenttijd, en de eigenaar beoordeelt spec en code
toch samen bij de merge.

## Besluit

1. **Eén PR is de standaard.** Een of meer specs met een eigenaarstatus (nieuw, volledig of mini, of een inhoudelijke wijziging
   van een goedgekeurde spec) mogen samen met code, tests en docs in één PR. De merge door de eigenaar blijft het besluit
   (0046 punt 1); afwijzen blijft de PR sluiten.
2. **Kritiek werk in een app eerst in een aparte besluit-PR (R-WERK-05); in de template in één PR (0090 punt 4):**
   - elk ADR (nieuw, herschreven, vervangen of vervallen);
   - auth en gegevensisolatie: `src/core/api/auth/`, `src/core/api/db/`, `db/init/`, een migratie buiten het owner-tabelpatroon
     uit `new:resource`, en een gewijzigde of verwijderde migratie;
   - de bewaking zelf: de paden in `altijdVragen` (CI, hooks, Claude-instellingen, het gate- en besluitregister,
     dependencies) en de scripts die over besluiten en merges oordelen.
   Bij twijfel geldt kritiek. Voor overige `src/core`, `scripts/`, `rails/` en instructies blijven CODEOWNERS,
   rolhek en eigenaarreview gelden; een spec in de PR geeft geen extra schrijfrechten.
3. **Borging van de spec in dezelfde PR.** Elke spec in de PR krijgt vóór het bouwen een spec-review door een onafhankelijke
   reviewer, die ook de keuze "niet kritiek" toetst. De spec staat in de PR in een commit vóór de eerste commit met code of
   tests. De PR-beschrijving opent met wat er besloten wordt en de uitslag van de
   spec-review.
4. **`gebouwd` in dezelfde PR.** Een spec mag in de PR die haar implementatie bevat direct naar `status: gebouwd`, zonder
   PR-nummer en zonder statuscommit achteraf (0095 punt 1). Bouwbewijs is dan de ruleset op main, die de verplichte
   checks op de gemergde head eist. Staat de implementatie al op main, dan zet een latere PR de regel met de hand (0095 punt 3).
5. *(vervallen, zie 0089 punt 5 en 0090 punt 4)*

## Alternatieven

- **Alles bij het oude laten:** twee PR's en een statuscommit per stuk werk; de gemeten wrijving blijft.
- **Ook kritiek werk in één PR:** verliest het stopmoment vóór werk aan auth, RLS of de bewaking zelf, waar een fout in het
  ontwerp het duurst is en de checks die het werk bewaken zelf veranderen.
- **Spec-review alleen door de eigenaar in de sessie:** vraagt weer een wachtmoment; de reviewer doet het zonder wachten en de
  eigenaar ziet de uitslag in de PR.
- **`gebouwd` automatisch na de merge:** een docs-stap na de merge bestaat bewust niet (framework §8).

## Gevolgen

Gewoon volledig werk is één PR met één CI-lus. Leerpunt #314 vervalt voor nieuw werk. Meting (P6): het aantal PR's per spec tot de eindstatus op main,
vóór (basislijn twee PR's en een statuscommit) en na de eerste vijf specs onder dit besluit.
