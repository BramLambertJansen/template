# 0054 — `gebouwd` in de bouw-PR, bewezen door de merge

Status: geaccepteerd

Herzien: 2026-11-03 (#469): gewijzigd door [0057](0057-risicogestuurde-werkstraat.md) (de activering)
Herzien: 2026-11-05 (#541): gewijzigd door [0080](0080-specarchief-en-bouwvorm.md) punt 1 en 5, `docs:status` schrijft ook na de merge alleen
`# #<PR>`; bestaande regels met `; gevalideerd: <sha>` worden omgezet
Herzien: 2026-11-12 (#696): door ADR 0089 punt 2, 5 en 8, punt 2 vervalt met `check-document-status`: `gebouwd` in de bouw-PR is een afspraak; punt 4, de ruleset eist precies `requiredChecks`; punt 3 blijft: het bouwbewijs is de merge

Wijzigt [0046](0046-werkstraat-en-beslisroute.md) punt 10, en punt 5 en 6 waar ze `gebouwd` noemen.
Drempel: A4 (een punt van een geaccepteerd ADR vervangen) en A3 (de guard aanvaardt `gebouwd` zonder eigen checkcontrole).

## Context

Nu gaat een spec pas naar `gebouwd` nadat alle verplichte checks groen zijn: `pnpm docs:status <spec> gebouwd --pr N` schrijft
PR en gevalideerde SHA, en dat is een extra commit, push en CI-ronde per spec (`docs/operations/agent-doorloop.md`, "PR en
statussen afronden"). De guard (`canRecordBuilt`, `statusOnlyDiff`) controleert dan zelf de check-runs op die SHA en eist dat de
latere diff alleen statusregels en het eigen roadmapvinkje raakt. Aanleiding (framework §1): gemeten wrijving, één ronde per
gebouwde spec, uit de eigenaarreview "template slanker en sneller".

## Besluit

1. **De claim staat in de bouw-PR.** Zodra de PR open is, schrijft de hoofdsessie in dezelfde PR `status: gebouwd # #<PR>`
   (met `--roadmap` ook het vinkje van de eigen taak), vóór het wachten op groen. `pnpm docs:status <spec> gebouwd --pr N` schrijft
   die vorm zonder op checks te wachten; hij weigert als PR N niet open is op de huidige branch.
2. *(vervallen, zie 0089 punt 5)*
3. **Het bouwbewijs is de merge.** De ruleset laat een merge alleen toe als elke verplichte check van GitHub Actions groen is op
   de head-SHA, en die head bevat de claim. De gevalideerde SHA staat niet meer in de tekst; GitHub bewaart hem bij PR N
   (`headRefOid`). `gebouwd` op main betekent: PR N is gemerged met groene verplichte checks.
4. *(vervallen, zie 0089 punt 2)*
5. **Achteraf blijft mogelijk.** Voor een spec waarvan de bouw-PR al gemerged is, blijft de route met `--pr` (vorm: 0080
   punt 5). ADR's kennen geen `gebouwd`.

Vervangt uit 0046: punt 10 (moment en vorm).

## Alternatieven

- **Status quo, SHA na groen:** de guard bewijst zelf, maar elke spec kost een extra ronde.
- **Afleiden bij het lezen uit git of GitHub, zonder statusregel:** `feiten` en `check-docs` hebben dan netwerk nodig, en een
  squash-merge laat de head-SHA niet in git achter.
- **Een workflow schrijft `gebouwd` op main na de merge:** een push naar main buiten een PR; kan pas met een eigen App en
  verplaatst het bewijs naar een token.

## Gevolgen

- Eén ronde minder per gebouwde spec; meten volgens 0046 punt 36.
- De garantie verschuift van de eigen check-run-controle van de guard naar de ruleset.
- Op een branch is `gebouwd` een claim, geen bewijs; sluit de eigenaar de PR, dan komt de claim nooit op main.
