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

## Eerste variant: volledige gate hergebruiken

De eigenaar reageerde in de sessie: "Prima, als we hier winnen wat we beoogd hadden". Dit is voorwaardelijk akkoord:
de aansluiting mag pas actief worden als de beoogde winst blijkt. De ADR-status is niet aangepast; het besluit staat
niet op main. Main is opnieuw opgehaald en stond nog op dezelfde broncommit; 0038 is daar nog voorgesteld.

Een experiment met een echte, afzonderlijke Git-repository heeft twee toegestane volgordes vastgelegd. Het voert
geen gate uit en implementeert geen cache; het toetst de voorwaarden van de eerste variant in commit `fa02eed`.
De broninhoud is na de wijziging telkens gelijk, zowel vóór als na `git add` en `git commit`.

| Volgorde                                      | Werkmap bij developer-stop      | HEAD bij pre-push                  | Gevolg van het voorstel                                                        |
| --------------------------------------------- | ------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------ |
| Bewerken → developer-stop → commit → pre-push | Gewijzigd, ook na alleen stagen | Anders dan bij developer-stop      | Geen herbruikbaar developer-resultaat; beide volledige controles blijven nodig |
| Bewerken → commit → developer-stop → pre-push | Schoon                          | Gelijk, als verder niets verandert | Hergebruik is mogelijk; tijdwinst is nog niet gemeten                          |

Concreet veranderde HEAD in de fixture van `4d9bf4ca63a92e72f33eceea5052bc08542d706b` naar
`1a4f02182f5cb533fec010dbc64029e87364ec50`. De SHA-256 van het gewijzigde bronbestand bleef vóór en na het committen
`7b9a72466d3960eb2aacccfc848939453490db0678bd4725def3f789b891c919`. De werkmap ging van gewijzigd naar schoon.
Dit bewijst dat gelijke broninhoud niet genoeg is voor de voorgestelde sleutel, die ook HEAD en een schone werkmap eist.
In het eerste scenario daalt het aantal noodzakelijke gate-uitvoeringen dus van twee naar twee: geen uitgespaarde run.
Dit is een gevolg van de getoetste voorwaarden, geen gemeten tijdsvergelijking van een cache-implementatie.

Het experiment en de volledige uitvoer staan lokaal in `/tmp/template-gate-flow-probe.py` en
`/tmp/template-gate-flow-probe.json`. Reproductie: initialiseer een tijdelijke Git-repository met één bestand, commit de
begininhoud, wijzig het bestand, leg HEAD/porcelain/inhoudshash vast, stage, leg ze opnieuw vast, commit en herhaal die
waarneming tweemaal zonder verdere bewerking. Er wordt niets gepusht en geen framework-werkmap gewijzigd.

**Uitkomst van de eerste variant:** de beoogde winst voor de ontwikkelronde was niet aangetoond. Die variant garandeert geen besparing
voor de eerste geldige volgorde. De huidige developer-instructie verplicht niet om vóór SubagentStop te committen
(`.claude/agents/developer.md:8`). Er was ook geen meting van hoe vaak elke volgorde voorkomt. Daarom is die volledige
hergebruikcache niet gebouwd. Dit volgde haar stopvoorwaarde; het is geen bewijs dat caching in alle workflows nutteloos is.

Een vervolgontwerp moet eerst bepalen welke dure, afzonderlijke controles veilig op hun werkelijke invoer kunnen
worden gekoppeld, zonder elke commit als verandering te behandelen. Git-afhankelijke controles blijven zelfstandig
draaien. Ook dan moeten typegestuurde lintafhankelijkheden, de geïnstalleerde dependencies en de omgevingen van beide
hooks worden meegenomen. Alleen opnieuw pushen op dezelfde HEAD sneller maken is onvoldoende bewijs voor de bredere
doelstelling. Dat vervolg verandert het huidige voorstel en wordt daarom niet stilzwijgend geactiveerd.

## Vervolg per controle: alleen lint

De eigenaar gaf daarna "Oke ga door" op het vervolg per afzonderlijke controle. De bestaande lint duurde afzonderlijk
46,178 seconden, typecheck 16,186 seconden (beide exitcode 0). De eerste aansluiting richt zich op ESLint's bestaande
contentcache, niet op een eigen groenbewijs. Het [herziene voorstel](../adr/0039-lokale-gate-hergebruik.md) beschrijft deze scope.

