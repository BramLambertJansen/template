# 0108 — Back-up en herstel: simpel, met drie vangnetten

Status: voorgesteld

Drempel: A2 (een nieuwe databaserol en twee kleine tools: `age` en `rclone`) en A3 (één rol krijgt `BYPASSRLS`; de test in
`db/tests/rolattributen.sql` die dat nu voor elke rol verbiedt, krijgt één benoemde uitzondering). Aanleiding: verzoek van de
eigenaar (2026-11-23), app-behoefte: de eerste app met geld (ABAS) gaat naar productie op goedkope hosting zonder back-ups van
een provider. Werkt roadmap-item ST-10 uit voor het deel "back-up en herstel". Uitwerking: spec
[back-up-en-herstel](../specs/back-up-en-herstel.md).

## Context

De template kiest geen hosting en geen beheerde database (0039). Een app op een eigen server of een gratis plan heeft dus
geen back-up, tenzij ze er zelf een bedenkt. De apps zijn klein: een database van enkele megabytes. Dertig volledige kopieën
kosten dan bijna niets, en een los bestand terugzetten is het eenvoudigste herstel dat er is.

Drie eigenschappen van de template maken een gewone `pg_dump` onmogelijk of gevaarlijk:

- **RLS is overal geforceerd en geen rol heeft `BYPASSRLS`** (R-DB-05, `db/tests/rolattributen.sql`). `pg_dump` stopt dan
  met een fout. Met geen enkele bestaande rol lukt een export.
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
2. **Instellen in git, uitvoeren buiten de app.** Map, schema en bewaartermijn staan in `deploy/backup.json` en wijzigen
   via een PR. Geheimen staan bij de uitvoerder. De taak draait los van het API-proces (op de host, of als geplande workflow
   als er geen host is). De app kan back-ups niet uitzetten, omleiden of terugzetten.
3. **Een eigen rol `app_backup`.** `LOGIN`, lid van `pg_read_all_data`, `BYPASSRLS`, `default_transaction_read_only = on`,
   nergens eigenaar of lid van. Alleen deze rol mag `BYPASSRLS` hebben; de rolattributentest noemt hem bij naam en eist dat
   hij niets kan schrijven. In `db/init/` en het runbook, nooit in een migratie (R-DB-01).
4. **De server kan zijn eigen back-ups niet lezen of wissen.** Versleutelen gebeurt met een publieke sleutel; de privésleutel
   staat alleen op het herstelblad en bij de hersteltest. De schrijver heeft in de map alleen recht om toe te voegen (bij
   een gedeelde Drive: Bijdrager), of wissen is daar minstens 7 dagen terug te halen. Opruimen doet een tweede identiteit.
5. **Vangnet 1, alarm.** Na elke geslaagde back-up meldt het script zich bij een "dodemansknop"-URL. Blijft die melding meer
   dan 26 uur uit, dan alarmeert die dienst. Een mislukte run mailt ook zelf.
6. **Vangnet 2, wekelijks echt terugzetten.** De nieuwste export in een lege Postgres van dezelfde versie: `db/init`,
   terugzetten, migreren naar de huidige code, de pgTAP-suite van de template en de herstelcontroles van de app (bij geld:
   saldo gelijk aan de som van de boekingen), en een proef op `AUTH_SECRET`. Ook deze test meldt zich bij een dodemansknop.
7. **Vangnet 3, een herstelblad bij twee mensen**, buiten git en buiten de host: waar de back-ups staan en hoe je erbij komt,
   de privésleutel, `AUTH_SECRET` en de andere productiegeheimen.
8. **Opruimen voorzichtig.** Exports ouder dan de bewaartermijn gaan weg, maar er blijven er altijd minstens zeven, en er
   wordt niets gewist zolang de nieuwste ouder is dan 26 uur.
9. **Terugzetten naar een nieuwe database, nooit eroverheen.** Na terugzetten vervallen alle sessies en open links, en
   blijven achtergrondtaken uit tot de eigenaar het herstel bevestigt.
10. **Productiepoort.** Geen release zonder geslaagde export vlak ervoor. Geen productie zonder een geslaagde hersteltest
    van hooguit acht dagen oud en een door de eigenaar bevestigd herstelblad.

## Alternatieven

- **restic of een vergelijkbaar back-upprogramma.** Sterk bij grote data die elke dag een beetje verandert. Bij een paar
  megabytes voegt het een opslagformaat en extra controles toe zonder winst; een los bestand wordt bij de hersteltest
  sowieso helemaal gelezen.
- **Twee bestemmingen verplicht.** Beschermt tegen het verlies van één opslagdienst. Kan per app-ADR, maar is geen eis.
- **Beheerde database met terugspoelen naar elk moment.** Minder risico, kost geld, en de template kiest geen provider.
- **Instellen via een beheerpagina in de app.** Wie het beheeraccount heeft, heeft dan de back-ups.
- **`superuser` of de eigenaarsrol voor de export.** Werkt, maar geeft de uitvoerder schrijfrechten op alles.

## Gevolgen

- Een rol met `BYPASSRLS`. Compensatie: alleen-lezen, alleen bereikbaar vanaf de uitvoerder, wachtwoord alleen daar.
- Twee kleine tools, elk één programma zonder eigen opslagformaat, gepind op versie en checksum, alleen in de image van de
  back-uptaak.
- Elke app die naar productie gaat, kiest in haar ADR: de map, de bewaartermijn, de dodemansknop en twee sleutelhouders.
- Gegevens die na een back-up zijn verwijderd, komen bij herstel terug; het runbook eist dat verwijderverzoeken sinds de
  back-updatum opnieuw worden uitgevoerd. De bewaartermijn hoort in het privacyregister.
- Bewust niet gedekt: het gelijktijdig verlies van de host en de opslagdienst, en een gerichte aanval die beide treft. Een
  app die dat wel nodig heeft, voegt per ADR een tweede bestemming toe.
- Groeit een database naar gigabytes, dan herzien we dit besluit (restic of doorlopend archiveren).
- Herzien bij de bouw: R-DB-01 (zesde rol), framework §3 (de rol als uitzondering), R-PROV-06 en R-SEC-06.
