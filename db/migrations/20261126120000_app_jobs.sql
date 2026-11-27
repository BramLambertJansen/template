-- migrate:up
-- Rol app_jobs (spec achtergrondtaken deel B, ADR 0050 punt 5): de rol zelf staat in db/init/01-roles.sql en per omgeving in
-- docs/operations/rollen.md; deze migratie faalt als hij nog niet bestaat. Alleen usage op schema app: geen tabelrechten,
-- geen rechten op better_auth; execute alleen op functies van klasse job (db/tests/functies.sql), per functie gegrant.
grant usage on schema app to app_jobs;

-- migrate:down
-- Append-only: geen down-migraties (docs/framework.md §10).
