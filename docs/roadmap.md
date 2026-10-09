# Roadmap

Uitwerking van [framework.md](framework.md) §12. Vink alleen af met bewijs (checkuitslag of test) in de PR.
Fase 0 en 1 horen in de template; fase 2 levert verbeteringen terug aan de template; fase 3 is per app.
Review van 2026-10-09: [reviews/2026-10-09-fundering.md](reviews/2026-10-09-fundering.md).

## Beslissingen

- [x] Provider-neutraal — ADR 0002
- [x] Auth in de API met Better Auth, sessiebeleid en MFA — ADR 0003
- [x] Postgres 17, rollen, dbmate, pgTAP — ADR 0004
- [x] Node 26, pnpm 11, TypeScript 6.0, GitHub App, toon van de regels — ADR 0005
- [x] App uit de template: koppeling, merge-commits voor updates, ADR-nummers, tussentijdse ruleset — ADR 0006
- [ ] CSRF-controle en testmatrix — ADR 0007 (voorgesteld)
- [ ] Grens tussen core en app — ADR 0008 (voorgesteld)
- [ ] Tests buiten de sandbox — ADR 0009 (voorgesteld)

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
- [ ] Uitkomst in een ADR "Datapad" (volgende vrije nummer in `docs/adr/`)

## Fase 1 — Fundament

Zes verticale stukken, in deze volgorde; elk stuk is één branch en één PR (een spec, waar nodig, in een eigen PR ervoor).
Een stuk is klaar als elk punt onder **Klaar als** met een checkuitslag of testuitvoer in de PR staat.
Core-onderdelen komen in `src/core/`, app-code en de referentie-feature in `src/{api,web,shared}` (ADR 0008).

### 1. Skelet

- [x] `mise.toml`, `.gitattributes`, `.editorconfig`, browserslist, `pnpm-workspace.yaml`, `.env.example` (bestanden staan er; nog niet in gebruik)
- [x] `docs/nieuwe-app.md`: setup-playbook voor Claude Code (machine → repo → koppeling → stack → databasebewijs)
- [ ] `tsconfig` (flags uit framework §4), TypeScript `~6.0.3`
- [ ] Vite + React in `src/web`, Hono in `src/api` met `src/api/server.ts` (:8787), Vite-proxy `/api`, headers/CSP in Vite
- [ ] Eén publieke route `GET /api/health` (uitzondering in framework §3) en een pagina die hem toont
- [ ] ESLint 10 flat config: strictTypeChecked, `consistent-type-assertions: never`, `switch-exhaustiveness-check`; Prettier; Vitest
- [ ] `scripts/bootstrap.sh`, `scripts/doctor.sh` (versies, inotify, sandbox, Docker, jq, bubblewrap; `--quick` voor de SessionStart-hook)
- [ ] dbmate (gepind) via script
- [ ] `pnpm dev`: Docker-check, `.env.local`, `compose --env-file .env.local up --build --wait`, migraties, Hono :8787 + Vite :5173 (met headers/CSP)
- [ ] lefthook (pre-commit: format, lint op staged, gitleaks gepind; pre-push: `gate:fast`)
- [ ] `gate:fast` (eerste versie: lint, typecheck, unit)
- [ ] `ci.yml` (`ubuntu-24.04`, mise-action, Actions op SHA, `permissions: read-all`, concurrency) met job `gate:fast`

**Klaar als:** `pnpm gate:fast` groen (uitvoer); pre-commit houdt een commit met `any` of `as` tegen (uitvoer);
CI-job `gate:fast` groen op de PR; de eigenaar bevestigt dat `pnpm dev` op een verse machine de pagina met `/api/health` toont.

### 2. Auth

