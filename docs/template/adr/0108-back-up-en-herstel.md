# 0108 — Back-up en herstel: simpel, met drie vangnetten

Status: voorgesteld

Drempel: A2 (een nieuwe databaserol, een definer-functie en drie kleine tools in een aparte image: `age`, `rclone` en
`curl`; `dbmate` gebruikt de template al), A3 (één rol krijgt `BYPASSRLS`; `db/tests/rolattributen.sql` verbiedt dat nu voor de vijf rollen van de template en
krijgt één benoemde uitzondering) en A4 (wijzigt [0039](0039-stack-provider-neutraal-en-toolchain.md) op één punt: de
template levert voortaan een back-upstap en een runbook voor herstel, waar 0039 alle runbooks per app liet). Aanleiding:
verzoek van de eigenaar (2026-11-23), app-behoefte: de eerste app met geld (ABAS) gaat naar productie op goedkope hosting
zonder back-ups van een provider. Werkt roadmap-item ST-10 uit voor het deel "back-up en herstel". Uitwerking: spec
[back-up-en-herstel](../specs/back-up-en-herstel.md).

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
- **Sessies en links staan in de database** (R-AUTH-02, R-AUTH-06). Een oude export terugzetten maakt sessies en links die
  na de back-up zijn ingetrokken, weer geldig.

In de praktijk gaan back-ups bijna altijd op drie manieren mis: ze zijn stil gestopt, ze blijken niet terug te zetten, of de
sleutel is kwijt. Daar richt dit besluit zich op; zeldzamere risico's laat het bewust liggen.

## Besluit

1. **Elke nacht een export, versleuteld, naar een map die de app kiest.** `pg_dump` naar één bestand, versleuteld met
   `age`, met `rclone` naar een map (een gedeelde Drive, SharePoint, een Storage Box of S3-achtige opslag). Daarnaast een
   export vlak vóór elke release. Verlies bij een ramp: hooguit één dag, of alles sinds de laatste release.
2. **Instellen in git, uitvoeren buiten de app.** Map, sleutel, bewaartermijn en schema staan in `deploy/backup.env` en
   wijzigen via een PR; CI valideert het bestand. Geheimen staan bij de uitvoerder. De taak draait los van het API-proces.
   De app kan back-ups niet uitzetten, omleiden of terugzetten.
3. **Een kleine image zonder Node.** Shellscripts met de Postgres-tools van `db/docker/Dockerfile`, plus `age`, `rclone`,
   `curl` (voor de dodemansknop en de foutmail via SMTP) en `dbmate` (om naar de huidige code te migreren), elk een los
   programma. Geen Node, geen `node_modules` naast de databasegeheimen.
4. **Een eigen rol `app_backup`.** `LOGIN`, lid van `pg_read_all_data`, `BYPASSRLS`, nergens eigenaar of lid van. Hij heeft
   geen enkel schrijfrecht; dat rust op de rechten, niet op een instelling die de rol zelf kan uitzetten. Alleen deze rol mag
   naast de vijf rollen van de template `BYPASSRLS` hebben; de rolattributentest noemt hem bij naam. In `db/init/` en het
   runbook, nooit in een migratie (R-DB-01).
5. **De host kan zijn eigen back-ups niet lezen of wissen.** Versleutelen gebeurt met een publieke sleutel; de privésleutel
   staat alleen op het herstelblad en waar de hersteltest draait. De host heeft in de map alleen een schrijver die mag
   toevoegen; wissen of overschrijven mislukt, of is terug te halen (bij een gedeelde Drive: Bijdrager, die niet kan wissen;
   een overschreven bestand houdt zijn oude versie). Exports krijgen altijd een nieuwe naam. Opruimen draait op een andere plek met een eigen identiteit
   (standaard een geplande workflow die alleen dat geheim kent). Valt het opruimen uit, dan groeit de map alleen: dat is
   veilig, en het alarm van punt 7 meldt het.
6. **Terugzetten als `app_migrator`, nooit eroverheen.** Op een echte doel-database bestaan de rollen al (runbook, R-DB-01);
   `pg_restore` draait als `app_migrator`, naar een nieuwe database. Daarna één definer-functie die de nazorg doet: alle
   sessies weg, `session_version` van elke gebruiker omhoog, open links weg, en een auditregel. De oefening zet ook als
   `app_migrator` terug, zodat ze precies het echte herstel bewijst.
7. **Vangnet 1, alarm.** Na elke geslaagde back-up meldt het script zich bij een "dodemansknop"-URL; blijft die melding meer
   dan 26 uur uit, dan alarmeert die dienst. Een mislukte run mailt zelf. Een export die veel kleiner is dan de vorige
   zeven, mailt ook: een leeggehaalde database wordt anders trouw geback-upt.
