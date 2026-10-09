---
paths:
  - "db/**"
  - "src/core/api/db/**"
  - "src/api/db/**"
---

# Regels voor `db/` en de database-toegang (`src/core/api/db`; `src/api/db` is gegenereerd)

- Lees `db/schema.snapshot.sql` voor de huidige stand, niet alle migraties.
- Nieuwe wijziging = nieuwe migratie in `db/migrations/` (dbmate-formaat `-- migrate:up`, geen down). Draait als `app_migrator`. Rollen maak je nooit in een migratie (`db/init/`). Een migratie die op `main` staat, raak je nooit aan.
- Expand/contract: de vorige versie van de code moet blijven werken na de migratie.
- Elke nieuwe tabel in dezelfde migratie:
  1. `alter table … enable row level security; alter table … force row level security;`
  2. expliciete `grant` aan `app_authenticated` met alleen de nodige rechten (nooit TRUNCATE, REFERENCES, TRIGGER);
     tabellen in `public` of `app`, nooit in `better_auth` of `tap`;
  3. policies die `(select app.current_user_id())` gebruiken;
  4. een pgTAP-test in `db/tests/` per policy, met de policynaam letterlijk in de test.
- pgTAP staat in schema `tap`: elke test begint met `set search_path = tap, public` en roept `plan()` aan vóór
  `set local role app_authenticated` (die rol heeft geen TEMP).
- Tabellen en kolommen snake_case; `timestamptz` voor tijd; geld in `bigint`/`integer` centen.
- CHECK-constraint met een grens uit `src/shared/limits.ts`: test dat beide waarden gelijk zijn.
- `security definer`-functies: `set search_path = ''`, alles volledig gekwalificeerd (`public.x`, `pg_catalog.y`),
  eigenaar `app_definer` (`alter function … owner to app_definer`) met alleen de rechten die de functie nodig heeft.
- Datamigraties die alle rijen moeten zien: via zo'n functie, nooit door RLS uit te zetten. FORCE RLS geldt ook voor
  `app_definer`: geef de tabel in dezelfde migratie een policy `to app_definer` met alleen wat de functie nodig heeft, met een pgTAP-test.
- Auth-tabellen: SQL uit `auth generate` (gepinde versie) in een migratie die begint met `set local search_path = better_auth;`; nooit `auth migrate`.
- Heeft een auth-hook data buiten `better_auth` nodig (bijv. rol uit `user_roles`), of de app gegevens uit `better_auth."user"`:
  via een `security definer`-functie of -view van `app_definer`, nooit met extra grants op het andere schema.
- `set_config` en `current_setting` alleen in `src/core/api/db` en in de helpers in schema `app`; nooit in app-SQL of handlers.
- Rijen in schema `better_auth` zijn van Better Auth (ADR 0010); lees of schrijf ze nooit vanuit `src/core/api/db` of app-code. Geen provider-specifieke schema's of functies (`storage.*`, `realtime.*`, `auth.uid()`).
- Na een migratie: types en snapshot opnieuw genereren met het script (zodra het bestaat); nooit met de hand.
- `src/core/api/db` exporteert alleen `withUser()` (plus `testing.ts`, alleen voor testbestanden). Die controleert aan het begin
  van elke transactie `current_user = session_user`, zet de rol, `app.user_id` en `app.session_strength` (`password` of `mfa`; elke
  andere waarde weigert hij) en vertaalt fouten. Buiten `withUser()` geeft `app.session_strength()` `none`.

## Besloten, nog niet gebouwd

`withUser()`, `db/schema.snapshot.sql`, `check-secdef`, `check-policies`, de functiecatalogus in pgTAP (framework §6), de RLS-invarianten en de
scripts voor types en snapshot bestaan nog niet (roadmap fase 0 en 1). Alleen de baseline-migratie staat er. Bouw er niet op vooruit.
