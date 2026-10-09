# Framework

Normatief. Dit document is de wet voor elke app die uit deze template start.
Wijzigen alleen via een PR met ADR, met review door de eigenaar.

## 1. Principes

1. **De fout onmogelijk maken, niet verbieden.** De browser heeft geen databaseclient; de databasemodule
   exporteert alleen `withUser()`; een route bestaat alleen via `defineRoute()`. Wat het typesysteem afdwingt, hoeft geen regel te zijn.
2. **Afdwingen boven afspreken.** Wat niet onmogelijk te maken is, blokkeert een check in CI. CLAUDE.md, skills
   en hooks sturen en geven snelle feedback; de harde grens ligt in CI en op GitHub.
3. **Eén bron per feit.** Migraties voor het datamodel, zod-schema's voor contracten, één CSS-laag voor tokens, één script per check.
4. **Lokaal is gelijk aan productie.** Dezelfde Postgres-versie (exact gepind in `db/docker/Dockerfile`, gelijk aan de beheerde database van de app), dezelfde rollen, grants, RLS, migraties en checks.
5. **Rails groeien met bewijs.** Een check of regel komt erbij als een fout aantoonbaar doorglipte. De eigenaar reviewt elke PR en releaset.
6. **Provider-neutraal.** De template kent geen hostingprovider en geen database-as-a-service. Een app kiest die per
   ADR (zie §3); de code raakt de keuze alleen via een adapter.

## 2. Architectuur

Eén repository, één pakket, drie lagen in twee zones, bewaakt door dependency-cruiser (ook: geen cycles).

**Zones** (ADR 0008): `src/core/{api,web,shared}` is van de template — beschermd, in een app alleen gewijzigd door een template-merge.
App-code staat in `src/{api,web,shared}`. App mag core importeren; core importeert nooit app. Wat core van de app nodig heeft
(permissies, foutcodes, routes, env-uitbreiding, `AppType`), krijgt het als argument van een compositie-root in de app
(`src/api/app.ts`, `src/api/kit.ts`, `src/web/lib/api.ts`). Een app breidt uit door te registreren, nooit door core te wijzigen.

| Laag | Map (core / app) | Mag importeren | Mag nooit |
|---|---|---|---|
| Frontend (Vite + React SPA) | `src/core/web` / `src/web` | `src/core/shared`, `src/shared`, het type `AppType` uit `src/api`, `better-auth/react` alleen in `src/core/web/lib/auth.ts` | databasedriver, ORM, `process.env`, `import.meta.env` buiten `src/core/web/lib/env.ts`, andere code uit `src/api` of `src/core/api` |
| API (Hono) | `src/core/api` / `src/api` | `src/core/shared`, `src/shared` | `src/web`, `src/core/web` |
| Gedeeld | `src/core/shared` / `src/shared` | alleen libraries (zod) en `src/core/shared` | `web`, `api` (beide zones) |
| Database-toegang | `src/core/api/db` | driver (`pg`) en Drizzle — als enige | iets anders exporteren dan `withUser()` |
| Auth | `src/core/api/auth` | Better Auth met eigen verbinding als `auth_service`, alleen schema `better_auth` (ADR 0010) | data buiten `better_auth` lezen of schrijven |

Plaats per onderdeel (`defineRoute`, `withUser`, auth, CSRF, foutafhandeling, logging, env, API- en auth-client, `AsyncView`, `Form`,
UI-kit en tokens, `format`, `assert`, `unsafeCast`, `Cents`, cursor, branded IDs, foutcodes, `can()`, limieten) en hoe een app elk
uitbreidingspunt gebruikt: ADR 0008.

- De browser praat alleen met de API, same-origin via `/api`. Lokaal proxyt Vite (:5173) `/api` naar Hono (:8787).
- De Hono-app is host-onafhankelijk. Ingangen: `src/api/server.ts` (Node, lokaal en containerhosts) en per gekozen
  host één adapterbestand in `deploy/<host>/`. Een adapter importeert de app en doet verder niets.
- Geen server-rendering: alle schermen zitten achter een login.
- Prestaties: API en database in dezelfde regio; kleine pool op moduleniveau;
  geen opeenvolgende queries per request; databasetijd per request in de log; bundelbudget (size-limit); routes lazy.

## 3. Poorten en adapters

| Poort | Template levert | Per app te kiezen (ADR) | Voorbeeld |
|---|---|---|---|
| Postgres | Postgres 17 + pgTAP in Docker (`compose.yaml`), rollen via `db/init/`, migraties met dbmate | Beheerde Postgres | Supabase, Neon, RDS |
| Frontend + API hosting | `vite build` (statisch) + `src/api/server.ts` | Host + adapter in `deploy/<host>/` | Vercel, Cloudflare, Fly |
| Auth | Better Auth in de API op de eigen Postgres (ADR 0003) | Alleen bij ADR: externe provider | — |
| E-mail | Mailpit in Docker | SMTP-dienst | — |
| Fouttracking | Eigen tabel via `reportClientError()` | Optionele dienst | Sentry |

Regels voor elke keuze:
- De database is altijd gewoon Postgres. Geen provider-specifieke functies (`auth.uid()`, Data API, Storage-policies)
  in migraties of code. De gebruiker komt uit `app.current_user_id()`, gezet door `withUser()`.
- Biedt de provider een directe data-API aan de browser (zoals Supabase Data API, Storage of Realtime), dan staat die uit.
  Een smoketest bewijst met een echte gebruikerssessie dat de browser er niet bij kan.
- Geen provider-SDK in `src/web`. In `src/api` alleen in `deploy/<host>/` of een adapter die een ADR toestaat.

### Uitzonderingen (limitatief)

