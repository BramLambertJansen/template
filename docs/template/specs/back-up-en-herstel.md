---
status: voorstel # voorstel | goedgekeurd | gebouwd | vervallen — architect of hoofdsessie zet de status in het voorstel, de merge door de eigenaar is het besluit (ADR 0046); gebouwd: `status: gebouwd` in de bouw-PR (ADR 0095)
namespace: backup
---

# Back-up en herstel

Uitwerking van [ADR 0108](../adr/0108-back-up-en-herstel.md) (voorgesteld); deel "back-up en herstel" van roadmap-item ST-10.
Kan pas `goedgekeurd` worden na de merge van dat ADR.

| Deel | Inhoud | Wacht op | AC's |
|---|---|---|---|
| **A — back-up, alarm, hersteltest, herstel** | rol `app_backup`, `deploy/backup.json`, drie commando's, runbook, sjabloon herstelblad | ADR 0108 | AC-1 t/m AC-13 |
| **B — release** | export vóór elke release, poort op de hersteltest | A, en de release-workflow van ST-10 | AC-14 t/m AC-16 |

## Doel

Elke app uit de template zet elke nacht een versleutelde export in een map die ze zelf kiest, merkt het binnen een dag als
dat stopt, bewijst elke week dat de export terug te zetten is, en kan na een ramp door iemand anders dan de bouwer worden
hersteld.

## Rollen en wie wat ziet

| Wie | Mag |
|---|---|
| `app_backup` (databaserol) | alles lezen, inclusief `better_auth`; niets schrijven |
| back-uptaak | exporteren, versleutelen met de publieke sleutel, toevoegen aan de map; niet lezen wat er al staat, niet wissen |
| opruimer (tweede identiteit bij de map) | oude exports wissen volgens de regels |
| hersteltest | de privésleutel; draait waar de productiedata al mag zijn |
| houders van het herstelblad (twee mensen, in het app-ADR) | privésleutel, toegang tot de map, `AUTH_SECRET` en de andere productiegeheimen |
| elke rol in de app | niets; de app kent back-ups niet |

## Datawijzigingen (met grants)

Geen migratie. Een rol in `db/init/01-roles.sql` en in het runbook voor beheerde databases (R-DB-01):

```sql
create role app_backup login bypassrls;
grant pg_read_all_data to app_backup;
alter role app_backup set default_transaction_read_only = on;
alter role app_backup set statement_timeout = '30min';
grant connect on database app to app_backup;
```

Nergens eigenaar van, geen lid van een andere app-rol. `db/tests/rolattributen.sql` verandert zo: geen rol heeft
`superuser`; `BYPASSRLS` heeft alleen `app_backup`; `app_backup` kan niets schrijven of aanmaken en geen functie van klasse
`client`, `auth` of `job` uitvoeren.

## Instellen: `deploy/backup.json`

Eén bestand per app, in git, gevalideerd door een zod-schema in `scripts/`. Geen geheimen.

```json
{
  "folder": "verenigingsdrive:Back-ups/ABAS",
  "publicKey": "age1…",
  "schedule": { "backup": "0 3 * * *", "drill": "0 4 * * 0" },
  "keepDays": 30,
  "drillRunsOn": "host"
}
```

- `folder` is een rclone-adres: een gedeelde Drive, SharePoint, een Storage Box of S3-achtige opslag. Het app-ADR legt de
  keuze vast en hoe de schrijver alleen kan toevoegen.
- `publicKey` mag in git; de privésleutel nooit.
- `keepDays` is minstens 7. Er blijven altijd minstens zeven exports staan (`MIN_BACKUP_KEEP` in `src/core/shared/limits.ts`).
- `drillRunsOn` is `host` of `github`; `github` alleen als het app-ADR aanvaardt dat ledendata daar terechtkomt.

Geheimen bij de taak: `BACKUP_DATABASE_URL` (als `app_backup`), de rclone-configuratie van de schrijver, die van de
opruimer, `BACKUP_HEARTBEAT_URL` en `BACKUP_DRILL_HEARTBEAT_URL`. De hersteltest krijgt daarnaast de privésleutel en
`AUTH_SECRET`.

## Commando's

