# 0020 — Achtergrondtaken: opruimen en mail-outbox

Status: geaccepteerd (agent, onder mandaat van de eigenaar van 2026-10-11; ter herziening door de eigenaar)

## Context

Roadmap (Beslissingen, stuk 7) vraagt een besluit over achtergrondtaken: opruimen van verlopen rijen en mail via een outbox,
met een eigen databaserol voor systeemjobs (framework §6: "Systeemjobs krijgen een aparte rol").

Wat er nu groeit of misgaat:
- `better_auth.session`, `better_auth.verification` (uitnodigings- en resetlinks) en `better_auth."rateLimit"`: Better Auth ruimt
  verlopen rijen alleen op als het ze tegenkomt. `rateLimit` krijgt een rij per IP en pad en wordt nooit kleiner.
- Uitnodigen stuurt de mail binnen de request (`sendResetPassword` → `sendInvitation` → SMTP). Valt SMTP even weg, dan faalt de
  uitnodiging voor de gebruiker, terwijl het account al bestaat. Herstel is nu `reinviteRoute` met de hand.
- Een app krijgt meer mails (melding, e-mail wijzigen) en eigen opruimwerk (bewaartermijnen, AVG-ADR).

## Besluit (voorstel)

1. **Runner in het API-proces, coördinatie in Postgres.** `startJobs()` in `src/core/api/jobs/` draait elke taak op een interval
   (bijv. elke minuut) vanuit `src/api/server.ts`. Elke run neemt `pg_try_advisory_xact_lock(<taak-id>)`: met meerdere instanties
   draait een taak er hooguit één tegelijk. Stoppen wacht op een lopende taak (binnen `SHUTDOWN_TIMEOUT_MS`). Geen extra proces,
   geen queue-dienst, geen cron van de host: werkt op elke containerhost (ADR 0002, ADR 0019).
2. **Opruimen van `better_auth`** draait als `auth_service` (die rol beheert dat schema al, ADR 0010), op de pool van Better Auth:
   sessies en verificaties waarvan `expiresAt` verstreken is, en `rateLimit`-rijen ouder dan het langste rate-limit-venster.
   In batches (bijv. 1000 rijen), zodat een run de tabel niet lang vastzet.
3. **Mail-outbox** in `app.mail_outbox` (RLS geforceerd, geen policy voor `app_authenticated`): `id`, `kind`, `recipient`,
   `payload jsonb`, `send_after`, `attempts`, `sent_at`, `last_error`. Erin via `app.enqueue_mail(...)` (security definer,
   eigenaar `app_definer`, intern), aan te roepen door `auth_service` (uitnodiging) en binnen `withUser()` door een route. Een worker
   pakt rijen met `for update skip locked`, verstuurt, en zet `sent_at` of verhoogt `attempts` met backoff; na N pogingen blijft de
   rij staan als "mislukt" (zichtbaar voor een admin). De payload (met de link en dus het token) wordt na verzenden geleegd.
4. **Eigen rol `app_jobs`** (login, `noinherit`, `statement_timeout`), aangemaakt in `db/init/01-roles.sql` en per omgeving via het
   runbook, met alleen `execute` op de interne functies voor outbox en opruimen van app-tabellen. Nieuwe env-variabele
   `JOBS_DATABASE_URL` (env-schema, secrets-regels, demo-waarde in `.env.example`).
5. Elke taak heeft een integratietest: opruimen verwijdert alleen verlopen rijen (roadmap stuk 7, **Klaar als**); de outbox
   verstuurt precies één keer bij twee gelijktijdige workers (racetest) en probeert opnieuw na een SMTP-fout.

## Besluiten op de open punten (agent, 2026-10-11)

- OV-1: eigen rol `app_jobs`, zoals framework §6 vraagt.
- OV-2: `JOBS_DATABASE_URL` met demo-waarde in `.env.example` en de rol in `db/init/01-roles.sql` (beschermde paden, onder het mandaat).
- OV-3: outbox; de accountlijst toont een mislukte verzending.

## Open punten voor de eigenaar (oorspronkelijk)

- **OV-1: eigen rol `app_jobs` (aanbeveling) of geen nieuwe rol.** Alternatief zonder nieuwe rol: grant `execute` op de interne
  functies rechtstreeks aan `api_user`. Binnen `withUser()` is de rol `app_authenticated` (en `api_user` is `noinherit`), dus een
  route kan ze niet aanroepen; alleen core-code met een eigen verbinding kan het. Scheelt een rol, een env-variabele en een
  runbookstap, maar wijkt af van framework §6 en maakt één gelekte `DATABASE_URL` krachtiger. Aanbeveling: eigen rol.
- **OV-2: `.env.example` en `db/init/` zijn beschermd.** De demo-waarde voor `JOBS_DATABASE_URL` en de nieuwe rol vragen akkoord.
- **OV-3: uitnodiging synchroon blijven tonen of niet.** Met de outbox meldt "uitnodigen" succes zodra de mail in de rij staat;
  een mislukte verzending ziet de admin pas later (status in de accountlijst). Aanbeveling: outbox, met status in de lijst.

## Alternatieven

- **Queue-bibliotheek (pg-boss, graphile-worker).** Volwassen, maar een nieuwe dependency met eigen schema en rechten die niet
  door onze RLS-invarianten en functiecatalogus gaan; meer dan nodig voor opruimen en één soort mail.
- **Cron van de host of een aparte worker-container.** Per provider anders (ADR 0002) en een tweede deploy-eenheid.
- **Geen outbox, wel opnieuw proberen in de request.** Houdt de request lang vast en lost het gat "account bestaat, mail niet
  verstuurd" niet op.

## Gevolgen

- Nieuwe map `src/core/api/jobs/` (runner, opruimen), migraties voor `app.mail_outbox` en de functies, pgTAP voor de functiecatalogus
  en RLS, een runbookregel voor de rol.
- `sendInvitation` in `src/api/server.ts` wordt "zet in de outbox" in plaats van direct SMTP; de SMTP-mailer verhuist naar de worker.
