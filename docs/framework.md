# Framework

Normatief. Dit document is de wet voor elke app die uit deze template start. Het is de
provider-neutrale uitwerking van [background/plan-v1.md](background/plan-v1.md); bij verschil wint dit document.
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

Eén repository, één pakket, drie lagen, bewaakt door dependency-cruiser (ook: geen cycles):

| Laag | Map | Mag importeren | Mag nooit |
|---|---|---|---|
| Frontend (Vite + React SPA) | `src/web` | `src/shared`, het type `AppType` uit `src/api`, `better-auth/react` alleen in `lib/auth.ts` | databasedriver, ORM, `process.env`/`import.meta.env` buiten `lib/env.ts`, andere code uit `src/api` |
| API (Hono) | `src/api` | `src/shared` | `src/web` |
| Gedeeld | `src/shared` | alleen libraries (zod) | `src/web`, `src/api` |
| Database-toegang | `src/api/db` | driver (`pg`) en Drizzle — als enige | iets anders exporteren dan `withUser()` |
| Auth | `src/api/auth` | Better Auth met eigen verbinding als `auth_service`, alleen schema `auth` | data buiten `auth` lezen of schrijven |

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
| Alleen `src/api/db` raakt `pg` | `src/api/auth` (als `auth_service`, alleen schema `auth`) | Better Auth beheert zijn eigen tabellen |
| Elke route via `defineRoute` | `/api/auth/*` (Better Auth-handler) | De library levert deze routes |
| Elke route vraagt login | `/api/auth/*` (inloggen, aanmelden, reset) en de clientfouten-route | Bestaan juist voor niet-ingelogden; elk met rate limit |
| Elke schermroute heeft een `can()`-guard | Inlog-, aanmeld- en resetschermen | Publiek; ze tonen geen data |

## 4. Codeerkaders

Alle lintregels op `error`; CI draait met `--max-warnings 0`. Checks op code gebruiken de AST (ESLint,
dependency-cruiser); checks op de database lezen de catalogus van de lokale database (`pg_policies`, `pg_proc`,
`information_schema`), nooit een regex over bronbestanden.

