# 0093 — De agent werkt onder het account van de eigenaar; het mergescript beslist op de padtabel

Status: geaccepteerd

Wijzigt [0089](0089-templateregime.md) punt 2, 5 (alleen: de inhoudstoets van `pnpm pr:merge` komt terug als padtoets), 9
en 10 en de Gevolgen over de App en over samenvoegen na punt 9, [0069](0069-agent-merge-niet-kritiek.md) punt 1, 2 en 3 en
de slotzin van punt 4 en 5 (vervallen niet meer met 0089 punt 9), [0045](0045-railwerk.md) punt 19
en [0091](0091-effecttoets-vervalt.md) punt 5. Drempel: A3 (een check vervalt: de review van een code-eigenaar in de ruleset
en de grenscontrole van het mergescript) en A4. Uitwerking: [spec](../specs/agent-samenvoegen.md). Besluiten van de eigenaar,
2026-11-18.

## Context

Sinds ADR 0089 opent de agent PR's als GitHub App, omdat GitHub niemand zijn eigen PR laat goedkeuren en de ruleset de review
van een code-eigenaar eist. De sleutel van de App staat op één machine; de eigenaar maakt elk uur met de hand een token
(`scripts/kit/agent-token.mjs`). Op een andere laptop en in de cloud werkt dat niet, en PR's blijven liggen tot de eigenaar
terug is. Voor een app moet de eigenaar een eigen App aanmaken, installeren en tokens maken; dat blokkeert de proef-app
(ST-09). De eigenaar, 18 november 2026: het werk wordt goed gedaan, maar het naar `main` krijgen is te omslachtig en te traag,
en hij wil geen terminalcommando's meer uitvoeren.

De harde grens die dit moest opleveren, bestaat niet: de login van de eigenaar staat nog in de agentomgeving (templateregime
AC-6 is nooit bewezen), dus een agent kan elke regel passeren die de eigenaar kan passeren. De App leverde in de praktijk
alleen een andere auteur, zodat de eigenaar kon goedkeuren.

Proef op 18 november 2026, met de ruleset `main` met `--bypass-beheerder`: PR #795 (alleen een proefbestand in `docs/`, geopend
onder het account van de eigenaar) was zonder review samenvoegbaar met alle checks groen. PR #794 (raakt `docs/roadmap.md`, een
pad van een code-eigenaar, ook onder het account van de eigenaar) toonde de eigenaar een gewone knop om samen te voegen, zonder
vinkje of waarschuwing. Met de bypass maakt GitHub voor het account van de eigenaar dus geen onderscheid tussen een vrij en een
beschermd pad.

Auto-merge van GitHub is overwogen en afgewezen in de spec-review: na het aanzetten voegt GitHub ook een latere push samen. In
de gewone CI-lus pusht de agent na een rode check een fix, vaak in een testbestand; in de template is dat een beschermd pad en
zou het zonder klik van de eigenaar op `main` komen.

## Besluit

1. **Eén identiteit.** De agent werkt overal onder het account van de eigenaar: lokaal met diens `gh`-login, in de cloud via
   diens gekoppelde GitHub-account. Er is geen GitHub App, geen installatietoken, geen sleutel en geen machineaccount.
   `scripts/kit/agent-token.mjs` en de spec `agent-token` vervallen.
2. **De ruleset bewaakt wat GitHub onder één account kan bewaken:** alleen via een pull request, geen delete of force push,
   precies `requiredChecks` van Actions, opgeloste gesprekken, alleen merge en squash. De review van een code-eigenaar gaat uit
   de ruleset en er is geen bypass: ook de eigenaar passeert geen rode verplichte check. De optie `--bypass-beheerder`
   verdwijnt.
3. **Wie samenvoegt, beslist het mergescript op de padtabel.** `pnpm pr:merge <nr>` leest de bestanden van de PR en de
   padtabel op `main`. Raakt de PR een beschermd pad, dan stopt het script en voegt de eigenaar samen met de gewone knop op
   GitHub. Anders voegt het script samen zodra de verplichte checks groen zijn, met de getoetste head-SHA als voorwaarde: een
   latere push komt er niet ongezien bij. De hoofdsessie wacht zelf op de CI; auto-merge blijft verboden (ADR 0069 punt 4).
