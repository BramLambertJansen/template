---
status: voorstel # voorstel | goedgekeurd | gebouwd | vervallen — architect of hoofdsessie zet de status in het voorstel, de merge door de eigenaar is het besluit (ADR 0046); gebouwd: `status: gebouwd` in de bouw-PR (ADR 0095)
namespace: backup
---

# Back-up en herstel

Uitwerking van [ADR 0108](../adr/0108-back-up-en-herstel.md) (voorgesteld); roadmap-item ST-10a. Kan pas `goedgekeurd`
worden na de merge van dat ADR.

| Deel | Inhoud | Wacht op | AC's |
|---|---|---|---|
| **A — back-up, alarm, oefening, herstel** | rol `app_backup`, `deploy/backup.env`, image en service in `deploy/backup/`, opruimworkflow, nazorg-SQL, runbook, sjabloon herstelblad | ADR 0108 | AC-1 t/m AC-16 |
| **B — release** | export vóór elke release, poort op markeerbestand en herstelblad | A, en de release-workflow van ST-10 | AC-17 t/m AC-19 |

## Doel

Elke app uit de template zet elke nacht een versleutelde export in een map die ze zelf kiest, merkt het binnen een dag als
dat stopt, bewijst elke week dat de export terug te zetten is, en kan na een ramp door iemand anders dan de bouwer worden
hersteld.

## Rollen en wie wat ziet

| Wie | Mag |
|---|---|
| `app_backup` (databaserol) | alles lezen, inclusief `better_auth`; geen enkel schrijfrecht |
| back-uptaak op de host | exporteren, versleutelen met de publieke sleutel, toevoegen aan de map en opsommen; niet wissen |
| oefening op de host | de privésleutel en een identiteit die de map mag lezen (aanvaard risico, ADR 0108 punt 6) |
| opruimtaak (geplande workflow in een beschermde environment) | opsommen en oude exports wissen; kent geen databasegeheim en geen privésleutel |
| `app_migrator` | terugzetten en de nazorg-SQL uitvoeren; eigenaar van de tabellen |
| houders van het herstelblad (twee mensen, in het app-ADR) | privésleutel, toegang tot de map, `AUTH_SECRET` en de andere productiegeheimen |
| elke rol in de app | niets; de app kent back-ups niet |

## Datawijzigingen (met grants)

Geen migratie. Eén rol in `db/init/01-roles.sql` en in het runbook voor beheerde databases (R-DB-01):

```sql
create role app_backup login bypassrls;
grant pg_read_all_data to app_backup;
alter role app_backup set statement_timeout = '30min';
grant connect on database app to app_backup;
```

Nergens eigenaar van, geen lid van een andere rol dan `pg_read_all_data`. `db/tests/rolattributen.sql` krijgt erbij: van
de vijf rollen van de template plus `app_backup` heeft alleen `app_backup` `BYPASSRLS` en geen van hen `superuser`;
`pg_read_all_data` heeft precies één lid (`app_backup`) en `pg_write_all_data` geen; `app_backup` heeft een
`statement_timeout` (R-DB-02); volgens `has_table_privilege`, `has_schema_privilege` en `has_function_privilege` heeft
`app_backup` geen `insert`, `update`, `delete`, `truncate`, `create` of `execute` op een functie van klasse `client` of
`auth`; en ook na `set transaction read write` faalt een insert met 42501.

De nazorg na herstel is geen databasefunctie maar een SQL-bestand in de image (`db/backup/after-restore.sql`) dat als
`app_migrator` draait. `app_migrator` is eigenaar van de tabellen in `better_auth` en lid van `app_definer` (de insert-policy
op `app.audit_log`). Er komen geen rechten bij; R-DB-14 en de allowlist in `db/tests/invarianten.sql` blijven gelijk.

## Routes en foutcodes

Geen route. De scripts eindigen met een vaste code op de foutuitvoer en exitcode 1:

| Code | Wanneer |
|---|---|
| `CONFIG_INVALID` | `deploy/backup.env` mist een verplichte sleutel of heeft een ongeldige waarde |
| `VERSION_MISMATCH` | `pg_dump` heeft een andere major dan de server |
| `ALREADY_RUNNING` | een andere run houdt het lock (`flock`) langer dan 10 minuten vast |
| `UPLOAD_FAILED` | na drie pogingen niet in de map, of grootte of hash klopt niet |
| `RESTORE_FAILED` | `pg_restore` of de migratie faalt |
| `CHECK_FAILED:<code>` | een pgTAP-bestand of herstelcontrole faalt; `<code>` is die van de controle |
| `TARGET_NOT_EMPTY` | het doel van `herstel naar` heeft al een schema `app` of een tabel `public.schema_migrations` |
| `NO_RECENT_DRILL` | geen markeerbestand van een geslaagde oefening in de laatste acht dagen |
| `NO_RECOVERY_SHEET` | `BACKUP_RECOVERY_SHEET_CONFIRMED` ontbreekt of is ouder dan twaalf maanden |

