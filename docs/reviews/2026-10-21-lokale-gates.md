# Herhaalde lokale gates: nulmeting en eerste bouwstap

Onderzocht door Codex op verzoek van de eigenaar, 2026-10-21. Broncheckout:
`5ce4cbca5ef6caddd30976271c8ae8784778d915`, de opgehaalde main vóór Claude's implementatie van ADR 0038.
Werkbranch: `codex/local-gate-reuse`, in een aparte worktree. De oorspronkelijke checkout is niet gewijzigd.

## Aangetroffen herhaling

| Moment         | Huidige uitvoering                                                 | Bron                                 |
| -------------- | ------------------------------------------------------------------ | ------------------------------------ |
| Na Edit/Write  | Prettier op het bestand; ESLint bij code                           | `rails/hooks/lib/werkstraat.mjs:61`  |
| Stop           | Typecheck, lint op gewijzigde code, gerelateerde unit- en webtests | `rails/hooks/lib/werkstraat.mjs:79`  |
| Developer-stop | Volledige snelle gate, ook bij een schone werkmap                  | `rails/hooks/lib/werkstraat.mjs:109` |
| Pre-commit     | Opmaak en lint op staged bestanden; secretcontrole                 | `lefthook.yml:3`                     |
| Pre-push       | Opnieuw volledige snelle gate                                      | `lefthook.yml:15`                    |
| CI             | Volledige snelle gate en build op de CI-checkout                   | `.github/workflows/ci.yml:20`        |

De volledige opdracht staat in `package.json:54`; de afzonderlijke gates in `scripts/kit/gates.mjs`.
Developer-stop en pre-push vragen dus dezelfde volledige controle opnieuw. De kleinere controles zijn geen vervanging
voor die gate: hun bestandsselectie en opdrachten verschillen. Twee volledige lokale uitvoeringen zijn statisch
aantoonbaar; hun tijdskosten vragen een meting. CI blijft een afzonderlijke controle op de CI-checkout.

De feedbacktabel in `docs/framework.md:114` noemt ESLint-cache; de huidige stopaanroep gebruikt die optie niet.
Typecheck gebruikt al de incrementele TypeScript-build. De unitgroep draait serieel in `vitest.config.ts`; het commentaar
daar noemt gedeelde databasegegevens, terwijl de integratiegroep apart staat. Dit bewijst nog niet dat de unitgroep
veilig parallel kan draaien: onder meer railtests bouwen fixtures en starten subprocessen.

## Meting

Opzet: Linux-worktree op `/tmp`, Node 26.11.1, pnpm 11.28.2, een verse installatie volgens het vastgelegde lockfile.
De meting voert de bestaande volledige snelle gate maximaal twee keer achter elkaar uit, zonder bronwijzigingen of
verwijderen van toolcaches tussen de runs. Alleen als de eerste uitvoering slaagt, volgt de tweede. Installatietijd telt
niet mee. Dit is een lokale meting; geen vergelijking met de Windows-werkmap, Claude-hooks of GitHub-runner.

| Uitvoering                         | Exitcode | Totale duur | Unit- en componenttests             |
| ---------------------------------- | -------- | ----------- | ----------------------------------- |
| Eerste volledige gate              | 0        | 217,886 s   | 208 bestanden, 3.077 tests geslaagd |
| Herhaling met bestaande toolcaches | 0        | 218,725 s   | 208 bestanden, 3.077 tests geslaagd |

Samen 436,611 seconden, ongeveer 7 minuten en 17 seconden. De tweede uitvoering start nog steeds alle gates; de
bestaande toolcaches maken haar hier niet merkbaar sneller. Dit zijn twee verkennende uitvoeringen, geen statistische
benchmark of bewijs voor de winst van een nieuwe cache. Tijdens de meting zijn deze twee voorstelteksten toegevoegd
en bijgewerkt. Broncode, checks, configuratie en dependencies bleven gelijk; de volledige bestandsbomen dus niet.
Een echte vóór/na-vergelijking moet op vastgelegde, stabiele invoer gebeuren.

De volledige uitvoer is in de meetsessie bewaard als `/tmp/template-gate-baseline-1.log` en
`/tmp/template-gate-baseline-2.log`. Dit zijn lokale onderzoeksbestanden, geen CI-bouwbewijs. Een eerste poging binnen
de bestandssandbox kon pnpm's lokale database niet openen; die fout telt niet mee als gate-meting. De twee geslaagde
uitvoeringen gebruikten de ongewijzigde opdracht met de toegestane ruimere uitvoerrechten, zonder runneroverride.

## Afbakening van de bouw

