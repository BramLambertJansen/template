# 0080 — Eén levende spec per mechanisme en één vorm voor `gebouwd`

Status: geaccepteerd

Herzien: 2026-11-05 (#542): punt 4 en 7 aangescherpt na de spec-review: de markering alleen op een nieuw AC-id, de digest zonder markering, een rename alleen naar `docs/specs/archief/`; de route via `voorstel` is een bestaand gat
Herzien: 2026-11-12 (#692): door ADR 0089 punt 2, in de template deels: punt 1, vervalt: het archief verandert niet, een archiefnaam komt niet terug; blijft: verhuizen onder dezelfde naam; punt 3 en 4, vervalt: AC-id's blijven, een spec verdwijnt niet; blijft: één levende spec per mechanisme, inhoud van een goedgekeurde spec wijzigen is een besluit
Herzien: 2026-11-12 (#696): door ADR 0089 punt 1, 5, 7 en 8, de vorige regel vervalt: punt 1, het specarchief verdwijnt bij de verhuizing en `docs/template/specs/` heeft geen archief; punt 3 en 4, AC-id's die blijven en een spec die niet verdwijnt zijn afspraken, geen guardtoets meer; punt 5, `gebouwd # #<PR>` blijft de vorm (`check:roadmap`), het bouwbewijs is de merge
Herzien: 2026-11-16 (#744): ingekort tot wat nog geldt; de puntnummers zijn ongewijzigd, de oude tekst staat in git
Herzien: 2026-11-18 (#804): gewijzigd door [0095](0095-gebouwd-zonder-pr-nummer.md) punt 1, 3, 4 en 5, punt 4: de bouw-PR
laat de statusregel staan; punt 5: de vorm is `status: gebouwd`, `docs:status` vervalt; punt 6: niemand zet regels om; punt
7: de bewijstoets van `docs:status` vervalt; punt 8: de terugval via `docs:status` vervalt

Wijzigt [0046](0046-werkstraat-en-beslisroute.md) punt 5 en 10 (een gebouwde spec krijgt in een besluit-PR nieuwe AC's
met de markering `(nog niet gebouwd)`; `gebouwd` noemt alleen de PR), [0054](0054-gebouwd-in-de-bouw-pr.md) punt 1 en 5
(`docs:status` schrijft ook na de merge alleen `# #<PR>`; de bestaande SHA-regels worden omgezet),
[0062](0062-spec-en-bouw-in-een-pr.md) punt 4 (de vorm met SHA vervalt ook voor een gemergde PR) en
[0063](0063-compacte-kennisbasis-en-lichtere-werkstraat.md) punt 4 (een vervallen spec gaat naar `docs/specs/archief/`;
`docs/template/` blijft voor documenten die alleen de template betreffen). Drempel: A3 (de guard laat een inhoudswijziging toe die hij
nu weigert) en A4. Uitwerking: [spec](../specs/specarchief-en-bouwvorm.md). Aanleiding: overzicht "Framework versimpelen" van
de eigenaar (5 november 2026), bevinding C en D.

## Context

Eén mechanisme staat in meerdere specs: agent-merge in vijf (waarvan `agent-merge.md`, 61 KB, vervallen) plus ADR 0069, het
rolhek in vier. Drie vervallen specs (108 KB) staan tussen de levende in `docs/specs/`, omdat de archiefmap uit R-CI-06
(`docs/template/specs/`) niet bestaat. Elke `grep` en elke agent die "de spec van X" zoekt, raakt eerst oude tekst.

`gebouwd` kent twee vormen: `# #<PR>` en `# #<PR>; gevalideerd: <sha>`. De SHA-vorm in een open PR wordt rood zodra er na die
SHA nog code verandert. Na de merge staat de SHA al bij GitHub (de head van PR N); de tekst herhaalt hem. Het bouwbewijs is de
merge met alle verplichte checks groen op de head (R-CI-08). Spec `padtabel` staat op `goedgekeurd` terwijl bouw-PR #537
gemerged is. Een latere status-PR kan dat nu al rechtzetten, maar alleen met de SHA-vorm (`mergedRefusal` eist hem); zonder
SHA weigert de guard elk ander nummer dan dat van de eigen PR.

## Besluit

1. **Specarchief `docs/specs/archief/`** in een app (de template heeft geen archief, 0089 punt 1), als spiegel van het
   ADR-archief (0053 punt 1, 2, 4 en 5). Een spec die op main `vervallen` is, mag daarheen verhuizen onder dezelfde naam,
   byte-gelijk; het archief verandert verder niet. Links lossen op zoals in 0053 punt 4.
2. *(vervallen, zie 0089 punt 1 en 7)*
3. **Eén levende spec per mechanisme.** Een wijziging aan een bestaand mechanisme werkt de spec van dat mechanisme bij met
   nieuwe AC's onder dezelfde naam en namespace; een nieuwe spec alleen voor een nieuw mechanisme. Vervangt een spec een andere,
   dan gaat de oude naar `vervallen`; in de template wordt zij verwijderd (R-CI-06). Een AC-id van een spec met eigenaarstatus verdwijnt nooit.
4. **Gebouwde spec.** Inhoud van een goedgekeurde spec wijzigen blijft een besluit. Een gebouwde spec blijft `gebouwd`: nieuwe
   inhoud is een besluit, en elke nieuwe AC krijgt `(nog niet gebouwd)` (patroon van R-DOC-10), alleen op een id dat nog niet
   op main staat; de AC-dekking slaat alleen gemarkeerde AC's over. De bouw-PR haalt de markering weg (telt niet als
   inhoudswijziging) en laat de statusregel staan (0095 punt 5).
5. **Eén vorm: `status: gebouwd`**, zonder PR-nummer, in de bouw-PR of met de hand in een latere PR (0095 punt 1 en 3);
   een bestaand `# #<PR>` is commentaar.
6. **Bestaande regels** blijven staan; niemand zet ze om (0095 punt 4). `check-docs` weigert de oude vorm met
   `; gevalideerd: <sha>` in een statusregel. Een gebouwde spec blijft gebouwd: het commentaar achter de status telt niet;
   nieuwe inhoud is een besluit, een weggehaalde markering is bouw (0095 punt 5).
7. **Niets wordt losser.** Spec-vóór-code en AC-dekking blijven. De bewijstoets van `docs:status` (gemergde PR, groene
   checks) is vervallen door 0095; dat aanvaarde risico staat daar.
8. **Terugval.** Verliest een spec een AC zonder melding, dan gaat de bouw-PR terug. De eigenaar beslist. (De terugval via
   `docs:status` is vervallen door 0095.)

## Alternatieven

- **Beide vormen blijven geldig zonder omzetten.** Twee vormen voor altijd; elke lezer en agent moet beide kennen.
- **De SHA in de tekst houden.** Dubbel met GitHub, en rood na elke latere commit in een open PR.
- **Elke wijziging een eigen spec.** Vijf specs voor één mechanisme.

## Gevolgen

- In een app wordt `check-docs` na een template-update rood op een eigen SHA-regel; omzetten is één regel per spec.
- Vervolg, elk met een eigen besluit: de route via `voorstel` dichten (R-WERK-08); de specs van agent-merge en van het rolhek
  samenvoegen (na de rolhek-krimp van 0071); en
  de controle van de SHA-vorm in een open PR weghalen zodra geen lezer haar meer nodig heeft.
