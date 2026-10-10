# 0021 — Audit log van admin-acties in core

Status: geaccepteerd (agent, onder mandaat van de eigenaar van 2026-10-11; ter herziening door de eigenaar)

## Context

Roadmap (Beslissingen) vraagt of een audit log van admin-acties standaard in core komt, in plaats van "op aanleiding" (framework §12).
Wat de repo nu laat zien en het ontwerp bepaalt:

1. **Admin-acties lopen langs twee wegen.** Rol toekennen gaat via `app.assign_role` (security definer van `app_definer`) in de
   transactie van `withUser()`. Uitnodigen, opnieuw uitnodigen en (spec `accountbeheer-uitbreiding`, PR #77) intrekken en resetlink
   lopen via Better Auth (`ctx.services.invitations`) over een **eigen verbinding** als `auth_service`, buiten die transactie.
   Blokkeren wordt `app.set_account_blocked` (security definer, PR #77). De spec wacht op dit besluit: "elke route krijgt een audit-regel".
2. **Nu herleidbaar is alleen de request-log** (`src/core/api/obs/request-log.ts`): `requestId`, gebruiker-ID, route, status, op stdout.
   Daarin staat niet wát er met wie gebeurde, en de bewaartijd hangt af van de host.
3. **`app_migrator` is eigenaar** van elke tabel en lid van `app_definer`. Een eigenaar kan triggers uitzetten, de tabel wijzigen of
   verwijderen; FORCE RLS houdt hem niet tegen. Binnen één database zonder superuser is "onwijzigbaar" dus nooit absoluut.
4. Scripts (`pnpm admin:create`, seed) kennen rollen toe als `app_migrator` zonder actor (`app.assign_role`, uitzondering zonder actor).

## Besluit (voorstel)

1. **Tabel `app.audit_log`**, append-only, RLS aan en geforceerd:
   `id bigint generated always as identity`, `at timestamptz not null default pg_catalog.now()`, `actor_id text` (null = script of taak),
   `db_role text not null default session_user`, `action text not null` (patroon `^[a-z]+(\.[a-z_]+)+$`), `target_type text`,
   `target_id text`, `request_id text`, `details jsonb not null default '{}'` (CHECK: object, hooguit 2 KB).
   Geen foreign keys naar `better_auth."user"`: een verwijderd account laat zijn ID staan (ADR 0022).
2. **Geen PII buiten ID's.** Geen naam, e-mail, IP of vrije tekst; `details` alleen ID's en enum-waarden (bijv. `{ "role": "admin",
   "previous": "user" }`). De TypeScript-kant (punt 5) valideert `details` per actie met zod; de CHECK begrenst de omvang.
3. **Schrijven in dezelfde transactie als de actie**, alleen via functies van `app_definer`; geen enkele rol heeft `insert` op de tabel
   behalve `app_definer` (policy `audit_log_definer_insert`).
   - Core-acties (`core.role.assign`, `core.account.block`, `core.account.unblock`) schrijft de security definer-functie zelf, in dezelfde
     body als de wijziging. Ook een script als `app_migrator` laat zo een regel achter (`actor_id` null, `db_role` = `app_migrator`).
   - Acties via Better Auth (`core.account.invite`, `.reinvite`, `.revoke`, `.reset_link`) schrijft de route in zijn `withUser()`-transactie
     vóór de aanroep van de service. Faalt de service, dan rolt de transactie terug en is er geen regel.
   - `app.audit(action, target_type, target_id, details)` (security definer, klasse `client`) zet `actor_id` altijd op
     `app.current_user_id()` (null → 42501) en weigert acties die met `core.` beginnen: een gebruiker kan alleen over zichzelf
     schrijven, nooit een core-actie nadoen.
4. **`requestId` in de database.** `withUser()` zet ook `app.request_id` met `set_config(…, true)` (alleen in `src/core/api/db`);
   `app.request_id()` leest hem. Zo koppelt een auditregel aan de regel in de request-log.
5. **Een app registreert eigen acties zonder core te wijzigen** (ADR 0008), zoals foutcodes: `src/shared/audit.ts` doet
   `defineAuditActions({ 'invoice.approve': z.object({ … }) })`; de route kit geeft handlers `ctx.audit(action, target, details)`, getypt op
   die sleutels, dat `app.audit` in de eigen `tx` aanroept. Een app-functie van `app_definer` mag ook rechtstreeks `app.audit` aanroepen.
   Een app-actie heeft nooit het voorvoegsel `core.`.
6. **Append-only afgedwongen** met triggers van `app_definer`: `before update` en `before truncate` falen altijd; `before delete` faalt
   tenzij de rij ouder is dan de bewaartermijn (punt 7). Dat geldt ook voor de eigenaar `app_migrator` bij gewone DML.
   Tegen uitzetten of wijzigen door de eigenaar (context 3): een invariant in pgTAP eist dat de triggers bestaan en aan staan, dat de
   policies en grants exact de allowlist zijn, en `db/migrations/` is een beschermd pad met review van de eigenaar.
7. **Bewaartermijn** via het mechanisme van ADR 0022: `app.audit_log` staat in de bewaarcatalogus met standaard 1 jaar (OV-5); de
   opruimtaak (ADR 0020, PR #69) verwijdert verlopen rijen via een functie van `app_definer`.
8. **Lezen** alleen voor een admin met MFA: policy `audit_log_select_admin` met `(select app.is_mfa_admin())`. Namen tonen gebeurt
   bij het lezen (join op `app.accounts`); een verwijderd account toont "verwijderd account". Geen scherm in deze stap (OV-6).
9. **Buiten scope**: lees-acties ("wie bekeek wat"), inloggen en mislukte pogingen (Better Auth, rate limit), en export naar een
   externe, onwijzigbare opslag (per app, OV-3).

## Tests

- **pgTAP**: per policy een test op naam; `insert`, `update`, `delete` en `truncate` falen voor `app_authenticated`, `api_user` en
  `auth_service`; `update` en `truncate` falen ook als `app_migrator` en `app_definer`; `delete` van een rij binnen de termijn faalt voor
  iedereen; de invariant op triggers, policies en grants met een opzettelijke fout; `app.assign_role` schrijft precies één regel met
  actor, `db_role` en `request_id`; teruggedraaide actie laat geen regel; `app.audit` weigert `core.*`, een lege actor en > 2 KB `details`;
  een `user` ziet geen regels, een admin zonder MFA ook niet. Functiecatalogus: `app.audit` `client`, triggerfuncties `intern`.
- **Integratie** (`pnpm test:db`): uitnodigen schrijft `core.account.invite` met `request_id` van de response; een falende mail of
  service laat geen regel achter; `ctx.audit` met een niet-geregistreerde actie compileert niet (type-test) en faalt bij zod.

## Alternatieven

- **Triggers op de gewijzigde tabellen** (generiek: oude en nieuwe rij als JSON). Vangt elk pad, ook cascades, maar logt PII mee, kent
  de bedoeling niet (uitnodigen of rol wijzigen) en werkt niet voor acties in `better_auth` via `auth_service`.
- **Alleen de request-log uitbreiden.** Niet in dezelfde transactie, bewaartijd per host, en wat er gebeurde staat er niet in.
- **Op aanleiding houden** (framework §12). Dan bouwt elke app het opnieuw, en PR #77 heeft het nu al nodig.
- **Eigen tabeleigenaar zonder `app_migrator`.** Kan niet zonder rol buiten migraties; `app_migrator` is lid van `app_definer`.

## Gevolgen

- Migratie voor tabel, triggers, `app.audit`, `app.request_id()` en aanpassing van `app.assign_role` (`create or replace`).
- `withUser()` krijgt de `requestId` mee; `createRouteKit` krijgt de auditacties van de app; `ctx.audit` in core.
- Framework §6 (audit log, invariant) en §12 (rij "Audit log" weg) wijzigen: beschermd, akkoord van de eigenaar.
- De routes uit spec `accountbeheer-uitbreiding` krijgen elk een auditregel; dat staat in de spec vóór `goedgekeurd`.

## Open punten (agent, 2026-10-11: elk punt besloten volgens de aanbeveling)

- **OV-1 — Standaard in core of op aanleiding.** Aanbeveling: in core, nu; PR #77 heeft het nodig en achteraf toevoegen mist de oude acties.
- **OV-2 — Schrijfwijze.** (a) expliciet in definer-functies en via `app.audit`/`ctx.audit`; (b) generieke triggers. Aanbeveling: (a).
- **OV-3 — Bescherming tegen de eigenaar.** Triggers + invariant + review van migraties (punt 6) erkennen dat `app_migrator` het kan
  omzeilen. Echte onwijzigbaarheid vraagt export naar externe opslag: per app, bij een wettelijke eis. Aanbeveling: zo.
- **OV-4 — Velden.** Alleen ID's en enum-waarden in `details`, zod per actie, hooguit 2 KB. Aanbeveling: zo; geen e-mail van de genodigde.
- **OV-5 — Standaardtermijn.** 1 jaar, per app te wijzigen in de bewaarcatalogus (ADR 0022). Aanbeveling: 1 jaar.
- **OV-6 — Scherm voor admins.** Aanbeveling: niet in deze stap; later `/admin/audit` via een eigen spec op het lijstpatroon (PR #77).
- **OV-7 — Gat bij Better Auth-acties.** Slaagt de service maar faalt daarna de commit, dan is er een actie zonder regel (zeldzaam, zichtbaar
  in de request-log met status 500). Aanbeveling: accepteren en noemen; een outbox-variant (ADR 0020) pas bij een eis.
