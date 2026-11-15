---
status: gebouwd # #722
namespace: create-server
---

# De serverkoppeling in core (`runServer`)

## Doel

De koppeling tussen core-onderdelen (omgeving, mail, auth, readiness, dev-login, de SPA, starten en stoppen) staat in core; `src/api/server.ts` in de app bevat alleen configuratie en registraties, zodat een wijziging aan die koppeling bij een template-update niet in elke app botst.

## Rollen en wie wat ziet

Geen wijziging: geen route, permissie of scherm verandert. Het gedrag van de draaiende server is gelijk aan nu.

## Ontwerp

- **Nu.** `src/api/server.ts` (app-zone, 63 regels) leest `env()`, bewaakt `withUser` met `guardWithUser`, maakt de SMTP-mailer en `createAuth`, bouwt de app met readiness en (alleen lokaal) de dev-login, zet er met `WEB_DIR` de SPA voor, start de server en sluit bij het stoppen de database en de auth-pool.
- **Straks.** Core levert `runServer(config)`. De app geeft alleen mee wat van haar is (R-LAAG-02: als argument, core importeert niets uit de app):
  - `appName`;
  - `devLogin: { roles, seedAccounts }` als één veld van het type `DevLoginConfig<Name>`, zodat TypeScript blijft afdwingen dat elke rol een seed-account heeft;
  - `invitationMail(invitation)` (de mailtekst van de app);
  - `loginRequiresMfa(withUser)` (de login-policy van de app);
  - `createServices(auth)`;
  - `buildApp(deps)`, met `deps: ServerAppDeps<Services>` = wat `buildApp` nu van `server.ts` krijgt: `appOrigin`, `auth` (gateway), `withUser`, `services`, `log`, `ready` en, alleen lokaal, `devLogin` (anders afwezig, niet `undefined`).
- **Toetsbaar door injectie.** `src/core/api/db/index.ts` roept bij het importeren `env()` aan en maakt een pool; een module die dat importeert is zonder volledige omgeving niet te testen. Daarom twee modules:
  - `src/core/api/server/compose.ts`: `composeServer(config, env, parts)` bouwt alles en geeft `{ app, start }` terug zonder te luisteren. `parts = { withUser, pingDatabase, closeDatabase, createAuth, createMailer, startServer }`. Deze module importeert `#core/api/db` niet.
  - `src/core/api/server.ts`: `runServer(config)` leest `env()`, vult `parts` met de echte onderdelen en roept `start()` aan. `src/api/server.ts` wordt: `await runServer({ … })`.
- **Eén auth-instantie.** `createServices`, de gateway, `devAuthSteps` (dev-login) en het sluiten van de pool gebruiken dezelfde `auth`.
- **Vaste waarden blijven gelijk en in core:** readiness met een probe van 2 s en een cache van 1 s, het afzenderadres `no-reply@<host van APP_ORIGIN>`, `writeJsonLine` als request-log.
- **Ongewijzigd:** `src/api/app.ts`, `kit.ts`, `services.ts`, `login-policy.ts` en de routes. `env()` blijft de enige lezer van `process.env` (R-LAAG-08).
- **R-LAAG-06.** De regel zegt nu dat `pingDatabase()` en `closeDatabase()` alleen vanuit `src/api/server.ts` gebruikt worden; geen check dwingt dat af (dependency-cruiser werkt per module, niet per exportnaam). De plek wordt `src/core/api/server.ts`, en een lintregel dwingt het voortaan af (AC-11).

## Kopieer de vorm van

- `src/core/api/http/create-app.ts`: een core-functie die app-input als argument krijgt, met een test met nagebootste onderdelen.
- `src/core/api/dev/login-as.ts`: `createDevLogin(steps, { roles, seedAccounts })` en het type `DevLoginConfig<Name>`.

## Hergebruik en UX

Geen schermen. Bestaande core-functies: `env`, `guardWithUser`, `createSmtpMailer`, `createAuth`, `authGateway`, `createReadiness`, `createDevLogin`, `devAuthSteps`, `createWebApp`, `startServer`, `closeDatabase`.

## Acceptatiecriteria

De core-test (`src/core/api/server/compose.test.ts`) gebruikt nagebootste `parts`, een `env`-object en een `buildApp` die een core-`createApp` gebruikt; geen database, geen open poort, geen import uit de app.