Alle drie draaien in de image `backup` (`db/backup/Dockerfile`): Postgres-client gelijk aan `db/docker/Dockerfile`, plus
`age` en `rclone`, op versie en checksum gepind. Op een host als service in `compose.yaml` onder profiel `backup`.

**`pnpm backup run [--release]`**

1. Valideer `deploy/backup.json`; versie van `pg_dump` gelijk aan die van de server. Anders stoppen.
2. `pg_dump --format=custom --exclude-schema=tap` als `app_backup`, direct door `age` met de publieke sleutel, naar een
   tijdelijk bestand. Er komt nooit een onversleutelde export op schijf.
3. Uploaden als `<app>-<UTC-tijd>[-release].dump.age`; een naam wordt nooit hergebruikt.
4. De grootte op de bestemming vergelijken met die van het tijdelijke bestand; tijdelijk bestand weg.
5. Opruimen (zie hieronder), met de identiteit van de opruimer.
6. Melden bij `BACKUP_HEARTBEAT_URL`.

Bij een fout in elke stap: tijdelijk bestand weg, foutmail, geen melding.

**Opruimen**: wist exports ouder dan `keepDays`, behalve de nieuwste zeven, en wist niets als de nieuwste ouder is dan 26
uur (dan een mail). Release-exports volgen dezelfde regel.

**`pnpm herstel oefening`** (wekelijks)

1. Nieuwste export ophalen en ontsleutelen.
2. Lege Postgres van dezelfde versie in een wegwerpcontainer; `db/init/` toepassen; `pg_restore --exit-on-error`.
3. `dbmate up` naar de migraties van de huidige code.
4. `db/tests/rolattributen.sql`, `invarianten.sql` en `security.sql`: de beveiliging is na herstel gelijk.
5. De herstelcontroles van de app: SQL-bestanden in `db/restore-checks/*.sql`, elk met één rij `ok boolean` en een vaste code.
   De template levert er één: elke gebruiker met een rol heeft een rij in `user_roles`.
6. Met `AUTH_SECRET` één TOTP-geheim ontsleutelen; mislukt dat, dan `AUTH_SECRET_MISMATCH`.
7. Container en bestanden weg; melden bij `BACKUP_DRILL_HEARTBEAT_URL`.

**`pnpm herstel naar <doel-url> [<bestand>]`** (alleen via het runbook)

1. Weigert als `<doel-url>` de database van de draaiende app is.
2. Toont welke export, van wanneer, en wat er sindsdien verloren gaat; bevestigen met de naam van de app.
3. Stap 1 t/m 6 van de oefening, naar `<doel-url>`.
4. Nazorg in één transactie: alle sessies weg, `session_version` van elke gebruiker omhoog, alle open `verification`-rijen
   weg, een auditregel `core.restore` met de exportdatum.
5. Toont als volgende stap: start de app met `JOBS_ENABLED=false` tot de outbox is nagekeken.

Overschakelen naar de nieuwe database is een aparte stap in het runbook. Eén rij terughalen gaat door terugzetten naast
productie en overnemen via een gereviewde migratie of definer-functie (R-DB-08).

## Instellen van de map, eenmalig

Het runbook beschrijft per soort map hoe je de schrijver alleen laat toevoegen. Bij een gedeelde Google Drive: de schrijver
is Bijdrager (kan uploaden, niet wissen), de opruimer is Inhoudsbeheerder. Bij elke andere soort: het app-ADR noemt hoe, en
bij het instellen probeert de beheerder één keer met de inloggegevens van de schrijver een proefbestand te wissen. Dat moet
mislukken, of het bestand moet nog 7 dagen terug te halen zijn.

## Kopieer de vorm van

- `db/init/01-roles.sql` — rollen met hun instellingen, buiten de migraties.
- `db/tests/rolattributen.sql` — de toets op rolattributen die één benoemde uitzondering krijgt.
- `db/docker/Dockerfile` — een op versie en digest gepinde image.
- `compose.yaml` — een service onder een eigen profiel.
- `scripts/runner.sh` — een script dat in een container draait en alleen codes logt.
- `docs/operations/eerste-admin.md` — een runbook dat een ander dan de bouwer kan volgen.
- `src/core/api/mail/smtp.ts` — mail versturen voor de foutmelding.

## Hergebruik en UX