## Instellen: `deploy/backup.env`

Eén bestand per app, in git, geen geheimen. Gewone `SLEUTEL=waarde`-regels, zodat de shellscripts het zonder extra tool
lezen. Een zod-schema in `scripts/` valideert het in `gate:fast`; de scripts toetsen bij de start alleen of de verplichte
sleutels er zijn. Verplicht: `BACKUP_FOLDER`, `BACKUP_PUBLIC_KEY`, `BACKUP_KEEP_DAYS`. Optioneel:
`BACKUP_RECOVERY_SHEET_CONFIRMED`; back-ups lopen ook zonder, alleen de productiepoort eist hem.

```sh
BACKUP_FOLDER=verenigingsdrive:Back-ups/ABAS
BACKUP_PUBLIC_KEY=age1…
BACKUP_KEEP_DAYS=30
BACKUP_RECOVERY_SHEET_CONFIRMED=2026-12-01
```

- `BACKUP_FOLDER` is een rclone-adres: standaard een gedeelde Drive of SharePoint; ook een Storage Box of S3-achtige opslag.
  Het app-ADR legt de keuze vast, hoe de schrijver niet kan wissen, en of de app het overschrijfrisico (ADR 0108 punt 6)
  met andere opslag afdekt.
- `BACKUP_KEEP_DAYS` is minstens 7. Er blijven altijd minstens zeven exports staan.
- `BACKUP_RECOVERY_SHEET_CONFIRMED` zet de eigenaar via een PR, op de dag dat het herstelblad compleet is bij twee mensen, en
  opnieuw na elke wissel van een geheim en minstens eens per jaar.

De planning staat niet in dit bestand maar in de planner van de host (cron of een systemd-timer; runbook "Planner instellen").

**Geheimen per plek**

| Plek | Geheimen |
|---|---|
| host, back-uptaak | `BACKUP_DATABASE_URL` (als `app_backup`), rclone-configuratie van de schrijver, `SMTP_URL` met afzender en ontvanger van de foutmail, `BACKUP_HEARTBEAT_URL` |
| host, oefening | daarnaast de privésleutel, de wachtwoorden van de rollen voor de wegwerpdatabase en `BACKUP_DRILL_HEARTBEAT_URL` |
| opruimtaak | alleen de rclone-configuratie van de opruimer, in een beschermde GitHub-environment |
| release-workflow (deel B) | draait de release op de host: de schrijver; anders een identiteit die de map alleen mag lezen, in een beschermde environment |

## Image en uitvoeren

`db/backup/Dockerfile` bouwt op `db/docker/Dockerfile` (Postgres 17 met pgTAP en de clienttools, gelijke versie) en voegt
`age`, `rclone`, `curl` en `dbmate` toe, elk op versie en checksum gepind (`dbmate` op dezelfde versie als in `compose.yaml`).
De migraties, de herstelcontroles en `after-restore.sql` komen bij de build in de image. De scripts zijn POSIX-shell in
`db/backup/`. De productieservice staat in `deploy/backup/compose.yaml`; de `compose.yaml` van de lokale stack krijgt alleen
een testvariant onder profiel `test`. De opruimtaak draait als `.github/workflows/backup-prune.yml` in de environment
`backup`, die alleen vanaf `main` start.

**`backup run [--release]`**

1. Lees `deploy/backup.env`; ontbreekt een verplichte sleutel, `CONFIG_INVALID`. Pak het lock met `flock` (vrij zodra het
   proces stopt), anders na 10 minuten `ALREADY_RUNNING`.
2. Major van `pg_dump` gelijk aan die van de server, anders `VERSION_MISMATCH`.
3. `pg_dump --format=custom --exclude-schema=tap --exclude-extension=pgtap --lock-wait-timeout=5min` als `app_backup`,
   direct door `age` met de publieke sleutel, naar een tijdelijk bestand. Er komt nooit een onversleutelde export op schijf.
