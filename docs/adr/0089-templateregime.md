# 0089 — GitHub bewaakt wie beslist; de eigen documentbewaking verdwijnt

Status: geaccepteerd

Herzien: 2026-11-12 (#696): geen templateregime meer; de agent krijgt een GitHub App, `CODEOWNERS` en de ruleset bewaken de
besluiten, de eigen documentbewaking verdwijnt en template-documenten verhuizen naar `docs/template/` (eigenaarbesluiten
2026-11-12)

Wijzigt [0039](0039-stack-provider-neutraal-en-toolchain.md) punt 8, [0040](0040-template-app-en-grens-core-app.md) punt 4, 8,
16 en 17, [0045](0045-railwerk.md) punt 10, 16, 17, 18, 19, 20, 21, 22 en 24, [0046](0046-werkstraat-en-beslisroute.md) punt
2, 5, 6, 10, 12, 15 en 31, [0053](0053-adr-archief.md) punt 1, 2, 3, 4 en 5, [0054](0054-gebouwd-in-de-bouw-pr.md) punt 2, 3 en
4, [0057](0057-risicogestuurde-werkstraat.md) punt 5 en 6, [0059](0059-leerlus-van-app-naar-template.md) punt 2,
[0060](0060-bestandsopslag-als-poort.md) punt 1, [0062](0062-spec-en-bouw-in-een-pr.md) punt 2, 3 en 5,
[0063](0063-compacte-kennisbasis-en-lichtere-werkstraat.md) punt 1, 4 en 5, [0068](0068-samenhang-checks-en-rollen.md) punt 1
en 3, [0069](0069-agent-merge-niet-kritiek.md) punt 1, 2 en 3, [0074](0074-herziene-adr-punten-gemarkeerd.md) punt 2 en 4,
[0077](0077-externe-koppelingen-via-poorten.md) punt 8, [0078](0078-leerlus-met-bewijs.md) punt 1 en 2,
[0079](0079-een-padtabel.md) punt 3 en 4, [0080](0080-specarchief-en-bouwvorm.md) punt 1, 3, 4 en 5 en
[0081](0081-leerlus-schrappen-en-vereenvoudigen.md) punt 3. Drempel: A3 (checks verdwijnen, de eigenaar krijgt een bypass)
en A4. Uitwerking: [spec](../specs/templateregime.md). Besluiten van de eigenaar, 2026-11-11 en 2026-11-12.

## Context

De template past de regels voor apps op zichzelf toe: 46 % van de commits is `docs`, 35 van de 49 geldige ADR's gaan over het
proces, een kleine wijziging aan de bewaking kost drie PR's (#668, #685, #687; leerpunt #673). De bewaking moet raden wie
beslist, omdat de agent met het account van de eigenaar werkt. Gemeten op 12 november 2026: de ruleset eiste zeven checks, nul
goedkeuringen en geen review van code-eigenaren; `.claude/decisions.json` noemt er elf (`document-status`, `check-core`,
`leerpunt-bewijs` en `codeql (javascript-typescript)` ontbreken op GitHub); `.github/CODEOWNERS` noemt de beschermde paden.

Proef op dezelfde dag, met review van code-eigenaren aan (nul goedkeuringen, vervalt bij een nieuwe push): de App
`bram-template-agent` opende #694 (alleen `docs/proef-app-vrij.md`), mergebaar zonder review zodra de checks groen waren, en
#695 (`scripts/proef-app-beschermd.md`), geblokkeerd met alle checks groen, mergebaar na goedkeuring van de eigenaar, en weer
geblokkeerd na een nieuwe commit van de App. Beide gesloten zonder merge. Nog niet bewezen: dat het token van de eigenaar uit de
agentomgeving is.

## Besluit

1. **Eigen plek.** Template-ADR's staan in `docs/template/adr/`, template-specs in `docs/template/specs/`, zonder archief: git
   is de historie. `docs/adr/` en `docs/specs/` zijn van de app; in de template staan daar alleen de sjablonen.
2. **GitHub bewaakt wie beslist.** De agent pusht en opent PR's als GitHub App, met een kortlevend installatietoken voor één
   repository, zonder het token van de eigenaar in zijn omgeving. Rechten van de App: contents, issues en pull requests
   schrijven; actions, checks, statuses en metadata lezen; geen workflows en geen administration. De ruleset eist review van een
   code-eigenaar met nul vereiste goedkeuringen, een nieuwe push trekt een goedkeuring in, en de verplichte checks zijn precies
   `requiredChecks` uit `.claude/decisions.json` (de vier die nu ontbreken komen erbij). Pas als het token van de eigenaar uit
   de agentomgeving is, krijgt de beheerdersrol een bypass alleen voor pull requests, zodat de eigenaar een eigen PR op een
   beschermd pad zonder review kan mergen; de App staat er niet in. Die bypass passeert ook een rode verplichte check. Dat
   wijkt af van R-REPO-02 ("geen bypass") en van R-CI-08 voor zo'n merge. Tot dan opent de App elke PR; een wijziging van de
   eigenaar zelf gaat als commit op een branch van de App, met zijn goedkeuring.
3. **`CODEOWNERS` uit de padtabel.** Eerst krijgt alles de eigenaar, dan elke glob met besluit `agent` geen eigenaar (nu
   `/src/`, `/docs/` en `/CHANGELOG.md`), daarna elke glob met een besluit anders dan `agent`. De padtabel krijgt rijen met besluit `eigenaar` voor `docs/template/**`
   en voor wat een agent vanzelf inlaadt of uitvoert: `**/CLAUDE*.md`, `**/AGENTS*.md`, `**/.*`, `**/.*/**`, `**/*.config.*`,
   `**/package.json` en `**/tsconfig*.json`. De padtabel blijft de ene bron, ook voor het schrijfrecht per rol.
4. **Wat blijft:** de CI-checks op code; `check-core`, met `docs/template` als tweede zone naast `src/core`; `leerpunt-bewijs`;
   in `check-docs` de links, statuswoorden, unieke nummers per map, kopnummer gelijk aan bestandsnummer, AC→test en de
   kopcontroles voor specs; de padtabel; de sandbox.
5. **Wat verdwijnt**, in template en app, pas als punt 2 inclusief de identiteit bewezen is: `check-document-status` (A4 met de
   herzieningsroute, archief, levende spec en AC-id's, bouwbewijs, lanes, besluit-PR), in `check-docs` de herzieningscheck
   (`adrHerzienViolations`) en de archiefnaamregel, de diff-guard, de job `agent-merge`, de inhoudstoets van `pnpm pr:merge` en
   `document-status` in `requiredChecks`.
6. **Nummers per map.** De reeks 0001–0099 / vanaf 0100 vervalt. Een kaal nummer verwijst naar de eigen map; template-documenten
   buiten de ADR-mappen verwijzen naar template-ADR's. Een app-document noemt een template-ADR in tekst, zonder link.
7. **Verhuizing in een eigen PR**, na punt 5: documenten verplaatsen, archieven verwijderen, links bijwerken. Voorwaarde: er
   bestaat nog geen app die deze template volgt (ST-09 staat open).
8. **Afspraak in plaats van check:** spec vóór de bouw, spec-review, `gebouwd` in de bouw-PR, een ADR bij A1 tot en met A4, een
   herzieningsregel, routes en permissies alleen via `src/shared/contracts/` en `permissions.ts` (R-WERK-09, getoetst door de
   reviewer). Het besluit is de goedkeuring van de eigenaar op de PR.
9. **Later, in een eigen stap:** de effecttoets en de identiteitsregels van het rolhek verdwijnen; het rolhek krimpt tot het
   schrijfrecht per rol uit de padtabel.
10. **Volgorde:** deze besluit-PR; bouw van punt 2 en 3 en activering; bewijs van de identiteit, daarna de bypass; weghalen van
    punt 5; verhuizing; punt 9.

## Alternatieven

- **De guard alleen in de template uitzetten**, een licht regime of een byte-vergelijking: guardlogica die GitHub niet afdwingt.
- **Een tweede account met een vast token:** afgewezen; de App geeft kortlevende tokens.
- **Een terugvaloptie als de proef faalde:** niet nodig, de proef slaagde.

## Gevolgen

- Na punt 5 kan de agent ook met `gh pr merge` mergen; `pnpm pr:merge` is gemak, geen grens. Agent-merge (0069) wordt: geen pad
  van een code-eigenaar en checks groen; omvanggrens, binaire-bestandentoets en reviewcommentaar op de head vervallen als check,
  de review blijft een werkafspraak. De noodschakelaar `merge: eigenaar` vervalt: de eigenaar zet zo nodig één vereiste
  goedkeuring. De eis dat de PR de kop van main bevat, vervalt; de ruleset eist geen bijgewerkte branch. Aanvaard risico: een
  PR die achterloopt kan main na de merge rood maken; de CI op main vangt dat (R-WERK-12).
- `contents: write` laat de App ook tags pushen; een app met release via tag krijgt een tag-ruleset. Buiten Claude Code is er
  geen sandbox.
- Een app heeft nodig: de App op de app-repo, de handle uit `goedkeurders` in `CODEOWNERS`, een installatie met
  `issues: write` op de template-repo voor leerpunten, en een ruleset; op een privé-repo vraagt dat een betaald abonnement.
- Tot punt 5 uitgevoerd is, gelden de huidige checks en afspraken.