Spec eerst (migraties en routes).
- [ ] Better Auth (gepind) in `src/core/api/auth`: tabellen via `auth generate` → migratie, `__Host-`-cookie, sessiebeleid, rate limit in database
- [ ] `session_strength` als sessieveld, gezet in een after-hook op 2FA-verificatie, doorgegeven aan `withUser()`
- [ ] Inloggen, aanmelden, reset, e-mailverificatie via Mailpit; geen account-enumeratie
- [ ] MFA met inschrijfscherm; admins zonder magic link en zonder `trustDevice`
- [ ] CSRF-middleware (testmatrix uit ADR 0007), `bodyLimit`, `secureHeaders()`, `onError` met `{ code, requestId }`
- [ ] Env-schema weigert waarden uit `.env.example` als `APP_ORIGIN` niet localhost is (framework §6)
- [ ] `scripts/seed` via de auth-API: gebruiker per rol, admin met vast lokaal TOTP-geheim

**Klaar als:** één test per rij van de CSRF-matrix groen; test dat een ingetrokken sessie bij de volgende request 401 geeft;
test dat een admin-sessie zonder MFA geen `mfa`-sterkte heeft; test dat de Better Auth-client bij sign-out `Content-Type: application/json`
stuurt; env-test met de demo-`AUTH_SECRET` en een niet-lokale `APP_ORIGIN` faalt bij opstart; e2e-inlog per rol tegen de echte stack groen.

### 3. Secure route en gebruikersbeheer (referentie-feature)

Spec eerst. Gebruikersbeheer is het voorbeeld waar agents van kopiëren: gebruiker beheert eigen profiel en sessies;
admin (MFA verplicht) zoekt gebruikers met cursor-paginering, kent rollen toe en trekt ze in, blokkeert gebruikers.
- [ ] Eerste feature met de hand door alle lagen (uit fase 2: dit is die feature)
- [ ] `defineRoute()` met `ctx.actor`, getypte client (`AppType`), types per resource
- [ ] `withUser()` met foutvertaling; Drizzle-introspectie + brands-script
- [ ] Foutcoderegister, `limits.ts`, `assert()`, `unsafeCast()`, `Cents`, cursor-contract — met uitbreiding door de app (ADR 0008)
- [ ] `user_roles` (FK naar `auth."user"`), `can()` met permissietabel van de app, MFA-eis in `can()` én RLS-helper, admin-test zonder MFA
- [ ] pgTAP-invarianten (RLS geforceerd, geen TRUNCATE/REFERENCES/TRIGGER, `auth` dicht), racetest-patroon
- [ ] TanStack Router met guards + ErrorBoundary; API-client (401 → inloggen, `ApiError`)
- [ ] `AsyncView`, `<Form>`/`<FormField>`, `lib/format.ts`, `lib/env.ts`
- [ ] Tokens in drie lagen, `@custom-variant dark`, basiskit Button, Input, Field, Card, Dialog (+ codemod)
- [ ] Contrasttest over recepten, `scanAxe`, woordenlijsttest, `/design-system` alleen in dev
- [ ] Testkit in `src/core`: `asUser(rol)`, factories, savepoint per test
- [ ] `docs/gouden-pad.md` (≤ 1 pagina) met verwijzingen naar de bestanden van deze feature

**Klaar als:** unit, pgTAP (elke policy op naam plus de invarianten), integratie, racetest "rol toekennen", e2e per rol en axe op 375 en
1280 px groen (uitvoer); een test per verboden rol per route; een test bewijst dat een app een permissie, foutcode en componentvariant
toevoegt zonder `src/core` te wijzigen.

### 4. Rails afdwingen

Elke regel uit `AGENTS.md` die een check kan zijn, wordt een check; een check telt pas met een fixture die bewijst dat hij faalt.
- [ ] ESLint-restricties: `no-restricted-syntax` (elementen, `SET ROLE`, `set_config(…, false)`), `no-restricted-imports`, sonarjs,
      better-tailwindcss, functielengte, max-params, max-depth
