# 0084 — Afscherming door de sandbox telt niet als effect

Status: geaccepteerd

Wijzigt [0066](0066-schrijfgrens-op-effect.md) punt 1 en [0083](0083-bewaking-met-minder-wrijving.md) punt 2. Drempel: A3
(een vangnet wordt smaller) en A4. Aanleiding: leerpunt #567 en meting #591 (6 november 2026), eerder #582. Uitwerking:
[spec rolhek-effect](../specs/rolhek-effect.md) AC-11.

## Context

De toets op effect vergelijkt de staat van de werkmap met een momentopname. De hooks maken die opname buiten de Bash-sandbox;
`pnpm pr:verify` vergelijkt erin. De sandbox legt op afgeschermde paden een plaatshouder neer. Gemeten op 6 november 2026
(Claude Code 2.1.318) zijn dat twee vormen: een alleen-lezen koppeling van `/dev/null`, een tekenapparaat 1,3 van `nobody`
(leesweigering, zoals `.env`; volgens #567 en 0082 ook voor schrijfpaden zoals `.bashrc`), en een leeg gewoon bestand dat
Claude Code op de host aanmaakt voor een schrijfgeweigerd pad dat niet bestond (`.bashrc`, `.mcp.json`, `.claude/commands`).
Elke plaatshouder kwam op naam van de subagent wiens venster hem zag verschijnen: 258 valse overtredingen voor reviewer, tester
en architect. `pr:verify` en de Stop-hook weigerden, en `rolhek:overnemen` zou een apparaatbestand overnemen. De werkmapcontrole
van `pr:verify` weigerde ook op de lege plaatshouders. Daarnaast schreef de opname genegeerde geheimen (`.env`) met
`git hash-object -w` in `.git/objects`.

## Besluit

1. **`pr:verify` slaat een bevestigd afgeschermd pad over en meldt het.** Bevestigd betekent: het pad is ongetrackt,
   `/proc/self/mountinfo` van het eigen proces koppelt `/dev/null` alleen-lezen op precies dat pad, en `lstat` geeft een
   tekenapparaat 1,3. Zo'n pad telt niet als verandering en laat geen open overtreding vervallen. De hooks erkennen deze
   vorm alleen via punt 2; zij zien de echte inhoud.
2. **Plaatshouders op een vaste lijst tellen niet.** Voor een ongetrackt pad op een vaste lijst plaatshouders van Claude Code
   gelden weg, leeg zonder uitvoerbit en tekenapparaat 1,3 als gelijk, in elke toets en in de werkmapcontrole van
   `pr:verify`. Inhoud, een uitvoerbit of een pad buiten de lijst telt zoals nu. Een nieuwe plaatshouder in een nieuwe versie
   geeft een valse melding en een leerpunt; de lijst groeit alleen met eigenaarakkoord.
3. **Bij twijfel geldt de toets zoals nu.** Een getrackt pad, een onleesbare mountinfo of een herkenning die een fout geeft,
   valt dicht.
4. **Geheimen gaan niet in `.git/objects`.** Een pad van de `.env`-familie of met `secret` in de basisnaam wordt gehasht zonder
   te schrijven. De oude inhoud is daarna niet terug te halen; een toets die haar nodig heeft, valt dicht.
5. **Alleen `pr:verify` van de hoofdsessie telt als bewijs** bij oplevering.

## Restrisico, aanvaard

`pr:verify` ziet geen wijziging aan een pad met de vorm van punt 1 (elk tekenapparaat 1,3, dus ook een schrijfplaatshouder
zoals `.mcp.json` of `.claude/commands`) die buiten de sandbox gebeurt ná de laatste Stop of SubagentStop. In de sandbox kan
zo'n pad niet geschreven worden; de hooks blijven het toetsen, en CI, de ruleset en de eigenaarmerge blijven de grens.

## Alternatieven

- **`pr:verify` in `sandbox.excludedCommands`.** Het draait dan code uit de werkmap (`scripts/`, `rails/`) buiten de sandbox;
  wat een subagent daar wijzigt, draait de hoofdsessie zonder grens (0082 punt 4).
- **De lijsten uit `.claude/settings.json`.** De schrijfplaatshouders zijn ingebouwd in Claude Code en staan daar niet; de
  leesregels zijn globs over permissies, niet de koppelingen zelf.
- **Eigenaar `nobody` en een mtime van vóór de sessie als kenmerk.** Hangt af van de uid-mapping en de versie; het lege
  bestand heeft juist een verse mtime.
- **`werkmapNegeer` uitbreiden.** Alleen voor `.claude/`, en het verbergt ook echte wijzigingen.
- **`rolhek:overnemen`.** Neemt een apparaatbestand over, en de melding komt bij de volgende sessie terug.

## Gevolgen

- De open lijst bevat geen plaatshouders meer; na de bouw wist `pnpm rolhek:overnemen --alles` eenmalig de oude meldingen.
- Framework R-ROL-09 en R-ROL-10, `docs/operations/agent-doorloop.md` en de `$comment` bij `werkmapNegeer` volgen in de
  bouw-PR. Die meet eerst buiten de sandbox welke vorm de plaatshouders op de host hebben en of ze blijven of verdwijnen.
