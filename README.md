# App-template

Basisrepository voor nieuwe webapps die door AI-agents gebouwd worden binnen afgedwongen kaders.
Het volledige ontwerp staat in [docs/plan.md](docs/plan.md); de voortgang in [docs/roadmap.md](docs/roadmap.md).

**Status:** skelet. De mappenstructuur, documentatie en basisconfiguratie staan erin; code, checks,
hooks en CI worden per fase gebouwd (zie roadmap). Fase 0 (bewijs Supavisor + `withUser()`) is nog niet gedaan.

## Stack

Vite + React SPA (`src/web`), Hono-API (`src/api`), gedeelde contracten (`src/shared`), Supabase
(Postgres + Auth) lokaal in Docker. Release naar Vercel + Supabase (fase 3).

## Nieuwe app starten vanaf deze template

GitHub staat niet toe dat je een repo forkt naar hetzelfde account of dezelfde organisatie. Daarom:

1. Zet deze repo op GitHub op **Settings → Template repository**.
2. Nieuwe app: **Use this template → Create a new repository**.
3. Updates uit de template later overnemen: `git remote add template <url-van-deze-repo>`,
   `git fetch template` en `git merge template/main` op een branch, via een PR.

## Lokaal starten

Nog niet beschikbaar: `scripts/bootstrap.sh`, `scripts/doctor.sh` en `pnpm dev` komen in fase 1
(zie [docs/plan.md](docs/plan.md), "Nieuwe machine in tien stappen").
