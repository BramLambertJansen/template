# App-template

Fundering voor elke nieuwe webapp, gebouwd door AI-agents binnen afgedwongen kaders.

- **De wet:** [docs/framework.md](docs/framework.md) — regels, architectuur, werkstraat.
- **Voortgang:** [docs/roadmap.md](docs/roadmap.md).
- **Agents:** [CLAUDE.md](CLAUDE.md) → [AGENTS.md](AGENTS.md) + padregels in `.claude/rules/`.

**Status:** fundering in opbouw (fase 0/1). Nog geen app-code, checks of CI.

## Stack

Vite + React SPA (`src/web`), Hono-API (`src/api`), gedeelde contracten (`src/shared`), gewone Postgres (`db/`).
Frameworkcode staat apart in `src/core/`, zodat template-updates niet botsen met app-code ([ADR 0008](docs/adr/0008-grens-core-en-app.md)).
Geen hosting- of databaseprovider in de template: een app kiest die zelf per ADR ([ADR 0002](docs/adr/0002-provider-neutraal.md)).
Auth draait in de API op de eigen Postgres ([ADR 0003](docs/adr/0003-auth-in-de-api.md)); database in [ADR 0004](docs/adr/0004-database-tooling.md);
toolchain en bot-identiteit in [ADR 0005](docs/adr/0005-toolchain-en-identiteit.md).

## Lokaal draaien

Vereist: Ubuntu 24.04 (native of WSL2), Docker Engine, [mise](https://mise.jdx.dev), gh, `bubblewrap` en `socat`
(zonder die twee start Claude Code hier niet: de sandbox staat op `failIfUnavailable`).

```sh
scripts/bootstrap.sh   # eenmalig: mise install, pnpm install, git-hooks (lefthook), daarna scripts/doctor.sh
pnpm dev               # Docker-check, .env.local, Postgres 17 + pgTAP en Mailpit, migraties, API :8787 + web http://127.0.0.1:5173
```

Draait er al een app op die poorten: tel 10 op bij `PG_PORT`, `MAIL_UI_PORT` en `SMTP_PORT` én bij de poort in de drie database-URL's en `SMTP_URL` in `.env.local`.

Lokale accounts (gemaakt door `pnpm dev`, alleen lokaal; wachtwoord `lokaal-demo-wachtwoord`):

| Account | Rol | TOTP |
|---|---|---|
| `admin@template.test` | admin | vast geheim; voeg toe aan je authenticator-app met `otpauth://totp/localhost:admin%40template.test?secret=NRXWWYLBNQWWIZLNN4WXI33UOAWXG3DFOV2GK3BNGAYDAMBQGAYA&issuer=localhost&digits=6&period=30` |
| `gebruiker@template.test` | user | — |

Eerste admin in een echte omgeving, of buitengesloten: `pnpm admin:create --email …` ([runbook](docs/operations/eerste-admin.md)).

Checks: `pnpm gate:fast` (lint, typecheck, lagen, unit), `pnpm test:db` en `pnpm ui:check` (in de runner-container van
[ADR 0009](docs/adr/0009-tests-buiten-de-sandbox.md)). Overzicht: `node scripts/kit/feiten.mjs`. Machine controleren: `scripts/doctor.sh`.

## Nieuwe app starten

Laat Claude Code het doen met [docs/nieuwe-app.md](docs/nieuwe-app.md): machine, repo, koppeling, instellingen, lokale stack en databasebewijs.

```sh
mkdir -p ~/setup && curl -fsSL https://raw.githubusercontent.com/BramLambertJansen/template/main/docs/nieuwe-app.md -o ~/setup/nieuwe-app.md
cd ~/setup && claude        # zeg: Volg nieuwe-app.md
```

De afspraken erachter ([ADR 0006](docs/adr/0006-app-uit-template.md)):

1. Deze repo staat op **Settings → Template repository**; een app ontstaat met **Use this template**.
2. Direct daarna eenmalig een merge-commit die de geschiedenis koppelt (`-s ours`); updates later met `git merge template/main`
   op een branch, via een PR, gemerged met **Create a merge commit** — nooit squash.
3. App-eigen ADR's nummeren vanaf `0100`. De hosting-ADR volgt bij de eerste release (roadmap fase 3), niet bij de start.
