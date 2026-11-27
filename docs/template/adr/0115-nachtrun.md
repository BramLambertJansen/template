# 0115 — Nachtrun: zelfstandig doorwerken met voorlopige en geparkeerde besluiten

Status: geaccepteerd

Wijzigt [0078](0078-leerlus-met-bewijs.md) punt 4 (de PR-tool vraagt niet meer bij de eigen werkbranch). Vult R-WERK-20 en
[0105](0105-begrensde-fixlus.md) aan met een nachtvariant: de vraag wordt vooraf gesteld of geparkeerd, niet onderweg.
Drempel: A3 (een MCP-schrijftool zonder vraag) en A4 (0078 wijzigt). Aanleiding: de eigenaar wil 's avonds een opdracht
geven en 's ochtends klaar werk vinden (27 november 2026). Uitwerking: [spec nachtrun](../specs/nachtrun.md).

## Context

Een sessie zonder eigenaar loopt nu op drie plekken vast. Ze stopt bij elke ontbrekende beslissing (R-WERK-20), ook bij een
detail dat in een vervolg-PR terug te draaien is. Het openen van een PR in de cloud vraagt de eigenaar (0078 punt 4, gemeten
in spec cloud-pr-route F10). En de Write-tool vraagt bij een bestand in `$TMPDIR`, dat buiten de werkmap ligt; bovendien
wijzen `$TMPDIR` binnen en buiten de Bash-sandbox naar verschillende mappen, zodat `git commit -F` (buiten de sandbox) een
tekst uit de sandbox niet vindt. De grenzen die er echt toe doen hangen niet van een prompt af: de VM van de cloudsessie, de
ruleset en verplichte checks op `main`, het rolhek, de `deny`-regels en de eigenaarmerge voor beschermde paden.

## Besluit

1. **Een nachtrun start alleen op verzoek van de eigenaar** (skill `nachtrun`), alleen in de hoofdsessie. Zonder dat
   verzoek verandert er niets.
2. **Vragen vooraf.** Vóór de start stelt de hoofdsessie alle vragen die een onomkeerbare of beschermde keuze raken in één
   gebundelde ronde, met de takenlijst erbij. Daarna stelt ze geen vragen meer.
3. **Voorlopig of geparkeerd.** Een ontbrekende beslissing die terug te draaien is, binnen de spec of de vrije ruimte van de
   bouwer valt, en geen ontwerpkeuze over een beschermd pad (besluit `eigenaar` of `besluit-pr`), nieuwe dependency, auth of security, dataverlies of handeling
   buiten de repo raakt, neemt de hoofdsessie zelf: `⏳ voorlopig`. Al het andere, en elke stopgrond van R-WERK-20, 0105 en de
   skill `opleveren` (behalve de CI-lus), wordt `⏸ geparkeerd`: die taak stopt, het werk gaat door met de volgende taak die
   er niet van afhangt. Een fix die een regel, check, hook of test afzwakt, is altijd geparkeerd.
4. **Merges zoals 0069.** Een PR zonder beschermd pad merget de hoofdsessie zelf; een PR met beschermd pad wacht op de
   eigenaar, en een taak die erop voortbouwt, stapelt: een branch vanaf die branch en een PR met die branch als `base`.
5. **PR openen zonder vraag.** Het rolhek geeft zelf allow op `mcp__<server>__create_pull_request` voor de hoofdsessie als
   `head` precies de huidige branch is (geen `main`, geen losse HEAD) en `base` gezet is en ervan verschilt; anders vraagt het
   de hoofdsessie en weigert het een subagent, zoals voorheen. Geen regel in `permissions.allow`: zonder hook blijft de
   vraag van Claude Code, dus de doorlaat faalt dicht. Geldt lokaal en in de cloud, ook buiten een nachtrun.
6. **Vastleggen in de bestaande vorm.** Een voorlopige keuze of geparkeerde vraag is een open vraag in de spec
   (`- **OV-n ⏳ voorlopig** — …`, `- **OV-n ⏸ geparkeerd** — …`) en een sectie in de PR. Herzien = de eigenaar beantwoordt
   de OV; een volgende sessie verwerkt dat en zet `✅ besloten`.
7. **Overzicht.** `node scripts/kit/feiten.mjs besluiten` toont alle voorlopige en geparkeerde open vragen; het
   eindbericht van de nachtrun (het ochtendrapport) noemt per taak de PR en de CI-uitslag, en deze lijst.
8. **Tijdelijke bestanden in `.tmp/` van de werkmap** (genegeerd door git en eslint), niet in `$TMPDIR`: voor commit- en
   PR-tekst en voor lees- of rekenscripts, lokaal en in de cloud.

## Alternatieven

- **`--dangerously-skip-permissions` in een container.** Afgewezen voor nu: de cloudsessie is al een VM, en prompts zijn niet
  de grens. Lokaal blijft het een optie voor later (een devcontainer met firewall), met een eigen besluit.
- **`pr:resolve`, `pr:log` en de trage checks naar `allow`.** Afgewezen: hun vraag is de ankertoets van 0102 (code uit de
  werkmap buiten de sandbox); het rolhek laat ze al zonder vraag door als de runnercode gelijk is aan main.
- **Een apart besluitenregister of issue per keuze.** Afgewezen: de open vragen in de spec zijn al de plek, en `gh issue`
  werkt in de cloud niet.

## Gevolgen

- De eigenaar vindt 's ochtends PR's en één lijst met keuzes om te herzien; een verkeerde voorlopige keuze kost een
  vervolg-PR, geen verloren nacht.
- Een nachtrun die runnercode wijzigt, krijgt bij de ankertoets nog een vraag die niemand beantwoordt; die stap wordt
  geparkeerd. Of auto mode in de cloud zo'n vraag anders afhandelt, meet de eerste nachtrun.
- Kosten en duur zijn niet begrensd vanuit de repo; de noodrem is de sessie stoppen in de app.
