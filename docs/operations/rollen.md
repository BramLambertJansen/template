# Databaserollen per omgeving

Runbook bij framework §6 (R-DB-01) en ADR 0042 en 0050 punt 5. Lokaal en in de runner maakt `db/init/01-roles.sql` de rollen
met demo-wachtwoorden bij de eerste start van een lege container. In elke andere omgeving (staging, productie, een beheerde
provider) maakt de beheerder dezelfde rollen met de hand, **vóór de eerste migratie**, met echte geheimen uit de geheimbeheerder
van de host. Migraties maken nooit rollen (R-DB-07); een migratie die een rol nodig heeft (zoals `…_app_jobs.sql`) faalt zonder.

`test/docs/rollen-runbook.test.ts` houdt deze tabel gelijk aan `db/init/01-roles.sql`.

## Overzicht

| Rol | Attributen | Lid van | Instellingen (`alter role … set`) | `connect` op de database | Env-variabele |
|---|---|---|---|---|---|
| `app_migrator` | `login`, geen superuser | — (krijgt `app_definer`) | `lock_timeout = 5s` | ja, en eigenaar van de database | `MIGRATOR_DATABASE_URL` (alleen migraties, scripts en tests) |
| `app_authenticated` | `nologin`, `noinherit` | — | — | nee | — |
| `api_user` | `login`, `noinherit` | in role `app_authenticated` | `statement_timeout = 5s`, `idle_in_transaction_session_timeout = 10s` | ja | `DATABASE_URL` |
| `auth_service` | `login` | — | `statement_timeout = 5s`, `idle_in_transaction_session_timeout = 10s`, `search_path = better_auth` | ja | `AUTH_DATABASE_URL` |
| `app_definer` | `nologin` | — | — | nee | — |
| `app_jobs` | `login`, `noinherit` | — | `statement_timeout = 5s`, `idle_in_transaction_session_timeout = 10s` | ja | `JOBS_DATABASE_URL` |

Geen rol is superuser of heeft `createrole`, `createdb` of `bypassrls`; `db/tests/rolattributen.sql` en
`db/tests/invarianten.sql` toetsen dat.

## Rollen aanmaken in een nieuwe omgeving

Als beheerder (de superuser of de beheerrol van de provider), in de database van de app. Vervang elk `<…>` door een eigen,
lang geheim (minstens 24 tekens, nooit de rolnaam of een demo-waarde: `env()` weigert die buiten `local` en `test`).

```sql
create role app_migrator login password '<geheim-migrator>';
create role app_authenticated nologin noinherit;
create role api_user login noinherit password '<geheim-api>' in role app_authenticated;
create role auth_service login password '<geheim-auth>';
create role app_definer nologin;
create role app_jobs login noinherit password '<geheim-jobs>';

alter role api_user set statement_timeout = '5s';
alter role api_user set idle_in_transaction_session_timeout = '10s';
alter role auth_service set statement_timeout = '5s';
alter role auth_service set idle_in_transaction_session_timeout = '10s';
alter role auth_service set search_path = better_auth;
alter role app_jobs set statement_timeout = '5s';
alter role app_jobs set idle_in_transaction_session_timeout = '10s';
alter role app_migrator set lock_timeout = '5s';

revoke all on database app from public;
grant connect on database app to app_migrator, api_user, auth_service, app_jobs;
alter database app owner to app_migrator;
grant app_definer to app_migrator;
```

Daarna de vier URL's in de geheimbeheerder van de host zetten (`DATABASE_URL`, `AUTH_DATABASE_URL`, `JOBS_DATABASE_URL`,
en `MIGRATOR_DATABASE_URL` alleen voor de migratiestap) en dan pas migreren. Een beheerde provider met een pooler: `api_user`
mag via de pooler in transaction mode (ADR 0042); `app_jobs` gebruikt alleen transactie-advisory-locks en mag dat ook.

## Een rol toevoegen aan een bestaande omgeving (bijv. `app_jobs`)

Een bestaande omgeving zonder `app_jobs` (gemaakt vóór ST-03): eerst de regels voor `app_jobs` hierboven (`create role`, de
twee `alter role`-regels en `grant connect`), dan `JOBS_DATABASE_URL` zetten, dan de nieuwe versie uitrollen (de migratie
`20261126120000_app_jobs.sql` en de opstartcontrole van de server hebben de rol nodig). Lokaal: het databasevolume opnieuw
maken (`docker compose down -v`, daarna opnieuw starten) of dezelfde regels met de hand als `postgres` draaien.

## Een geheim roteren

`alter role <rol> password '<nieuw>';`, dan de URL in de geheimbeheerder bijwerken en de app opnieuw uitrollen. Bestaande
verbindingen blijven tot hun einde werken. Voor `app_jobs`: een instantie met het oude wachtwoord kan na een herstart niet meer
starten (opstartcontrole, ADR 0049 punt 3); rol de nieuwe URL dus uit vóór of direct na het wijzigen.
