# 0004 — Database-tooling: Postgres 17, dbmate, pgTAP-image, rollen via init

Status: geaccepteerd (2026-10-09) — besloten door de agent op verzoek van de eigenaar; herzien via een nieuwe ADR.

## Besluit

- **Postgres 17** (exact gepind in `db/docker/Dockerfile`). Breedst ondersteund door beheerde providers; 18 pas als de providers van onze apps het bieden.
- **dbmate** voor migraties: gewone SQL, versies als tijdstempel (geen botsingen bij `git merge template/main`),
  werkt op elke Postgres, als gepinde devDependency. Migraties in `db/migrations/`.
- **pgTAP** in een eigen image (`db/docker/Dockerfile`: officiële Postgres + `postgresql-17-pgtap` + `pg_prove`),
  gebruikt door `compose.yaml` en CI. Tests in `db/tests/*.sql`.
- **Rollen** (`app_authenticated`, `api_user`, `auth_service`) worden niet in migraties gemaakt: lokaal door
  `db/init/` (eerste start van de container, demo-wachtwoorden), per omgeving via het runbook. Migraties gaan uit van hun bestaan
  en verlenen alleen rechten.
- Schema-snapshot via `pg_dump --schema-only` uit de container; Drizzle alleen voor introspectie/types, nooit voor migraties.

## Alternatieven

- Supabase CLI / drizzle-kit migrate: providergebonden resp. tweede bron voor het schema.
- node-pg-migrate / graphile-migrate: JS-migraties of eigen conventies; dbmate is het eenvoudigst.
- Testcontainers met kale Postgres: test een andere database dan we draaien.

## Gevolgen

- `check-migrations` controleert append-only tegen `origin/main` en unieke versies.
- Een beheerde provider moet `CREATE ROLE` of vooraf aangemaakte rollen toestaan; dat is een keuzecriterium in de app-ADR.
