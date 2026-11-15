# 0069 — De hoofdsessie merget niet-kritiek werk zelf

Status: geaccepteerd

Herzien: 2026-11-03 (#456): punt 3 (Codex-voorwaarde drieledig, omvanggrens `agentMerge.maxRegels`), punt 5
(steekproef, terugval, overgang), Gevolgen en Meten; versoepelt de Codex-voorwaarde; uitwerking in
spec
Herzien: 2026-11-03 (#468): punt 3 (een 👀 van Codex of een review die nog bezig is, telt als spoor en houdt de merge tegen),
punt 5 (overgang) en Gevolgen; verscherpt de Codex-voorwaarde; uitwerking in spec
Herzien: 2026-11-03 (#473): punt 3, bytegrens `agentMerge.maxBytes` naast `maxRegels`; verscherpt de omvanggrens;
uitwerking in [spec](../specs/agent-merge-bytegrens.md)
Herzien: 2026-11-04 (#535): gewijzigd door [0079](0079-een-padtabel.md) punt 1, `agentMerge.toegestaan` en
`agentMerge.kritiek` worden de kolom `besluit` van de padtabel (`agent` of strenger); de uitslag per pad blijft gelijk
Herzien: 2026-11-05 (#568): punt 3 en 5, Alternatieven, Gevolgen en Meten; versoepelt de Codex-voorwaarde: ze vervalt,
met `agentMerge.codex`, ook als Codex wél reviewt; elke agent-merge is een steekproef (leerpunt #562: Codex is geen
vereiste); uitwerking in
[spec](../specs/agent-merge-niet-kritiek.md) AC-7 tot en met AC-10
Herzien: 2026-11-12 (#696): door ADR 0089 punt 2, 3 en 5, punt 1, 2 en 3 worden: geen pad van een code-eigenaar geraakt en checks groen; de lijst uit de padtabel wordt `CODEOWNERS`, de job `agent-merge` en de inhoudstoets van `pnpm pr:merge` verdwijnen, de omvanggrens en het reviewcommentaar op de head vervallen als check (de review blijft een werkafspraak)
Herzien: 2026-11-14 (#713): ingekort tot wat nog geldt na ADR 0089; de puntnummers zijn ongewijzigd, de oude tekst staat in git

Wijzigt [0046](0046-werkstraat-en-beslisroute.md) punt 30, 31, 33, 34 en 35, de zin "automatische agent-merges vallen af" uit
[0057](0057-risicogestuurde-werkstraat.md), in [0064](0064-leesbudget-per-laag.md) "zodra de GitHub App er is" (R-DOC-09) en in
[0068](0068-samenhang-checks-en-rollen.md) punt 3 de eigenaarmerge als grens; vult
[0062](0062-spec-en-bouw-in-een-pr.md) aan. Drempel: A3 (rechten verruimen). Uitwerking:
[spec](../specs/agent-merge-niet-kritiek.md) (vervallen; de code noemt er nog acceptatiecriteria uit).

## Context

De eigenaar wil dat een agent werk zelf merget als het niet kritiek is en de agent het niet kan slopen (opdracht 3 november
2026). Tot dan mergde alleen de eigenaar, ook een kleine fix met groene CI en een schone review. Dat kost een wachtmoment per
PR en schaalt met de tijd van de eigenaar, niet met de uitvoer (zelfde argument als 0068 punt 5).

Toen dit besluit viel, werkte de agent onder het account van de eigenaar en kon GitHub een agent-merge niet van een
eigenaarmerge onderscheiden. De grens tussen kritiek en niet-kritiek lag daarom bij het mergescript en het rolhek, met een
toegestane lijst, een eigen CI-job en een omvanggrens. Sinds 0089 heeft de agent een GitHub App en bewaakt GitHub de grens:
een pad van een code-eigenaar vraagt zijn review.

## Besluit

1. **Wat de agent mag mergen.** Een PR die geen pad van een code-eigenaar raakt (0089 punt 3: `CODEOWNERS` volgt de padtabel in
   `.claude/gates.json`). Elke PR met een spec, ADR, test, `src/core`, script, hook, workflow of agentinstructie merget dus de
   eigenaar. *Waarom een toegestane lijst en geen verbodslijst:* "kan het niet slopen" laat zich niet als verbodslijst sluiten;
   elk nieuw configbestand dat een tool automatisch laadt, zou erdoor glippen. In `CODEOWNERS` krijgt daarom eerst alles de
   eigenaar en vallen alleen de paden met besluit `agent` vrij. Bij twijfel kritiek.
2. *(vervallen, zie 0089 punt 5)* De job `agent-merge` en de diff-guard bestaan niet meer; het oordeel is de review van de
   code-eigenaar die de ruleset eist.
3. **Mergen alleen via `pnpm pr:merge <nr>`.** Het script leest alles via de API van GitHub en merget (squash, met de head-SHA
   als voorwaarde) pas als: de modus `merge` in `.claude/gates.json` op de kop van `main` `"niet-kritiek"` is (ontbreekt of
   onleesbaar: `"eigenaar"`); de PR open is, geen draft, basis `main`, head in dezelfde repository en gelijk aan de lokale `HEAD`;
   elke check uit `requiredChecks` `success` is op de head-SHA; de laatste uitslag van `requiredChecks` op de kop van `main`
   groen is; en de leerpuntregel van 0078 punt 2 geen reden geeft om te wachten. De inhoudstoets, de omvanggrens, de eis dat de
   PR de kop van `main` bevat en het reviewcommentaar op de head zijn als check vervallen (0089 punt 5 en Gevolgen); de review
   door een verse reviewer vóór de push blijft een werkafspraak. *Waarom:* elke voorwaarde dekt een eigen faalwijze: verkeerde PR
   of SHA, rode CI, doorbouwen op rode `main`. Aanvaard risico: een PR die achterloopt kan `main` na de merge rood maken; de
   agent volgt na de merge de CI op `main`.
4. **Alle andere merge-routes blijven dicht, en alleen in Claude Code.** `gh pr merge`, `gh api …/merge`, auto-merge,
   MCP-merge en mergen door een subagent blijven voor elke rol geweigerd (rolhek en deny-regels in `.claude/settings.json`).
   Het rolhek staat de hoofdsessie `pnpm pr:merge <nr>` toe zonder prompt, alleen als op schijf het script, zijn imports en de
   bestanden die bepalen wat `pnpm` draait gelijk zijn aan het anker op `main`. Valt het rolhek open, dan krijgt de hoofdsessie
   een prompt. *Waarom:* één smalle route is te toetsen; een aangepast script op de eigen branch mag zichzelf geen recht geven.
   Dit vervalt met de identiteitsregels van het rolhek (0089 punt 9); daarna is `pnpm pr:merge` gemak en GitHub de grens.
5. **De eigenaar houdt de schakelaar.** De modus staat standaard op `"eigenaar"`; terugzetten is één regel in een beschermd
   bestand. Na elke agent-merge meldt de agent PR en SHA in de thread, met het woord "steekproef" (`pr:merge` drukt die regel
   af); de eigenaar kijkt de eerste tien achteraf na en zegt daarna of de melding blijft. Een fout herstelt de agent met een
   revert-PR. Terugval: na een revert van een agent-merge, één rode `main` door een
   agent-merge of een agent-merge die achteraf kritiek blijkt, merget de hoofdsessie niets meer via `pr:merge`, opent een PR die
   `merge` op `"eigenaar"` zet en meldt dat, en dit besluit wordt herzien; pas na een besluit van de eigenaar gaat het verder. Steekproef en terugval zijn
   afspraken, geen check. De schakelaar vervalt met 0089 punt 9; daarna zet de eigenaar zo nodig één vereiste goedkeuring.
6. *(vervallen: de bouw-PR is gemerged)*

## Alternatieven

- **Alleen tekst ("merge als het niet kritiek is"):** de agent kiest dan zelf. Verworpen.
- **Verbodslijst:** een nieuw configbestand glipt erdoor. Verworpen voor de toegestane lijst.
- **Auto-merge na groen, of een label of comment als akkoord:** zet de agent zelf, en kijkt niet naar inhoud. Verworpen.
- **Een workflow die zelf merget:** geeft het Actions-token schrijfrecht (tegen R-REPO-02). Verworpen.
- **Een externe reviewer (Codex) als voorwaarde:** de autonomie hangt dan aan een betaalde dienst en stopt als het tegoed op
  is. Verworpen; een app die dat wil, legt het vast in een eigen app-ADR.
- **Ruimer (`src/core` buiten auth):** dan merget een agent template-code die elke app erft. Niet nu.

## Gevolgen

- Licht werk in app-code en gewone docs gaat zonder wachtmoment naar `main`. In de template valt het meeste werk onder paden
  van de code-eigenaar en blijft het bij de eigenaar; in een app is het grootste deel van de lichte fixes agent-mergebaar.
- Restrisico: de verse reviewer is bij een agent-merge de enige inhoudelijke lezer; een fout die hij mist, ziet de eigenaar pas
  in de steekproef of na een rode `main`.
- Meten (0046 punt 36): aantal agent-merges, reverts daarvan en rode `main` na een agent-merge.
