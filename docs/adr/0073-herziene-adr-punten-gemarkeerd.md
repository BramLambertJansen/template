# 0073 — Herziene ADR-punten staan gemarkeerd in het oude ADR

Status: geaccepteerd

Wijzigt [0046](0046-werkstraat-en-beslisroute.md) punt 2 ("de tekst van een geaccepteerd ADR verandert niet": een markering
mag); vult [0063](0063-compacte-kennisbasis-en-lichtere-werkstraat.md) punt 1 (het regelboek is bindend) aan. Drempel: A4
(afspraak over geaccepteerde ADR's) en een nieuwe check in `check-docs`.
Uitwerking: [spec](../specs/adr-herzien-markering.md). Aanleiding: review van 3 november 2026, bevinding P8b.

## Context

Een nieuw ADR wijzigt vaak een punt van een ouder ADR zonder dat oudere ADR aan te raken. De kopregel van het nieuwe ADR zegt
het ("Wijzigt [0046](…) punt 30, 31 …"), het oude ADR zegt het niet. Veertien actieve ADR's wijzigen op die manier een ander
ADR. ADR 0046 telt 194 regels, waarvan een deel door 0054, 0056, 0057, 0062, 0063 en 0069 is gewijzigd; wie 0046 opent, ziet
niet welke punten nog gelden.

Het regelboek is bindend (R-DOC-03), dus een agent die alleen `docs/framework.md` volgt, gaat niet fout. Maar het waarom staat
in de ADR's, en een agent of de eigenaar die een ADR opent om dat waarom te lezen, leest dan een punt dat niet meer geldt als
geldend. Dat kost leestijd en levert verkeerde conclusies op, en het wordt erger met elk nieuw ADR.

Een ADR in zijn geheel herschrijven bij elke wijziging (de `Herzien:`-regel van R-CI-05, zoals 0063 deed bij 0045 en 0046) kan
al, maar is zwaar: een grote diff in een besluit-PR voor een punt dat elders al beslist is.

## Besluit

1. **Bron is de kopregel van het nieuwe ADR.** Een geaccepteerd ADR dat een ander geaccepteerd ADR wijzigt, noemt dat in zijn
   kopregel met de bestaande vorm: `Wijzigt`, `Herziet` of `Vervangt`, een link `[NNNN](NNNN-….md)` en, waar het om punten
   gaat, `punt N` (ook `punt N, M en K` en `punt N–M`). Een gedeeltelijke wijziging zonder puntnummer (een zin, een paragraaf)
   noemt geen punt.
2. **Het oude ADR krijgt een markering.** Bij elk genoemd punt staat direct na de vetgedrukte titel
   `(herzien door [MMMM](MMMM-….md))`; zonder puntnummer staat die markering in de alinea die het betreft. De tekst van het punt
   verandert verder niet. Een `Herzien:`-regel in het oude ADR die MMMM noemt (een herschrijving volgens R-CI-05) telt ook.
3. **Geen herschrijving.** Een markering toevoegen is geen herschrijving in de zin van R-CI-05: het vraagt geen `Herzien:`-regel
   en mag in de PR van het nieuwe ADR, die door de A4-drempel al een besluit-PR is. Een vervangen of vervallen ADR en het archief
   krijgen geen markering; die blijven byte-gelijk.
4. **`check-docs` dwingt het af.** De check leest de kopregels van alle geaccepteerde ADR's en eist per genoemd punt (of zonder
   punt: per genoemd ADR) de markering uit punt 2. Ontbreekt die, dan is `check-docs` rood, met het oude ADR, het punt en het
   nieuwe ADR in de melding. De check heeft een falende fixture. Een kopregel die naar een geaccepteerd ADR linkt maar geen
   leesbare puntvorm heeft, telt als "zonder punt": het oude ADR moet dan minstens één markering voor het nieuwe hebben.
5. **Eenmalig bijwerken.** De bouw-PR zet de markeringen in alle bestaande gevallen en neemt punt 3 op in R-CI-05. Dit ADR
   markeert zijn eigen wijziging van 0046 punt 2 al in deze PR.

## Alternatieven

- **Alleen afleiden, niets in het oude ADR.** `feiten.mjs adr` zou per punt kunnen tonen dat het gewijzigd is. Goedkoop, maar
  wie het ADR met Read of op GitHub opent, ziet het niet, en dat is precies de lezer die hier fout gaat.
- **Elk gewijzigd ADR herschrijven met een `Herzien:`-regel.** Bestaat al en blijft mogelijk, maar maakt van elke kleine
  wijziging een herschrijving van het oude besluit; de markering is één regel per punt.
- **Oude ADR's periodiek consolideren** (zoals 0039–0051 deden). Ruimt eenmalig op, maar zonder check groeit het gat daarna
  weer. Kan later naast dit besluit.
- **Niets doen; het regelboek wint toch.** Klopt voor het gedrag, niet voor de leestijd en de uitleg aan de eigenaar.

## Gevolgen

- Elke PR met een nieuw ADR dat een ouder ADR wijzigt, raakt ook dat oudere ADR (één regel per punt); de reviewer ziet zo in
  de diff welk punt vervalt.
- De check leest alleen `docs/adr/*.md` buiten het archief; de kosten groeien met het aantal template-ADR's (begrensd op
  0001–0099) en niet met de geschiedenis (R-DOC-09).
- Een vrije formulering in een kopregel ("de vaste rolvolgorde") blijft mogelijk, maar vraagt dan een markering op de plek
  zelf; de check kan alleen eisen dát er een is.
