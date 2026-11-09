# 0087 — Branchsleutels naar `origin` in `.git/config` tellen niet als effect

Status: geaccepteerd

Wijzigt [0066](0066-schrijfgrens-op-effect.md) punt 1. Drempel: A3 (een vangnet wordt smaller) en A4. Aanleiding:
leerpunt #642 (9 november 2026: minstens tien valse meldingen in één sessie, elk met `pnpm rolhek:overnemen .git/config`
door de eigenaar). Uitwerking: [spec rolhek-effect](../specs/rolhek-effect.md) AC-13.

## Context

`.git/config` staat op de vaste lijst van de toets op effect: elke byte die verandert, telt. Iemand kan het bestand zonder
venster schrijven terwijl de opname van een subagent openstaat. Dan komt de wijziging op naam van die subagent. Dat kan
de eigenaar zijn, in zijn eigen terminal, of de git-extensie van de editor. `git push -u` en `git switch -c` met tracking
schrijven een sectie `[branch "<naam>"]` met `remote` en `merge`. `git branch -D` haalt die weer weg. De editor schrijft
`vscode-merge-base`, ook bij een branch zonder upstream. Wie buiten een venster schrijft, kan de hook niet vaststellen.
Eerdere voorstellen steunden op een kenmerk per aanroep, of op twee staten met een apart toetsmoment. Het eerste strandde
op een opslag per aanroep die niet atomair is. Het tweede vond de eigenaar te zwaar.

## Besluit

1. **De staat van `.git/config` is zijn betekenis, zonder branchsleutels naar `origin`.** Is het bestand een gewoon
   bestand dat git kan lezen, dan is de staat in de momentopname een hash. Die gaat over de lijst die
   `git config --no-includes --list` uit precies die bytes leest, zonder drie soorten regels: `remote = origin`, een
   `merge` naar `refs/heads/<branch>` in een sectie met alleen `remote = origin`, en `vscode-merge-base = origin/<branch>`.
   Dat geldt alleen als `remote.origin.url` in dezelfde bytes staat. Commentaar, witruimte en een lege sectie tellen
   daardoor ook niet. Het geldt in elk toetsmoment en voor elke actor. De patronen staan in de spec, en de klasse groeit
   alleen met eigenaarakkoord.
2. **Bij twijfel geldt de toets zoals nu.** Elke andere sleutel of remote telt, ook in een branchsectie. Dat geldt ook
   voor een waarde buiten het patroon, een andere volgorde, een andere mode, en een bestand dat git niet kan lezen of dat
   geen gewoon bestand is.
3. **Refs en HEAD blijven buiten dit besluit.** Een verwijderde of verschoven `refs/heads/*` en een verschoven HEAD tellen
   zoals in 0083 punt 2.

## Restrisico, aanvaard

Een subagent kan via een programma, in zijn eigen commando of via een achtergrondproces, zonder melding een regel uit
de klasse zetten of weghalen. Het rolhek weigert `git config` vooraf nog steeds, maar een kenmerk per aanroep is er niet.
Een push naar een andere bestaande remote is uitgesloten, want alleen `origin` is neutraal. Twee risico's blijven over:

- een `merge` binnen `origin` naar een andere branch verleggen, zodat `git pull` vreemde code merget die daarna draait;
- een andere lezer van `.git/config` (libgit2, JGit, een editor-extensie) leest dezelfde bytes anders dan git, en ziet zo
  een regel die voor git neutraal is maar voor die lezer niet.

CI, de ruleset en de eigenaarmerge blijven de grens.

## Alternatieven

- **Twee staten: streng tot en met SubagentStop, neutraal in de nacontrole daarna.** Dan blijft de subagent zelf
  geweigerd. Niet gekozen: dit wijzigt ook 0083 punt 2 en de vergelijking en de hooks, en dat is te zwaar nu. Het hoort
  bij een grotere refactor van de bewaking.
- **Alleen buiten de tool-vensters van de subagent vrijstellen, met een kenmerk per aanroep.** Dat hangt af van een
  opslag per aanroep die niet atomair is.
- **`.git/config` niet meer toeschrijven na SubagentStop.** Dan valt ook een `core.hooksPath` of `include.path` uit een
  achtergrondproces weg.
- **Elke bestaande remote neutraal, of ook de sleutels van de GitHub-extensie.** Dat geeft minder meldingen, maar dan
  kan een push naar een fork of een andere repository gaan.
- **Een eigen parser van de bytes.** Een verschil met de parser van git zou een gat zijn.

## Gevolgen

- `git push -u origin`, een branch met tracking op `origin`, `git branch -D` (alleen het configdeel) en
  `vscode-merge-base` geven geen melding meer op `.git/config`. De ref van een verwijderde branch blijft een melding voor
  `pnpm rolhek:overnemen`, net als de sleutels van de GitHub-extensie.
- De momentopname schrijft `.git/config` niet meer als blob in `.git/objects`. Een opname van vóór de bouw heeft nog de
  oude staat, en de eerste vergelijking daarmee telt één keer als verandering. `pnpm rolhek:overnemen --alles` wist de
  opnamen van subagents, maar niet die van lopende commando's. De overgang is pas voorbij als elke sessie van vóór de
  bouw gestopt of herstart is.
- Framework R-ROL-10 en `docs/operations/agent-doorloop.md` volgen in de bouw-PR.
