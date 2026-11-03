# 0069 — De hoofdsessie merget niet-kritiek werk zelf

Status: geaccepteerd

Wijzigt [0046](0046-werkstraat-en-beslisroute.md) punt 30, 31, 33 en 35 en de zin "automatische agent-merges vallen af" uit
[0057](0057-risicogestuurde-werkstraat.md); vult [0062](0062-spec-en-bouw-in-een-pr.md) en
[0068](0068-samenhang-checks-en-rollen.md) aan. Drempel: A3 (rechten verruimen). Uitwerking:
[spec](../specs/agent-merge-niet-kritiek.md).

## Context

De eigenaar wil dat een agent werk zelf merget als het niet kritiek is en de agent het niet kan slopen (opdracht 3 november
2026). Nu merget alleen de eigenaar (R-REPO-01, R-REPO-05, `AGENTS.md`), ook een kleine fix met groene CI en een schone review.
Dat kost een wachtmoment per PR en schaalt met de tijd van de eigenaar, niet met de uitvoer (zelfde argument als 0068 punt 5).

Het eerdere ontwerp (0046 punt 30, spec `agent-merge`) werd nooit actief: het hing aan een feature-lane die 0062 verving, aan
`scripts/check-github.mjs` dat niet bestaat, en 0057 schrapte het. Wat sindsdien wel bestaat en hier het werk doet:
de diff-guard (`pull_request_target`, scripts van `main`) die gate-paden, `scripts` in `package.json`, bestaande tests en een
risico-overzicht (migraties, permissies, dependencies, routes) per PR bepaalt; één lijst verplichte checks (`requiredChecks`,
0068); `pnpm pr:verify`; de ruleset op `main`.

De zwakte blijft: de agent werkt onder het account van de eigenaar. GitHub ziet niet wie merget, dus GitHub kan een
agent-merge niet anders behandelen dan een eigenaarmerge. De grens moet daarom op de PR liggen (wat erin zit en welke checks
groen zijn), niet op de persoon.

## Besluit

1. **Wat de agent mag mergen.** Een PR naar `main` uit dezelfde repository waarin niets kritiek is (0062 punt 2) én geen
   beschermd pad geraakt wordt. Concreet is de PR alleen agent-mergebaar als: geen pad uit `gates` (of een `jsonGates`-sleutel)
   in `.claude/gates.json` verandert, met als enige uitzondering een nieuw testbestand; geen bestaande test verandert of
   verdwijnt; het risico-overzicht leeg is (geen migratie, permissiesleutel, nieuwe dependency, nieuwe `defineRoute`,
   gewijzigd contract); en geen `kritiekPad` uit `scripts/kit/lane.mjs` geraakt wordt. Een goedkeuring van de eigenaar maakt
   een PR niet agent-mergebaar. Omdat specs en ADR's gate-paden zijn, merget de eigenaar elke PR die een besluit of een
   eigenaarstatus bevat: daar is de merge het besluit (R-WERK-08). In de praktijk is agent-merge dus licht werk (R-WERK-03)
   en docs buiten de gates. Bij twijfel kritiek.
   *Waarom:* "kan het niet slopen" betekent dat de wijziging de bewaking, de rechten, de data en de besluiten niet raakt. Dat
   is precies wat de gate-lijst en het risico-overzicht al afbakenen; een tweede lijst zou gaan afwijken (R-PRINC-03).
2. **Het oordeel komt uit CI, niet uit de sessie.** De diff-guard-workflow krijgt een job `agent-merge` die alleen slaagt als
   punt 1 geldt, berekend door `scripts/kit/diff-guard.mjs` uit de scripts van `main` (`pull_request_target`, de PR alleen als
   git-data). Anders wordt de job overgeslagen, niet rood: hij is geen verplichte check en blokkeert de eigenaar nooit.
   *Waarom:* de sessie kan zich vergissen of een aangepast script draaien; de workflow draait vertrouwde code op de echte head
   van de PR. Een agent kan geen check-run van GitHub Actions namaken, en een workflow uit de PR-branch zelf telt niet (punt 3).