4. Uploaden als `<app>-<UTC-tijd>[-release].dump.age`, hooguit drie pogingen; een naam wordt nooit hergebruikt. Daarna
   vergelijkt `rclone` grootte en, waar de opslag een hash kent, de hash; wijkt iets af, `UPLOAD_FAILED`. Tijdelijk bestand weg.
5. Is de export kleiner dan de helft van de mediaan van de vorige zeven, dan een waarschuwingsmail. De run slaagt wel.
6. Melden bij `BACKUP_HEARTBEAT_URL`.

Bij een fout in elke stap: tijdelijk bestand weg, foutmail, geen melding.

**Opruimen** (opruimtaak, dagelijks): wist exports ouder dan `BACKUP_KEEP_DAYS`, behalve de nieuwste zeven, en wist niets
als de nieuwste ouder is dan 26 uur (dan een mail). Markeerbestanden: de nieuwste tien blijven.

**`herstel oefening`** (wekelijks, op de host)

1. Nieuwste export ophalen en ontsleutelen naar een tijdelijke map met rechten `0700`.
2. Een lege Postgres starten in dezelfde container (eigen datamap in de tijdelijke map, alleen op een unix-socket),
   `db/init/` toepassen. Dat mag hier: de database is wegwerp en niet bereikbaar.
3. `pg_restore --exit-on-error` als `app_migrator`, dan `dbmate up` naar de migraties van de huidige code.
4. `db/tests/invarianten.sql` en `security.sql`: policies, grants en invarianten in de herstelde database zijn gelijk. Rollen
   zelf zitten niet in een export; die toetst de oefening niet.
5. De herstelcontroles van de app: SQL-bestanden in `db/restore-checks/*.sql`, elk met één rij `ok boolean` en een vaste
   `code`. De template levert er één: elke gebruiker met een rol heeft een rij in `user_roles`.
6. Postgres stoppen, tijdelijke map weg. Een markeerbestand `drill-ok-<UTC-datum>.txt` met alleen de naam van de geteste
   export in de map zetten, en melden bij `BACKUP_DRILL_HEARTBEAT_URL` (venster bij die dienst: acht dagen).

**`herstel naar <doel-url> [<bestand>]`** (alleen via het runbook)

1. Eis: de doel-database is nieuw en leeg, de rollen en de rechten op databaseniveau bestaan al (runbook "Nieuwe server":
   rollen, `create database … owner app_migrator`, `revoke all on database … from public`, `grant connect` aan `api_user`,
   `auth_service` en `app_backup`; ook als de database niet `app` heet). Het script past `db/init/` niet toe en installeert
   geen pgTAP. Heeft het doel al een schema `app` of een tabel `public.schema_migrations`, dan `TARGET_NOT_EMPTY`, vóór het
   iets schrijft. Zo kan het nooit over de draaiende database heen, hoe die ook genoemd wordt.
2. Toont welke export, van wanneer, en wat er sindsdien verloren gaat; bevestigen met de naam van de app.
3. Ophalen, ontsleutelen, `pg_restore --exit-on-error` als `app_migrator`, `dbmate up`.
4. De herstelcontroles uit `db/restore-checks/` (alleen-lezen SQL).
5. `db/backup/after-restore.sql` als `app_migrator`, in één transactie: alle rijen uit `better_auth.session` en
   `better_auth.verification` weg, `session_version` van elke rij in `better_auth."user"` plus één, en één regel in
   `app.audit_log` met actie `core.restore`, `target_type` `database` en in `details` alleen `{ "backup_at": … }`.
6. Toont de volgende stappen uit het runbook: de app tijdelijk tegen de nieuwe database starten en als beheerder met de
   tweede factor inloggen (dat bewijst `AUTH_SECRET`); pas overschakelen als de oude app minstens een uur geen links meer
   uitgeeft (getekende links voor een e-mailwijziging verlopen na `EMAIL_CHANGE_TTL_SECONDS`; ze staan niet in de database
   en hun eenmalige claim kan na herstel ontbreken); achtergrondtaken uit laten (zodra die bestaan); uitnodigingen opnieuw
   versturen; verwijderverzoeken sinds de exportdatum nalopen.

Eén rij terughalen gaat door terugzetten naast productie en overnemen via een gereviewde migratie of definer-functie
(R-DB-08).

## De map instellen, eenmalig

