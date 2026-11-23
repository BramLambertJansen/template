# 0108 — Back-up en herstel: simpel, met drie vangnetten

Status: voorgesteld

Drempel: A2 (een nieuwe databaserol en vier kleine tools in een aparte image: `age`, `rclone`, `curl` en `dbmate`, waarvan
de template `dbmate` al gebruikt), A3 (één rol krijgt `BYPASSRLS`; `db/tests/rolattributen.sql` verbiedt dat nu voor de vijf
rollen van de template en krijgt één benoemde uitzondering) en A4 (wijzigt [0039](0039-stack-provider-neutraal-en-toolchain.md)
op één punt: de template levert voortaan een back-upstap en een runbook voor herstel, waar 0039 alle runbooks per app liet;
en [0043](0043-accounts-uitnodigen-mfa-en-beheer.md) via R-DB-13: na een herstel schrijft één SQL-stap als `app_migrator`
rechtstreeks in `better_auth`).
Aanleiding: verzoek van de eigenaar (2026-11-23), app-behoefte: de eerste app met geld (ABAS) gaat naar productie op
goedkope hosting zonder back-ups van een provider. Werkt roadmap-item ST-10 uit voor het deel "back-up en herstel"
(ST-10a). Uitwerking: spec [back-up-en-herstel](../specs/back-up-en-herstel.md). Keuzes van de eigenaar na de spec-review
(2026-11-23): oefening op de server, Drive of SharePoint als standaardmap met benoemd risico, nazorg als SQL-stap, een server
met planner verplicht voor productie, en de migraties komen bij het draaien uit de code van de release, niet uit de image.

## Context

De template kiest geen hosting en geen beheerde database (0039). Een app op een eigen server of een gratis plan heeft dus
geen back-up, tenzij ze er zelf een bedenkt. De apps zijn klein: een database van enkele megabytes. Dertig volledige kopieën
kosten bijna niets, en een los bestand terugzetten is het eenvoudigste herstel dat er is.

Drie eigenschappen van de template maken een gewone `pg_dump` onmogelijk of gevaarlijk:

- **RLS is geforceerd op elke tabel in `public` en `app`, en geen rol van de template heeft `BYPASSRLS`** (R-DB-05,
  `db/tests/rolattributen.sql`). `pg_dump` zet `row_security` uit en stopt dan met een fout. Met geen enkele rol van de
  template lukt een volledige export.
- **TOTP-geheimen zijn versleuteld met `AUTH_SECRET`** (Better Auth, two-factor-plugin). Zonder dat geheim kunnen beheerders
  na herstel niet meer inloggen.
- **Sessies, links en eenmalige claims staan in de database** (R-AUTH-02, R-AUTH-06). Een oude export terugzetten maakt
  sessies en links die na de back-up zijn ingetrokken of gebruikt, weer geldig.

In de praktijk gaan back-ups bijna altijd op drie manieren mis: ze zijn stil gestopt, ze blijken niet terug te zetten, of de
sleutel is kwijt. Daar richt dit besluit zich op; zeldzamere risico's laat het bewust liggen en benoemt het.

## Besluit

1. **Elke nacht een export, versleuteld, naar een map die de app kiest.** `pg_dump` naar één bestand, versleuteld met
   `age`, met `rclone` naar een map (standaard een gedeelde Drive of SharePoint; ook een Storage Box of S3-achtige opslag).
   Daarnaast een export vlak vóór elke release. Verlies bij een ramp: hooguit één dag, of alles sinds de laatste release.
2. **Instellen in git, uitvoeren buiten de app.** Map, sleutel en bewaartermijn staan in `deploy/backup.env` en wijzigen via
   een PR; CI valideert het bestand. De planning staat in de planner van de host (runbook). Geheimen staan bij de
   uitvoerder. De taak draait los van het API-proces. De app kan back-ups niet uitzetten, omleiden of terugzetten.
3. **Productie vraagt een server met een planner.** Daar draaien de back-up en de oefening. Een app op hosting zonder
   planner kiest in haar eigen ADR hoe ze dit oplost; de template levert daar geen variant voor.
4. **Een kleine image zonder Node.** Bash-scripts met de Postgres-tools van `db/docker/Dockerfile`, plus `age`, `rclone`,
   `curl` (voor de dodemansknop en de foutmail via SMTP) en `dbmate` (om naar de huidige code te migreren), elk een los
   programma. De migraties zitten niet in de image (R-DEPLOY-03): de taak leest ze bij het draaien, alleen-lezen, uit de
   checkout van de huidige release. Elke stap van een pipe telt mee voor de uitkomst (`set -o pipefail`): een export die
   halverwege afbreekt, is een mislukte export. De productieservice staat in `deploy/backup/`, niet in de `compose.yaml`
   van de lokale stack.
