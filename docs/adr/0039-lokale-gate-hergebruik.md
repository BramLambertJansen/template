# 0039 — Lintresultaten lokaal hergebruiken op basis van projectinhoud

Status: voorgesteld

Wijzigt [0011](0011-railwerk.md) punt 3 en de lokale feedbacklus uit framework §4 en §8.
Drempel: A3 (een lokale controle mag een eerdere uitslag gebruiken) en A4. Staat los van de beslisroute van 0038.

## Context

De eigenaar vraagt op 2026-10-21 om de verbeterpunten uit de gedeelde procesanalyse op te pakken; Claude werkt aan 0038.
Developer-stop en pre-push starten ieder volledig dezelfde snelle gate. De
[nulmeting](../reviews/2026-10-21-lokale-gates.md) meet circa 218 seconden per uitvoering, waarvan circa 46 seconden lint.
Het eerste voorstel voor volledige hergebruikcache viel af: een vuile werkmap en een volgende commit verhinderen
hergebruik. De eigenaar gaf voorwaardelijk akkoord ("als we hier winnen wat we beoogd hadden") en daarna "Oke ga door"
op het vervolg per controle. Dit voorstel beperkt de bouw tot ESLint; de ADR-status blijft ongewijzigd tot het formele besluit.

## Voorgesteld besluit

1. **Alle gates blijven draaien.** Eén lokaal toegangspunt voor developer-stop en pre-push leest het bestaande gate-register
   en houdt dezelfde volgorde en foutcodes. Alleen lint krijgt ESLint's eigen contentcache; ESLint start iedere keer en
   blijft zelf zijn configuratie en cache controleren. Er komt geen eigen groene uitslag voor een volledige gate.
2. **Inhoud, niet commit.** De cache bindt werkmap, bytes en bestandssoorten van project en dependencies, Node-binary,
   toolversie en de werkelijke lintomgeving. Ook andere TypeScript-bestanden tellen mee: hun wijzigingen kunnen een
   lintfout veroorzaken in een onveranderd bestand. Stagen en committen zonder inhoudswijziging veranderen deze invoer niet.
   Launchermetadata verdwijnt zowel uit de sleutel als uit de werkelijke lintomgeving; Node en ESLint worden direct
   gestart. Een interne pnpm-zoekroute wordt gecontroleerd en verwijderd; een externe zoekroute geeft gewone lint.
3. **Beperkt ondersteund.** Alleen de onderzochte ESLint-/tsconfig-inhoud en lintopdracht gebruiken de versnelling.
   Andere configuratie, runtimeoverrides, externe bronnen/declaraties, externe symlinks, extra TypeScript-projecten of
   packages in bovenliggende mappen geven de oorspronkelijke lintopdracht. De configuratiedigests zijn een grens van de
   ondersteunde invoer; wijzigen vraagt onderzoek en tests, niet alleen nieuwe hashes invullen om hergebruik terug te krijgen.
4. **Veilig publiceren.** Iedere run heeft een eigen tijdelijk cachebestand. Alleen na exitcode 0 en gelijke invoer vóór
   en na lint worden sleutel en ESLint-cache samen atomair gepubliceerd. Bij een tussentijdse wijziging volgt gewone lint.
   Ontbrekende/beschadigde cache geeft een verse controle; een onbruikbare cachemap geeft gewone lint. Een mislukte
   publicatie verandert de echte groene lintuitslag niet. Opslag buiten de werkmap bevat geen omgevingswaarden of secrets.
5. **CI en bewijs blijven zelfstandig.** De gewone handmatige snelle gate, CI, PR-verificatie, documentstatus en
   onafhankelijke review gebruiken deze lokale cache niet. Het toegangspunt schakelt caching uit in CI en de runner.
   De overige lokale controles, tests en Git-afhankelijke checks worden altijd opnieuw uitgevoerd.
6. **Bewezen winst is voorwaarde.** Meet de volledige ronde met dezelfde broncode, inclusief hashing en extra tests.
   Bewijs met echte ESLint dat een typewijziging een fout in een onveranderde afnemer oplevert. Geen aansluiting als
   alleen de losse lintmicrobenchmark sneller is. Dit voorstel belooft niet dat de volledige tweede gate verdwijnt.

## Alternatieven

- Volledige gates aan HEAD koppelen: geen winst tussen een vuile developer-stop en de daaropvolgende commit/pre-push.
- Alleen ESLint's individuele bestandsinhoud gebruiken: mist typewijzigingen in andere bestanden.
- Eigen cache voor succesvolle unit-tests of typecheck: meer geldigheidsregels; blijft buiten deze eerste stap.
- Tegelijk CI-selectie, testparallelisatie en Docker aanpassen: maakt oorzaak en winst moeilijker te beoordelen.

## Gevolgen

De bouw raakt scripts, de twee lokale aansluitingen, nieuwe tests en de bijbehorende procedure. Er komen geen nieuwe
dependencies, CI-regels of databaserechten bij. Oudere checkouts zonder helper houden de volledige bestaande gate.
Nieuwe ESLint-/TypeScript-configuratie kan de versnelling uitschakelen; de gewone controle blijft dan werken.
Het lokale cachebestand is geen manipulatiebestendig bewijs. Eigenaarreview en de merge blijven vereist.
