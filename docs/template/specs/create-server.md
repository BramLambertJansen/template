---
status: voorstel
namespace: create-server
---

# De serverkoppeling in core (`createServer`)

## Doel

De koppeling tussen core-onderdelen (omgeving, mail, auth, readiness, dev-login, de SPA, starten en stoppen) staat in core; `src/api/server.ts` in de app bevat alleen configuratie en registraties, zodat een wijziging aan die koppeling bij een template-update niet in elke app botst.

## Rollen en wie wat ziet

Geen wijziging: geen route, permissie of scherm verandert. Het gedrag van de draaiende server is gelijk aan nu.

## Ontwerp

- **Nu.** `src/api/server.ts` (app-zone, 63 regels) leest `env()`, bewaakt `withUser` met `guardWithUser`, maakt de SMTP-mailer en `createAuth`, bouwt de app met readiness en (alleen lokaal) de dev-login, zet er met `WEB_DIR` de SPA voor, start de server en sluit bij het stoppen de database en de auth-pool. Dat is koppeling tussen core-onderdelen; alleen de app-specifieke delen horen in de app.
- **Straks.** Core levert `createServer(config)` in `src/core/api/server.ts`. De app geeft alleen mee wat van haar is (R-LAAG-02, als argument, geen import uit de app):
  - `appName`;
  - `roles` en `seedAccounts` (voor de dev-login);
  - `invitationMail(invitation)` (de mailtekst van de app);
  - `loginRequiresMfa(withUser)` (de login-policy van de app);
  - `createServices(auth)`;
  - `buildApp(deps)`, waarbij `deps` is wat `buildApp` nu van `server.ts` krijgt: `appOrigin`, `auth` (gateway), `withUser`, `services`, `log`, `ready` en, alleen lokaal, `devLogin`.
- **Twee functies, zodat het toetsbaar is.** `composeServer(config, env)` bouwt alles en geeft `{ app, start }` terug zonder te luisteren; `createServer(config)` leest `env()` en roept `start()` aan. `src/api/server.ts` wordt: `await createServer({ … })`.
- **Vaste waarden blijven in core:** de readiness-grenzen (probe 2 s, cache 1 s), het afzenderadres `no-reply@<host van APP_ORIGIN>`, `writeJsonLine` als request-log.
- **Ongewijzigd:** `src/api/app.ts`, `kit.ts`, `services.ts`, `login-policy.ts` en de routes. `env()` blijft de enige lezer van `process.env` (R-LAAG-08).
- **R-LAAG-06 verschuift mee:** `pingDatabase()` en `closeDatabase()` worden alleen nog vanuit `src/core/api/server.ts` gebruikt in plaats van `src/api/server.ts`; de regel in `.dependency-cruiser.mjs` en de tekst van R-LAAG-06 volgen.

## Kopieer de vorm van

- `src/core/api/http/create-app.ts`: een core-functie die app-input als argument krijgt, met een test met nagebootste onderdelen.
- `src/core/api/dev/login-as.ts`: `createDevLogin(steps, { roles, seedAccounts })`.

## Hergebruik en UX

Geen schermen. Bestaande core-functies: `env`, `guardWithUser`, `createSmtpMailer`, `createAuth`, `authGateway`, `createReadiness`, `createDevLogin`, `createWebApp`, `startServer`, `closeDatabase`.

## Acceptatiecriteria

- **create-server/AC-1**: `src/api/server.ts` importeert uit core alleen `createServer` en roept geen andere core-functie aan; een test faalt als het bestand `createAuth`, `createSmtpMailer`, `createReadiness`, `createDevLogin`, `createWebApp`, `startServer`, `pingDatabase` of `closeDatabase` noemt.
- **create-server/AC-2**: Met `APP_ENV=local` krijgt `buildApp` een `devLogin`; met `test`, `staging` of `production` niet, en `POST /api/dev/login-as` geeft dan 404 (per omgeving een test).
- **create-server/AC-3**: `buildApp` krijgt `appOrigin` uit de omgeving, een `withUser` die een uitgaande aanroep binnen de transactie weigert (de bewaking van `guardWithUser`), `log` en `ready`; `GET /api/ready` bestaat op de gebouwde app.
- **create-server/AC-4**: `createAuth` krijgt `origin`, `secret`, `databaseUrl` en `clientIpHeader` uit de omgeving, `appName` van de app, `loginRequiresMfa` = wat de app teruggeeft voor de bewaakte `withUser`, en een `sendInvitation` die de mail van `invitationMail` naar de SMTP-mailer stuurt met afzender `no-reply@<host van APP_ORIGIN>`.
- **create-server/AC-5**: Zonder `WEB_DIR` is de gestarte app de API; met `WEB_DIR` de web-app eromheen (een bestaand bestand uit de map wordt geserveerd, `/api/health` blijft de API).
- **create-server/AC-6**: `start()` luistert op `API_HOST` en `API_PORT` met `SHUTDOWN_TIMEOUT_MS`; bij het stoppen worden de database en de auth-pool beide gesloten.
- **create-server/AC-7**: Core importeert niets uit de app (`pnpm ratchet`, dependency-cruiser); `pingDatabase` en `closeDatabase` worden alleen in `src/core/api/server.ts` geïmporteerd, en de bestaande regel die dat bewaakt faalt bij een import elders.
- **create-server/AC-8**: Alle bestaande tests blijven ongewijzigd groen, ook `pnpm ui:check` (e2e tegen de echte server) en de job `image`.

## Raakt ook

- Risicowerk: de koppeling bepaalt of de dev-login bestaat (alleen lokaal) en welke geheimen en adressen auth krijgt. Aparte tester.
- Nieuw: `src/core/api/server.ts`, `src/core/api/server.test.ts`. Gewijzigd: `src/api/server.ts`, `.dependency-cruiser.mjs` (de regel voor `pingDatabase`/`closeDatabase`), `docs/framework.md` R-LAAG-06 en R-LAAG-02 (compositie-roots) met hun spiegels in `.claude/rules/`, `AGENTS.md` (noemt `src/api/server.ts` als ingang), ADR 0040 (regel: de app-zone bevat configuratie en registraties, geen koppeling tussen core-onderdelen), `CHANGELOG.md` (release-notitie: een app vervangt haar `server.ts`).
- `Dockerfile`, `package.json` (`pnpm start`) en `scripts/dev.mjs` blijven `src/api/server.ts` starten.
- Tests die het pad `src/api/server.ts` als beschermd pad noemen (`test/hooks`, `test/rails`) veranderen niet: het bestand blijft bestaan.

## Buiten scope

Accountbeheer als core-module (ST-17); de achtergrondtaken (`startJobs`, ST-03); een opstartcontrole voor `app_jobs`.

## Open vragen

- **OV-1**: Naam en plek: `createServer` in `src/core/api/server.ts`. Aanbeveling: zo, naast `createApp` in `src/core/api/http/create-app.ts`.
- **OV-2**: Moet `createServer` ook `closeDatabase` en de auth-pool sluiten als het starten zelf mislukt (poort bezet)? Nu gebeurt dat niet. Aanbeveling: gedrag gelijk houden; geen wijziging in deze PR.