5. **Een eigen rol `app_backup`.** `LOGIN`, lid van `pg_read_all_data`, `BYPASSRLS`, nergens eigenaar of lid van. Hij heeft
   geen enkel schrijfrecht; dat rust op de rechten, niet op een instelling die de rol zelf kan uitzetten. Alleen deze rol mag
   naast de vijf rollen van de template `BYPASSRLS` hebben, en hij is het enige lid van `pg_read_all_data`. In `db/init/`
   en het runbook, nooit in een migratie (R-DB-01).
6. **Wat de host wel en niet kan.** De back-uptaak versleutelt met een publieke sleutel en kan haar eigen exports dus niet
   lezen. Ze heeft in de map alleen een schrijver die niet kan wissen (bij een gedeelde Drive: Bijdrager). Opruimen draait
   elders met een eigen identiteit. Twee risico's aanvaardt dit besluit bewust:
   - de oefening draait op dezelfde host en heeft daar de privésleutel. Wie de host kaapt, kan dus ook de exports van de
     bewaartermijn lezen. Die host heeft de actuele data al; een app met gevoelige gegevens kan de oefening per ADR
     elders laten draaien;
   - een Bijdrager op een Drive kan bestaande exports overschrijven en oude versies weghalen. Wie de host kaapt, kan zo
     back-ups onbruikbaar maken. De wekelijkse oefening en het krimpalarm merken dat; een app met geld kiest per ADR
     opslag die overschrijven weigert (snapshots of object lock).
7. **Geheimen in GitHub alleen in een beschermde omgeving.** De opruimtaak, en elke andere workflow met een back-upgeheim,
   draait in een GitHub-environment die alleen vanaf `main` start (R-SEC-06).
8. **Terugzetten als `app_migrator`, nooit eroverheen.** Op een echte doel-database bestaan de rollen al (runbook,
   R-DB-01); `pg_restore` draait als `app_migrator`, naar een nieuwe, lege database. De nazorg is een SQL-stap die ook als
   `app_migrator` draait (eigenaar van de tabellen): alle sessies en open links weg, `session_version` van elke gebruiker
   omhoog, en een auditregel met alleen ID's (R-DB-15). Geen nieuwe rechten en geen wijziging van R-DB-14; wel een
   uitzondering op R-DB-13 voor alleen deze stap. Getekende links voor een e-mailwijziging staan niet in de database; die
   verlopen na `EMAIL_CHANGE_TTL_SECONDS`, en daarom wordt pas overgeschakeld als de oude app minstens zo lang geen links
   meer uitgeeft. Een niet-superuser kan een dump met objecten van `app_definer` alleen terugzetten als de rechten op de
   schema's vóór de eigenaarswissels staan; het herstelscript legt die volgorde vast, en de bouw bewijst het met een echte
   template-database. De oefening zet ook als `app_migrator` terug.
9. **Vangnet 1, alarm.** Na elke geslaagde back-up meldt het script zich bij een "dodemansknop"-URL; blijft die melding meer
   dan 26 uur uit, dan alarmeert die dienst. Een mislukte run mailt zelf. Een export die veel kleiner is dan de vorige
   zeven, mailt ook: een leeggehaalde database wordt anders trouw geback-upt.
10. **Vangnet 2, wekelijks echt terugzetten.** De nieuwste export in een lege Postgres van dezelfde versie, als
    `app_migrator`, gemigreerd naar de huidige code, met de policy- en invariantentests van de template en de
    herstelcontroles van de app (bij geld: saldo gelijk aan de som van de boekingen). Een geslaagde oefening meldt zich bij
    een eigen dodemansknop (venster acht dagen) en zet een klein markeerbestand zonder persoonsgegevens in de map. Of
    `AUTH_SECRET` klopt, toetst geen automaat: dat vraagt de cryptografie van Better Auth en dus Node. Bij een echt herstel
    logt een beheerder met zijn tweede factor in vóór het overschakelen.
11. **Vangnet 3, een herstelblad bij twee mensen**, buiten git en buiten de host: waar de back-ups staan en hoe je erbij komt,
    de privésleutel, `AUTH_SECRET` en de andere productiegeheimen. De houders toetsen bij het opstellen dat hun privésleutel
    bij de publieke sleutel in git hoort, en bevestigen het blad minstens eens per jaar en na elke wissel van een geheim.
