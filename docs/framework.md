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
4. **Lokaal is gelijk aan productie.** Dezelfde Postgres-majorversie, dezelfde rollen, grants, RLS, migraties en checks.
5. **Rails groeien met bewijs.** Een check of regel komt erbij als een fout aantoonbaar doorglipte. De eigenaar reviewt elke PR en releaset.
6. **Provider-neutraal.** De template kent geen hostingprovider en geen database-as-a-service. Een app kiest die per
   ADR (zie §3); de code raakt de keuze alleen via een adapter.

## 2. Architectuur

Eén repository, één pakket, drie lagen, bewaakt door dependency-cruiser:

| Laag | Map | Mag importeren | Mag nooit |
|---|---|---|---|
| Frontend (Vite + React SPA) | `src/web` | `src/shared`, het type `AppType` uit `src/api` | databasedriver, ORM, `process.env`, andere code uit `src/api` |
| API (Hono) | `src/api` | `src/shared` | `src/web` |
| Gedeeld | `src/shared` | alleen libraries (zod) | `src/web`, `src/api` |
| Database-toegang | `src/api/db` | driver (`pg`) en Drizzle — als enige | iets anders exporteren dan `withUser()` |

- De browser praat alleen met de API, same-origin via `/api`. Lokaal proxyt Vite (:5173) `/api` naar Hono (:8787).
- De Hono-app is host-onafhankelijk. Ingangen: `src/api/server.ts` (Node, lokaal en containerhosts) en per gekozen
  host één adapterbestand in `deploy/<host>/`. Een adapter importeert de app en doet verder niets.
- Geen server-rendering: alle schermen zitten achter een login.
- Prestaties: API en database in dezelfde regio; kleine pool op moduleniveau; JWKS bij laden van de module;
  geen opeenvolgende queries per request; databasetijd per request in de log; bundelbudget (size-limit); routes lazy.

## 3. Poorten en adapters

| Poort | Template levert | Per app te kiezen (ADR) | Voorbeeld |
|---|---|---|---|
| Postgres | Postgres in Docker (`compose.yaml`), rollen en RLS in migraties | Beheerde Postgres | Supabase, Neon, RDS |
| Frontend + API hosting | `vite build` (statisch) + `src/api/server.ts` | Host + adapter in `deploy/<host>/` | Vercel, Cloudflare, Fly |
| Auth | JWT-verificatie via JWKS in `src/api/auth` | Identity provider (OIDC/JWT) | Supabase Auth, Auth0, Keycloak |
| E-mail | Mailpit in Docker | SMTP-dienst | — |
| Fouttracking | Eigen tabel via `reportClientError()` | Optionele dienst | Sentry |

Regels voor elke keuze:
- De database is altijd gewoon Postgres. Geen provider-specifieke functies (`auth.uid()`, Data API, Storage-policies)
  in migraties of code. De gebruiker komt uit `app.current_user_id()`, gezet door `withUser()`.
- Biedt de provider een directe data-API aan de browser (zoals Supabase Data API, Storage of Realtime), dan staat die uit.
  Een smoketest bewijst met een echte gebruikerstoken dat de browser er niet bij kan.
- Een provider-SDK in `src/web` is alleen toegestaan voor inloggen, en alleen het auth-deel.

## 4. Codeerkaders

Alle lintregels op `error`; CI draait met `--max-warnings 0`. Checks op code gebruiken de AST (ESLint,
dependency-cruiser); checks op de database lezen de catalogus van de lokale database (`pg_policies`, `pg_proc`,
`information_schema`), nooit een regex over bronbestanden.