- **Lintmeldingen zijn instructies**: `no-restricted-imports`/`no-restricted-syntax` noemen de juiste helper.
- **Kleine eenheden**: max-lines-per-function 60 (`.ts`) / 120 (`.tsx`); sonarjs cognitive-complexity 15; max-params 3; max-depth 3.
- **Parse op elke grens**: zod via `defineRoute()` voor request en response (`.strict()`); env-schema in `src/api/env.ts`, de enige plek met `process.env`.
- **Geen casts**: type-assertions (`x as T`, `<T>x`) zijn verboden (`consistent-type-assertions: never`); `as const` en `import { a as b }` mogen; `unsafeCast(value, reden)` in `src/shared` is de enige uitweg. CI zet het verschil in aantal op de PR.
- **`assert(cond, msg)`** in `src/shared`, actief in productie en gemeld aan de fouttracking; in de frontend vangt een ErrorBoundary per route hem op.
- **Types per resource** apart geëxporteerd uit de API, zodat de TypeScript-server niet trager wordt naarmate routes groeien.
- **Branded IDs** (`UserId`) via zod `.brand()`; een script na schema-introspectie zet `$type<UserId>()` terug.
- **TypeScript streng**: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noFallthroughCasesInSwitch`,
  `noImplicitOverride`, `verbatimModuleSyntax`, `erasableSyntaxOnly`, `moduleResolution: bundler`, `types` expliciet per tsconfig;
  typescript-eslint `strictTypeChecked` plus `switch-exhaustiveness-check` (staat daar niet in). TypeScript `~6.0.3` (ADR 0005).
- **ESLint 10**: verboden elementen via `no-restricted-syntax` op `JSXOpeningElement` (eslint-plugin-react ondersteunt ESLint 10 niet).
- **Geen sessielek in de database**: lint verbiedt `SET ROLE` en `set_config(…, false)`; een test controleert na elke request `current_user = session_user`.

### Feedbacklus

| Moment | Wat | Duur |
|---|---|---|
| Na elke bewerking (PostToolUse-hook) | ESLint + Prettier op dat bestand | ~1–2 s |
| Pre-commit (lefthook) | format, ESLint op staged, gitleaks | < 10 s |
| Einde beurt (Stop-hook) | `tsc --incremental`, ESLint `--cache`, `vitest --changed` | ~10–30 s |
| Database-tests | `pnpm test:db`: integratie + pgTAP tegen lokale Postgres | ~20–60 s |
| Pre-push | `gate:fast` | < 60 s |
| CI | `gate:fast` + build, daarna `gate:slow` | 3–5 / 8–15 min |

- `gate:fast` = lint, typecheck, unit, dependency-cruiser, bundelbudget, `check-migrations`, `check-docs`.
- `gate:slow` = `test:db` met `check-policies` en `check-secdef`, squawk op migraties, schema-snapshot zonder verschil, kleine e2e-set — tegen een verse database.
- Verplicht naast CI: CodeQL en osv-scanner.

### Tests

- Unit (Vitest) op `src/api/domain` en `src/shared`; property-based (fast-check) voor reken- en parselogica.
- Integratie tegen lokale Postgres; `withUser()` accepteert in tests een geïnjecteerde transactie (savepoint per test);
  per feature één test die echt commit.
- Races: elke mutatie met een uniekheidsregel of geld krijgt een test met twee gelijktijdige requests; precies één slaagt.
- E2E (Playwright) altijd tegen de echte lokale stack, nooit met gemockte API of database; inloggen per rol, één kernflow per feature, CSP aan.

## 5. Vaste patronen

### Frontend

| Gebied | Patroon | Afgedwongen door |
|---|---|---|
| Routing | TanStack Router, bestandsroutes, getypte zoekparameters; elke route ErrorBoundary + `beforeLoad`-guard met `can()` (uitzonderingen: §3) | Router-types; lint op routes zonder guard |
| State | Server-state in TanStack Query; UI-state in de URL; formulieren in React Hook Form; geen globale store | Lint verbiedt store-libraries |
| Data | Per resource één `queries.ts` met key-factory, hooks en mutaties; mutatie invalideert eigen resource + "raakt ook" | Lint: `useQuery`/`useMutation` alleen in `queries.ts` |
| API-client | Eén client in `src/web/lib/api.ts`: same-origin met cookie, 401 → naar inloggen, foutcodes → `ApiError` | Lint verbiedt `fetch(` elders |
| Formulieren | `<Form>`/`<FormField>` met zodResolver op het gedeelde schema; valideren bij verlaten, daarna bij typen; verzendknop uit tijdens de mutatie; serverveldfouten via `setError` | Lint verbiedt `useForm` buiten de wrapper |
| Laden/leeg/fout | `<AsyncView query empty>` | Lint op `.isLoading`/`.isError` in `features/` |
| Teksten | `copy/errors.ts` als `Record<ErrorCode, string>`; zod-meldingen Nederlands | TypeScript |
| Rechten | Dezelfde `can()` als de API; de API blijft de echte controle | Eén functie |

### Data en waarden

| Gebied | Patroon |
|---|---|
| Datums | `timestamptz` in de database, ISO-strings in het contract, één formatter (Intl, Europe/Amsterdam) |
| Bedragen | Gehele centen, branded `Cents`, één formatter |
| Paginering | Cursor-contract `{ items, nextCursor }` in `src/shared`, cursor in de URL |
| Naamgeving | Bestanden kebab-case, componenten PascalCase, hooks `useX`, routes meervoud, tabellen/kolommen snake_case; UI Nederlands, code en commits Engels |

## 6. Data-toegang en security

Ankers: OWASP Top 10:2025, OWASP API Security Top 10, ASVS 5.0 niveau 1 (checklist in de security-review-skill).

- **Alleen inloggen vanuit de browser**; alle data via de API.
- **Sessies** (ADR 0003): Better Auth in `src/api/auth`, sessie in de database (`cookieCache` uit), cookie `__Host-`, `httpOnly`,
  `Secure`, `SameSite=Lax`; geen token in `localStorage`. Absoluut 7 dagen, idle 12 uur, `freshAge` 10 min voor gevoelige acties;
  wachtwoord- of 2FA-wijziging trekt andere sessies in. Gebruikersbewerkbare velden nooit voor autorisatie.
- **CSRF**: eigen middleware; niet-GET eist `Sec-Fetch-Site: same-origin` of `Origin === APP_ORIGIN` en `Content-Type: application/json`. Geen `cors()`.
- **Accounts**: e-mailverificatie verplicht, geen account-enumeratie bij aanmelden en reset, gelekte wachtwoorden geweigerd (staging/productie).
- **Eigen databaserol**: de API verbindt als `api_user` (NOINHERIT, geen eigen rechten, alleen lid van `app_authenticated`),
  nooit als superuser of eigenaar. Systeemjobs krijgen een aparte rol. Werkt de gekozen pooler (transaction mode) niet met
  deze rol, dan valt het ontwerp om: bewijzen vóór de keuze definitief is.
- **`withUser(actor, tx => …)` als enige ingang**: één transactie per request die de rol, `app.user_id` en `app.session_strength` zet; read only voor GET.
- **Rollen** (ADR 0004): `app_migrator` (eigenaar, migraties, geen superuser), `app_authenticated`, `api_user`, `auth_service`,
  `app_definer` (eigenaar van `security definer`-functies). Rollen zijn clusterbreed en ontstaan niet in migraties: lokaal in
  `db/init/01-roles.sql`, per omgeving via het runbook. Al het andere per database (schema's, grants, default privileges) staat in migraties.
  `MIGRATOR_DATABASE_URL` gebruiken alleen scripts in `scripts/`, nooit code in `src/`.
- **Timeouts**: `statement_timeout` en `idle_in_transaction_session_timeout` op `api_user` en `auth_service`.
- **Rollen uit de database**, uit `user_roles` per request; een rol in de sessie is alleen een UI-hint. Elke request leest de sessie uit de database, dus uitloggen en blokkeren tellen direct.
- **Autorisatie zonder overlap**: `can(permissie)` op functieniveau (BFLA); RLS op rijniveau (BOLA). Elke tabel RLS aan
  (`FORCE ROW LEVEL SECURITY`), elke policy een pgTAP-test op naam. Policies gebruiken `(select app.current_user_id())`.
- **MFA voor admin**: permissies met kenmerk admin eisen een sterkere sessie (`app.session_strength() = 'mfa'`, eigen sessieveld gezet na 2FA-verificatie, ADR 0003), in `can()` én in een RLS-helper; getest met een admin-sessie zonder MFA. Admins: geen magic link, geen `trustDevice`.
- **Grants**: PUBLIC krijgt niets (`alter default privileges for role app_migrator revoke execute on functions / usage on types from public`,
  `revoke all on database/schema public from public`); elke tabel expliciete grants in de migratie; een pgTAP-invariant eist dat geen
  API-rol TRUNCATE, REFERENCES of TRIGGER heeft en dat elke tabel in `public` en `app` RLS aan én geforceerd heeft
  (uitzondering: `public.schema_migrations`); schema `auth` heeft geen grants behalve aan `auth_service`.
- **FORCE RLS werkt alleen voor niet-superusers**: daarom is `app_migrator` eigenaar en geen superuser, lokaal én in productie.
  Datamigraties die alle rijen moeten zien, lopen via een gereviewde `security definer`-functie van `app_definer`.
- **`search_path = ''`** op elke `security definer`-functie, met volledig gekwalificeerde namen; een catalogus-check op `pg_proc` (`prosecdef` en `proconfig`) bewaakt dit.
- **Schema-snapshot**: `db/schema.snapshot.sql` via `pg_dump --schema-only -N tap` van de lokale database (het enige schemabestand; dbmate draait met `--no-dump-schema`); de agent leest dit, CI faalt bij verschil.
- **Eén actor**: `defineRoute` geeft `ctx.actor`; een handler zoekt de gebruiker nooit zelf op.
- **Databasefouten op één plek**: `withUser()` vertaalt 23505 → `ALREADY_EXISTS`, 23503 → `NOT_FOUND`, 42501 → `FORBIDDEN`.
- **Limieten één keer** in `src/shared/limits.ts`; een CHECK-constraint met dezelfde waarde krijgt een gelijkheidstest.
- **Resourceverbruik (API4)**: `bodyLimit` op de Hono-app, maximale paginagrootte in `limits.ts`, database-timeouts (hierboven).
- **Verharding**: rate limit op dure routes en op inloggen/reset (in de API, opslag in de database, IP alleen uit een door de host gezette header); CAPTCHA op aanmelden/reset in staging en productie (lokaal uit, want offline);
  headers (CSP, HSTS, nosniff, Referrer-Policy) zet de statische host voor de SPA en `secureHeaders()` voor `/api`; lokaal zet Vite dezelfde headers zodat e2e met CSP draait;
  CSP volledig uitgeschreven: `default-src 'self'`; `script-src 'self'` plus CAPTCHA-domein; `frame-src` CAPTCHA-domein; `connect-src 'self'`; `style-src 'self'` (geen nonce mogelijk bij een statische SPA; wat componenten inline zetten, wordt in e2e met CSP aan ontdekt en per ADR toegestaan); `img-src 'self' data:`; `frame-ancestors 'none'`; e2e draait met CSP aan; HSTS, nosniff, Referrer-Policy;
  service worker cachet nooit `/api/*`; één `onError` die `{ code, requestId }` teruggeeft, nooit stacktraces of SQL;
  `/design-system` en `/design` bestaan alleen in dev-builds; de clientfouten-route is de enige data-route zonder login, met maximale grootte per melding, limiet per IP per minuut en geen onnodige vrije tekst.
- **Logging**: per request `requestId`, gebruiker-ID, duur, databasetijd. Clientfouten via `reportClientError()` naar een eigen tabel; lint verbiedt kale `console.error` in `queries.ts` en de API-client.
- **Secrets**: env-schema bij opstart; alleen publieke waarden krijgen `VITE_`. Geen productiegeheimen in de werkmap.
  Secret scanning met push protection; gitleaks in pre-commit en CI.
- **Supply chain**: Renovate gegroepeerd; pnpm-instellingen in `pnpm-workspace.yaml`: `minimumReleaseAge: 10080` (minuten = 7 dagen), `strictDepBuilds` met expliciete `allowBuilds`, `trustPolicy: no-downgrade`;
  versies in het framework zijn ondergrenzen bij schrijven, nooit de bewaking: osv-scanner faalt op bekende advisories;
  Actions gepind op SHA, `permissions: read-all`, runner gepind op `ubuntu-24.04`; deploy-secrets alleen in beschermde GitHub-environments;
  CodeQL en osv-scanner op elke PR en wekelijks op `main`.
- **Agentveiligheid**: de agent werkt via een GitHub App zonder `workflows`-recht (ADR 0005); het token van de eigenaar staat niet in de agent-omgeving; permissieregels zijn geen beveiligingsgrens, de sandbox en GitHub wel; MCP-servers alleen read-only en versie gepind;
  geen nieuwe dependency zonder akkoord van de eigenaar.

## 7. Design system

- **Tokens in drie lagen** in CSS (enige bron): primitief (OKLCH-palet, nooit direct gebruikt) → semantisch (shadcn-namen:
  `--background`, `--foreground`, `--primary`, … `--radius`; de enige laag die een app aanpast) → component (`--control-h-*`, `--focus-ring-*`).
- In `@theme` worden kleur, radius en schaduw van Tailwind gereset; `bg-red-500` bestaat niet. Dark mode via `[data-theme=dark]` met `@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));`.
  De reset sloopt klassen die shadcn gebruikt (`bg-black/50`, `shadow-xs`): de codemod vangt die op. Vite `build.target` gelijk aan browserslist.
- **Componenten**: shadcn/ui gekopieerd naar `src/web/ui`; na elke `shadcn add` zet een codemod het component op de eigen tokens; varianten in één CVA-recept; afleiden, niet forken; 44 px en focusring in de basis van elk recept.
- **Afgedwongen**: alleen bestaande klassen; in `features/` geen arbitrary values, `!` of `dark:` en alleen layout-klassen;
  geen rauwe `<button> <input> <select> <textarea> <dialog> <a>` buiten `src/web/ui`; geen hex/benoemde kleuren buiten tokens;
  contrasttest over alle receptvarianten; `outline-none` alleen met `focus-visible:ring-*`; één `scanAxe(page)` (wcag2a/aa, 21aa, 22aa; lint verbiedt losse `AxeBuilder`);
  woordenlijsttest op `src/web/copy`; geen `matchMedia`/`userAgent`/`isMobile` in `src/web`; browserslist in `package.json`.
- **Hergebruik**: de schermskill haalt via `scripts/facts.mjs` de actuele componenten op; past geen component, dan stopt de agent en stelt een variant voor.
- **Startkit**: Button, Input, Field, Card, Dialog. Groeit per app-behoefte. WCAG 2.2 AA (4,5:1 tekst, 3:1 UI), één focusring, `prefers-reduced-motion`, 44 px aanraakdoelen.
- `/design-system` (catalogus) en optioneel `/design` (prototypes uit `designs/`), alleen in dev.

## 8. Werkstraat

1. **Spec** in `docs/specs/` volgens `_template.md` — alleen bij migratie, nieuwe route of nieuwe permissie. Status `goedgekeurd` zet alleen de eigenaar.
2. **Contract**: zod-schema's en routes die `501` teruggeven.
3. **Tester-subagent** (sonnet) schrijft acceptatietests tegen het contract; ze compileren en falen op hun asserties. Schrijft alleen in testpaden (PreToolUse-hook).
4. **Hoofdsessie** bouwt tot groen. Mag tests toevoegen, nooit bestaande wijzigen of verwijderen. Lijkt een test van de tester fout,
   dan stopt de hoofdsessie en legt het de eigenaar voor; na akkoord past de tester (niet de hoofdsessie) de test aan.
5. **Reviewer-subagent** (opus, `tools: Read, Grep, Glob, Bash`, `maxTurns`, readonly-bash-hook) keurt tegen `docs/dod.md`: correctheid, duplicatie, spec-afwijking, testinhoud per criterium. Stijl is werk van de lint.
6. **Eigenaar** reviewt en merget.

Licht pad: geen migratie, route of permissie → plan, bouwen, review.

CI zet gewijzigde bestaande tests als lijst in de PR. Ontbreekt de subagent nog, dan draait de rol als ad-hoc subagent met dezelfde opdracht; de hoofdsessie reviewt nooit haar eigen werk.

Hooks (exit 2 blokkeert; exit 1 en een timeout laten door, dus elke hook heeft een korte expliciete `timeout`
en `set -euo pipefail` met `trap 'exit 2' ERR`):

| Hook | Doet |
|---|---|
| PostToolUse (Edit/Write) | ESLint + Prettier op het bewerkte bestand |
| Stop | typecheck/lint/unit op geraakte bestanden; `{"decision":"block","reason":…}` met ≤ 40 regels; stopt direct bij `stop_hook_active`; overslaan in plan mode of zonder wijzigingen; nooit netwerk of database |
| SubagentStop | klaar-criterium per `agent_type`: tester → nieuwe tests compileren en falen op asserties; reviewer → rapport geschreven |
| SessionStart | spec, branch, laatste checkuitslag, status lokale stack (`doctor --quick`) als `additionalContext` |
| PreToolUse guard-files (Edit/Write/Bash) | blokkeert gegenereerde bestanden, gecommitte migraties en wijzigen van bestaande tests (bestand bestaat in `origin/main`) |
| PreToolUse git-guard (Bash) | blokkeert push als de huidige branch `main` is, `HUSKY=0`, `core.hooksPath` |
| PreToolUse tester-paden (subagent, Edit/Write/Bash) | tester schrijft alleen in testpaden |
| PreToolUse readonly-bash (subagent) | reviewer: alleen `pnpm check:*`/`test*`, `git diff/log/show/status`, `gh pr view/diff/checks` |

Permissieregels in `.claude/settings.json` zijn gemak, geen grens (Claude Code-docs): deny op `.env*`, pushes naar `main`,
force, `--no-verify`, mergen en `docker`; `ask` op de beschermde paden (§10) en op `pnpm add/install/update/remove`.
De sandbox (`failIfUnavailable`, `allowUnsandboxedCommands: false`) en GitHub zijn de grens.

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
  (CodeQL); code-owner-review; goedkeuring vervalt bij nieuwe push; geen bypass voor de bot.
- Actions-instellingen: "Allow GitHub Actions to create and approve pull requests" uit; "Require actions to be pinned to a full-length commit SHA" aan.
- **Beschermde paden** (één lijst; CODEOWNERS en `ask` in `.claude/settings.json` spiegelen hem, `check-docs` bewaakt gelijkheid; de `ask`-lijst is nog niet gelijk, zie roadmap):
  `AGENTS.md`, `CLAUDE.md`, `docs/framework.md`, `docs/dod.md`, `docs/adr/`, `docs/specs/`, `.github/`, `.claude/`, `scripts/`,
  `db/init/`, `db/docker/`, `db/tests/`, `compose.yaml`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `mise.toml`,
  `eslint.config.*`, `tsconfig*.json`, `.dependency-cruiser.*`, `lefthook.yml`, `renovate.json`, `.gitattributes`, `src/api/db/`,
  `src/api/auth/`, `src/api/env.ts`, `src/shared/can.ts`, alle `*.test.*`/`*.spec.*`, `e2e/`.
- Instellingen als code in `.github/settings/main-protection.json`; `scripts/check-github.mjs` controleert alleen-lezend dat ze actief zijn en faalt als de agent onder het account van de eigenaar werkt.
- `check-docs` (smal): paden en `pnpm`-scripts in `AGENTS.md`, `CLAUDE.md` en `.claude/**` moeten bestaan; spec-statussen uit de vaste woordenlijst.
- **Spec goedkeuren**: een spec komt in een eigen PR met `status: voorstel`; de eigenaar zet `goedgekeurd` in die PR en keurt hem goed.
  `check-spec-approval` controleert via de GitHub API dat de wijziging naar `goedgekeurd` in een PR zit met een goedkeuring van de eigenaar
  (commit-auteurs zijn te vervalsen).
- `guard.yml` (`pull_request_target`, draait altijd de versie van de default branch) voert de check-scripts van `main` uit. PR-code wordt
  alleen als git-data in een aparte map uitgecheckt en nooit uitgevoerd: geen `pnpm install`, geen configs of scripts uit de PR,
  `persist-credentials: false`, minimale `permissions`.
- Korte branches, één onderwerp, squash-merge, conventional commits.
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
Daarna haalt een gewone `git merge template/main` op een branch, via een PR, de updates binnen. Workflow-wijzigingen pusht de eigenaar.

### Meten

CI logt per PR welke checks faalden. Na een wijziging aan de agent-opzet bouwt de agent dezelfde drie testopdrachten opnieuw;
een regel blijft alleen als hij aantoonbaar helpt.

## 11. Lokaal ontwikkelen

- Ubuntu 24.04 (native of WSL2), code op ext4 (`~/code`), Docker Engine, mise (`mise.toml`). WSL2: `systemd=true` in `/etc/wsl.conf`
  (nodig voor Docker Engine), `fs.inotify.max_user_watches=524288`, `networkingMode=mirrored`.
- `compose.yaml` levert Postgres (eigen image met pgTAP) en Mailpit, gebonden aan `127.0.0.1`. De app (Vite, Hono) draait native, niet in Docker.
- `pnpm dev` (fase 1): Docker-check, `.env.local` uit `.env.example`, `docker compose up -d --build --wait`, migraties, Hono :8787 + Vite :5173.
  Poorten via `.env.local`, zodat meerdere apps naast elkaar draaien.
- De agent gebruikt `docker` niet (deny); de stack is van de eigenaar. Draait de stack niet (SessionStart-hook draait `doctor --quick`), dan vraagt de agent de eigenaar `pnpm dev` te starten. Sandbox met `failIfUnavailable: true`; alleen `pnpm test:db`, `pnpm db:reset`,
  `pnpm db:types` en `pnpm ui:check` draaien buiten de sandbox (`excludedCommands`), en hun scripts vallen onder CODEOWNERS.
- Screenshot-baselines alleen in de gepinde Playwright-image.
- Devcontainer (optioneel): Docker-in-Docker, nooit de host-socket doorgeven.

## 11a. Repo-structuur

```
src/web/      routes/ features/ ui/ lib/ (api.ts, auth.ts, format.ts, report-error.ts) copy/ dev/
src/api/      routes/ domain/ db/ (pool, withUser, schema, ids.ts) auth/ (Better Auth) obs/ env.ts server.ts
src/shared/   schema's, can(), limits.ts, branded IDs, Cents, cursor, foutcodes, assert(), unsafeCast()
deploy/<host>/ adapter per gekozen host (per app)
db/           docker/ (Postgres+pgTAP) init/ (rollen, alleen lokaal) migrations/ (dbmate) tests/ (pgTAP) schema.snapshot.sql
scripts/seed  testgebruikers per rol via de auth-API (wachtwoordhashes, vast lokaal TOTP-geheim voor admin)
scripts/      dev bootstrap doctor test-db ui-check db-types facts.mjs check-*
designs/      optioneel: prototype-exports
docs/         framework.md roadmap.md dod.md specs/ adr/ operations/ background/
.claude/      settings.json agents/ skills/ rules/ hooks/
.github/      workflows/ settings/ CODEOWNERS pull_request_template.md
compose.yaml  mise.toml  AGENTS.md  CLAUDE.md  CHANGELOG.md
```

## 12. Fasering

| Fase | Inhoud |
|---|---|
| 0. Bewijs | `api_user` + `withUser()` via `pg`, direct én via PgBouncer (transaction mode) in compose, zonder lekken |
| 1. Fundament | Checks, secure route, database, auth, frontend-basis, design system, agent-opzet, GitHub — zie `roadmap.md` |
| 2. Eerste features (per app) | Gouden pad, `new:resource`-generator, clientfouten, `check:catalogus` |
| 3. Eerste release (per app) | Providerkeuze per ADR, adapter, staging/productie, runbooks |

Fase 0 en 1 horen in de template. Fase 2 levert het gouden pad en de generator terug aan de template; fase 3 is per app.

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
