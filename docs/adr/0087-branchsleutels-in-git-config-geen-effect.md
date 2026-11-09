# 0087 — Vaste branchsleutels in `.git/config` tellen na SubagentStop niet als effect

Status: geaccepteerd

Wijzigt [0066](0066-schrijfgrens-op-effect.md) punt 1 en [0083](0083-bewaking-met-minder-wrijving.md) punt 2. Drempel:
A3 (een vangnet wordt smaller) en A4. Aanleiding: leerpunt #642 (9 november 2026). In één sessie kwamen minstens tien
valse meldingen, en elk vroeg `pnpm rolhek:overnemen .git/config` door de eigenaar. Uitwerking:
[spec rolhek-effect](../specs/rolhek-effect.md) AC-13.

## Context

`.git/config` staat op de vaste lijst van de toets op effect: elke byte die verandert, telt. Iemand kan het bestand zonder
venster schrijven terwijl de opname van een subagent openstaat. Dan komt de wijziging op naam van die subagent, ook ná zijn
SubagentStop. Die schrijver kan de eigenaar in zijn eigen terminal zijn, of de git-extensie van de editor. `git push -u`
en `git switch -c` met tracking schrijven een sectie `[branch "<naam>"]` met `remote` en `merge`. `git branch -D` haalt
die weer weg. De editor schrijft `vscode-merge-base`, `github-pr-base-branch` en `github-pr-owner-number`.

Wie buiten een venster schrijft, kan de hook niet vaststellen. Een eerder voorstel steunde op een kenmerk per aanroep.
Dat strandde, omdat de opslag per aanroep niet atomair is. Ook een subagent kan zulke regels zetten. Het gevolg is dan
een push naar een andere bestaande remote, of een pull van een verlegde merge. De eigenaar wil dat een subagent daar
geweigerd blijft.

## Besluit

1. **De staat van `.git/config` draagt twee hashes.** Is het bestand een gewoon bestand dat git kan lezen, dan bevat de
   staat de hash van de bytes. Daarnaast bevat hij de hash van de lijst die `git config --no-includes --list` uit precies
   die bytes leest, zonder een vaste klasse branchsleutels met een vast waardepatroon. Welke sleutels en patronen dat
   zijn, staat in de spec. De klasse groeit alleen met eigenaarakkoord.
2. **Streng tot en met SubagentStop, neutraal daarna.** Elke vergelijking die een subagent zelf kan treffen, gebruikt de
   hash van de bytes, zoals nu. Dat zijn de eigen Bash-commando's van de subagent, zijn SubagentStop, de vensters van de
   hoofdsessie, en een nacontrole van een subagent die niet gestopt is. Alleen de nacontrole van een gestopte subagent
   gebruikt de neutrale hash. Een kenmerk per aanroep is daarvoor niet nodig: de hook-gebeurtenis en de bestaande opname
   bepalen het toetsmoment.
3. **Bij twijfel geldt de toets zoals nu.** Elke andere sleutel telt, ook in een branchsectie. Dat geldt ook voor een
   waarde buiten het patroon, een remote die niet in hetzelfde bestand staat, een andere volgorde, een andere mode, en een
   bestand dat git niet kan lezen of dat geen gewoon bestand is.
4. **Refs en HEAD blijven buiten dit besluit.** Een verwijderde of verschoven `refs/heads/*` en een verschoven HEAD tellen
   zoals in 0083 punt 2.

## Restrisico, aanvaard

Een achtergrondproces van een subagent dat ná zijn SubagentStop een neutrale regel zet, valt niet op. Het is niet te
onderscheiden van de eigenaar of de editor; voor `refs/remotes/**` aanvaardde 0083 punt 2 hetzelfde. Zo'n regel kan
drie dingen doen:

- een `git push` zonder argumenten naar een andere remote sturen die al in het bestand staat, zoals een publieke fork,
  en de branch daar publiceren;
- `git pull` een andere bestaande remote branch laten mergen, met vreemde code die daarna draait;
- een regel zijn die voor git neutraal is, maar die een andere lezer (libgit2, JGit, een editor-extensie) anders leest.

Een neutrale regel van de eigenaar of de editor binnen de looptijd van een subagent blijft een vals positief. De
eigenaar neemt hem over. CI, de ruleset en de eigenaarmerge blijven de grens.

## Alternatieven

- **Inhoud alleen, in elk toetsmoment.** Eenvoudiger, maar dan kan een subagent de regels in zijn eigen commando zetten.
  De eigenaar wees dat af.
- **Een kenmerk per aanroep, met vrijstelling buiten de tool-vensters.** Dat hangt af van een opslag per aanroep die niet
  atomair is, en het laat een achtergrondproces na het venster toch door.
- **`.git/config` niet meer toeschrijven na SubagentStop.** Dan valt ook een `core.hooksPath` of `include.path` uit een
  achtergrondproces weg.
- **Neutraal vanaf SubagentStop in plaats van daarna.** Dat geeft minder valse meldingen, maar dan is alleen een
  commando met PostToolUse nog gedekt (spec OV-10).
- **Alleen de remote `origin` neutraal.** Dat dekt een push of pull naar een andere remote, maar niet een verlegde
  `merge`. Dit is de terugval als de gekozen vorm in review niet houdt.
- **Een eigen parser van de bytes.** Een verschil met de parser van git zou een gat zijn.

## Gevolgen

- Na SubagentStop geven `git push -u`, een branch met tracking, `git branch -D` (alleen het configdeel) en de editor
  geen melding meer op `.git/config`. De ref van een verwijderde branch blijft een melding voor `pnpm rolhek:overnemen`.
- De momentopname schrijft `.git/config` niet meer als blob in `.git/objects`. Een opname van vóór de bouw heeft nog de
  oude staat, en de eerste vergelijking daarmee telt één keer als verandering. `pnpm rolhek:overnemen --alles` wist de
  opnamen van subagents, maar niet die van lopende commando's. De overgang is pas voorbij als elke sessie van vóór de
  bouw gestopt of herstart is.
- Framework R-ROL-10 en `docs/operations/agent-doorloop.md` volgen in de bouw-PR.
