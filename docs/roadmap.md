# Roadmap

Afgeleid uit [plan.md](plan.md), "Fasering". Vink af in de PR die het onderdeel oplevert.
Uren zijn de schatting uit het plan.

## Fase 0 — Bewijs (4–8 u)

- [ ] Gratis Supabase-project; verbinden via Supavisor (transaction mode) als `api_user` met `pg`.
- [ ] Lektest zoals eerder met PgBouncer: nul lekken, geen toegang buiten `withUser()`.
- [ ] Uitkomst vastleggen in `docs/adr/0002-datapad-supavisor.md`. Faalt het: eerst datapad herontwerpen.

## Fase 1 — Fundament, lokaal (130–175 u)

### Machine en repo (~10 u)
- [ ] `scripts/bootstrap.sh`, `scripts/doctor.sh` (versies, inotify, sandbox, Docker, jq)
- [ ] `pnpm dev`: Docker-check, `supabase start` (afgeslankt), `.env.local` uit `supabase status`, Hono :8787 + Vite :5173 met proxy
- [x] `mise.toml`, `.gitattributes`, `.editorconfig`, browserslist in `package.json`
- [ ] `.vscode/`, `.devcontainer/`

### Checks (~22 u)
- [ ] `tsconfig` (strict-opties uit het plan), TypeScript 6.0.x gepind
- [ ] ESLint strictTypeChecked + projectregels (imports, `as`, apparaatdetectie, focusregel, functielengte)
- [ ] dependency-cruiser (web ↛ api behalve `AppType`; alleen `src/api/db` raakt Drizzle/pg; shared importeert niets; geen cycles)
- [ ] lefthook (pre-commit, pre-push), gitleaks
- [ ] `check-migrations`, smalle `check-docs`, bundelbudget (size-limit)
- [ ] `gate:fast`, `gate:slow` (squawk, `supabase db lint`, snapshot zonder verschil, e2e)

### Secure route en database (~26 u)
- [ ] `defineRoute()` met `ctx.actor`, getypte client (`AppType`)
- [ ] `withUser()` met foutvertaling (23505/23503/42501 → domeincodes)
- [ ] Drizzle-schema gegenereerd + brands-script, `ids.ts`
- [ ] Foutcoderegister, `limits.ts`, `assert()`, `unsafeCast()`
- [ ] Expliciete grants, `search_path = ''`, pgTAP-rechteninvariant, `check-policies`, schema-snapshot
- [ ] Smoketest: browser kan niet bij Data API, Storage, Realtime
- [ ] Racetests-patroon

### Auth en rollen (~20 u)
- [ ] Inloggen via `@supabase/auth-js`, JWT-verificatie (JWKS, allowlist, iss/aud/exp)
- [ ] `user_roles`, `can()`, sessiecheck voor admin
- [ ] MFA (aal2) voor admin met inschrijfscherm
- [ ] Seed met testgebruikers per rol, Mailpit

### Frontend-basis (~19 u)
- [ ] TanStack Router met guards + ErrorBoundary per route
- [ ] API-client (token, één retry bij 401, `ApiError`)
- [ ] `AsyncView`, `<Form>`/`<FormField>`, formatters (datum, `Cents`)
- [ ] Tokens in drie lagen, shadcn-basiskit: Button, Input, Field, Card, Dialog (44 px + focusring in recepten)
- [ ] Contrasttest over recepten, `scanAxe`, woordenlijsttest, `/design-system` alleen in dev

### Agent-opzet (~22 u)
- [x] `AGENTS.md`, `CLAUDE.md` (eerste versie), spec-sjabloon, DoD
- [ ] Padregels in `.claude/rules/`, skills met live feiten (`scripts/facts.mjs`)
- [ ] Subagents tester (sonnet) en reviewer (opus)
- [ ] Hooks: lint-na-bewerking, guard-files, readonly-bash, stop, subagent-stop, tester-paden, sessie-context
- [ ] `.claude/settings.json`: ask op checks, sandbox met `excludedCommands` (deny-regels staan er al)

### GitHub (~17 u)
- [ ] Organisatie + bot-account met fijnmazig token (geen workflows-recht)
- [ ] `.github/settings/main-protection.json` + `scripts/check-github.mjs`
- [x] `CODEOWNERS`, PR-template
- [ ] `ci.yml`, `guard.yml` (vanaf main), `codeql.yml`, osv-scanner, `check-release-ci`

**Klaar als:** verse laptop komt met `bootstrap.sh` + `pnpm dev` tot een ingelogde app zonder extern account;
CI weigert `any`, een databaseclient in `src/web`, een route buiten `defineRoute` en een gewijzigde migratie;
de bewaker houdt een afgezwakt check-script tegen; `check-github` groen; smoketest groen; elke rol logt in via e2e.

## Fase 2 — Eerste features (40–60 u)

- [ ] Gouden pad: eerste feature met de hand door alle lagen
- [ ] `pnpm new:resource <naam>` afgeleid uit het gouden pad
- [ ] Clientfouten naar eigen tabel (`reportClientError()`), `check:catalogus`
- [ ] Twee features via de werkstraat

## Fase 3 — Eerste release (25–40 u)

- [ ] Supabase staging (gratis) + productie (Pro), twee Vercel-projecten, beschermde environments
- [ ] `release-staging.yml`, `release-production.yml`, `check-deployment-schema`
- [ ] CSP op echt domein, PWA-manifest, `docs/operations/runbook.md` en `backup-restore.md`
- [ ] Back-up één keer teruggezet in lokale stack
