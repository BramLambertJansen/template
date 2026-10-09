# App-template

Fundering voor elke nieuwe webapp, gebouwd door AI-agents binnen afgedwongen kaders.

- **De wet:** [docs/framework.md](docs/framework.md) — regels, architectuur, werkstraat.
- **Voortgang:** [docs/roadmap.md](docs/roadmap.md).
- **Agents:** [CLAUDE.md](CLAUDE.md) → [AGENTS.md](AGENTS.md) + padregels in `.claude/rules/`.
- **Achtergrond:** [docs/background/plan-v1.md](docs/background/plan-v1.md) (oorspronkelijk plan, niet normatief).

**Status:** fundering in opbouw (fase 0/1). Nog geen app-code, checks of CI.

## Stack

Vite + React SPA (`src/web`), Hono-API (`src/api`), gedeelde contracten (`src/shared`), gewone Postgres (`db/`).
Geen hosting- of databaseprovider in de template: een app kiest die zelf per ADR ([ADR 0002](docs/adr/0002-provider-neutraal.md)).
Auth draait in de API op de eigen Postgres ([ADR 0003](docs/adr/0003-auth-in-de-api.md)); database-tooling in [ADR 0004](docs/adr/0004-database-tooling.md).

## Lokaal draaien

Vereist: Ubuntu 24.04 (native of WSL2), Docker Engine, [mise](https://mise.jdx.dev).

```sh
mise install
cp .env.example .env.local
docker compose up -d --build --wait   # Postgres 17 + pgTAP op 127.0.0.1:54322, Mailpit op http://127.0.0.1:54324
```

`pnpm dev`, `scripts/bootstrap.sh` en `scripts/doctor.sh` volgen in fase 1.

## Nieuwe app starten

GitHub laat je een repo niet forken naar hetzelfde account. Daarom:

1. Zet deze repo op **Settings → Template repository**.
2. Nieuwe app: **Use this template → Create a new repository**.
3. Template-updates overnemen: `git remote add template <url>`, `git fetch template`, `git merge template/main` op een branch, via PR.
4. Eerste ADR in de app: hosting en beheerde Postgres (`docs/framework.md` §3).