| Regel | Uitzondering | Waarom |
|---|---|---|
| Alleen `src/core/api/db` raakt `pg` | `src/core/api/auth` (als `auth_service`, alleen schema `better_auth`) | Better Auth beheert zijn eigen tabellen |
| Elke route via `defineRoute` | `/api/auth/*` (Better Auth-handler) en de clientfouten-route (ADR 0003) | De library levert de auth-routes; de clientfouten-route werkt zonder actor |
| Elke route vraagt login | `/api/auth/*` (inloggen, aanmelden, reset), de clientfouten-route en `GET /api/health` | Bestaan juist voor niet-ingelogden; elk met rate limit; health geeft alleen `{ ok }`, geen data |
| Elke schermroute heeft een `can()`-guard | Inlog-, aanmeld- en resetschermen | Publiek; ze tonen geen data |
| Spec vóór een nieuwe route | `GET /api/health` en de pagina die hem toont (skelet) | Bestaat vóór `defineRoute`; vervalt zodra het skelet een ingelogde startpagina heeft |

## 4. Codeerkaders

Alle lintregels op `error`; CI draait met `--max-warnings 0`. Checks op code gebruiken de AST (ESLint,
dependency-cruiser); checks op de database lezen de catalogus van de lokale database (`pg_policies`, `pg_proc`,
`information_schema`), nooit een regex over bronbestanden.

- **Lintmeldingen zijn instructies**: `no-restricted-imports`/`no-restricted-syntax` noemen de juiste helper.
- **Kleine eenheden**: max-lines-per-function 60 (`.ts`) / 120 (`.tsx`); sonarjs cognitive-complexity 15; max-params 3; max-depth 3.
- **Parse op elke grens**: zod via `defineRoute()` voor request en response (`.strict()`); env-schema in `src/core/api/env.ts`, de enige plek met `process.env` (de app levert alleen haar uitbreiding in `src/api/env.ts`).
- **Geen casts**: type-assertions (`x as T`, `<T>x`) zijn verboden (`consistent-type-assertions: never`); `as const` en `import { a as b }` mogen; `unsafeCast(value, reden)` in `src/core/shared` is de enige uitweg. CI zet het verschil in aantal op de PR.
- **`assert(cond, msg)`** in `src/core/shared`, actief in productie en gemeld aan de fouttracking; in de frontend vangt een ErrorBoundary per route hem op.
- **Types per resource** apart geëxporteerd uit de API, zodat de TypeScript-server niet trager wordt naarmate routes groeien.
- **Branded IDs** (`UserId`) via zod `.brand()`; een script na schema-introspectie zet `$type<UserId>()` terug.
- **Modules en aliassen**: aliassen via `imports` in `package.json` (`#core/*` → `./src/core/*`, `#api/*`, `#web/*`, `#shared/*`),
  zodat Node, Vite, Vitest en TypeScript dezelfde bron lezen. Hoe Node `src/api/server.ts` draait (native type stripping of een
  loader) en de bijbehorende tsconfig-flags legt het skelet vast en bewijst `pnpm dev`.
