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
     tabellen in `public` of `app`, nooit in `auth` of `tap`;
  3. policies die `(select app.current_user_id())` gebruiken;
  4. een pgTAP-test in `db/tests/` per policy, met de policynaam letterlijk in de test.
- pgTAP staat in schema `tap`: elke test begint met `set search_path = tap, public` en roept `plan()` aan vóór
  `set local role app_authenticated` (die rol heeft geen TEMP).
- Tabellen en kolommen snake_case; `timestamptz` voor tijd; geld in `bigint`/`integer` centen.
- CHECK-constraint met een grens uit `src/shared/limits.ts`: test dat beide waarden gelijk zijn.
- `security definer`-functies: `set search_path = ''`, alles volledig gekwalificeerd (`public.x`, `pg_catalog.y`),
  eigenaar `app_definer` (`alter function … owner to app_definer`) met alleen de rechten die de functie nodig heeft.
- Datamigraties die alle rijen moeten zien: via zo'n functie, nooit door RLS uit te zetten.
- Auth-tabellen: SQL uit `auth generate` (gepinde versie) in een migratie; nooit `auth migrate`.
- Rijen in schema `auth` zijn van Better Auth; lees of schrijf ze nooit vanuit `src/core/api/db` of app-code. Geen provider-specifieke schema's of functies (`storage.*`, `realtime.*`, `auth.uid()`).
- Na een migratie: types en snapshot opnieuw genereren met het script (zodra het bestaat); nooit met de hand.
- `src/core/api/db` exporteert alleen `withUser()`. Die zet per transactie de rol, `app.user_id` en `app.session_strength`, en vertaalt fouten.