12. **Opruimen voorzichtig.** Exports ouder dan de bewaartermijn gaan weg, maar er blijven er altijd minstens zeven, en er
    wordt niets gewist zolang de nieuwste ouder is dan 26 uur.
13. **Productiepoort.** Geen release zonder geslaagde export vlak ervoor. Geen productie zonder een markeerbestand van een
    geslaagde oefening van hooguit acht dagen oud en een bevestiging van het herstelblad van hooguit twaalf maanden oud in
    `deploy/backup.env`, gezet door de eigenaar. Een gekaapte host kan een markeerbestand vervalsen; dat risico aanvaardt
    dit besluit, omdat de poort een vergissing moet tegenhouden, geen aanval (R-PRINC-02).

## Alternatieven

- **restic of een vergelijkbaar back-upprogramma.** Sterk bij grote data die elke dag een beetje verandert. Bij een paar
  megabytes voegt het een opslagformaat en extra controles toe zonder winst; een los bestand wordt bij de oefening sowieso
  helemaal gelezen.
- **Twee bestemmingen verplicht.** Beschermt tegen het verlies van één opslagdienst. Kan per app-ADR, maar is geen eis.
- **De oefening standaard elders.** Houdt de privésleutel weg van de host, maar vraagt een tweede machine of dienst met
  eigen geheimen. Per app-ADR.
- **Standaard opslag die overschrijven weigert.** Sterker tegen een gekaapte host, maar de eigenaar wil de map van de
  vereniging kunnen gebruiken. Per app-ADR.
- **Een definer-functie voor de nazorg.** Afgeschermd tot één functie, maar vraagt delete-rechten voor `app_definer` op
  `better_auth` en dus een wijziging van R-DB-14 en ADR 0043. De SQL-stap als `app_migrator` heeft die rechten al.
- **Opruimen op de host zelf.** Eenvoudiger, maar dan kan wie de host kaapt alle back-ups wissen.
- **Een runtime (Node) in de image.** Kan `AUTH_SECRET` automatisch toetsen, maar zet een volledige runtime naast de
  databasegeheimen. Het inloggen bij een echt herstel bewijst hetzelfde.
- **Beheerde database met terugspoelen naar elk moment.** Minder risico, kost geld, en de template kiest geen provider.
- **Instellen via een beheerpagina in de app.** Wie het beheeraccount heeft, heeft dan de back-ups.

## Gevolgen

- Een rol met `BYPASSRLS` die ook kolommen leest die de allowlist voor `better_auth` (R-DB-14) anders afschermt, zoals
  wachtwoord-hashes en TOTP-geheimen. Compensatie: geen schrijfrechten, wachtwoord alleen bij de uitvoerder, en waar de
  database het toestaat alleen bereikbaar vanaf de uitvoerder (runbook; bij een beheerde database vaak niet per rol in te
  stellen).
- Elke app die naar productie gaat, kiest in haar ADR: de map, waar het opruimen draait, de bewaartermijn, de dodemansknop en
  twee sleutelhouders, en of ze een van de aanvaarde risico's van punt 6 anders afdekt.
- Na herstel zijn lopende uitnodigingen ongeldig; het runbook zegt opnieuw uitnodigen.
- Achtergrondtaken (spec achtergrondtaken, nog niet gebouwd) mogen na herstel niet vanzelf starten. Tot die er zijn, is er
  niets om uit te zetten; die spec krijgt een schakelaar bij de start, en het runbook noemt hem.
- Gegevens die na een back-up zijn verwijderd, komen bij herstel terug. Bij een echte ramp is ook het auditlog met die
  verzoeken weg. Dat risico aanvaardt dit besluit; een app-ADR kan een eigen logboek buiten de database kiezen. De
  bewaartermijn hoort in het privacyregister.
- Bewust niet gedekt: het gelijktijdig verlies van de host en de opslagdienst. Een app die dat wel nodig heeft, voegt per ADR
  een tweede bestemming toe.
- Groeit een database naar gigabytes, dan herzien we dit besluit.
- Herzien bij de bouw: R-DB-01 (een rol erbij, en de enige met `BYPASSRLS`; met de spec achtergrondtaken komt daar ook
  `app_jobs` bij), R-DB-13 (de nazorg-SQL als uitzondering), R-ARCH-05 en R-ARCH-10 (de mappen `db/backup/`,
  `db/restore-checks/` en `deploy/backup/`, en `deploy/backup.env`), R-PROV-06 en R-SEC-06.