- **Lintmeldingen zijn instructies**: `no-restricted-imports`/`no-restricted-syntax` noemen de juiste helper.
- **Kleine eenheden**: max-lines-per-function 60 (`.ts`) / 120 (`.tsx`); sonarjs cognitive-complexity 15; max-params 3; max-depth 3.
- **Parse op elke grens**: zod via `defineRoute()` voor request en response (`.strict()`); env-schema in `src/api/env.ts`, de enige plek met `process.env`.
- **Geen casts**: `as` is verboden; `unsafeCast(value, reden)` in `src/shared` is de enige uitweg. CI zet het verschil in aantal op de PR.
- **`assert(cond, msg)`** in `src/shared`, actief in productie; in de frontend vangt een ErrorBoundary per route hem op.
- **Branded IDs** (`UserId`) via zod `.brand()`; een script na schema-introspectie zet `$type<UserId>()` terug.
- **TypeScript streng**: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noFallthroughCasesInSwitch`;
  typescript-eslint `strictTypeChecked` met `switch-exhaustiveness-check`. TypeScript gepind op 6.0.x.

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
- `gate:slow` = `test:db` met `check-policies`, squawk op migraties, schema-snapshot zonder verschil, kleine e2e-set — tegen een verse database.
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
| Routing | TanStack Router, bestandsroutes, getypte zoekparameters; elke route ErrorBoundary + `beforeLoad`-guard met `can()` | Router-types; lint op routes zonder guard |
| State | Server-state in TanStack Query; UI-state in de URL; formulieren in React Hook Form; geen globale store | Lint verbiedt store-libraries |
| Data | Per resource één `queries.ts` met key-factory, hooks en mutaties; mutatie invalideert eigen resource + "raakt ook" | Lint: `useQuery`/`useMutation` alleen in `queries.ts` |
| API-client | Eén client in `src/web/lib/api.ts`: token, één retry na 401, foutcodes → `ApiError` | Lint verbiedt `fetch(` elders |
| Formulieren | `<Form>`/`<FormField>` met zodResolver op het gedeelde schema; serverveldfouten via `setError` | Lint verbiedt `useForm` buiten de wrapper |
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
- **JWT-verificatie**: asymmetrisch, JWKS bij laden van de module, algoritme-allowlist, controle op `iss`, `aud`, `exp`.
  Korte levensduur (~15 min). Gebruikersbewerkbare metadata wordt nooit gelezen voor autorisatie.
- **Eigen databaserol**: de API verbindt als `api_user` (NOINHERIT, geen eigen rechten, alleen lid van `app_authenticated`),
  nooit als superuser of eigenaar. Systeemjobs krijgen een aparte rol. Werkt de gekozen pooler (transaction mode) niet met
  deze rol, dan valt het ontwerp om: bewijzen vóór de keuze definitief is.
- **`withUser(actor, tx => …)` als enige ingang**: één transactie per request die rol en `app.user_id` zet; read only voor GET.
- **Rollen uit de database**, uit `user_roles` per request; een rol in de token is alleen een UI-hint. Admin-routes controleren dat de sessie nog geldig is.
- **Autorisatie zonder overlap**: `can(permissie)` op functieniveau (BFLA); RLS op rijniveau (BOLA). Elke tabel RLS aan
  (`FORCE ROW LEVEL SECURITY`), elke policy een pgTAP-test op naam. Policies gebruiken `(select app.current_user_id())`.
- **MFA voor admin**: permissies met kenmerk admin eisen een sterkere sessie (bijv. `aal2`), in `can()` én in een RLS-helper.
- **Grants**: geen standaardrechten op nieuwe tabellen (`ALTER DEFAULT PRIVILEGES … REVOKE`); elke tabel expliciete grants in de migratie;
  een pgTAP-invariant eist dat geen API-rol TRUNCATE, REFERENCES of TRIGGER heeft en dat elke tabel RLS aan heeft.
- **`search_path = ''`** op elke `security definer`-functie, met volledig gekwalificeerde namen.
- **Schema-snapshot**: `db/schema.snapshot.sql` via `pg_dump --schema-only` van de lokale database; de agent leest dit, CI faalt bij verschil.
- **Eén actor**: `defineRoute` geeft `ctx.actor`; een handler zoekt de gebruiker nooit zelf op.
- **Databasefouten op één plek**: `withUser()` vertaalt 23505 → `ALREADY_EXISTS`, 23503 → `NOT_FOUND`, 42501 → `FORBIDDEN`.
- **Limieten één keer** in `src/shared/limits.ts`; een CHECK-constraint met dezelfde waarde krijgt een gelijkheidstest.
- **Verharding**: rate limit op dure routes en op inloggen/reset (bij de identity provider of de API); CAPTCHA op aanmelden/reset;
  CSP `default-src 'self'`, `frame-ancestors 'none'`, alleen de nodige extra domeinen; HSTS, nosniff, Referrer-Policy;
  service worker cachet nooit `/api/*`; één `onError` die `{ code, requestId }` teruggeeft, nooit stacktraces of SQL;
  `/design-system` en `/design` bestaan alleen in dev-builds; de clientfouten-route is de enige route zonder login en heeft limieten.
- **Logging**: per request `requestId`, gebruiker-ID, duur, databasetijd. Clientfouten naar een eigen tabel.
- **Secrets**: env-schema bij opstart; alleen publieke waarden krijgen `VITE_`. Geen productiegeheimen in de werkmap.
  Secret scanning met push protection; gitleaks in pre-commit en CI.
- **Supply chain**: Renovate gegroepeerd; pnpm met `minimumReleaseAge` (7 dagen), expliciete `allowBuilds`, `trustPolicy: no-downgrade`;
  Actions gepind op SHA, `permissions: read-all`; deploy-secrets alleen in beschermde GitHub-environments.

## 7. Design system

- **Tokens in drie lagen** in CSS (enige bron): primitief (OKLCH-palet, nooit direct gebruikt) → semantisch (shadcn-namen:
  `--background`, `--foreground`, `--primary`, … `--radius`; de enige laag die een app aanpast) → component (`--control-h-*`, `--focus-ring-*`).
- In `@theme` worden kleur, radius en schaduw van Tailwind gereset; `bg-red-500` bestaat niet. Dark mode via `[data-theme=dark]`.
- **Componenten**: shadcn/ui gekopieerd naar `src/web/ui`; varianten in één CVA-recept; afleiden, niet forken; 44 px en focusring in de basis van elk recept.
- **Afgedwongen**: alleen bestaande klassen; in `features/` geen arbitrary values, `!` of `dark:` en alleen layout-klassen;
  geen rauwe `<button> <input> <select> <textarea> <dialog> <a>` buiten `src/web/ui`; geen hex/benoemde kleuren buiten tokens;
  contrasttest over alle receptvarianten; `outline-none` alleen met `focus-visible:ring-*`; één `scanAxe(page)` (wcag2a/aa, 21aa, 22aa);
  woordenlijsttest op `src/web/copy`; geen `matchMedia`/`userAgent`/`isMobile` in `src/web`; browserslist in `package.json`.
- **Hergebruik**: de schermskill haalt via `scripts/facts.mjs` de actuele componenten op; past geen component, dan stopt de agent en stelt een variant voor.
- **Startkit**: Button, Input, Field, Card, Dialog. Groeit per app-behoefte. WCAG 2.2 AA.
- `/design-system` (catalogus) en optioneel `/design` (prototypes uit `designs/`), alleen in dev.

## 8. Werkstraat

1. **Spec** in `docs/specs/` volgens `_template.md` — alleen bij migratie, nieuwe route of nieuwe permissie. Status `goedgekeurd` zet alleen de eigenaar.
2. **Contract**: zod-schema's en routes die `501` teruggeven.
3. **Tester-subagent** (sonnet) schrijft acceptatietests tegen het contract; ze compileren en falen op hun asserties. Schrijft alleen in testpaden (PreToolUse-hook).
4. **Hoofdsessie** bouwt tot groen. Mag tests toevoegen, nooit bestaande wijzigen of verwijderen.
5. **Reviewer-subagent** (opus, zonder Write/Edit, readonly-bash) keurt tegen `docs/dod.md`: correctheid, duplicatie, spec-afwijking, testinhoud per criterium. Stijl is werk van de lint.
6. **Eigenaar** reviewt en merget.

Licht pad: geen migratie, route of permissie → plan, bouwen, review.

Hooks falen dicht (`set -euo pipefail`, `trap 'exit 2' ERR`): PostToolUse (lint op bestand), Stop (typecheck/lint/unit op geraakte
bestanden, `{"decision":"block"}` met ≤ 40 regels, max één keer per beurt, nooit netwerk of database), SubagentStop (klaar-criterium per subagent),
SessionStart (spec, branch, laatste check, status lokale stack), guard-files (geen gegenereerde bestanden of gecommitte migraties bewerken),
tester-paden, readonly-bash (reviewer). `.claude/settings.json`: `ask` op checks, workflows, hooks, `.claude/`, pgTAP-invarianten; deny op `.env*`,
push naar `main`, `gh pr merge`, `--no-verify`.

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

- Repo in een organisatie; de agent pusht met een fijnmazig token van een bot-account zonder workflows-recht. De eigenaar merget.
- Ruleset op `main`: alleen via PR; verplichte checks `gate:fast`, `gate:slow`, CodeQL, osv-scanner; code-owner-review op tests,
  `.github/`, `scripts/`, `.claude/`, `db/tests/`; goedkeuring vervalt bij nieuwe push; geen force push; geen bypass voor de bot.
- Instellingen als code in `.github/settings/main-protection.json`; `scripts/check-github.mjs` controleert dat ze actief zijn.
- `guard.yml` (`pull_request_target`) draait de check-scripts van `main`, nooit die uit de PR.
- Korte branches, één onderwerp, squash-merge, conventional commits.
- Release: lokaal → PR → staging → productie. Database vóór code, altijd eerst staging. Migraties append-only en expand/contract;
  `check-migrations` vergelijkt met `origin/main` en eist unieke versienummers. Nooit handmatig aan productie.
  Rollback: code via de host, database vooruit met een nieuwe migratie. Concreet per host in `docs/operations/` (fase 3, per app).

## 11. Lokaal ontwikkelen

- Ubuntu 24.04 (native of WSL2), code op ext4 (`~/code`), Docker Engine, mise (`mise.toml`).
- `compose.yaml` levert Postgres en Mailpit, gebonden aan `127.0.0.1`. De app (Vite, Hono) draait native, niet in Docker.
- `pnpm dev` (fase 1): Docker-check, `docker compose up -d --wait`, migraties, Hono :8787 + Vite :5173.
- De agent start of stopt Docker nooit. Sandbox met `failIfUnavailable: true`; alleen `pnpm test:db`, `pnpm db:reset`,
  `pnpm db:types` en `pnpm ui:check` draaien buiten de sandbox (`excludedCommands`), en hun scripts vallen onder CODEOWNERS.
- Screenshot-baselines alleen in de gepinde Playwright-image.

## 12. Fasering

| Fase | Inhoud |
|---|---|
| 0. Bewijs | `api_user` + `withUser()` via `pg` (en via pooler) zonder lekken |
| 1. Fundament | Checks, secure route, database, auth-poort, frontend-basis, design system, agent-opzet, GitHub — zie `roadmap.md` |
| 2. Eerste features (per app) | Gouden pad, `new:resource`-generator, clientfouten, `check:catalogus` |
| 3. Eerste release (per app) | Providerkeuze per ADR, adapter, staging/productie, runbooks |

Fase 0 en 1 horen in de template. Fase 2 levert het gouden pad en de generator terug aan de template; fase 3 is per app.
