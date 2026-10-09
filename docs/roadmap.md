# Roadmap

Uitwerking van [framework.md](framework.md) §12. Vink alleen af met bewijs (checkuitslag of test) in de PR.
Fase 0 en 1 horen in de template; fase 2 levert gouden pad en generator terug; fase 3 is per app.
Review van 2026-10-09: [reviews/2026-10-09-fundering.md](reviews/2026-10-09-fundering.md).

## Beslissingen

- [x] Provider-neutraal — ADR 0002
- [x] Auth in de API met Better Auth, sessiebeleid en MFA — ADR 0003
- [x] Postgres 17, rollen, dbmate, pgTAP — ADR 0004
- [x] Node 26, pnpm 11, TypeScript 6.0, GitHub App, toon van de regels — ADR 0005

## Fase 0 — Bewijs

Eerst door de eigenaar op de eigen machine (de agent gebruikt geen Docker):
- [ ] `docker compose up -d --build --wait`: image met pgTAP bouwt, `db/init` draait vóór "healthy"
- [ ] Baseline-migratie draait als `app_migrator` met dbmate

Daarna:
- [ ] `withUser()` met `pg`: `SET LOCAL ROLE` + `set_config(…, true)`; lektest over parallelle requests, nul lekken;
      na elke request `current_user = session_user`; `api_user` ziet zonder `withUser()` niets
- [ ] Dezelfde test via PgBouncer (transaction mode) als compose-profiel `pooler`
- [ ] FORCE RLS: bewijzen dat `app_migrator` (geen superuser) onder RLS valt
- [ ] Better Auth: `session_strength` via after-hook op 2FA-verificatie, `cookieCache` uit, intrekken werkt direct
- [ ] Meten: twee verbindingen per request (sessie + `withUser`), latency lokaal
- [ ] Uitkomst in `docs/adr/0006-datapad.md`

## Fase 1 — Fundament

### Machine en repo
- [x] `mise.toml`, `.gitattributes`, `.editorconfig`, browserslist, `pnpm-workspace.yaml`, `.env.example` (bestanden staan er; nog niet in gebruik)
- [ ] `scripts/bootstrap.sh`, `scripts/doctor.sh` (versies, inotify, sandbox, Docker, jq, bubblewrap)
- [ ] `pnpm dev`: Docker-check, `.env.local`, `compose up --build --wait`, migraties, Hono :8787 + Vite :5173 (met headers/CSP)
- [ ] `scripts/seed` via de auth-API: gebruiker per rol, admin met vast lokaal TOTP-geheim

### Checks
- [ ] `tsconfig` (flags uit framework §4), TypeScript `~6.0.3`, Renovate blokkeert TS 7
- [ ] ESLint 10 flat config: strictTypeChecked, `consistent-type-assertions: never`, `switch-exhaustiveness-check`,
      `no-restricted-syntax` (elementen, `SET ROLE`), `no-restricted-imports`, sonarjs, better-tailwindcss, functielengte
- [ ] dependency-cruiser (lagen en uitzonderingen uit framework §2–§3, geen cycles)
- [ ] lefthook (pre-commit, pre-push), gitleaks (gepind)
- [ ] dbmate (gepind) via script; `check-migrations`, `check-docs` (incl. gelijke beschermde-padenlijsten), `check-secdef`, bundelbudget
- [ ] `gate:fast`, `gate:slow` (squawk, snapshot `pg_dump -N tap` zonder verschil, `check-policies`, e2e)

### Secure route en database
- [ ] `defineRoute()` met `ctx.actor`, getypte client (`AppType`), types per resource
- [ ] `withUser()` met foutvertaling; Drizzle-introspectie + brands-script
- [ ] Foutcoderegister, `limits.ts`, `assert()`, `unsafeCast()`, `Cents`, cursor-contract
- [ ] pgTAP-invarianten (RLS geforceerd, geen TRUNCATE/REFERENCES/TRIGGER, `auth` dicht), racetest-patroon
- [ ] CSRF-middleware, `bodyLimit`, `secureHeaders()`, `onError` met `{ code, requestId }`

### Auth en rollen
- [ ] Better Auth (gepind): tabellen via `auth generate` → migratie, `__Host-`-cookie, sessiebeleid, rate limit in database
- [ ] `user_roles` (FK naar `auth."user"`), `can()`, MFA met inschrijfscherm, admin-test zonder MFA
- [ ] Inloggen, aanmelden, reset, e-mailverificatie via Mailpit; geen account-enumeratie

### Frontend-basis
- [ ] TanStack Router met guards + ErrorBoundary; API-client (401 → inloggen, `ApiError`)
- [ ] `AsyncView`, `<Form>`/`<FormField>`, `lib/format.ts`, `lib/env.ts`
- [ ] Tokens in drie lagen, `@custom-variant dark`, basiskit Button, Input, Field, Card, Dialog (+ codemod)
- [ ] Contrasttest over recepten, `scanAxe`, woordenlijsttest, `/design-system` alleen in dev

### Agent-opzet
- [x] `AGENTS.md`, `CLAUDE.md`, padregels, spec-sjabloon, DoD (tekst; nog niet afgedwongen)
- [ ] Scripts uit `excludedCommands` (`test:db`, `db:reset`, `db:types`, `ui:check`, `gate:slow`) bestaan in `package.json`
- [ ] `.claude/settings.json` bewezen: sandbox start op Ubuntu/WSL2 (bubblewrap, socat), deny-regels getest
- [ ] Hooks uit framework §8 (incl. git-guard en guard-files voor bestaande tests), elk met timeout
- [ ] Subagents tester (sonnet) en reviewer (opus) met frontmatter-hooks
- [ ] Skills (spec, nieuw-route, nieuw-scherm, nieuw-component, migratie, release, security-review) + `scripts/facts.mjs`

### GitHub
- [x] `CODEOWNERS`, PR-template (bestanden; nog niet actief)
- [ ] Organisatie, GitHub App voor de agent, org-ruleset via custom property, Actions-instellingen
- [ ] `.github/settings/` + `scripts/check-github.mjs`, `check-spec-approval`
- [ ] `ci.yml` (`ubuntu-24.04`, mise-action, Actions op SHA, gewijzigde tests als lijst), `guard.yml` (PR-code alleen als data),
      CodeQL, osv-scanner (PR + wekelijks), Renovate

**Klaar als:** verse machine komt met `bootstrap.sh` + `pnpm dev` tot een ingelogde app zonder extern account;
CI weigert `any`, een databaseclient in `src/web`, een route buiten `defineRoute` en een gewijzigde migratie;
de bewaker houdt een afgezwakt check-script tegen; `check-github` groen; elke rol logt in via e2e.

## Fase 2 — Gouden pad (eerste app, terug naar template)

- [ ] Eerste feature met de hand door alle lagen
- [ ] `pnpm new:resource <naam>` daaruit afgeleid
- [ ] Clientfouten naar eigen tabel, `check:catalogus`

## Fase 3 — Release (per app)

- [ ] ADR: hosting en beheerde Postgres (moet eigen rollen toestaan); adapter in `deploy/<host>/`
- [ ] Lektest via de pooler van de provider; rollen per omgeving via runbook
- [ ] Staging en productie, beschermde environments, release-workflows, `check-release-ci`, `check-deployment-schema`
- [ ] Smoketest na deploy; headers/CSP op de host; CAPTCHA; PWA-manifest
- [ ] Runbooks in `docs/operations/`; back-up één keer teruggezet