De modules zijn `scripts/kit/lint-inputs.mjs` (inhoudscontrole), `scripts/kit/cached-lint.mjs` (tijdelijke bestanden en
ESLint-aanroep) en `scripts/kit/local-gate.mjs` (dezelfde gates uit het register). Developer-stop en pre-push gebruiken
dit toegangspunt. Alle andere gates, waaronder tests en Git-afhankelijke checks, blijven opnieuw draaien. De gewone
opdracht `pnpm gate:fast`, CI en onafhankelijke review gebruiken de lokale cache niet. De
[procedure](../operations/lokale-checks.md) beschrijft opslag, terugval en de grens van ondersteunde configuratie.

De hook laadt zijn code vanaf het vertrouwde anker. Een nieuwe scriptnaam uit die hook moet daarom bij ontbreken op
een oudere checkout terugvallen op de bestaande volledige gate. Een gemengde templateversie mag de lokale controle
niet stilzwijgend laten vervallen. Het gate-register en de CI-opdrachten blijven gelijk.

## Acceptatiebewijs

| Criterium                                                                    | Bewijs                                                                                                                       |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Stagen en committen zonder inhoudswijziging behouden hergebruik              | Fixture met echte Git-commits in `test/rails/local-gate.test.ts`                                                             |
| Andere typen, nieuwe bestanden en dependencies horen bij de sleutel          | Negatieve gevallen, ook met teruggezette mtime en gewijzigde dependency zonder versieverhoging                               |
| Werkelijke Node-binary en omgeving horen bij de sleutel                      | Afzonderlijke negatieve gevallen; hookvariabelen verdwijnen ook uit de echte lintomgeving                                    |
| Onbekende of externe invoer geeft gewone lint                                | Configuratie, lintopdracht, externe symlink/bron/declaratie en uitgesloten `.git`/`.env`-verwijzing getest                   |
| Alleen stabiel groen wordt gepubliceerd                                      | Rode lint, wijziging tijdens lint en onbruikbare cachemap getest                                                             |
| Een kapotte cache of overlappende run geeft geen onterecht hergebruik        | Beschadigde publicatie en een gecontroleerde interleaving van twee runs getest; dit is geen timingtest met twee OS-processen |
| Alle gates blijven in dezelfde volgorde draaien                              | Twee volledige aanroepen in de commandotest, alleen lint krijgt cacheopties                                                  |
| CI gebruikt geen lokale cache                                                | CI-terugval getest; CI-workflows en handmatige gate blijven ongewijzigd                                                      |
| Oudere checkout zonder helper houdt de controle                              | Nieuwe hooktest in `test/hooks/local-gate.test.ts`; bestaande hooktests ongewijzigd groen                                    |
| Een typewijziging veroorzaakt nog steeds een fout in de onveranderde afnemer | Hieronder met echte ESLint aangetoond                                                                                        |
| De hele ronde wordt sneller                                                  | Hieronder: alle vier gates groen; 16,704 seconden (4,0%) lokale winst over de hele ronde                                     |

De acceptatietests zijn eerst tegen een passthrough/skelet uitgevoerd: 9 van 12 gevallen faalden op de ontbrekende
hergebruiklogica. Na de bouw zijn de oorspronkelijke gevallen groen; er zijn extra negatieve gevallen toegevoegd.
Er is geen bestaande test gewijzigd, verwijderd of geskipt. De nieuwe protocoltests gebruiken een kleine checkerfixture,
geen gemockte API of database. De meting en typeproef gebruiken de echte geïnstalleerde ESLint.

## Echte lint- en typeproef

Twee tijdelijke bestanden in `src/shared/` vormden leverancier en afnemer. Aanvankelijk retourneerde `value()` een getal;
de afnemer riep `value();` aan. Na koud en warm controleren veranderde alleen de leverancier naar `Promise<number>`.
De onveranderde afnemer moet dan `no-floating-promises` opleveren. Dat gebeurde:

