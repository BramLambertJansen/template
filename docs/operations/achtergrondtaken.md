# Achtergrondtaken: werking en herstel

Runbook bij ADR 0050 en de spec [achtergrondtaken](../template/specs/achtergrondtaken.md). De runner draait in het API-proces
(`startJobs`, `src/core/api/jobs/`); elke batch is één transactie met een advisory lock (`JOB_LOCK_NAMESPACE`, taaknummer),
dus met meer instanties draait een batch van een taak er hooguit één tegelijk. Core-taken: `core.purge_auth` (nummer 1,
`purgeExpired()` als `auth_service`) en `core.purge` (nummer 2, `app.purge_expired` als `app_jobs`), elke minuut
(`JOBS_INTERVAL_SECONDS`), de eerste ronde direct na de start.

## Wat de log laat zien

Een geslaagde ronde logt niets. Een mislukte ronde geeft één JSON-regel op stdout:
`{"time":"…","job":"core.purge","outcome":"error","durationMs":12,"errorClass":"DatabaseError:57014"}`. `errorClass` is de
klasse van de fout en bij een databasefout de SQLSTATE; nooit de melding, SQL of een adres.

| `errorClass` | Betekenis | Herstel |
|---|---|---|
| `DatabaseError:28P01` of een verbindingsfout | `app_jobs` (of `auth_service` voor `core.purge_auth`) kan niet inloggen | wachtwoord en `JOBS_DATABASE_URL` vergelijken (`docs/operations/rollen.md`, "Een geheim roteren") |
| `DatabaseError:57014` | een batch liep langer dan `statement_timeout` (5 s) | rolt terug; de volgende ronde probeert opnieuw. Blijft het: tabel meten, index overwegen (spec OV-D2) |
| `DatabaseError:42501` | rechten ontbreken (bijv. `execute` op een `job`-functie) | migraties gedraaid? `pnpm test:db` lokaal: functiecatalogus en invarianten |
| `DatabaseError:22023` | `app.purge_expired` weigert de tabel (geen of verkeerde rij in `app.retention`) | rij in de bewaarcatalogus herstellen met een migratie |
| `DatabaseError:42883` | een functie bestaat niet (migraties niet gedraaid) | migreren |

## Herstel per situatie

- **Proces stopt of crasht midden in een batch.** De transactie rolt terug en de lock vervalt met de verbinding. De volgende
  ronde (op deze of een andere instantie) doet de batch opnieuw; opruimen is idempotent. Niets te doen.
- **SIGTERM tijdens een batch.** De runner start geen nieuwe batch, wacht op de lopende en sluit daarna de pools, binnen
  `SHUTDOWN_TIMEOUT_MS`; daarna breekt het proces af (rollback, zie hierboven).
- **De server start niet: opstartcontrole faalt.** De server verbindt vóór het starten één keer als `app_jobs` (ADR 0049
  punt 3). Controleer of de rol bestaat, `connect` heeft en of `JOBS_DATABASE_URL` de gegevens van `app_jobs` heeft (niet van
  een andere rol). Readiness (`GET /api/ready`) hangt hier niet van af.
- **Eén tabel faalt in `core.purge`.** De andere tabellen worden in dezelfde ronde nog opgeruimd; daarna logt de runner de
  eerste fout. Herstel volgens de tabel hierboven.
- **Opruimen loopt achter** (meer dan `MAX_PURGE_BATCHES_PER_ROUND` × `MAX_PURGE_BATCH` verlopen rijen per tabel). Elke ronde
  ruimt hooguit 100 × 1000 rijen per tabel op; de rest volgt vanzelf in de volgende rondes.
- **Een lock blijft bezet.** Een advisory lock in transactievorm leeft alleen zolang de transactie: zoek in `pg_locks`
  (`locktype = 'advisory'`, `classid = 1785684595`) de backend en beëindig die alleen als die echt hangt
  (`pg_terminate_backend`); de taak gaat in de volgende ronde verder.
- **Host die naar nul schaalt.** De runner draait dan niet. Een adapter in `deploy/<host>/` roept op de cron van de host
  `runJobsOnce()` aan (ADR 0050 punt 7, buiten de template).
