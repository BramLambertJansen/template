# 0084 — Afscherming door de sandbox telt niet als effect

Status: geaccepteerd

Herzien: 2026-11-12 (#705): alleen de plaatshouders voor `pr:verify` blijven; de afscherming voor de effecttoets vervalt (ADR 0091 punt 2)
Herzien: 2026-11-16 (#745): ingekort tot wat nog geldt; de puntnummers zijn ongewijzigd, de oude tekst staat in git

Wijzigt [0083](0083-bewaking-met-minder-wrijving.md) punt 2. Drempel: A3
(een vangnet wordt smaller) en A4. Aanleiding: leerpunt #567 en meting #591 (6 november 2026), eerder #582. Uitwerking:
[spec sandbox-plaatshouders](../specs/sandbox-plaatshouders.md).

## Context

De sandbox legt op afgeschermde paden een plaatshouder neer. Gemeten op 6 november 2026 (Claude Code 2.1.318) zijn dat twee
vormen: een alleen-lezen koppeling van `/dev/null`, een tekenapparaat 1,3 van `nobody` (leesweigering, zoals `.env`; ook voor
schrijfpaden zoals `.bashrc`), en een leeg gewoon bestand dat Claude Code op de host aanmaakt voor een schrijfgeweigerd pad dat
niet bestond (`.bashrc`, `.mcp.json`, `.claude/commands`). De werkmapcontrole van `pr:verify` weigerde op die plaatshouders.

## Besluit

1. *(vervallen, zie 0091)*
2. **Plaatshouders op een vaste lijst tellen niet.** Voor een ongetrackt pad op de vaste lijst plaatshouders van Claude Code
   (`rails/hooks/lib/sandbox-plaatshouders.mjs`) gelden leeg zonder uitvoerbit en tekenapparaat 1,3 als afwezig in de
   werkmapcontrole van `pr:verify`. Inhoud, een uitvoerbit of een pad buiten de lijst telt als wijziging. Een nieuwe
   plaatshouder in een nieuwe versie geeft een valse melding en een leerpunt; de lijst groeit alleen met eigenaarakkoord.
3. **Bij twijfel telt het pad.** Een getrackt pad of een herkenning die een fout geeft, valt dicht.
4. *(vervallen, zie 0091)*
5. **Alleen `pr:verify` van de hoofdsessie telt als bewijs** bij oplevering.

## Restrisico, aanvaard

`pr:verify` ziet geen wijziging aan een pad op de lijst die de vorm van een plaatshouder heeft (een tekenapparaat 1,3 of een
leeg bestand zonder uitvoerbit). In de sandbox kan zo'n pad niet geschreven worden; CI, de ruleset en de eigenaarmerge blijven de grens.

## Alternatieven

- **`pr:verify` in `sandbox.excludedCommands`.** Het draait dan code uit de werkmap (`scripts/`, `rails/`) buiten de sandbox;
  wat een subagent daar wijzigt, draait de hoofdsessie zonder grens (0082 punt 4).
- **De lijsten uit `.claude/settings.json`.** De schrijfplaatshouders zijn ingebouwd in Claude Code en staan daar niet.
- **Eigenaar `nobody` en een mtime van vóór de sessie als kenmerk.** Hangt af van de uid-mapping en de versie; het lege
  bestand heeft juist een verse mtime.
- **`werkmapNegeer` uitbreiden.** Alleen voor `.claude/`, en het verbergt ook echte wijzigingen.

## Gevolgen

- `docs/operations/agent-doorloop.md` beschrijft de werkmapcontrole met de plaatshouders.