4. **Beschermd pad, per context.** In de template (de repository uit `onderhoud`): elk pad waarvan het besluit in de padtabel
   niet `agent` is, zoals nu. In een app: een pad met besluit `besluit-pr` of schrijven `voorReview` of hoger (auth,
   gegevensisolatie, de bewaking, agentinstructies en configuratie), een migratie (`migraties`) en de zones van `check-core`
   (`src/core/**`, `docs/template/**`). Tests, specs, de roadmap en gewone app-code zijn in een app vrij.
5. **Zonder ruleset** (een privé-repo zonder betaald abonnement) werkt het script hetzelfde: het toetst zelf de groene checks.
   Dat is daar een vangnet, geen grens, en de setup zegt dat. De grenscontrole van templateregime AC-14 vervalt.
6. **Het rolhek blijft zoals het is.** De regels tegen samenvoegen, goedkeuren en labels buiten het mergescript blijven voor
   elke rol, blijvend: ADR 0089 punt 9 (de identiteitsregels verdwijnen) vervalt voor dat deel.
7. **`CODEOWNERS` blijft gegenereerd** uit de padtabel, als leesbare lijst en voor de dag dat een repo weer een tweede
   identiteit krijgt; het is geen grens meer.

## Alternatieven

- **De App houden en het token automatisch verversen** (timer of credential-helper): de sleutel moet dan op elke machine en in
  de cloud staan, en het is eigen machinerie per plek.
- **Een machineaccount met een vast token:** GitHub dwingt dan de goedkeuring van de eigenaar op beschermde paden hard af, mits
  diens login uit de agentomgeving is. Afgewezen voor nu: een tweede account, een token per plek en een instelling per machine,
  voor één eigenaar met één agent. Het blijft de weg voor een app met echte gebruikers en data (zie Gevolgen).
- **De review van een code-eigenaar houden met een bypass voor de beheerder:** de proef toont dat GitHub het enige account dan
  niets in de weg legt, terwijl de bypass ook een rode check passeert. Meer regel, minder grens.
- **Auto-merge van GitHub**, met uitzetten vóór elke push en een melding achteraf: zie Context; meer machinerie om een gat te
  dichten dat direct samenvoegen op de head-SHA niet heeft.
- **Een workflow die de PR als de App opent:** de sleutel staat dan op GitHub en de agent start de workflow met de login van de
  eigenaar; de grens wordt er niet harder van.

## Gevolgen

- Aanvaard risico: op een beschermd pad houdt GitHub een samenvoeging onder het account van de eigenaar niet tegen. Wat de
  agent tegenhoudt, is het mergescript en het rolhek: een vangnet, geen grens. Een agent die het vangnet omzeilt, valt niet
  automatisch op; de wijziging staat wel in een PR en in de geschiedenis en is terug te draaien. De harde grens die blijft, is
  de ruleset: alleen via een PR met groene verplichte checks.
- Een app waarin een samenvoeging naar `main` automatisch uitrolt naar echte gebruikers, weegt dit opnieuw: daar past een
  machineaccount met de review van een code-eigenaar op de kritieke paden. Dat kan per app, met een eigen app-ADR.
- De eigenaar doet geen terminalwerk voor dit onderwerp: de hoofdsessie draait het rulesetscript na zijn akkoord in de
  vraagprompt. `.github/**` blijft een beschermd pad; een workflowwijziging voegt de eigenaar samen.
- Eindigt een sessie voordat de CI klaar is, dan blijft de PR open tot een volgende sessie `pnpm pr:merge` draait.
- Vervalt: templateregime AC-1 (token), AC-6 (identiteit) en AC-14 (grenscontrole van het mergescript), het deel van AC-7 dat
  de inhoudstoets schrapt, de App-stappen in `docs/nieuwe-app.md` 6.2 en het deel van roadmap ST-01 over de App en `denyRead`
  op `~/.config/gh`. R-REPO-01, R-REPO-02, R-CI-07 en R-ROL-10 volgen dit ADR. De App `bram-template-agent` kan de eigenaar van
  de repo verwijderen.
- ADR 0069 punt 4 en 5 blijven gelden (geen andere route om samen te voegen, de melding met steekproefregel en de CI op
  `main` volgen, R-WERK-12), en vervallen niet meer met ADR 0089 punt 9. Het eerste Gevolgen-punt van ADR 0089 (na punt 9
  kan de agent ook met `gh pr merge` samenvoegen; de noodschakelaar `merge: eigenaar` vervalt) geldt niet meer: `pnpm pr:merge`
  blijft de enige route en de noodschakelaar blijft.
