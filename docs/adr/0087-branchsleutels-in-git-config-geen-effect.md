# 0087 — Vaste branchsleutels in `.git/config` tellen niet als effect

Status: geaccepteerd

Wijzigt [0066](0066-schrijfgrens-op-effect.md) punt 1. Drempel: A3 (een vangnet wordt smaller) en A4. Aanleiding:
leerpunt #642 (9 november 2026: minstens tien valse meldingen in één sessie, elk met `pnpm rolhek:overnemen .git/config`
door de eigenaar). Uitwerking: [spec rolhek-effect](../specs/rolhek-effect.md) AC-13.

## Context

`.git/config` staat op de vaste lijst van de toets op effect: elke byte die verandert, telt. Schrijft iemand zonder venster
het bestand, terwijl de momentopname van een subagent openstaat, dan komt de wijziging op naam van die subagent. Dat kan
de eigenaar in zijn eigen terminal zijn, of de git-extensie van de editor. `git push -u` en `git switch -c` met tracking
schrijven een sectie `[branch "<naam>"]` met `remote` en `merge`, en `git branch -D` haalt die weer weg. De editor schrijft
`vscode-merge-base`, `github-pr-base-branch` en `github-pr-owner-number`. Wie buiten een venster schrijft, kan de hook niet
vaststellen. Een eerder voorstel stelde zulke secties alleen buiten de tool-vensters van een subagent vrij, met een kenmerk
per aanroep. Twee spec-reviews vonden dat niet bouwbaar: de opslag per aanroep is niet atomair, en de editorsleutels
hadden geen vast patroon.

## Besluit

1. **De staat van `.git/config` is zijn betekenis, zonder vaste branchsleutels.** Is het bestand een gewoon bestand dat git
   kan lezen, dan is de staat in de momentopname de hash van de lijst die `git config --no-includes --list` uit precies die
   bytes leest. De regels van een vaste klasse branchsleutels met een vast waardepatroon tellen daarbij niet mee. Een
   verandering die alleen die regels raakt, of alleen commentaar, witruimte of een lege sectie, is daardoor geen verandering.
   Dat geldt in elk toetsmoment en voor elke actor. Welke sleutels en patronen dat zijn, staat in de spec. De klasse groeit
   alleen met eigenaarakkoord.
2. **Bij twijfel geldt de toets zoals nu.** Elke andere sleutel telt, ook in een branchsectie. Dat geldt ook voor een waarde
   buiten het patroon, een remote die niet in hetzelfde bestand staat, een volgorde die verandert, en een bestand dat git
   niet kan lezen of dat geen gewoon bestand is.
3. **Refs en HEAD blijven buiten dit besluit.** Een verwijderde of verschoven `refs/heads/*` en een verschoven HEAD tellen
   zoals in 0083 punt 2.

## Restrisico, aanvaard

Ook een subagent of een achtergrondproces kan nu ongemerkt een branchsleutel uit de klasse zetten of weghalen. Het
rolhek weigert `git config` vooraf voor een subagent nog steeds, maar een programma kan het bestand ook zelf schrijven. Het
ergste gevolg: `git pull` of `git push` op die branch gaat naar een andere branch van een remote die al bestaat. Geen
van deze sleutels voert code uit of verandert een URL. CI, de ruleset en de eigenaarmerge blijven de grens.

## Alternatieven

- **Alleen buiten de tool-vensters van de subagent vrijstellen, met een kenmerk per aanroep.** Dat was het eerdere voorstel.
  Het hangt af van een opslag per aanroep die niet atomair is, en het laat een achtergrondproces met dezelfde sleutels
  toch door. Het is complexer en niet veiliger.
- **`.git/config` niet meer toeschrijven na SubagentStop.** Eenvoudig, maar dan valt een `core.hooksPath` of
  `include.path` uit een achtergrondproces weg. Juist dat geval houden 0066 punt 2 en 0083 punt 2 zichtbaar.
- **De vensters van de hoofdsessie uitbreiden.** Haar eigen git-commando's verklaren haar venster al. De valse meldingen
  komen van schrijvers zonder venster: de eigenaar en de editor.
- **Een eigen parser van de bytes.** Een verschil met de parser van git zou een gat zijn. `git config` leest het bestand
  zoals git het leest.

## Gevolgen

- `git push -u`, een branch met tracking, `git branch -D` (alleen het configdeel) en de editor geven geen melding meer
  op `.git/config`. De ref van een verwijderde branch blijft een melding voor `pnpm rolhek:overnemen`.
- De momentopname schrijft `.git/config` niet meer als blob in `.git/objects`. Een momentopname van vóór de bouw heeft
  nog de oude staat, en de eerste vergelijking daarmee telt eenmalig als verandering. Na de bouw wist
  `pnpm rolhek:overnemen --alles` dat eenmalig, zoals na 0084.
- Framework R-ROL-10 en `docs/operations/agent-doorloop.md` volgen in de bouw-PR.
