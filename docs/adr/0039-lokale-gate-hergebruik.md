# 0039 — Lokale gate-uitslagen alleen bij bewezen gelijke invoer hergebruiken

Status: voorgesteld

Wijzigt [0011](0011-railwerk.md) punt 3 en de lokale feedbacklus uit framework §4 en §8.
Drempel: A3 (een lokale controle mag een eerdere uitslag gebruiken) en A4. Staat los van de beslisroute van 0038.

## Context

De eigenaar vraagt op 2026-10-21 om de verbeterpunten uit de gedeelde procesanalyse op te pakken; Claude werkt aan 0038.
Developer-stop en pre-push starten ieder volledig dezelfde snelle gate. De gewone stop start daarnaast typecheck, lint
en gerelateerde tests. De [nulmeting en afbakening](../reviews/2026-10-21-lokale-gates.md) beschrijven de huidige code.
Alleen een commit-SHA bewijst niet dat werkmap, geïnstalleerde dependencies of omgeving gelijk zijn.

## Voorgesteld besluit

1. **Eerste bouwstap: één gedeeld lokaal toegangspunt** voor developer-stop en pre-push. Het voert de bestaande volledige
   snelle gate uit of gebruikt een geslaagde lokale uitslag voor aantoonbaar dezelfde invoer. De gewone stop, tester-stop,
   pre-commit en handmatige gate blijven in deze stap ongewijzigd. Geen gedeeltelijke uitslag geldt als volledige gate.
2. **Conservatieve start:** hergebruik alleen binnen dezelfde werkmap, op een schone gecommitte checkout. Gewijzigde,
   staged of niet-genegeerde nieuwe bestanden maken hergebruik onmogelijk. De sleutel bindt tevens de feitelijke inhoud
   en bestandssoorten van de checkout en geïnstalleerde dependencies, relevante Git-refs, configuratie, toolchain,
   opdracht en omgeving. Alleen versienummers, lockfile, mtimes of een lege Git-status zijn onvoldoende. Kan de bouwer
   deze invoer niet volledig bepalen, dan draait de gate. Geen secrets of omgevingswaarden in het uitslagbestand.
3. **Alleen stabiel groen:** leg een uitslag atomair vast na exitcode 0 én een identieke invoer vóór en na de controle.
   Rood, onderbreking, een ontbrekende/beschadigde cache of een lees-/schrijffout levert geen hergebruik op. Gelijktijdige
   aanroepen mogen bij twijfel allebei controleren; voorkom dat een oude run een nieuwere invoer groen verklaart.
4. **Vertrouwensgrens:** een lokaal uitslagbestand is geen onafhankelijk of manipulatiebestendig bewijs. Het is alleen
   een versnelling voor lokale feedback. CI voert alle bestaande gates opnieuw uit; PR-verificatie, documentstatus,
   vereiste checks, runnerisolatie en review gebruiken de lokale cache nooit. Bestaande veiligheidscontroles blijven.
5. **Meten vóór activeren:** vergelijk op dezelfde machine twee volledige controles met één volledige controle gevolgd
   door hergebruik; neem alle kosten voor invoercontrole mee. Meet daarnaast bouwen, committen en pushen: een nieuwe
   commit maakt de sleutel ongeldig, ook als bronbestanden gelijk bleven. Activeer de aansluiting alleen als ook het
   beoogde werkpatroon aantoonbaar sneller is en alle negatieve tests slagen. Zonder winst blijft alleen de meting over.
   Bewaar de ongewijzigde volledige gate als terugval.

## Alternatieven

- Alleen op HEAD of een schone Git-status vertrouwen: mist lokale bestandsinhoud, dependencies en omgeving.
- Losse caches per hook: twee implementaties van dezelfde geldigheidstoets.
- Meteen vuile werkmappen, CI-selectie, testparallelisatie en Docker combineren: te veel veranderende voorwaarden om de
  winst en regressies aan één wijziging toe te schrijven.
- Alleen ingebouwde lintcaching: smaller alternatief als volledige invoercontrole duurder blijkt dan opnieuw controleren;
  typegestuurde lint vereist daarbij ook invalidatie bij wijzigingen in andere bronbestanden.

## Gevolgen

Na eigenaarbesluit volgt een aparte bouw-PR met test-eerst bewijs voor gewijzigde invoer, rood, corruptie en races.
De bouw wijzigt het lokale toegangspunt, de twee aansluitingen, tests en de bijbehorende procedure. Het gate-register
blijft de bron voor de volledige gate. Er komen geen nieuwe dependencies, CI-regels of databaserechten bij.
De acceptatiecriteria en beoogde bestanden staan in de nulmeting. Dit voorstel activeert geen cache en verandert geen gate.