Het runbook beschrijft per soort map hoe de schrijver niet kan wissen. Bij een gedeelde Google Drive: de schrijver is
Bijdrager (kan uploaden, niet wissen), de opruimer is Inhoudsbeheerder. Een Bijdrager kan wel overschrijven en oude versies
weghalen; dat is het aanvaarde risico uit ADR 0108 punt 6, en het runbook noemt het. Bij elke andere soort noemt het app-ADR
hoe. Bij het instellen probeert de beheerder één keer met de inloggegevens van de schrijver een proefbestand te wissen; dat
moet mislukken. Ook controleert hij dat de host de inloggegevens van de opruimer niet heeft.

## Kopieer de vorm van

- `db/init/01-roles.sql` — rollen met hun instellingen, buiten de migraties.
- `db/tests/rolattributen.sql` — de toets op rolattributen die één benoemde uitzondering krijgt.
- `db/migrations/20261021120000_account_lifecycle.sql` — SQL die `session_version` verhoogt en een auditregel schrijft.
- `db/docker/Dockerfile` — een op versie en digest gepinde image; de image `backup` bouwt erop voort.
- `compose.yaml` — een service onder een eigen profiel, voor de testvariant.
- `docs/operations/eerste-admin.md` — een runbook dat een ander dan de bouwer kan volgen.

## Hergebruik en UX

Geen scherm. Teksten voor mensen staan in de mails en het runbook.

- "Back-up van {app} mislukt": "De back-up van {tijd} is mislukt ({code}). De laatste geslaagde is van {laatste}. Volg
  docs/operations/back-up-en-herstel.md, sectie 'Back-up mislukt'."
- "Back-up van {app} veel kleiner dan normaal": "De export van {tijd} is {grootte}, normaal rond {mediaan}. Controleer of er
  data is verdwenen."
- "Hersteltest van {app} mislukt": code en de sectie "Hersteltest mislukt".
- "Back-ups van {app} niet opgeruimd": "De nieuwste back-up is van {laatste}; er is niets gewist."

## Acceptatiecriteria

**Deel A**

- **backup/AC-1** — Gegeven de vijf rollen van de template en `app_backup`, dan heeft alleen `app_backup` `BYPASSRLS` en
  geen van hen `superuser`; `pg_read_all_data` heeft alleen `app_backup` als lid en `pg_write_all_data` geen; `app_backup`
  heeft een `statement_timeout`, volgens de rechtenfuncties geen schrijf-, aanmaak- of uitvoerrecht uit de spec, en ook na
  `set transaction read write` faalt een insert in elke tabel van `public`, `app` en `better_auth` met 42501. Toets: `db/tests/rolattributen.sql`
- **backup/AC-2** — Gegeven rijen in elke tabel van `public`, `app` en `better_auth` op de lokale stack (met pgTAP), dan bevat
  een export als `app_backup` elke rij en geen `pgtap`; als `app_migrator` faalt hij met een fout over row security en komt er
  geen bestand. Toets: `test/backup/export.int.test.ts` (nieuw)
- **backup/AC-3** — Gegeven een `pg_dump` met een andere major dan de server, dan stopt `backup run` vóór het exporteren met
  `VERSION_MISMATCH`. Toets: `test/backup/run.int.test.ts` (nieuw)
- **backup/AC-4** — Gegeven een geslaagde run, dan staat er één nieuw bestand in de map, is het alleen met de privésleutel te
  lezen, staat er geen onversleuteld bestand op schijf en krijgt `BACKUP_HEARTBEAT_URL` één aanvraag. Toets: `test/backup/run.int.test.ts` (nieuw)
- **backup/AC-5** — Gegeven een map die drie keer weigert, of een geüpload bestand met een andere grootte of hash, dan eindigt
  de run met `UPLOAD_FAILED`, is het tijdelijke bestand weg, gaat er een foutmail uit en geen melding. Toets: `test/backup/run.int.test.ts` (nieuw)
- **backup/AC-6** — Gegeven een export kleiner dan de helft van de mediaan van de vorige zeven, dan slaagt de run en gaat er
  één waarschuwingsmail uit. Toets: `test/backup/run.int.test.ts` (nieuw)
- **backup/AC-7** — Gegeven `deploy/backup.env` met een ontbrekende verplichte sleutel, een onbekende sleutel,
  `BACKUP_KEEP_DAYS` onder 7 of een waarde die op een privésleutel lijkt (`AGE-SECRET-KEY-`), dan faalt de validatie in
  `gate:fast` met de naam van de sleutel en eindigt `backup run` met `CONFIG_INVALID`; zonder
  `BACKUP_RECOVERY_SHEET_CONFIRMED` slaagt de validatie en loopt `backup run`. Toets: `test/backup/config.test.ts` (nieuw)
