---
soort: toegevoegd
---

- Achtergrondtaken (spec `achtergrondtaken`, deel B–D; ADR 0050): een runner in het API-proces (`startJobs`, `runJobsOnce` in
  `src/core/api/jobs/`) met batches onder een advisory lock, de rol `app_jobs` (`JOBS_DATABASE_URL`, verplicht) met `withJob()`,
  en opruimen van verlopen sessies, verificaties en rate-limit-rijen (`purgeExpired()`, als `auth_service`) en van app-tabellen
  met een termijn uit `app.retention` (`app.purge_expired`). Een app registreert eigen taken met `jobs` in de
  `runServer`-aanroep van `src/api/server.ts` (nummers vanaf 100). De server controleert bij opstart één verbinding als
  `app_jobs` (ADR 0049 punt 3) en start niet als die faalt; readiness blijft één ping als `api_user`. Runbooks:
  `docs/operations/rollen.md` en `docs/operations/achtergrondtaken.md`.

### Bij een update

- Maak in elke omgeving de rol `app_jobs` aan vóór de migraties (`docs/operations/rollen.md`, "Een rol toevoegen aan een
  bestaande omgeving") en zet `JOBS_DATABASE_URL` in de geheimen van de host; zonder rol faalt de migratie
  `20261126120000_app_jobs.sql`, zonder variabele of met een verkeerde URL start de server niet. Lokaal: voeg
  `JOBS_DATABASE_URL=postgres://app_jobs:app_jobs@127.0.0.1:54322/app` (met de eigen PG-poort) toe aan `.env.local` en maak het
  databasevolume opnieuw (`docker compose down -v`) of maak de rol met de hand.
