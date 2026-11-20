# 0061 — Dagelijks werk binnen de Claude Code-sandbox

Status: geaccepteerd
Herzien: 2026-11-04 (#555): punt 3, `git merge origin/main` en fast-forward falen in de sandbox als ze een afgeschermd
zelfladend pad meenemen ([0082](0082-zelfladend-sandbox-en-leeslijst.md))
Herzien: 2026-11-07 (#623): alternatief "Projectstore, cache en state opnieuw inrichten", herzien door
[0085](0085-worktree-installatie-in-de-sandbox.md): in een worktree installeert de agent `node_modules` frozen, met store,
cache en state onder de tijdelijke map; punt 4 blijft
Herzien: 2026-11-16 (#745): ingekort tot wat nog geldt; de puntnummers zijn ongewijzigd, de oude tekst staat in git
Herzien: 2026-11-20: punt 5 en Alternatieven, `git commit *`, `git push origin HEAD`, `gh api *` en `pnpm pr:verify *`
draaien buiten de sandbox, de eerste twee en `pr:verify` zonder prompt, met een aanvaard restrisico (eigenaar; spec
[cloud-pr-route](../specs/cloud-pr-route.md))

Drempel: A3, agentrechten expliciteren en gericht verruimen. Uitwerking: [spec](../specs/claude-sandbox-werkstraat.md).

## Context

De eigenaar wil dat Claude Code in Ubuntu/WSL pnpm, gewone commits, featurebranch-pushes en PR-aanmaak uitvoert zonder
terugkerende eigenaarstaken. De wrijving is eerder gemeten in
[het onderzoek van 13 oktober](../../reviews/2026-10-13-wrijving.md) (S-1, G-3). Dit is de aanleiding uit framework §1.

De huidige mise-selectie `pnpm = "11"` levert lokaal 11.28.5, terwijl `packageManager` 11.28.2 voorschrijft.
Een gerichte bwrap-proef met alleen de eigen tijdelijke map schrijfbaar gaf bij 11.28.5 een SQLite-waarschuwing tijdens
de automatische versiewissel, gevolgd door 11.28.5 met exitcode 0. De rechtstreeks gestarte, al aanwezige 11.28.2 gaf
wel 11.28.2 met exitcode 0; die exacte pnpm gaf met `exec prettier --version` in dezelfde proef 3.9.9 met exitcode 0.
`mise exec -- betterleaks version` gaf 1.9.0 met exitcode 0. Dit zijn beperkte probes,
geen bewijs van een volledige Claude Code-sessie. Globale pnpm-caches openen is daarmee niet noodzakelijk gebleken.

Een echte Git-fixture met lokale bare remote en read-only `.git/config` en `.git/hooks` liet `git push origin HEAD`
slagen. De upstreamvariant gaf ondanks exitcode 0 twee configschrijffouten. Ook voor Git bewijst alleen de exitcode
dus onvoldoende; de dagelijkse vorm vermijdt upstreamregistratie.

## Besluit

1. `package.json` blijft de enige bron van de exacte pnpm-versie. Mise leidt zijn selectie daar shellvrij uit af;
   de bestaande setup installeert die versie vooraf. Dagelijks werk gebruikt de geïnstalleerde versie rechtstreeks.
   Een ongeldige pin of verkeerde werkelijke versie stopt; stille terugval geldt niet als succes. Dit besluit
   autoriseert geen mise-upgrade.
2. Claude krijgt expliciet `autoAllowBashIfSandboxed: true` en gerichte toestemmingen voor gewone Git- en gh-opdrachten.
   `ask`, `deny`, rolhek, hooks uit `main`, CI en GitHub blijven gelden. Subagents krijgen geen push- of PR-schrijfrecht.
3. De dagelijkse pushvorm is `git push origin HEAD` vanaf een featurebranch. PR-aanmaak gebruikt expliciet `--head`
   met de werkbranch en `--body-file`. Een push vanaf `main`, main-verwijdering, force, `--all`, `--mirror`,
   hookoverslaan, PR-merge via gh/API en zelfreview blijven verboden. Lokale `git merge origin/main`, fast-forward en
   bestaande veilige taakbranchopruiming blijven toegestaan. Nemen ze een pad mee dat de sandbox afschermt, dan falen
   ze in de sandbox ([0082](0082-zelfladend-sandbox-en-leeslijst.md)). Upstreaminstelling krijgt geen nieuwe automatische
   toestemming.
4. Git-metadatawrites in hoofdcheckout en worktree gebruiken uitsluitend Claude's ingebouwde ondersteuning.
   Geen `.git`-allowlist, globale pnpm-opslag of mise-installaties schrijfbaar maken. Alleen als een echte gh-logproef
   cachewrites nodig blijkt te hebben, mag exact `~/.cache/gh` schrijfbaar worden; nooit `~/.config/gh`.
5. Sandboxplicht, bestaande runneruitzonderingen, netwerkdomeinen, afscherming van geheimen, supplychaininstellingen,
   `verifyDepsBeforeRun` en alle kwaliteitschecks blijven behouden. De wijziging geldt voor Claude Code, niet voor Codex.
   Daarnaast draaien `git commit *`, `git push origin HEAD`, `gh api *` en `pnpm pr:verify *` buiten de sandbox, lokaal en
   in de cloud. Reden: in een cloudsessie bereikt de sandbox de signeerdienst en de token-proxy van het platform niet;
   `gh` gaf 401 en een commit kon niet worden ondertekend (spec `cloud-pr-route`, F1 en F2). Commit, push en `pr:verify`
   staan in `allow`, dus zonder prompt; `gh api` staat daar niet en volgt de permissieregels. `deny`, `ask` en het rolhek
   blijven gelden.

## Alternatieven

- Globale pnpm-cache of toolchain schrijfbaar maken: vergroot de uitvoerbare inhoud die later buiten de sandbox kan
  worden geladen, terwijl rechtstreeks gebruik van de gepinde versie al slaagt.
- Projectstore, cache en state opnieuw inrichten: extra installatie- en configuratiewerk zonder aangetoonde noodzaak.
- Hooks overslaan: strijdig met de bestaande grenzen.
- Terugkerende handmatige versiecorrecties, pushes en PR-aanmaak: laat de gemeten wrijving bestaan.

## Gevolgen

Eenmalige inrichting loopt via de bestaande setup; normale sessies vragen geen nieuwe toolchaininstallatie.
Eigenaarreview en merge blijven de acceptatie. Beschermde paden en taakmandaten veranderen niet.

Restrisico, aanvaard (punt 5): `git commit` start lefthook en `pnpm pr:verify` start `scripts/` uit de werkmap, beide
buiten de sandbox en zonder vraag vooraf, ook op de machine van de eigenaar. Wat een subagent onder `scripts/` of `rails/`
wijzigt, draait de hoofdsessie bij de volgende commit onbeschermd. Alleen het rolhek vooraf staat ertussen
([0082](0082-zelfladend-sandbox-en-leeslijst.md) punt 4); CI, de ruleset op `main` en de eigenaarmerge blijven de grens.
`gh api` buiten de sandbox geldt ook voor subagents; daar laat het rolhek alleen lezende REST-aanroepen door.
