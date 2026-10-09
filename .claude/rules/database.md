---
paths:
  - "db/**"
  - "src/api/db/**"
---

# Regels voor `db/` en `src/api/db`

- Lees `db/schema.snapshot.sql` voor de huidige stand, niet alle migraties.
- Nieuwe wijziging = nieuwe migratie in `db/migrations/`. Een migratie die op `main` staat, raak je nooit aan.
- Expand/contract: de vorige versie van de code moet blijven werken na de migratie.
- Elke nieuwe tabel in dezelfde migratie:
  1. `alter table … enable row level security; alter table … force row level security;`
  2. expliciete `grant` aan `app_authenticated` met alleen de nodige rechten (nooit TRUNCATE, REFERENCES, TRIGGER);
  3. policies die `(select app.current_user_id())` gebruiken;
  4. een pgTAP-test in `db/tests/` per policy, met de policynaam letterlijk in de test.
- Tabellen en kolommen snake_case; `timestamptz` voor tijd; geld in `bigint`/`integer` centen.
- CHECK-constraint met een grens uit `src/shared/limits.ts`: test dat beide waarden gelijk zijn.
- `security definer`-functies: `set search_path = ''`, alles volledig gekwalificeerd (`public.x`, `pg_catalog.y`).
- Geen provider-specifieke schema's of functies (`auth.*`, `storage.*`, `realtime.*`).
- Na een migratie: types en snapshot opnieuw genereren met het script (zodra het bestaat); nooit met de hand.
- `src/api/db` exporteert alleen `withUser()`. Die zet per transactie de rol en `app.user_id`, en vertaalt fouten.