- **backup/AC-8** — Gegeven een run die het lock vasthoudt, dan wacht een tweede run en eindigt na 10 minuten met
  `ALREADY_RUNNING`; wordt de eerste gedood, dan krijgt de volgende het lock meteen. Toets: `test/backup/run.int.test.ts` (nieuw)
- **backup/AC-9** — Gegeven 40 dagelijkse exports en `BACKUP_KEEP_DAYS` 30, dan wist opruimen de tien oudste; gegeven dat de
  nieuwste ouder is dan 26 uur, of minder dan zeven exports, dan wist het niets. Toets: `test/backup/opruimen.int.test.ts` (nieuw)
- **backup/AC-10** — Gegeven de inloggegevens van de schrijver op een map zonder wisrecht, dan faalt een wis-poging en
  eindigt de run niet met een fout. Toets: `test/backup/opruimen.int.test.ts` (nieuw)
- **backup/AC-11** — Gegeven `.github/workflows/backup-prune.yml` en elke andere workflow die een `BACKUP_`-geheim leest, dan
  heeft elke job daarin `environment: backup`; een fixture zonder environment laat de check falen. Toets: `test/rails/backup-workflows.test.ts` (nieuw)
- **backup/AC-12** — Gegeven een geslaagde export, dan slaagt `herstel oefening` met terugzetten als `app_migrator`, zonder
  `AUTH_SECRET` in zijn omgeving: migreren, de twee pgTAP-bestanden en de herstelcontroles groen, een markeerbestand in de
  map en één aanvraag naar `BACKUP_DRILL_HEARTBEAT_URL`. Toets: `test/backup/oefening.int.test.ts` (nieuw)
- **backup/AC-13** — Gegeven een export van een oudere migratiestand, dan zet de oefening hem terug en migreert hij hem zonder
  fout. Toets: `test/backup/oefening.int.test.ts` (nieuw)
- **backup/AC-14** — Gegeven een herstelcontrole met `ok = false` of een beschadigd bestand, dan faalt de oefening met
  `CHECK_FAILED:<code>` of `RESTORE_FAILED`, zonder markeerbestand en zonder melding. Toets: `test/backup/oefening.int.test.ts` (nieuw)
- **backup/AC-15** — Gegeven een doel met een schema `app` of een tabel `public.schema_migrations`, dan eindigt
  `herstel naar` met `TARGET_NOT_EMPTY` vóór het iets schrijft; gegeven een leeg doel met bestaande rollen, dan past het
  `db/init/` niet toe, installeert het geen pgTAP, bestaan na afloop de sessie- en verification-rijen uit de export niet
  meer, is `session_version` van elke gebruiker met één verhoogd en staat er één auditregel `core.restore`. Toets: `test/backup/herstel.int.test.ts` (nieuw)
- **backup/AC-16** — Gegeven het runbook en het sjabloon herstelblad, dan hebben ze de secties "Map instellen", "Planner
  instellen", "Back-up mislukt", "Hersteltest mislukt", "Nieuwe server", "Volledig herstel", "Eén rij terughalen" en
  "Sleutel of geheim kwijt", en vraagt het herstelblad om de vergelijking van `age-keygen -y` met `BACKUP_PUBLIC_KEY`
  (structuurtest). Toets: `test/docs/back-up-runbook.test.ts` (nieuw)

**Deel B**

- **backup/AC-17** — Gegeven een release, dan draait `backup run --release` als eerste stap, vóór `dbmate up` en vóór de
  nieuwe code live gaat; faalt die, dan gaat er niets live. Toets: `test/backup/release.int.test.ts` (nieuw)
- **backup/AC-18** — Gegeven geen markeerbestand `drill-ok-*` van de laatste acht dagen in de map, dan weigert de poort met
  `NO_RECENT_DRILL`. Toets: `test/backup/poort.int.test.ts` (nieuw)
- **backup/AC-19** — Gegeven `deploy/backup.env` zonder `BACKUP_RECOVERY_SHEET_CONFIRMED`, of met een datum ouder dan twaalf
  maanden, dan weigert de poort met `NO_RECOVERY_SHEET`. Toets: `test/backup/poort.int.test.ts` (nieuw)

## Randgevallen