- **create-server/AC-1**: `src/api/server.ts` importeert uit core alleen `runServer`. Een test in `test/rails/` leest het bestand en faalt als het `createAuth`, `createSmtpMailer`, `createReadiness`, `createDevLogin`, `createWebApp`, `startServer`, `pingDatabase`, `closeDatabase` of `env(` bevat.
- **create-server/AC-2**: Met `appEnv` `local` krijgt `buildApp` een `devLogin` en geeft `POST /api/dev/login-as` op de samengestelde app geen 404; met `test`, `staging` en `production` ontbreekt de sleutel `devLogin` in `deps` en geeft de route 404 (per omgeving een geval).
- **create-server/AC-3**: `buildApp` krijgt `appOrigin` = `APP_ORIGIN`, een `withUser` die een uitgaande aanroep binnen de transactie weigert (de bewaking van `guardWithUser` om `parts.withUser`), `log` = `writeJsonLine`, en `ready`; `GET /api/ready` geeft 200 als `parts.pingDatabase` slaagt en 503 als hij faalt.
- **create-server/AC-4**: De nagebootste `createAuth` krijgt precies: `origin` = `AUTH_BASE_URL`, `secret` = `AUTH_SECRET`, `databaseUrl` = `AUTH_DATABASE_URL`, `clientIpHeader` = `CLIENT_IP_HEADER`, `appName` van de app, `loginRequiresMfa` = wat de app teruggeeft voor de bewaakte `withUser`, `sendMail` = de mailer, en een `sendInvitation` die de uitkomst van `invitationMail(invitation)` naar dezelfde mailer stuurt.
- **create-server/AC-5**: `parts.createMailer` wordt aangeroepen met `SMTP_URL` en het afzenderadres `no-reply@<host van APP_ORIGIN>`.
- **create-server/AC-6**: `createServices`, de gateway in `deps.auth`, de dev-login en het sluiten bij het stoppen gebruiken dezelfde `auth`-instantie die `createAuth` teruggaf.
- **create-server/AC-7**: Zonder `WEB_DIR` is de app die `start()` doorgeeft de API; met `WEB_DIR` (een tijdelijke map) serveert hij een bestand uit die map en blijft `/api/health` de API (via `app.fetch`, zonder poort).
- **create-server/AC-8**: `start()` roept `parts.startServer` aan met `host` = `API_HOST`, `port` = `API_PORT` en `shutdownTimeoutMs` = `SHUTDOWN_TIMEOUT_MS`; `onStopped()` roept `parts.closeDatabase` en `auth.closePool` beide aan.
- **create-server/AC-9**: Core importeert niets uit de app (`pnpm ratchet`); `src/core/api/server/compose.ts` importeert `#core/api/db` niet (een test of dependency-cruiser-regel faalt als dat wel gebeurt).
- **create-server/AC-10**: Alle bestaande tests blijven ongewijzigd groen. Dat de echte onderdelen in `runServer` goed zijn aangesloten, bewijzen `pnpm ui:check` (e2e tegen de echte server, met inloggen, uitnodigen en de dev-login) en de job `image`; dat kan geen unit-test.
- **create-server/AC-11**: Een ESLint-regel (`no-restricted-imports` op de namen `pingDatabase` en `closeDatabase`) weigert een import van die twee buiten `src/core/api/server.ts` en `src/core/api/db/**`; een fixture-test laat zien dat een import elders faalt en dat de toegestane plekken slagen.

## Raakt ook

- Risicowerk: de koppeling bepaalt of de dev-login bestaat (alleen lokaal) en welke geheimen en adressen auth krijgt. Aparte tester.
- Lint: de regel van AC-11 in `eslint.config.js` (beschermd pad) met een fixture onder `test/rails/`.
- Nieuw: `src/core/api/server.ts`, `src/core/api/server/compose.ts`, `src/core/api/server/compose.test.ts`, de test van AC-1. Gewijzigd: `src/api/server.ts`.
- Commentaar dat `src/api/server.ts` als plek van de koppeling noemt en onwaar wordt: `src/core/api/auth/auth.ts`, `src/core/api/db/index.ts`, `src/core/api/dev/login-as.ts`, `src/core/api/http/serve.ts`, `src/core/api/env.ts`.
- Docs: `docs/framework.md` R-LAAG-06 en R-LAAG-02 met hun spiegels in `.claude/rules/`, `AGENTS.md` (noemt `src/api/server.ts` als ingang), ADR 0040 (regel erbij: de app-zone bevat configuratie en registraties, geen koppeling tussen core-onderdelen; de merge van deze PR is dat besluit), `CHANGELOG.md` (release-notitie: een app vervangt haar `server.ts`).
- `Dockerfile`, `package.json` (`pnpm start`) en `scripts/dev.mjs` blijven `src/api/server.ts` starten. Tests die het pad als beschermd pad noemen veranderen niet: het bestand blijft bestaan, en de keuze voor de dev-login verhuist naar `src/core/**`, dat net zo beschermd is.

## Buiten scope

Accountbeheer als core-module; de achtergrondtaken (`startJobs`); een opstartcontrole voor `app_jobs`; sluiten van de pools als het starten zelf mislukt.

## Open vragen

Geen. Besloten door de eigenaar op 2026-11-15:

- **OV-1**: de functie heet `runServer` (geen verwarring met `createServer` uit `node:http`, dat `serve.ts` gebruikt); de spec en de AC-id's houden de naam `create-server`.
- **OV-2**: het gedrag bij een mislukte start blijft gelijk; sluiten van de pools is een eigen PR.
- **OV-3**: een ESLint-regel dwingt R-LAAG-06 af (zie AC-11).
