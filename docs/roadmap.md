# Roadmap

Uitwerking van [framework.md](framework.md) §12. Vink af in de PR die het onderdeel oplevert, met bewijs.
Fase 0 en 1 horen in de template; fase 2 levert gouden pad en generator terug; fase 3 is per app.

## Beslissingen

- [x] Provider-neutraal — ADR 0002
- [x] Auth in de API met Better Auth op de eigen Postgres — ADR 0003
- [x] Postgres 17, dbmate, pgTAP-image, rollen via `db/init/` — ADR 0004

Genomen door de agent op verzoek van de eigenaar; herzien via een nieuwe ADR.

## Fase 0 — Bewijs

- [x] Rollen `app_authenticated`, `api_user` (NOINHERIT), `auth_service` en dichte default privileges in `db/init/01-roles.sql`
- [ ] Eerste migratie: `app.current_user_id()`, `app.session_strength()`
- [ ] `withUser()` met `pg`: lektest over parallelle requests, nul lekken, geen toegang buiten `withUser()`.
- [ ] Dezelfde test via PgBouncer (transaction mode) als compose-profiel `pooler`.
- [ ] Uitkomst in `docs/adr/0003-datapad.md`.

## Fase 1 — Fundament

### Machine en repo
- [x] `mise.toml`, `.gitattributes`, `.editorconfig`, browserslist, `compose.yaml` (Postgres 17.6 + pgTAP-image, Mailpit), `.env.example`
- [ ] `scripts/bootstrap.sh`, `scripts/doctor.sh` (versies, inotify, sandbox, Docker, jq)
- [ ] `pnpm dev`: Docker-check, `compose up --wait`, migraties, `.env.local`, Hono :8787 + Vite :5173 met proxy
- [ ] `.vscode/`, `.devcontainer/` (optioneel)

### Checks
- [ ] `tsconfig` (strict-opties), TypeScript 6.0.x gepind
- [ ] ESLint strictTypeChecked + projectregels (imports, `as`, apparaatdetectie, focusregel, functielengte, forbid-elements)
- [ ] dependency-cruiser (lagen uit framework §2)
- [ ] lefthook (pre-commit, pre-push), gitleaks
- [ ] dbmate als gepinde devDependency; `check-migrations`, smalle `check-docs` (incl. wie `goedgekeurd` zet), `check-secdef`, bundelbudget
- [ ] pnpm supply chain: `minimumReleaseAge` 7 dagen, `allowBuilds`, `trustPolicy: no-downgrade`
- [ ] `gate:fast`, `gate:slow` (squawk, snapshot zonder verschil, e2e)

### Secure route en database
- [ ] `defineRoute()` met `ctx.actor`, getypte client (`AppType`)
- [ ] `withUser()` met foutvertaling; Drizzle-introspectie + brands-script
- [ ] Foutcoderegister, `limits.ts`, `assert()`, `unsafeCast()`, `Cents`, cursor-contract
- [ ] Default privileges dicht, pgTAP-rechteninvariant, `check-policies`, schema-snapshot (`pg_dump`)
- [ ] Racetest-patroon

### Auth en rollen
- [ ] Better Auth in `src/api/auth` (schema `auth`, cookie, `Origin`-check, rate limit), client in `src/web/lib/auth.ts`
- [ ] `user_roles`, `can()`, MFA (two-factor) met `session_strength` voor admin, test admin zonder MFA
- [ ] Seed met testgebruikers per rol; mails via Mailpit

### Frontend-basis
- [ ] TanStack Router met guards + ErrorBoundary; API-client (401 → inloggen, `ApiError`)
- [ ] `AsyncView`, `<Form>`/`<FormField>`, `lib/format.ts`
- [ ] Tokens in drie lagen, basiskit Button, Input, Field, Card, Dialog
- [ ] Contrasttest over recepten, `scanAxe`, woordenlijsttest, `/design-system` alleen in dev

### Agent-opzet
- [x] `AGENTS.md`, `CLAUDE.md`, padregels (`api`, `web`, `database`), spec-sjabloon, DoD, deny/ask in `.claude/settings.json`
- [ ] Skills (spec, nieuw-route, nieuw-scherm, nieuw-component, migratie, release, security-review) + `scripts/facts.mjs`
- [ ] Subagents tester (sonnet) en reviewer (opus, zonder Write/Edit)
- [ ] Hooks: lint-na-bewerking, guard-files, readonly-bash, stop, subagent-stop, tester-paden, sessie-context
- [ ] Sandbox met `failIfUnavailable` en `excludedCommands`

### GitHub
- [x] `CODEOWNERS`, PR-template
- [ ] Organisatie + bot-account met fijnmazig token
- [ ] `.github/settings/main-protection.json` + `scripts/check-github.mjs`
- [ ] `ci.yml` (runner `ubuntu-24.04`, Actions op SHA, gewijzigde tests als lijst in de PR), `guard.yml` (vanaf main), `codeql.yml`, osv-scanner (PR + wekelijks), Renovate

**Klaar als:** verse machine komt met `bootstrap.sh` + `pnpm dev` tot een ingelogde app zonder extern account;
CI weigert `any`, een databaseclient in `src/web`, een route buiten `defineRoute` en een gewijzigde migratie;
de bewaker houdt een afgezwakt check-script tegen; `check-github` groen; elke rol logt in via e2e.

## Fase 2 — Gouden pad (eerste app, terug naar template)

- [ ] Eerste feature met de hand door alle lagen
- [ ] `pnpm new:resource <naam>` daaruit afgeleid
- [ ] Clientfouten naar eigen tabel, `check:catalogus`

## Fase 3 — Release (per app)

- [ ] ADR: hosting en beheerde Postgres (moet eigen rollen toestaan); adapter in `deploy/<host>/`
- [ ] Staging en productie, beschermde environments, release-workflows, `check-deployment-schema`
- [ ] Smoketest: browser kan niet bij provider-data-API's
- [ ] Runbooks in `docs/operations/`; back-up één keer teruggezet