Geen scherm. Teksten voor mensen staan in de mails en het runbook.

- "Back-up van {app} mislukt": "De back-up van {tijd} is mislukt bij stap {stap} ({code}). De laatste geslaagde is van
  {laatste}. Volg docs/operations/back-up-en-herstel.md, sectie 'Back-up mislukt'."
- "Hersteltest van {app} mislukt": stap, code en de sectie "Hersteltest mislukt".
- "Back-ups van {app} niet opgeruimd": "De nieuwste back-up is van {laatste}; er is niets gewist."

## Acceptatiecriteria

**Deel A**

- **backup/AC-1** — Gegeven elke rol behalve `app_backup`, dan heeft hij geen `BYPASSRLS` en geen `superuser`; `app_backup`
  heeft `BYPASSRLS` maar faalt bij elke `insert`, `update`, `delete`, `truncate` en `create` en bij elke functie van klasse
  `client`, `auth` of `job`. Toets: `db/tests/rolattributen.sql`
- **backup/AC-2** — Gegeven rijen in elke tabel van `public`, `app` en `better_auth`, dan bevat een export als `app_backup`
  elke rij; als `app_migrator` faalt hij met een fout over row security en komt er geen bestand. Toets: `test/backup/export.int.test.ts` (nieuw)
- **backup/AC-3** — Gegeven een andere versie van `pg_dump` dan de server, dan stopt de run vóór het exporteren met
  `VERSION_MISMATCH`. Toets: `test/backup/run.int.test.ts` (nieuw)
- **backup/AC-4** — Gegeven een geslaagde run, dan staat er één nieuw bestand in de map, is het alleen met de privésleutel te
  lezen, staat er geen onversleuteld bestand op schijf en krijgt `BACKUP_HEARTBEAT_URL` één aanvraag. Toets: `test/backup/run.int.test.ts` (nieuw)
- **backup/AC-5** — Gegeven een run die faalt bij uploaden, dan is het tijdelijke bestand weg, is de exitcode ≠ 0, gaat er
  een foutmail uit en geen melding. Toets: `test/backup/run.int.test.ts` (nieuw)
- **backup/AC-6** — Gegeven `deploy/backup.json` met een onbekende sleutel, `keepDays` onder 7 of iets dat op een privésleutel
  lijkt, dan weigert de validatie met de naam van het veld. Toets: `test/backup/config.test.ts` (nieuw)
- **backup/AC-7** — Gegeven 40 dagelijkse exports en `keepDays` 30, dan wist opruimen de tien oudste; gegeven dat de nieuwste
  ouder is dan 26 uur, of minder dan zeven exports, dan wist het niets. Toets: `test/backup/opruimen.test.ts` (nieuw)
- **backup/AC-8** — Gegeven een geslaagde export, dan slaagt `pnpm herstel oefening`: terugzetten, migreren, de drie
  pgTAP-bestanden en de herstelcontroles groen, en `BACKUP_DRILL_HEARTBEAT_URL` krijgt één aanvraag. Toets: `test/backup/oefening.int.test.ts` (nieuw)
- **backup/AC-9** — Gegeven een export van een oudere migratiestand, dan zet de oefening hem terug en migreert hij hem zonder
  fout. Toets: `test/backup/oefening.int.test.ts` (nieuw)
- **backup/AC-10** — Gegeven een herstelcontrole met `ok = false`, een beschadigd bestand of een verkeerde `AUTH_SECRET`, dan
  faalt de oefening met de code ervan en meldt ze niets bij de dodemansknop. Toets: `test/backup/oefening.int.test.ts` (nieuw)
- **backup/AC-11** — Gegeven `pnpm herstel naar` met als doel de database van de draaiende app, dan weigert het commando vóór
  het iets leest of schrijft. Toets: `test/backup/herstel.int.test.ts` (nieuw)
- **backup/AC-12** — Gegeven een sessie en een uitnodigingslink in de export, wanneer het herstel klaar is, dan werkt die
  sessie niet, geeft die link `INVITATION_INVALID` en staat er een auditregel `core.restore`. Toets: `test/backup/herstel.int.test.ts` (nieuw)