| Scenario                                | Duur inclusief invoercontrole | Exitcode | Uitkomst                                                   |
| --------------------------------------- | ----------------------------- | -------- | ---------------------------------------------------------- |
| Koude lintcache                         | 51,398 s                      | 0        | Groen                                                      |
| Dezelfde inhoud, warme lintcache        | 6,893 s                       | 0        | Groen                                                      |
| Alleen retourtype leverancier gewijzigd | 47,166 s                      | 1        | Afnemer regel 3: `@typescript-eslint/no-floating-promises` |

De SHA-256 van de afnemer bleef in alle drie gevallen
`a151fca9830efae7f17a09e2cf63dc86dc7f566c55b993217ed3c901671e90f7`. De tijdelijke bestanden zijn daarna opgeruimd.
Volledige uitvoer: `/tmp/template-lint-type-results.json` en `/tmp/template-lint-type-<scenario>.log`.
Dit toont 44,505 seconden winst bij één herhaalde lintcontrole, niet bij de hele gate. Het rechtvaardigt de volgende
volledige vergelijking, maar is nog geen eindbewijs van de totale ontwikkelronde.

De pre-push-omgeving is ook met de echte geïnstalleerde Lefthook onderzocht, in een aparte Git-fixture. De native
launcher veranderde `NO_COLOR`, `PROGRAMFILES(X86)` en `PWD`; de pnpm-shim voegde ook `NODE_PATH` toe. Dat zou anders
hergebruik tussen developer-stop en pre-push verhinderen. Deze metadata wordt nu consequent uit de lintomgeving
verwijderd of genormaliseerd; een externe `NODE_PATH` geeft nog steeds terugval. De nieuwe commandotest controleert
dat beide invoeren dezelfde sleutel krijgen. De volledige vergelijking gebruikt ook de echte pre-push-launcher.

## Volledige vergelijking op vaste inhoud

De vergelijking gebruikt een aparte Git-clone met bronversie `7d211b55b4c6480193545b8f822ddc724b4b9a62`, eigen Git-hooks
en dezelfde vastgelegde dependencies. Een tijdelijk document is bij developer-stop ongetrackt en bij pre-push gecommit.
Na de gewone ronde wordt alleen de tracking teruggedraaid met een nieuwe commit; dezelfde bestandsinhoud blijft bestaan.
Daarna volgen de geoptimaliseerde developer-stop met koude cache en de echte Lefthook-pre-push met warme cache.
Logging staat buiten de werkmap; tijdens de vier runs is de bronboom niet bewerkt. Alle andere gates blijven draaien.

| Uitvoering                      | Opdracht                                  | Duur      | Exitcode | Tests                         |
| ------------------------------- | ----------------------------------------- | --------- | -------- | ----------------------------- |
| Gewone developer-stop           | `pnpm gate:fast`                          | 215,129 s | 0        | 210 bestanden, 3.105 geslaagd |
| Gewone pre-push                 | `pnpm gate:fast`                          | 204,531 s | 0        | 210 bestanden, 3.105 geslaagd |
| Geoptimaliseerde developer-stop | `node scripts/kit/local-gate.mjs`         | 216,635 s | 0        | 210 bestanden, 3.105 geslaagd |
| Geoptimaliseerde pre-push       | `node_modules/.bin/lefthook run pre-push` | 186,321 s | 0        | 210 bestanden, 3.105 geslaagd |

De gewone ronde duurt samen 419,660 seconden; de geoptimaliseerde 402,956 seconden. Dat is 16,704 seconden (4,0%) winst
in deze lokale vergelijking. De pre-push zelf wint 18,210 seconden (8,9%); de eerste koude run kost 1,506 seconden meer.
Dit is een bescheiden totale winst. De testduur varieerde van 127,19 tot 142,17 seconden. Eén vergelijking bewijst geen
statistisch stabiele versnelling en rechtvaardigt geen algemene belofte van tientallen seconden per ronde.