Het [besluitvoorstel](../adr/0039-lokale-gate-hergebruik.md) beperkt de eerste aansluiting tot developer-stop en pre-push.
Beoogde nieuwe module en CLI: `scripts/kit/local-gate-state.mjs` en `scripts/kit/local-gate.mjs`.
Beoogde aansluitingen: `rails/hooks/lib/werkstraat.mjs` en `lefthook.yml`. Testuitbreiding:
`test/hooks/werkstraat.test.ts` en een nieuw `test/rails/local-gate.test.ts`.
Dit zijn bouwdoelen, nog geen bestaande bestanden of opdrachten.

De schone-checkoutbeperking is bewust klein, maar beperkt ook de mogelijke winst: een developer stopt vaak met een
vuile werkmap en de hoofdsessie commit daarna. Een andere HEAD maakt het resultaat ongeldig, omdat onder meer
migratie- en roadmapcontroles Git gebruiken. Voor dat patroon is volledige hergebruikcache dus niet vanzelf een
oplossing. De bouwmeting moet dit scenario meenemen. Zonder winst volgt geen activatie; een volgende, afzonderlijke
afweging kan onderzoeken welke individuele controles veilig op alleen broninhoud kunnen worden gekoppeld.

De hook laadt zijn code vanaf het vertrouwde anker. Een nieuwe scriptnaam uit die hook moet daarom bij ontbreken op
een oudere checkout terugvallen op de bestaande volledige gate. Een gemengde templateversie mag de lokale controle
niet stilzwijgend laten vervallen. Het gate-register en de CI-opdrachten blijven gelijk.

## Acceptatiecriteria voor de bouw

| Criterium                                                                              | Vereist bewijs                                                                                       |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Identieke, schone invoer hergebruikt alleen een volledig geslaagde gate                | Twee echte CLI-aanroepen in een tijdelijke fixture-repo; de gate wordt één keer gestart              |
| HEAD, branch en relevante refs horen bij de sleutel                                    | Iedere wijziging afzonderlijk bewijst een nieuwe volledige uitvoering                                |
| Werkmap, staged wijzigingen, untracked bestanden en bestandssoorten zijn gecontroleerd | Ook wijzigen zonder mtime-wijziging en een symlink mogen geen oud groen opleveren                    |
| Configuratie, lockfile, toolchain, daadwerkelijke dependencies en omgeving tellen mee  | Afzonderlijke negatieve gevallen; een gelijk versienummer zonder gelijke inhoud volstaat niet        |
| Een onbekende invoer valt terug op controleren                                         | Onleesbaar bestand en onbekende installatievorm leveren geen cachehit op                             |
| Alleen stabiel groen telt                                                              | Rode gate, procesfout, onderbreking en wijziging tijdens een run produceren geen herbruikbaar succes |
| Schade of races geven geen onterecht groen                                             | Ontbrekende, kapotte en gedeeltelijke uitslag; twee gelijktijdige aanroepen; atomair publiceren      |
| Oude checkouts en andere werkmappen behouden hun controle                              | Ontbrekende helper valt terug; werkmappen delen geen geldig lokaal resultaat                         |
| CI, runner en PR-bewijs accepteren de lokale uitslag niet                              | Test van de twee aansluitingen en de bestaande CI-/PR-verificatie; geen gewijzigde CI-selectie       |
| De optimalisatie bespaart werkelijk tijd                                               | Dezelfde scenario's vóór en na; ook hashing, toolstart en cachebeheer meegerekend                    |

Geen bestaande test wordt verwijderd of geskipt. De commandotest voor developer-stop verandert in de bouw omdat de
opdracht naar het gedeelde toegangspunt gaat; de eis dat rood blokkeert blijft bestaan en krijgt aanvullende gevallen.
Deze voorbereidingswijziging verandert geen test, hook of gate.

## Besluit en vervolg

De huidige framework-lane verlangt een eigenaarbesluit vóór de bouw van een gewijzigde geaccepteerde ADR
(`docs/adr/0029-snellere-beslisroute.md`, punten 1 en 4). Daarom staat het ontwerp als voorstel klaar; geen cache is
geactiveerd. ADR 0038 is nog voorgesteld in deze broncheckout en wordt door Claude behandeld.
Na zijn wijziging moet de besluitprocedure opnieuw tegen main worden gelezen; deze wijziging herschrijft haar niet.

CI-selectie, consolidatie van ADR's, Docker-orchestratie, rolverdeling en testparallelisatie vallen buiten deze bouwstap.
Die kunnen later afzonderlijk op hetzelfde soort meting worden beoordeeld.