- **backup/AC-13** — Gegeven het runbook en het sjabloon herstelblad, dan hebben ze de secties "Map instellen", "Back-up
  mislukt", "Hersteltest mislukt", "Volledig herstel", "Eén rij terughalen", "Nieuwe server" en "Sleutel of geheim kwijt"
  (structuurtest). Toets: `test/docs/back-up-runbook.test.ts` (nieuw)

**Deel B**

- **backup/AC-14** — Gegeven een release, dan draait `pnpm backup run --release` als eerste stap, vóór `dbmate up` en vóór de
  nieuwe code live gaat; faalt die, dan gaat er niets live. Toets: `test/backup/release.int.test.ts` (nieuw)
- **backup/AC-15** — Gegeven geen geslaagde hersteltest in de laatste acht dagen, dan weigert de poort met `NO_RECENT_DRILL`. Toets: `test/backup/poort.test.ts` (nieuw)
- **backup/AC-16** — Gegeven een app-ADR zonder bevestigd herstelblad, dan weigert de poort met `NO_RECOVERY_SHEET`. Toets: `test/backup/poort.test.ts` (nieuw)

## Randgevallen

| Situatie | Gedrag |
|---|---|
| Schijf vol of map tijdelijk onbereikbaar | run faalt na drie pogingen, foutmail; opruimen stopt vanzelf na 26 uur |
| Twee runs tegelijk | de tweede wacht op een lock-bestand en stopt na 10 minuten met `ALREADY_RUNNING` |
| Lange lock tijdens de export | `pg_dump --lock-wait-timeout=5min`, daarna faalt de run |
| Privésleutel kwijt | oude exports zijn onbruikbaar; nieuw sleutelpaar, `publicKey` via PR, herstelblad bijwerken |
| Een lid vroeg na de export om verwijdering | runbook-stap na herstel: verwijderverzoeken sinds de exportdatum opnieuw uitvoeren |

## Raakt ook

- `db/init/01-roles.sql` en `db/tests/rolattributen.sql` (bestaande test, nieuw gedrag: de tester past hem aan, de PR noemt
  het, R-TEST-02).
- `docs/framework.md`: R-DB-01, §3, R-PROV-06, R-SEC-06.
- `compose.yaml`, en `.github/workflows` alleen bij een GitHub-uitvoerder: gate-paden, eigenaarakkoord.
- `docs/nieuwe-app.md` noemt de productiepoort; `docs/operations/back-up-en-herstel.md` is nieuw.
- Spec [achtergrondtaken](achtergrondtaken.md): `JOBS_ENABLED` als schakelaar bij de start.

## Buiten scope

- restic of een ander back-upprogramma; een tweede bestemming (kan per app-ADR); doorlopend archiveren.
- Een statuspagina en een leesbare export voor het bestuur: eigen specs, na deze.
- Een knop in de app die iets start, wijzigt of terugzet.

## Testplan

- Integratietests tegen de echte stack met een lokale map als bestemming en een nep-dodemansknop.
- Bij oplevering van deel A: één volledig herstel volgens het runbook door iemand anders dan de bouwer, met de gemeten tijd
  in de PR. Daarna jaarlijks als advies in het runbook.
- `pnpm gate:fast`, `pnpm gate:slow` en `pnpm ratchet` groen; uitslag in de PR.

## Open vragen

Een vraag zonder aanbeveling (de eigenaar kiest) blokkeert `goedgekeurd`; een vraag met aanbeveling mag blijven staan. `check-docs` telt elke regel in deze sectie met het waarschuwingsteken en "open" (ook met U+FE0F of hoofdletter, ook zonder opsommingsteken).

- **OV-1** — Versleutelen met `age` (publieke sleutel, de server kan niet lezen) of met `gpg` en een wachtwoord (vaak al
  aanwezig). Aanbeveling: `age`; één klein programma, en een gekaapte server kan de oude back-ups dan niet lezen.
- **OV-2** — Standaard bewaartermijn. Aanbeveling: 30 dagen, altijd minstens zeven exports.
- **OV-3** — Waar de hersteltest standaard draait. Aanbeveling: op de host; GitHub alleen als er geen host is en het app-ADR
  het aanvaardt.
- **OV-4** — Welke dodemansknop. Aanbeveling: de template noemt geen dienst; elke URL die een gemiste melding alarmeert werkt.