3. **Mergen alleen via `pnpm pr:merge <nr>`, met harde voorwaarden.** Het script merget pas (squash, met de head-SHA als
   voorwaarde, via de REST-API) als alles hieronder geldt; anders stopt het met de reden:
   - de modus in `.claude/gates.json` op `main` is `"niet-kritiek"` (sleutel `merge`; ontbreekt of onleesbaar: `"eigenaar"`);
   - de PR is open, geen draft, basis `main`, head in dezelfde repository, en de head is gelijk aan de lokale `HEAD`;
   - de PR bevat de huidige `main` (geen achterstand), zodat twee groene PR's samen `main` niet rood maken;
   - elke check uit `requiredChecks` is `success` op de head-SHA (zelfde toets als `pr:verify`);
   - de job `agent-merge` van de run van `.github/workflows/guard.yml` met event `pull_request_target` is `success` op de
     head-SHA;
   - er is een verse review: een PR-commentaar `Review <head-SHA>: geen blokkerende bevindingen` van een reviewer-subagent
     volgens 0068 punt 5, op precies die SHA (na elke push opnieuw);
   - Codex heeft de head-SHA beoordeeld en heeft geen open punten: een Codex-review of Codex-uitslag op de head-SHA, en
     geen onopgeloste review-thread;
   - de laatste run van de verplichte checks op `main` is groen.
   *Waarom:* elke voorwaarde dekt een eigen faalwijze: verkeerde PR of SHA, verouderde basis, rode CI, kritieke inhoud, een
   review van een oudere versie, genegeerde Codex-punten, en doorbouwen op een rode `main`. De ruleset blijft daarnaast
   gelden (groene checks, opgeloste gesprekken), ook als het script zou falen.
4. **Alle andere merge-routes blijven dicht.** `gh pr merge`, `gh api …/merge`, auto-merge, MCP-merge en mergen door een
   subagent blijven voor elke rol geweigerd (rolhek en de deny-regels in `.claude/settings.json`). Het rolhek laat alleen de
   hoofdsessie `pnpm pr:merge <nr>` draaien, en alleen als het script en zijn imports gelijk zijn aan het anker op `main`.
   *Waarom:* één smalle route is te toetsen; een aangepast script op de eigen branch mag zichzelf geen recht geven.
5. **De eigenaar houdt de schakelaar.** De modus staat standaard op `"eigenaar"`. De bouw-PR zet hem op `"niet-kritiek"`; de
   eigenaar activeert met de merge van die PR en zet hem met één regel terug. Na elke agent-merge meldt de agent het in de
   thread met PR en SHA; een fout herstelt hij met een revert-PR, die zelf ook alleen agent-mergebaar is als punt 1 geldt.
   *Waarom:* omkeerbaar zonder code te wijzigen, en elke merge is zichtbaar.
6. **Tot de bouw-PR gemerged is, merget geen agent.** R-REPO-01, R-REPO-05 en `AGENTS.md` veranderen pas in de bouw-PR, met
   het mechanisme, zodat geen tekst een recht geeft dat nog niet afgedwongen wordt (0068 C2).

## Alternatieven

- **Alleen tekst ("merge als het niet kritiek is"):** de agent kiest dan zelf wat niet kritiek is. Verworpen.
- **Auto-merge na groen, of een label of comment als akkoord:** de agent zet die zelf, en auto-merge kijkt niet naar de inhoud.
  Verworpen (zoals in 0046).
- **Een workflow die met schrijfrecht zelf merget:** geeft het Actions-token schrijfrecht (tegen R-REPO-02) en vraagt toch een
  trigger die de agent zet. Verworpen.
- **`agent-merge` als verplichte check:** zou elke kritieke PR ook voor de eigenaar blokkeren, want GitHub ziet het verschil
  niet. Verworpen.
- **Ruimer: ook gate-paden buiten `voorReview` (bijv. `src/core` buiten auth, specs):** meer werk zonder wachten, maar dan
  merget een agent ook besluiten en template-code die elke app erft. Niet nu; kan later met een eigen besluit.
- **Wachten op de GitHub App (ST-01):** maakt de merge herleidbaar, maar verandert niets aan de toets op inhoud. De App kan
  later; dit besluit hangt er niet van af.

## Gevolgen

- Licht werk buiten de gates gaat zonder wachtmoment naar `main`. In de template valt het meeste werk onder gates en blijft
  het bij de eigenaar; in een app is het grootste deel van de lichte fixes agent-mergebaar.
- Restrisico, bewust aanvaard: de review-regel is een sessie-artefact onder het account van de eigenaar; het rolhek is een
  vangnet (R-ROL-10). De inhoudstoets in CI en de ruleset zijn de grens.
- De bouw-PR is zelf kritiek (`.github/**`, `.claude/**`, besluitscripts); de eigenaar merget hem en pusht de
  workflowwijziging. `docs/specs/agent-merge.md` gaat in die PR naar `vervallen`, met het roadmap-item.
- Meten (0046 punt 36): aantal agent-merges, reverts daarvan en rode `main` na een agent-merge. Eén rode `main` door een
  agent-merge of één agent-merge van iets dat achteraf kritiek blijkt: modus terug naar `"eigenaar"` en dit besluit herzien.