- **TypeScript streng**: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noFallthroughCasesInSwitch`,
  `noImplicitOverride`, `verbatimModuleSyntax`, `erasableSyntaxOnly`, `moduleResolution: bundler`, `types` expliciet per tsconfig;
  typescript-eslint `strictTypeChecked` plus `switch-exhaustiveness-check` (staat daar niet in). TypeScript `~6.0.3` (ADR 0005).
- **ESLint 10**: verboden elementen via `no-restricted-syntax` op `JSXOpeningElement` (eslint-plugin-react ondersteunt ESLint 10 niet).
- **Geen sessielek in de database**: lint verbiedt `SET ROLE`, `set_config(…, false)` en `set_config`/`current_setting` buiten
  `src/core/api/db`; `withUser()` controleert aan het begin van elke transactie `current_user = session_user` en een test controleert het na elke request.

### Feedbacklus

| Moment | Wat | Duur |
|---|---|---|
| Na elke bewerking (PostToolUse-hook) | ESLint + Prettier op dat bestand | ~1–2 s |
| Pre-commit (lefthook) | format, ESLint op staged, gitleaks | < 10 s |
| Einde beurt (Stop-hook) | `tsc --incremental`, ESLint `--cache`, `vitest --changed` (alleen het unit-project) | ~10–30 s |
| Database-tests | `pnpm test:db`: integratie + pgTAP tegen lokale Postgres | ~20–60 s |
| Pre-push | `gate:fast` | < 60 s |
| CI | `gate:fast` + build, daarna `gate:slow` | 3–5 / 8–15 min |

- `gate:fast` = lint, typecheck, unit, dependency-cruiser, bundelbudget, `check-migrations`, `check-docs`.
- `gate:slow` = `test:db` met `check-policies` en `check-secdef`, squawk op migraties, schema-snapshot zonder verschil, kleine e2e-set — tegen een verse database.
- Verplicht naast CI: CodeQL en osv-scanner.

### Tests

- Indeling: unit `*.test.ts(x)` naast de code (Vitest-project `unit`, draait in de sandbox); integratie `*.int.test.ts`
  (Vitest-project `int`, alleen via `pnpm test:db`); pgTAP in `db/tests/`; e2e in `e2e/` (Playwright, via `gate:slow`/`ui:check`).
- Unit (Vitest) op `src/api/domain`, `src/shared` en `src/core`; property-based (fast-check) voor reken- en parselogica.
- Integratie tegen lokale Postgres; `src/core/api/db/testing.ts` (alleen importeerbaar uit testbestanden) laat `withUser()` een
  geïnjecteerde transactie gebruiken (savepoint per test); per feature één test die echt commit.
- Races: elke mutatie met een uniekheidsregel of geld krijgt een test met twee gelijktijdige requests; precies één slaagt.
- E2E (Playwright) altijd tegen de echte lokale stack, nooit met gemockte API of database; inloggen per rol, één kernflow per feature, CSP aan.

## 5. Vaste patronen

### Frontend

| Gebied | Patroon | Afgedwongen door |
|---|---|---|
| Routing | TanStack Router, bestandsroutes, getypte zoekparameters; elke route ErrorBoundary + `beforeLoad`-guard met `can()` (uitzonderingen: §3) | Router-types; lint op routes zonder guard |
| State | Server-state in TanStack Query; UI-state in de URL; formulieren in React Hook Form; geen globale store | Lint verbiedt store-libraries |
| Data | Per resource één `queries.ts` met key-factory, hooks en mutaties; mutatie invalideert eigen resource + "raakt ook" | Lint: `useQuery`/`useMutation` alleen in `queries.ts` |
| API-client | Eén client in `src/core/web/lib/api-client.ts`, door de app gemaakt in `src/web/lib/api.ts`: same-origin met cookie, 401 → naar inloggen, foutcodes → `ApiError` | Lint verbiedt `fetch(` elders |
| Formulieren | `<Form>`/`<FormField>` met zodResolver op het gedeelde schema; valideren bij verlaten, daarna bij typen; verzendknop uit tijdens de mutatie; serverveldfouten via `setError` | Lint verbiedt `useForm` buiten de wrapper |
| Laden/leeg/fout | `<AsyncView query empty>` | Lint op `.isLoading`/`.isError` in `features/` |
| Teksten | `src/web/copy/errors.ts` als `Record<ErrorCode, string>` (basisteksten uit `src/core/web/copy`, app-codes erbij); zod-meldingen Nederlands | TypeScript |
| Rechten | Dezelfde `can()` als de API; de API blijft de echte controle | Eén functie |

### Data en waarden

| Gebied | Patroon |
|---|---|
| Datums | `timestamptz` in de database, ISO-strings in het contract, één formatter (Intl, Europe/Amsterdam) |
| Bedragen | Gehele centen, branded `Cents`, één formatter |
| Paginering | Cursor-contract `{ items, nextCursor }` in `src/core/shared`, cursor in de URL |
| Naamgeving | Bestanden kebab-case, componenten PascalCase, hooks `useX`, routes meervoud, tabellen/kolommen snake_case; UI Nederlands, code en commits Engels |

## 6. Data-toegang en security

Ankers: OWASP Top 10:2025, OWASP API Security Top 10, ASVS 5.0 niveau 1 (checklist in de security-review-skill).

- **Alleen inloggen vanuit de browser**; alle data via de API.
- **Sessies** (ADR 0003): Better Auth in `src/core/api/auth`, sessie in de database (`cookieCache` uit), cookie `__Host-`, `httpOnly`,
  `Secure`, `SameSite=Lax`; geen token in `localStorage`. Absoluut 7 dagen, idle 12 uur, `freshAge` 10 min voor gevoelige acties;
  wachtwoord- of 2FA-wijziging trekt andere sessies in. Gebruikersbewerkbare velden nooit voor autorisatie.
  `session_strength` is `password` of `mfa` (sessieveld met `input: false`, standaard `password`, alleen gezet in de after-hook op
  2FA-verificatie); 2FA uitzetten zet de huidige sessie terug op `password`. `none` bestaat alleen in de database: geen actor.
- **CSRF** (ADR 0007): eigen middleware vóór alle routes; elk request behalve GET, HEAD en OPTIONS vereist mediatype `application/json` (hoofdletterongevoelig; parameters zoals `charset` zijn toegestaan; ook zonder body, dus de client stuurt de header altijd). Minstens een van `Sec-Fetch-Site` en `Origin` moet aanwezig zijn; elke aanwezige header moet respectievelijk `same-origin` of exact `APP_ORIGIN` zijn (`Origin: null`, `same-site`, `cross-site` en `none` worden geweigerd). Ontbreken beide, komt een van deze headers (of `Content-Type`) dubbel voor, of klopt een aanwezige header niet, dan weigert de middleware het request. Testmatrix: ADR 0007. Geen `cors()`.
  GET-links die een sessie maken (e-mailverificatie, magic link) openen een scherm dat de actie met een POST bevestigt (geen login-CSRF).
- **Accounts**: e-mailverificatie verplicht, geen account-enumeratie bij aanmelden en reset, gelekte wachtwoorden geweigerd (staging/productie).
- **Eigen databaserol**: de API verbindt als `api_user` (NOINHERIT, geen eigen rechten, alleen lid van `app_authenticated`),
  nooit als superuser of eigenaar. Systeemjobs krijgen een aparte rol. Werkt de gekozen pooler (transaction mode) niet met
  deze rol, dan valt het ontwerp om: bewijzen vóór de keuze definitief is.
- **`withUser(actor, tx => …)` als enige ingang**: één transactie per request die de rol, `app.user_id` en `app.session_strength` zet; read only voor GET.
  `actor` is `{ userId: UserId; sessionStrength: 'password' | 'mfa' }`; het type van `tx` (pg-client of Drizzle-transactie) legt de datapad-ADR in fase 0 vast, zodat het in fase 1 niet verandert.
- **Rollen** (ADR 0004): `app_migrator` (eigenaar, migraties, geen superuser), `app_authenticated`, `api_user`, `auth_service`,
  `app_definer` (eigenaar van `security definer`-functies). Rollen zijn clusterbreed en ontstaan niet in migraties: lokaal in
  `db/init/01-roles.sql`, per omgeving via het runbook. Al het andere per database (schema's, grants, default privileges) staat in migraties.
  `MIGRATOR_DATABASE_URL` gebruiken alleen scripts in `scripts/`, nooit code in `src/`.
- **Timeouts**: `statement_timeout` en `idle_in_transaction_session_timeout` op `api_user` en `auth_service`; `lock_timeout` op `app_migrator`.
- **Rollen uit de database**, uit `user_roles` per request; een rol in de sessie is alleen een UI-hint. Elke request leest de sessie uit de database, dus uitloggen en blokkeren tellen direct.
- **Autorisatie zonder overlap**: `can(permissie)` op functieniveau (BFLA); RLS op rijniveau (BOLA). Elke tabel RLS aan
  (`FORCE ROW LEVEL SECURITY`), elke policy een pgTAP-test op naam. Policies gebruiken `(select app.current_user_id())`.
- **MFA voor admin**: elke permissie die aan de rol `admin` is toegekend, eist een sterkere sessie (core leidt dit af uit de rol, de app kan het niet uitzetten;
  ADR 0008) (`app.session_strength() = 'mfa'`, eigen sessieveld gezet na 2FA-verificatie, ADR 0003), in `can()` én in een RLS-helper; getest met een admin-sessie zonder MFA. Admins: geen magic link, geen `trustDevice`.
- **Grants**: PUBLIC krijgt niets (`alter default privileges for role app_migrator revoke execute on functions / usage on types from public`,
  `revoke all on database/schema public from public`); elke tabel expliciete grants in de migratie; een pgTAP-invariant eist dat geen
  API-rol TRUNCATE, REFERENCES of TRIGGER heeft en dat elke tabel in `public` en `app` RLS aan én geforceerd heeft
  (uitzondering: `public.schema_migrations`); schema `better_auth` heeft geen grants behalve aan `auth_service`.
- **FORCE RLS werkt alleen voor niet-superusers**: daarom is `app_migrator` eigenaar en geen superuser, lokaal én in productie.
  Datamigraties die alle rijen moeten zien, lopen via een gereviewde `security definer`-functie van `app_definer`; omdat FORCE RLS
  ook voor `app_definer` geldt, krijgt de tabel daarvoor een eigen policy `to app_definer` met pgTAP-test.
- **`search_path = ''`** op elke `security definer`-functie, met volledig gekwalificeerde namen; een catalogus-check op `pg_proc` (`prosecdef` en `proconfig`) bewaakt dit.
- **Schema-snapshot**: `db/schema.snapshot.sql` via `pg_dump --schema-only -N tap --exclude-extension=pgtap` van de lokale database (het enige schemabestand; dbmate draait met `--no-dump-schema`); de agent leest dit, CI faalt bij verschil.
- **Eén actor**: `defineRoute` geeft `ctx.actor`; een handler zoekt de gebruiker nooit zelf op.
- **Databasefouten op één plek**: `withUser()` vertaalt 23505 → `ALREADY_EXISTS`, 23503 → `NOT_FOUND`, 42501 → `FORBIDDEN`.
- **Limieten één keer**: harde grenzen in `src/core/shared/limits.ts`, app-grenzen in `src/shared/limits.ts` (ADR 0008); een CHECK-constraint met dezelfde waarde krijgt een gelijkheidstest.
- **Resourceverbruik (API4)**: `bodyLimit` op de Hono-app, maximale paginagrootte in `limits.ts`, database-timeouts (hierboven).
- **Verharding**: rate limit op dure routes en op inloggen/reset (in de API, opslag in de database, IP alleen uit een door de host gezette header); CAPTCHA op aanmelden/reset in staging en productie (lokaal uit, want offline);
  headers (CSP, HSTS, nosniff, Referrer-Policy) zet de statische host voor de SPA en `secureHeaders()` voor `/api`; lokaal zet Vite dezelfde headers zodat e2e met CSP draait;
  CSP volledig uitgeschreven: `default-src 'self'`; `script-src 'self'` plus CAPTCHA-domein; `frame-src` CAPTCHA-domein; `connect-src 'self'`; `style-src 'self'` (geen nonce mogelijk bij een statische SPA; wat componenten inline zetten, wordt in e2e met CSP aan ontdekt en per ADR toegestaan); `img-src 'self' data:`; `frame-ancestors 'none'`; `base-uri 'self'`; `form-action 'self'`; `object-src 'none'`; e2e draait met CSP aan
  (verwacht: Radix Dialog zet een inline `<style>`, dat vraagt een ADR of een andere scroll-lock); HSTS, nosniff, Referrer-Policy;
  service worker cachet nooit `/api/*`; één `onError` die `{ code, requestId }` teruggeeft, nooit stacktraces of SQL;
  `/design-system` en `/design` bestaan alleen in dev-builds; de clientfouten-route is de enige data-route zonder login, met maximale grootte per melding, limiet per IP per minuut en geen onnodige vrije tekst.
- **Logging**: per request `requestId`, gebruiker-ID, duur, databasetijd. Clientfouten via `reportClientError()` naar een eigen tabel; lint verbiedt kale `console.error` in `queries.ts` en de API-client.
- **Secrets**: env-schema bij opstart; alleen publieke waarden krijgen `VITE_`. Geen productiegeheimen in de werkmap.
  `APP_ENV` (`local` | `test` | `staging` | `production`) is verplicht. Buiten `local`/`test` weigert het env-schema bij opstart:
  een `AUTH_SECRET` korter dan 32 bytes of met een demo-waarde erin; database-URL's met een demo-wachtwoord (URL geparsed, niet als
  hele string vergeleken); een `APP_ORIGIN` of `AUTH_BASE_URL` zonder `https`; `AUTH_BASE_URL` ≠ `APP_ORIGIN`. De demo-waarden staan
  als lijst in `src/core/api/env.ts` (niet uit `.env.example` gelezen); een test per regel bewijst het.
  Secret scanning met push protection; gitleaks in pre-commit en CI.
- **Supply chain**: Renovate gegroepeerd; pnpm-instellingen in `pnpm-workspace.yaml`: `minimumReleaseAge: 10080` (minuten = 7 dagen), `strictDepBuilds` met expliciete `allowBuilds`, `trustPolicy: no-downgrade`;
  versies in het framework zijn ondergrenzen bij schrijven, nooit de bewaking: osv-scanner faalt op bekende advisories;
  Actions gepind op SHA, `permissions: read-all`, runner gepind op `ubuntu-24.04`; deploy-secrets alleen in beschermde GitHub-environments;
  CodeQL en osv-scanner op elke PR en wekelijks op `main`.
- **Agentveiligheid**: de agent werkt via een GitHub App zonder `workflows`-recht (ADR 0005); het token van de eigenaar staat niet in de agent-omgeving.
  Tot die App bestaat (roadmap fase 1, GitHub) werkt de agent wél met de `gh`-login van de eigenaar; de grens is dan alleen de ruleset en de review van de eigenaar; permissieregels zijn geen beveiligingsgrens, de sandbox en GitHub wel; MCP-servers alleen read-only en versie gepind;
  geen nieuwe dependency zonder akkoord van de eigenaar.

## 7. Design system

- **Tokens in drie lagen** in CSS (enige bron): primitief (OKLCH-palet, nooit direct gebruikt) → semantisch (shadcn-namen:
  `--background`, `--foreground`, `--primary`, … `--radius`; de enige laag die een app aanpast) → component (`--control-h-*`, `--focus-ring-*`).
- In `@theme` worden kleur, radius en schaduw van Tailwind gereset; `bg-red-500` bestaat niet. Dark mode via `[data-theme=dark]` met `@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));`.
  De reset sloopt klassen die shadcn gebruikt (`bg-black/50`, `shadow-xs`): de codemod vangt die op. Vite `build.target` gelijk aan browserslist.
- **Tokens per zone** (ADR 0008): primitief, component en standaard-semantisch in `src/core/web/styles/`; een app past alleen de
  semantische laag aan in `src/web/styles/theme.css`.
- **Componenten**: shadcn/ui gekopieerd naar `src/core/web/ui` (basiskit, van de template); app-specifieke componenten en
  afgeleide varianten in `src/web/ui`, die ook de enige importbron voor `features/` is (her-exporteert core). Een basiscomponent dat
  elke app kan gebruiken, komt via een PR in de template. Na elke `shadcn add` zet een codemod het component op de eigen tokens; varianten in één CVA-recept; afleiden, niet forken; 44 px en focusring in de basis van elk recept.
- **Afgedwongen**: alleen bestaande klassen; in `features/` geen arbitrary values, `!` of `dark:` en alleen layout-klassen;
  geen rauwe `<button> <input> <select> <textarea> <dialog> <a>` buiten `src/core/web/ui` en `src/web/ui`; geen hex/benoemde kleuren buiten tokens;
  contrasttest over alle receptvarianten; `outline-none` alleen met `focus-visible:ring-*`; één `scanAxe(page)` (wcag2a/aa, 21aa, 22aa; lint verbiedt losse `AxeBuilder`);
  woordenlijsttest op `src/web/copy`; geen `matchMedia`/`userAgent`/`isMobile` in `src/web`; browserslist in `package.json`.
- **Hergebruik**: de schermskill haalt via `scripts/facts.mjs` de actuele componenten op; past geen component, dan stopt de agent en stelt een variant voor.
- **Startkit**: Button, Input, Field, Card, Dialog. Groeit per app-behoefte. WCAG 2.2 AA (4,5:1 tekst, 3:1 UI), één focusring, `prefers-reduced-motion`, 44 px aanraakdoelen.
- `/design-system` (catalogus) en optioneel `/design` (prototypes uit `designs/`), alleen in dev.

## 8. Werkstraat

1. **Spec** in `docs/specs/` volgens `_template.md` — alleen bij migratie, nieuwe route of nieuwe permissie. Status `goedgekeurd` zet alleen de eigenaar.
2. **Contract**: zod-schema's en routes die `501` teruggeven wanneer de wijziging een API-contract toevoegt.
3. **Tester-agent** schrijft acceptatietests tegen het contract; ze compileren en falen op hun asserties. Schrijft alleen in testpaden.
4. **Hoofdsessie** bouwt tot groen. Mag tests toevoegen. Een bestaande test wijzigen mag alleen als de spec of opdracht het geteste
   gedrag verandert; elke gewijzigde test staat met reden in de PR. Verwijderen of skippen alleen met akkoord van de eigenaar.
   Lijkt een test van de tester fout zonder dat het gedrag verandert, dan stopt de hoofdsessie en legt het de eigenaar voor;
   na akkoord past de tester (niet de hoofdsessie) de test aan.
5. **Reviewer-agent** met schone context controleert `docs/dod.md`: correctheid, duplicatie, spec-afwijking en testinhoud per criterium. Stijl is werk van de lint.
6. **Eigenaar** reviewt en merget.

Licht pad: geen migratie, route of permissie → plan, bouwen, review.

CI zet gewijzigde bestaande tests als lijst in de PR.

**Eisen aan de rollen, ongeacht runtime:** de tester kan alleen in testpaden schrijven; de reviewer is read-only (geen schrijfrechten; alleen leescommando's, `git diff/log/show/status`, `gh pr view/diff/checks` en de checks uit `docs/dod.md`) met een begrensd aantal beurten; beide starten met schone context en alleen de afgebakende opdracht. Een rol telt alleen als onafhankelijk, ook als ad-hoc subagent, wanneer de runtime die eisen afdwingt. Is dat niet zo, of ontbreekt de rol, voer dan geen onafhankelijke review voor die rol op: benoem de ontbrekende stap expliciet en laat de eigenaar die uitvoeren vóór samenvoegen. De hoofdsessie reviewt nooit haar eigen werk.

**Claude Code-implementatie:** reviewer (opus) met `tools: Read, Grep, Glob, Bash`, `maxTurns` en de readonly-bash-hook; tester (sonnet) met de testpaden-hook (zie tabel). Hooks, permissies, sandboxinstellingen en agentconfiguratie zijn runtime-specifiek; documenteer en activeer ze alleen voor de runtime waarvoor ze zijn getest. De eisen hierboven gelden voor elke runtime.

Hooks (exit 2 blokkeert; exit 1 en een timeout laten het toolgebruik door — fail-open. Elke hook is daarom kort en deterministisch,
met een korte expliciete `timeout` en `set -euo pipefail` met `trap 'exit 2' ERR`; de harde grens blijven sandbox, CI en GitHub).
SubagentStop staat in `.claude/settings.json` (matcher = agentnaam), niet in de frontmatter van de subagent:

| Hook | Doet |
|---|---|
| PostToolUse (Edit/Write) | ESLint + Prettier op het bewerkte bestand |
| Stop | typecheck/lint/unit op geraakte bestanden; `{"decision":"block","reason":…}` met ≤ 40 regels; stopt direct bij `stop_hook_active`; overslaan in plan mode of zonder wijzigingen; nooit netwerk of database |
| SubagentStop | klaar-criterium per `agent_type`: tester → nieuwe tests compileren en falen op asserties; reviewer → rapport geschreven |
| SessionStart | spec, branch, laatste checkuitslag, status lokale stack (`doctor --quick`) als `additionalContext` |
| PreToolUse guard-files (Edit/Write/Bash) | blokkeert gegenereerde bestanden, gecommitte migraties, verwijderen of skippen van bestaande tests (bestand bestaat in `origin/main`) en schrijven via Bash (`sed -i`, `perl -pi`, `cp`, `mv`, redirect) naar beschermde paden; wijzigen van een bestaande test meldt hij als `additionalContext` (reden in de PR) |
| PreToolUse git-guard (Bash) | blokkeert push als de huidige branch `main` is, `HUSKY=0`, `core.hooksPath` |
| PreToolUse tester-paden (subagent, Edit/Write/Bash) | tester schrijft alleen in testpaden |
| PreToolUse readonly-bash (subagent) | reviewer: alleen `pnpm check:*`/`test*`/`gate:*`, `git diff/log/show/status`, `gh pr view/diff/checks` |

Permissieregels in `.claude/settings.json` zijn gemak, geen grens (Claude Code-docs): deny op `.env*`, pushes naar `main`,
force, `--no-verify`, mergen en `docker`; `ask` op de beschermde paden (§10), op `pnpm add/install/update/remove`, op `sed -i`/`perl -pi`
(Edit-regels dekken Bash-schrijfacties niet) en op elk commando uit `excludedCommands`, zodat de eigenaar elke run buiten de sandbox goedkeurt.
Permissieregels vangen alleen de gangbare vormen (bijv. `git commit -n` midden in de opties niet); de git-guard-hook dekt dat volledig.
De sandbox (`failIfUnavailable`, `allowUnsandboxedCommands: false`, `denyRead` op `~/.ssh` en `~/.aws`; `~/.config/gh` volgt zodra de agent met het App-token werkt) en GitHub zijn de grens.
De sandbox draait niet op native Windows: met `failIfUnavailable` start Claude Code daar niet; werk in WSL2. Op Linux/WSL2 bereikt een
commando in de sandbox `localhost` niet; commando's die de lokale stack nodig hebben (`pnpm test:db`, `pnpm gate:slow`, …) staan
in `excludedCommands` als patroon met ` *`, zodat argumenten meekomen (zonder wildcard matcht het exact). Daarmee draaien ook door de agent geschreven tests buiten de sandbox; hoe dat gat dichtgaat, staat in ADR 0009. De toolchain (mise: Node, pnpm, dbmate, gitleaks) installeert de eigenaar via `scripts/bootstrap.sh`, niet de agent.

## 9. Documentatie en tokenbudget

| Bestand | Inhoud | Laadt | Budget |
|---|---|---|---|
| `AGENTS.md` | Stack, commando's, harde regels | Altijd | ≤ 100 regels |
| `CLAUDE.md` | `@AGENTS.md` + werkstraat | Altijd | ≤ 50 regels |
| `.claude/rules/*.md` | Conventies per pad | Bij bestanden op dat pad | ≤ 60 regels |
| `.claude/skills/*/SKILL.md` | Procedures met live feiten | Bij gebruik | ≤ 200 regels |
| `docs/specs/` | Featurespecs | Tijdens de feature | 1–2 pagina's |
| `docs/adr/` | Beslissingen | Op verzoek | 1 pagina |
| `docs/operations/` | Release, rollback, back-up en herstel | Bij release of incident | 1–2 pagina's |

Wat een type of check afdwingt, staat niet in proza. Wat soms nodig is, hoort in een skill of padregel, niet in een `@`-import.

## 10. Versiebeheer, CI en release

- Repo in een organisatie; de agent pusht via een GitHub App zonder `workflows`-recht en zonder admin (ADR 0005). De eigenaar merget.
- Ruleset op `main` (op organisatieniveau via een custom property, want "Use this template" kopieert geen rulesets of settings):
  alleen via PR; geen force push of delete; verplichte checks `gate:fast`, `gate:slow`, osv-scanner; "Require code scanning results"
  (CodeQL); code-owner-review; goedkeuring vervalt bij nieuwe push; geen bypass voor de bot; merge-methoden alleen merge en squash.
  Tot de GitHub App bestaat, pusht de agent onder het account van de eigenaar en kan die zijn eigen PR niet goedkeuren: dan 0 goedkeuringen
  en geen code-owner-review, wel PR-plicht, geen force push en geen delete (ADR 0006). Rulesets op private repo's vragen GitHub Pro of Team.
- Actions-instellingen: "Allow GitHub Actions to create and approve pull requests" uit; "Require actions to be pinned to a full-length commit SHA" aan.
- **Beschermde paden** (één lijst; CODEOWNERS spiegelt hem volledig, `ask` in `.claude/settings.json` zonder de paden waarin de agent
  hoort te schrijven: tests (`*.test.*`, `*.spec.*`, `db/tests/`, `e2e/`) en `docs/specs/`. Toevoegen mag daar; verwijderen of skippen
  van bestaande tests blokkeert de guard-files-hook, `goedgekeurd` bewaakt `check-spec-approval`. `check-docs` bewaakt beide spiegelingen):
  `AGENTS.md`, `CLAUDE.md`, `docs/framework.md`, `docs/dod.md`, `docs/roadmap.md`, `docs/adr/`, `docs/specs/`, `.github/`, `.claude/`, `scripts/`,
  `db/init/`, `db/docker/`, `db/tests/`, `compose*.yaml`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.npmrc`, `.pnpmfile.cjs`,
  `mise.toml`, `.env.example`, `eslint.config.*`, `tsconfig*.json`, `.dependency-cruiser.*`, `lefthook.yml`, `renovate.json`, `.gitattributes`,
  `src/core/`, `src/api/app.ts`, `src/api/kit.ts`, `src/api/server.ts`, `src/api/env.ts`, `src/shared/permissions.ts`, `deploy/`,
  alle `*.test.*`/`*.spec.*`, `e2e/`.
  `src/core/` is daarnaast core (ADR 0008): in een app wijzigt alleen een template-merge het, bewaakt door `check-core`.
- Instellingen als code in `.github/settings/main-protection.json`; `scripts/check-github.mjs` controleert alleen-lezend dat ze actief zijn en faalt als de agent onder het account van de eigenaar werkt.
- `check-docs` (smal): paden en `pnpm`-scripts in `AGENTS.md`, `CLAUDE.md` en `.claude/**` moeten bestaan; relatieve links in `docs/` kloppen;
  de beschermde-padenlijst hierboven, CODEOWNERS en `ask` zijn gelijk (op de genoemde uitzonderingen na); spec- en ADR-statussen uit de vaste woordenlijst.
- **Spec goedkeuren**: een spec komt in een eigen PR met `status: voorstel`; de eigenaar zet `goedgekeurd` in die PR en keurt hem goed.
  `check-spec-approval` controleert via de GitHub API dat de wijziging naar `goedgekeurd` in een PR zit met een goedkeuring van de eigenaar
  (commit-auteurs zijn te vervalsen).
- `guard.yml` (`pull_request_target`, draait altijd de versie van de default branch) voert de check-scripts van `main` uit. PR-code wordt
  alleen als git-data in een aparte map uitgecheckt en nooit uitgevoerd: geen `pnpm install`, geen configs of scripts uit de PR,
  `persist-credentials: false`, minimale `permissions`.
- Korte branches, één onderwerp, squash-merge, conventional commits. Uitzondering: de template-koppeling en template-updates
  landen als merge-commit; squash gooit de tweede ouder weg en dan conflicteert elke volgende update op alles (ADR 0006).
- CI: runner `ubuntu-24.04`, toolchain via `jdx/mise-action` (geen Corepack); snelle job op elke push, trage job op PR's en `main`; concurrency annuleert oude runs; pad-filters en caches.

### Release (geldt voor elke host)

- Lokaal → PR → staging → productie. Database vóór code, altijd eerst staging. Merge op `main` → staging; release-tag + goedkeuring
  van de eigenaar in een beschermde environment → productie. Automatische Git-deploys van de host staan uit: CI bouwt en zet neer.
- Geen preview-deploys tegen staging zonder de migraties van die PR.
- `check-release-ci`: CI was groen voor exact dit commit (en voor productie: staging ook). `check-deployment-schema`: het productieschema
  heeft alleen-lezend de tabellen en kolommen die de code verwacht, afgeleid uit het Drizzle-schema.
- Per omgeving een eigen build (publieke `VITE_`-waarden zitten in de build): hetzelfde commit, niet dezelfde build.
- Migraties append-only en expand/contract; `check-migrations` vergelijkt met `origin/main` en eist unieke versienummers
  (dbmate-tijdstempels voorkomen botsingen bij `git merge template/main`). Nooit handmatig aan productie.
- Smoketest na elke deploy (staging en productie): inloggen met een testaccount, één leesactie, en bewijzen dat een
  eventuele provider-data-API voor de browser dicht is. Lokaal bewijst een test dat `api_user` zonder `withUser()` niets ziet.
- Rollback: code via de host, database vooruit met een nieuwe migratie, in nood uit back-up. Na een release een uur fouten en logs volgen.
  Concreet per host in `docs/operations/` (fase 3, per app).

### Template-updates naar een app

"Use this template" maakt een nieuwe geschiedenis. Direct na het aanmaken eenmalig:
`git remote add template <url>`, `git fetch template`, `git merge --allow-unrelated-histories -s ours template/main`.
Daarna haalt een gewone `git merge template/main` op een branch, via een PR, de updates binnen; de eigenaar merget met
**Create a merge commit**, nooit squash. Workflow-wijzigingen pusht de eigenaar. App-eigen ADR's nummeren vanaf `0100`;
`0001`–`0099` zijn van de template. Het hele traject voor een nieuwe app staat in [nieuwe-app.md](nieuwe-app.md) (ADR 0006).

### Meten

CI logt per PR welke checks faalden. Na een wijziging aan de agent-opzet bouwt de agent dezelfde drie testopdrachten opnieuw;
een regel blijft alleen als hij aantoonbaar helpt.

## 11. Lokaal ontwikkelen

- Ubuntu 24.04 (native of WSL2), code op ext4 (`~/code`), Docker Engine, mise (`mise.toml`), gh, `bubblewrap` en `socat` (sandbox van Claude Code). WSL2: `systemd=true` in `/etc/wsl.conf`
  (nodig voor Docker Engine), `fs.inotify.max_user_watches=524288`, `networkingMode=mirrored`.
- `compose.yaml` levert Postgres (eigen image met pgTAP) en Mailpit, gebonden aan `127.0.0.1`. De app (Vite, Hono) draait native, niet in Docker.
- `pnpm dev` (fase 1): Docker-check, `.env.local` uit `.env.example`, `docker compose --env-file .env.local up -d --build --wait`, migraties, Hono :8787 + Vite :5173.
  Poorten via `.env.local`, zodat meerdere apps naast elkaar draaien. Compose leest zonder `--env-file` alleen `.env`, en de poort
  staat ook in de URL's: een andere poort betekent `PG_PORT` én de drie database-URL's aanpassen, en `SMTP_PORT` én `SMTP_URL`.
  Vite- en Hono-poort worden in het skelet instelbaar (`WEB_PORT`, `API_PORT`), met `APP_ORIGIN` en `AUTH_BASE_URL` erop afgestemd.
- De agent gebruikt `docker` niet (deny); de stack is van de eigenaar. Draait de stack niet (vanaf fase 1 meldt de SessionStart-hook dat via `doctor --quick`), dan vraagt de agent de eigenaar `pnpm dev` te starten. Sandbox met `failIfUnavailable: true`; alleen `pnpm test:db`, `pnpm db:reset`,
  `pnpm db:types`, `pnpm ui:check` en `pnpm gate:slow` draaien buiten de sandbox (`excludedCommands`), elk na goedkeuring van de eigenaar.
  CODEOWNERS op hun scripts is niet genoeg: ze laden door de agent geschreven tests en configs. Isolatie daarvan: ADR 0009.
- Screenshot-baselines alleen in de gepinde Playwright-image.
- Devcontainer (optioneel): Docker-in-Docker, nooit de host-socket doorgeven.

## 11a. Repo-structuur

```
src/core/     van de template (ADR 0008); een app wijzigt dit niet
  api/        route/ (createRouteKit, defineRoute) db/ (pool, withUser, foutvertaling) auth/ (Better Auth)
              http/ (createApp: CSRF, bodyLimit, secureHeaders, onError) obs/ env.ts (basisschema, enige process.env)
  web/        ui/ (basiskit, AsyncView, Form) styles/ (tokens) lib/ (api-client.ts, auth.ts, env.ts, format.ts, report-error.ts) copy/ (basisteksten)
  shared/     can.ts (engine) errors.ts (basiscodes) limits.ts (harde grenzen) ids.ts assert unsafeCast Cents cursor
src/web/      routes/ features/ ui/ (eigen componenten + barrel) styles/theme.css lib/ (api.ts, env.ts) copy/ dev/
src/api/      app.ts kit.ts server.ts env.ts routes/ domain/ db/ (gegenereerd: schema, ids.ts)
src/shared/   schema's, permissions.ts, errors.ts, limits.ts, ids.ts (app-uitbreidingen)
deploy/<host>/ adapter per gekozen host (per app)
db/           docker/ (Postgres+pgTAP) init/ (rollen, alleen lokaal) migrations/ (dbmate) tests/ (pgTAP) schema.snapshot.sql
e2e/          Playwright-tests tegen de echte lokale stack
scripts/seed  testgebruikers per rol via de auth-API (wachtwoordhashes, vast lokaal TOTP-geheim voor admin)
scripts/      dev bootstrap doctor test-db ui-check db-types facts.mjs check-*
designs/      optioneel: prototype-exports
docs/         framework.md roadmap.md dod.md nieuwe-app.md gouden-pad.md specs/ adr/ operations/ reviews/
.claude/      settings.json agents/ skills/ rules/ hooks/
.github/      workflows/ settings/ CODEOWNERS pull_request_template.md
compose.yaml  mise.toml  AGENTS.md  CLAUDE.md  CHANGELOG.md
```

## 12. Fasering

| Fase | Inhoud |
|---|---|
| 0. Bewijs | `api_user` + `withUser()` via `pg`, direct én via PgBouncer (transaction mode) in compose, zonder lekken |
| 1. Fundament | Verticale stukken: skelet met rails en test-infra, auth, secure route met gebruikersbeheer als referentie-feature (gouden pad), rails afdwingen, agent-opzet (met `new:resource`), GitHub — zie `roadmap.md` |
| 2. Eerste features (per app) | Clientfouten, `check:catalogus`; wat in een app doorglipt, wordt eerst een check in de template |
| 3. Eerste release (per app) | Providerkeuze per ADR, adapter, staging/productie, runbooks |

Fase 0 en 1 horen in de template; het gouden pad en de generator ontstaan in fase 1 uit gebruikersbeheer. Fase 2 levert verbeteringen terug aan de template; fase 3 is per app.

### Uitbreidingen, op aanleiding

| Uitbreiding | Toevoegen wanneer |
|---|---|
| Audit log | Wijzigingen moeten herleidbaar zijn naar een gebruiker |
| Bestanden (signed URL's) of realtime | De app heeft ze nodig, met een eigen ADR |
| Idempotency-Key | Mutaties met geld of voorraad |
| Screenshot-regressie en axe in CI | Een visuele of toegankelijkheidsfout glipte door |
| jscpd, knip, ast-grep | Review vindt herhaaldelijk kopieën, dode code of een fout patroon |
| Mutation testing | Kritieke reken- of geldlogica |
| Renovate automatisch mergen, OpenTelemetry | De basis draait stabiel |
| Devcontainer of agent-sandbox in Docker | Iemand werkt mee, of agents draaien zonder toestemmingsprompts |