- [ ] dependency-cruiser (lagen en uitzonderingen uit framework §2–§3, core → app verboden, geen cycles)
- [ ] `check-migrations`, `check-docs` (incl. gelijke beschermde-padenlijsten), `check-secdef`, `check-policies`, `check-core`, bundelbudget
- [ ] `gate:fast` definitief, `gate:slow` (squawk, snapshot `pg_dump -N tap` zonder verschil, `check-policies`, e2e)
- [ ] Scripts uit `excludedCommands` (`test:db`, `db:reset`, `db:types`, `ui:check`, `gate:slow`) bestaan in `package.json`, uitgevoerd volgens ADR 0009
- [ ] CI: `gate:slow`-job, gewijzigde tests als lijst, `guard.yml` (PR-code alleen als data), CodeQL, osv-scanner (PR + wekelijks),
      Renovate (gegroepeerd, blokkeert TS 7)

**Klaar als:** tabel in de PR met per regel uit `AGENTS.md` de check en de fixture-test die bewijst dat hij faalt (alle fixture-tests groen);
CI weigert `any`, een databaseclient in `src/web`, een route buiten `defineRoute` en een gewijzigde migratie (uitvoer);
de bewaker houdt een afgezwakt check-script tegen; regels zonder check staan met reden als roadmap-item.

### 5. Agent-opzet

- [x] `AGENTS.md`, `CLAUDE.md`, padregels, spec-sjabloon, DoD (tekst; nog niet afgedwongen)
- [ ] `.claude/settings.json` bewezen: sandbox start op Ubuntu/WSL2 (bubblewrap, socat), deny-regels getest
- [ ] Hooks uit framework §8 (incl. git-guard en guard-files voor bestaande tests), elk met timeout
- [ ] Subagents tester (sonnet) en reviewer (opus) met frontmatter-hooks
- [ ] Skills (spec, nieuw-route, nieuw-scherm, nieuw-component, migratie, release, security-review) + `scripts/facts.mjs`
- [ ] `pnpm new:resource <naam>` afgeleid uit het gouden pad (uit fase 2)

**Klaar als:** per hook een script dat hem met voorbeeld-invoer aanroept en de exitcode controleert (blokkeert wat moet, laat door wat mag), groen;
code uit `pnpm new:resource` haalt `gate:fast`; drie testopdrachten door de hele werkstraat met per opdracht: ingegrepen hook of check, aantal beurten, correcties van de eigenaar.

### 6. GitHub

- [x] `CODEOWNERS`, PR-template (bestanden; nog niet actief)
- [ ] Organisatie, GitHub App voor de agent, org-ruleset via custom property, Actions-instellingen
      (daarna in de ruleset: code-owner-review en 1 goedkeuring aan; private repo's vragen Pro/Team)
- [ ] `.github/settings/` + `scripts/check-github.mjs`, `check-spec-approval`
- [ ] Pushen met het App-token zonder het token van de eigenaar in de agent-omgeving (`docs/operations/`)

**Klaar als:** `check-github` groen; een test-PR van de bot is zonder review van de eigenaar niet te mergen; een push naar `main` wordt geweigerd.

**Fase 1 klaar als:** verse machine komt met `bootstrap.sh` + `pnpm dev` tot een ingelogde app zonder extern account;
CI weigert `any`, een databaseclient in `src/web`, een route buiten `defineRoute` en een gewijzigde migratie;
de bewaker houdt een afgezwakt check-script tegen; `check-github` groen; elke rol logt in via e2e.

## Fase 2 — Eerste app, terug naar template

Eerste feature en `new:resource` zijn naar fase 1 verplaatst (stuk 3 en 5).
- [ ] Clientfouten naar eigen tabel, `check:catalogus`
- [ ] Elke fout die in een app doorglipt, wordt eerst een check of regel in de template (met fixture), daarna gerepareerd in de app

## Fase 3 — Release (per app)

- [ ] ADR `0100`+: hosting en beheerde Postgres (moet eigen rollen toestaan); adapter in `deploy/<host>/`
- [ ] Lektest via de pooler van de provider; rollen per omgeving via runbook
- [ ] Staging en productie, beschermde environments, release-workflows, `check-release-ci`, `check-deployment-schema`
- [ ] Smoketest na deploy; headers/CSP op de host; CAPTCHA; PWA-manifest
- [ ] Runbooks in `docs/operations/`; back-up één keer teruggezet