8. **Vangnet 2, wekelijks echt terugzetten.** De nieuwste export in een lege Postgres van dezelfde versie, als
   `app_migrator`, gemigreerd naar de huidige code, met de pgTAP-suite van de template en de herstelcontroles van de app
   (bij geld: saldo gelijk aan de som van de boekingen). Of `AUTH_SECRET` klopt, toetst geen automaat: dat vraagt de
   cryptografie van Better Auth en dus Node. Bij een echt herstel logt een beheerder met zijn tweede factor in vóór het
   overschakelen, en het herstelblad vraagt het geheim expliciet. Een geslaagde oefening meldt zich bij een
   eigen dodemansknop en zet een klein markeerbestand zonder persoonsgegevens in de map.
9. **Vangnet 3, een herstelblad bij twee mensen**, buiten git en buiten de host: waar de back-ups staan en hoe je erbij komt,
   de privésleutel, `AUTH_SECRET` en de andere productiegeheimen.
10. **Opruimen voorzichtig.** Exports ouder dan de bewaartermijn gaan weg, maar er blijven er altijd minstens zeven, en er
    wordt niets gewist zolang de nieuwste ouder is dan 26 uur.
11. **Productiepoort.** Geen release zonder geslaagde export vlak ervoor. Geen productie zonder een markeerbestand van een
    geslaagde oefening van hooguit acht dagen oud en een datum "herstelblad bevestigd" in `deploy/backup.env`, gezet door
    de eigenaar.

## Alternatieven

- **restic of een vergelijkbaar back-upprogramma.** Sterk bij grote data die elke dag een beetje verandert. Bij een paar
  megabytes voegt het een opslagformaat en extra controles toe zonder winst; een los bestand wordt bij de oefening sowieso
  helemaal gelezen.
- **Twee bestemmingen verplicht.** Beschermt tegen het verlies van één opslagdienst. Kan per app-ADR, maar is geen eis.
- **Opruimen op de host zelf.** Eenvoudiger, maar dan kan wie de host kaapt alle back-ups wissen; alleen de prullenbak van de
  opslag beschermt dan nog.
- **Een runtime (Node) in de image.** Hergebruikt de scripts van de template en kan `AUTH_SECRET` automatisch toetsen, maar
  zet een volledige runtime en dependencies naast de databasegeheimen. Een eigen programma alleen voor die proef is ook
  een extra afhankelijkheid; het inloggen bij een echt herstel bewijst hetzelfde.
- **Beheerde database met terugspoelen naar elk moment.** Minder risico, kost geld, en de template kiest geen provider.
- **Instellen via een beheerpagina in de app.** Wie het beheeraccount heeft, heeft dan de back-ups.

## Gevolgen

- Een rol met `BYPASSRLS`. Compensatie: geen schrijfrechten, wachtwoord alleen bij de uitvoerder, en waar de database het
  toestaat alleen bereikbaar vanaf de uitvoerder (runbook; bij een beheerde database vaak niet per rol in te stellen).
- Een definer-functie `app.after_restore` (migratie, functiecatalogus, `check:secdef`), alleen uitvoerbaar door `app_migrator`.
- Elke app die naar productie gaat, kiest in haar ADR: de map, waar het opruimen draait, de bewaartermijn, de dodemansknop en
  twee sleutelhouders.
- Na herstel zijn lopende uitnodigingen ongeldig; het runbook zegt opnieuw uitnodigen.
- Achtergrondtaken (spec achtergrondtaken, nog niet gebouwd) mogen na herstel niet vanzelf starten. Tot die er zijn, is er
  niets om uit te zetten; die spec krijgt een schakelaar bij de start, en het runbook noemt hem.
- Gegevens die na een back-up zijn verwijderd, komen bij herstel terug. Bij een echte ramp is ook het auditlog met die
  verzoeken weg. Dat risico aanvaardt dit besluit; een app-ADR kan een eigen logboek buiten de database kiezen. De
  bewaartermijn hoort in het privacyregister.
- Bewust niet gedekt: het gelijktijdig verlies van de host en de opslagdienst. Een app die dat wel nodig heeft, voegt per ADR
  een tweede bestemming toe.
- Groeit een database naar gigabytes, dan herzien we dit besluit.
- Herzien bij de bouw: R-DB-01 (een rol erbij; met de spec achtergrondtaken komt daar ook `app_jobs` bij), framework §3 (de
  rol als uitzondering), R-PROV-06 en R-SEC-06.