| Situatie | Gedrag |
|---|---|
| Opruimtaak valt uit (ook: GitHub zet de workflow na 60 dagen stil) | de map groeit; veilig |
| Gekaapte host overschrijft exports in een Drive | de oefening faalt binnen een week en alarmeert; aanvaard risico (ADR 0108 punt 6) |
| Gekaapte host maakt een vals markeerbestand | de poort laat de release door; aanvaard risico, de poort houdt vergissingen tegen |
| Privésleutel kwijt | oude exports zijn onbruikbaar; nieuw sleutelpaar, `BACKUP_PUBLIC_KEY` via PR, herstelblad opnieuw bevestigen |
| `AUTH_SECRET` op het herstelblad klopt niet | merkt de beheerder bij het inloggen vóór het overschakelen; de tweede factor opnieuw instellen via het beheerdersrunbook |
| Herstel op een beheerde database zonder `pg_read_all_data` of `BYPASSRLS` | het app-ADR noemt de rol die de export maakt; de oefening bewijst dat hij werkt |
| Lopende uitnodigingen na herstel | ongeldig; runbook: opnieuw uitnodigen |
| Een lid vroeg na de export om verwijdering | runbook: verwijderverzoeken sinds de exportdatum nalopen, voor zover nog bekend; bij een ramp aanvaard risico (ADR 0108) |

## Raakt ook

- `db/init/01-roles.sql` en `db/tests/rolattributen.sql` (bestaande test, nieuw gedrag: de tester past hem aan, de PR noemt
  het, R-TEST-02).
- `docs/framework.md`: R-DB-01, §3, R-PROV-06, R-SEC-06. ADR 0039 wijzigt op het punt van ADR 0108.
- `compose.yaml` (testvariant), `deploy/backup/`, `.github/workflows/backup-prune.yml` en de GitHub-environment `backup`:
  gate-paden en een instelling die de eigenaar zet.
- `test:db`; `gate:fast` krijgt de validatie van `deploy/backup.env` en de check op workflows (AC-11).
- `docs/nieuwe-app.md` noemt de productiepoort; `docs/operations/back-up-en-herstel.md` is nieuw.
- Spec [achtergrondtaken](achtergrondtaken.md): een schakelaar waarmee taken bij de start uit blijven, voor na een herstel.

## Buiten scope

- restic of een ander back-upprogramma; een tweede bestemming (kan per app-ADR); doorlopend archiveren.
- Back-up op hosting zonder planner (per app-ADR).
- Een statuspagina en een leesbare export voor het bestuur: eigen specs, na deze.
- Een knop in de app die iets start, wijzigt of terugzet.

## Testplan

- Integratietests tegen de echte stack met een lokale map als bestemming (één met en één zonder wisrecht), een
  nep-dodemansknop en Mailpit voor de mails.
- Bij oplevering van deel A: één volledig herstel volgens het runbook door iemand anders dan de bouwer, met de gemeten tijd
  in de PR. Daarna jaarlijks als advies in het runbook.
- `pnpm gate:fast`, `pnpm gate:slow` en `pnpm ratchet` groen; uitslag in de PR.

## Open vragen

Een vraag zonder aanbeveling (de eigenaar kiest) blokkeert `goedgekeurd`; een vraag met aanbeveling mag blijven staan. `check-docs` telt elke regel in deze sectie met het waarschuwingsteken en "open" (ook met U+FE0F of hoofdletter, ook zonder opsommingsteken).

- **OV-1** — Versleutelen met `age` (publieke sleutel) of met `gpg` en een wachtwoord. Aanbeveling: `age`; de back-uptaak heeft
  dan nooit een geheim om te lezen, en een app die de oefening elders laat draaien, houdt de host helemaal blind.
- **OV-2** — Standaard bewaartermijn. Aanbeveling: 30 dagen, altijd minstens zeven exports.
- **OV-3 ✅ besloten** — De oefening draait standaard op de host; een gekaapte host kan dan oude exports lezen (eigenaar, 2026-11-23).
- **OV-4 ✅ besloten** — Een gedeelde Drive of SharePoint mag de standaardmap zijn, met het overschrijfrisico benoemd (eigenaar, 2026-11-23).
- **OV-5 ✅ besloten** — De nazorg is een SQL-stap als `app_migrator`, geen definer-functie (eigenaar, 2026-11-23).
- **OV-6 ✅ besloten** — Productie vraagt een server met planner; hosting zonder planner regelt het per app-ADR (eigenaar, 2026-11-23).
- **OV-7** — Welke dodemansknop. Aanbeveling: de template noemt geen dienst; elke URL die een gemiste melding alarmeert werkt.
- **OV-8** — Verwijderverzoeken na een ramp. Aanbeveling: het risico aanvaarden in de template; een app met gevoelige
  ledendata kiest in haar ADR een klein logboek buiten de database.