De tijdelijke documentinhoud heeft in alle vier fasen dezelfde SHA-256:
`6938c9a5ad062e0a28f71e2fb22c31ae20d4f9253e5ec0d79ab68f0f1f15738f`.
De Git-HEAD's zijn achtereenvolgens `7d211b5`, `1168e91`, `d352c35` en `b339a8c`. Die verschillen zijn doelbewust:
het experiment bewijst hergebruik over stagen en committen, niet alleen bij herhaald pushen op dezelfde HEAD.
De bronwijziging van de implementatie is in alle vier gevallen gelijk. De hookinstallatie raakt alleen de eigen clone.

Volledige uitvoer en meetopzet staan lokaal in `/tmp/template-round-v2.py`, `/tmp/template-round-v2-results.json` en
`/tmp/template-round-v2-<scenario>.log`. Dit is lokaal meetbewijs, geen vervanging voor onafhankelijke review of CI.

## Besluit en vervolg

Een aanvullende codecontrole vond twee ontbrekende grenzen: relatieve `reference types`-directieven en gewone
TypeScript-bronnen in dependencies. Vijf nieuwe regressiegevallen faalden eerst op asserties en zijn na correctie groen.
De gerichte controle met de ongewijzigde hooktests telt nu 58 geslaagde tests. Deze aanvullende controle is geen
afgedwongen onafhankelijke review: deze runtime begrenst de schrijfrechten van de reviewer niet.

De eerste volledige vergelijkingspoging op `90243ac` stopte tijdens de gewone, ongecachete nulmeting. Tien bestaande
DOM-tests overschreden hun ongewijzigde timeout van vijf seconden; 3.090 tests slaagden. De gate was rood (329,777 s),
dus deze poging bewijst geen tijdwinst. Uitvoer: `/tmp/template-round-baseline-developer.log`.
De vergelijking is na bovenstaande invoercorrecties opnieuw uitgevoerd, zonder aangepaste testgrenzen; de groene
uitkomsten staan hierboven.

De implementatie volgt het voorwaardelijke akkoord en het vervolgmandaat uit de sessie. De ADR-status is niet door de
agent goedgekeurd of geaccepteerd. De formele besluitprocedure, eigenaarreview en merge blijven gelden. De lokale
aansluitingen staan alleen op de werkbranch; de draaiende Claude-hooks laden nog hun vertrouwde versie van main.
Main is opnieuw opgehaald: `542e300` bevat de gebouwde beslisroute en de geaccepteerde 0038. Na expliciet akkoord van
de eigenaar is die versie zonder conflicten in de werkbranch opgenomen (`c6215c4`). De vergelijking blijft op haar
vaste bronversie `7d211b5`; de uiteindelijke samengevoegde bron vraagt daarnaast een eigen checkuitslag.
De beslisroute uit 0038 vereist een afzonderlijke besluit-PR voor een ADR met eigenaarstatus; bouwen volgt in een
volgende PR (`docs/operations/agent-doorloop.md`). De lokale bouw en meetgegevens zijn voorbereid voor die review.

De gewone eindcontrole `pnpm gate:fast` op de samengevoegde bron `bcad05e9eb6ef5114802c7cb3639b8af585226cb` bleef rood:
676,946 seconden, acht bestaande DOM-tests met een timeout en drie niet gestarte Vitest-workers; 3.277 tests slaagden.
Opmaak, lint, typecheck en alle statische gates waren daarvoor groen. Tijdens het onderzoek was de swap volledig
bezet (2.047 van 2.048 MiB); de worker- en testtimeouts passen bij een belaste omgeving, maar die oorzaak is niet bewezen.
De testgrenzen zijn niet aangepast. Uitvoer: `/tmp/template-final-gate.log` en `/tmp/template-final-gate.json`.
Deze eindcontrole is geen groenbewijs; actuele CI op een schone runner moet het ontbrekende checkbewijs leveren.

Het afzonderlijke besluitvoorstel staat in [PR #247](https://github.com/BramLambertJansen/template/pull/247).
De eigenaar beslist met merge. De implementatie blijft concept tot besluit, vereiste CI en eigenaarreview rond zijn;
de aanvullende statische controles tellen niet als afgedwongen onafhankelijke review.

CI-selectie, consolidatie van ADR's, Docker-orchestratie, rolverdeling en testparallelisatie vallen buiten deze bouwstap.
Die kunnen later afzonderlijk op hetzelfde soort meting worden beoordeeld.
