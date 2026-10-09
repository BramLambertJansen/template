<!-- Achtergrond, NIET normatief. Oorspronkelijk plan (Claude Doc "Agent-framework: plan", rev 77, 2026-10-09), Supabase- en Vercel-specifiek. De wet is docs/framework.md (zie ADR 0002). -->

# Agent-framework: plan

2026-10-09 · Bram Jansen

## Samenvatting

Dit plan beschrijft hoe één webapplicatie professioneel wordt opgezet en gebouwd door AI-agents binnen afgedwongen kaders. Wat een machine kan controleren, controleert een machine; documentatie legt alleen uit. Hergebruik als basis voor latere apps is een bijkomend voordeel, geen ontwerpdoel.

Stack: Vite + React SPA en een TypeScript-API (Hono) in één repository; Postgres en Auth van Supabase. Ontwikkelen gebeurt volledig lokaal: localhost plus Docker in Ubuntu, zonder externe accounts of cloudomgeving. Bij een release gaat de app naar Vercel en Supabase.

Vijf principes:

- **De fout onmogelijk maken, niet verbieden.** De browser heeft geen databaseclient, de API-laag exporteert alleen `withUser()`, en een route bestaat alleen via `defineRoute()` die validatie, permissie en output verplicht maakt. Wat het typesysteem afdwingt, hoeft geen regel te zijn.

- **Afdwingen boven afspreken.** Wat niet onmogelijk te maken is, blokkeert een check in CI. CLAUDE.md, skills en hooks sturen en geven snelle feedback; de harde grens ligt in CI en op GitHub.

- **Eén bron per feit.** Migraties voor het datamodel, zod-schema's voor contracten, één CSS-laag voor tokens, één script per check.

- **Lokaal is gelijk aan productie.** Dezelfde Postgres-versie, dezelfde diensten met dezelfde instellingen (ook Storage en Realtime, dicht zoals in productie), dezelfde migraties en checks.

- **Rails groeien met bewijs.** De opzet begint met wat nodig is; een check of regel komt erbij als een fout aantoonbaar doorglipte. Jij reviewt elke PR en releaset.


### Omgevingen

|  | Lokaal | Staging | Productie |
|---|---|---|---|
| Doel | Bouwen en testen | Release-kandidaat met echte diensten | Gebruikers |
| Frontend + API | Vite op `localhost:5173`, Hono op `localhost:8787` via Vite-proxy | Apart Vercel-project | Vercel-project productie |
| Database + Auth | Supabase-stack in Docker | Eigen Supabase-project (gratis laag) | Eigen Supabase-project (Pro) |
| E-mail | Mailpit, vangt alle mails op | Echte SMTP | Echte SMTP |
| Gegevens | Seed met testgebruikers per rol | Seed | Echt; nooit naar lokaal gekopieerd |
| Externe accounts nodig | Geen | Vercel, Supabase, SMTP | Vercel, Supabase, SMTP, fouttracking |
| Wie zet erop | Jij en de agent | CI na merge op `main` | CI na jouw goedkeuring van een release-tag |

Staging is een apart Vercel-project in plaats van een custom environment, omdat dat ook op de gratis laag werkt. Lokaal werkt alles offline zodra de Docker-images binnen zijn.

## Architectuur

Drie lagen in één pakket, gescheiden door mappen die dependency-cruiser bewaakt. De browser praat alleen met de API; de API is de enige plek die Postgres raakt, en doet dat onder de identiteit van de gebruiker.

*[Diagram: architectuur · drie lagen, één contract — zie het originele plan]*

**Waarom één pakket:** een monorepo met drie pakketten levert voor één app vooral onderhoud op (drie configs, workspace-links, build-volgorde). Mappen `src/web`, `src/api` en `src/shared` met harde importregels geven dezelfde garantie.

**Hoe het draait:** dezelfde Hono-app heeft twee ingangen. Lokaal start `@hono/node-server` hem op `localhost:8787` en stuurt de Vite-devserver `/api` daarheen door, zodat de browser same-origin werkt zoals in productie. Op Vercel exporteert `api/index.ts` dezelfde app als functie, met een rewrite van `/api/*` in `vercel.json`. Geen Vercel-account nodig om te ontwikkelen.

**Contract per route:** `defineRoute({ method, path, input, output, permission, handler })` is de enige manier om een route te maken. Input wordt met zod `.strict()` gevalideerd, `permission` loopt via dezelfde `can()` die de UI gebruikt, en de output gaat door het DTO-schema voordat hij de deur uit gaat. De getypte client volgt automatisch. De types per resource worden apart geëxporteerd, zodat de TypeScript-server niet trager wordt naarmate er routes bijkomen.

**Waarom een SPA met losse API:** alle schermen zitten achter een login, dus server-rendering levert niets op. Een expliciete HTTP-grens is voor agents het duidelijkst en houdt de API los van Vercel. Een full-stack framework met server functions (TanStack Start, React Router framework mode) is een redelijk alternatief met dezelfde beveiliging; de keuze voor Hono houdt de uitwijkroute naar een andere host open.

**Snelheid:** de Vercel-functies draaien in dezelfde regio als de Supabase-database; een CI-check controleert `regions` in `vercel.json`. Per request kost de database minstens vier rondes (begin, rol en claims zetten, query, commit): binnen de regio ~5–15 ms, buiten de regio ~360 ms. Daarom: JWKS bij het laden van de module ophalen, een kleine pool op moduleniveau, geen opeenvolgende queries per request, en databasetijd per request in de log. De frontend heeft een bundelbudget (`size-limit` in `gate:fast`) en laadt routes lazy.

## Codeerkaders

Agents schrijven snel en dupliceren graag. De kaders hieronder geven de agent feedback zo vroeg mogelijk: per bewerkt bestand, niet pas in CI. Alle lintregels staan op `error`, CI draait met `--max-warnings 0`.

### Regels

- **Lintmeldingen zijn instructies.** `no-restricted-imports` en `no-restricted-syntax` verbieden de omweg en noemen de juiste helper ("gebruik `api` uit `@/web/lib/api`"). De agent leest de melding en corrigeert zichzelf.

- **Kleine eenheden.** `max-lines-per-function` 60 voor `.ts` en 120 voor `.tsx`; sonarjs `cognitive-complexity` 15 als enige complexiteitsregel; `max-params` 3; `max-depth` 3.

- **Parse op elke grens.** Zod via `defineRoute()` voor request en response, een env-schema in `src/api/env.ts` (de enige plek met `process.env`).

- **Geen casts, één uitweg.** `as` is verboden; `unsafeCast(value, reden)` in `src/shared` is de enige uitzondering, voor waar library-types tekortschieten. CI zet het verschil in aantal als commentaar op de PR, zodat jij het ziet bij review.

- **`assert(cond, msg)`** in `src/shared`, actief in productie, gekoppeld aan fouttracking. In de frontend vangt een ErrorBoundary per route een gefaalde assert op.

- **Branded IDs** (`UserId`) via zod `.brand()`. Een script na `drizzle-kit pull` zet `$type<UserId>()` op de juiste kolommen, zodat een nieuwe pull de brands niet wist.

- **TypeScript streng:** `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noFallthroughCasesInSwitch`; typescript-eslint `strictTypeChecked` met `switch-exhaustiveness-check`. TypeScript gepind op 6.0.x.


**Checks lezen de werkelijkheid, geen tekst.** Checks op code gebruiken de AST (ESLint, dependency-cruiser), checks op de database lezen de catalogus van de lokale database (`pg_policies`, `pg_proc`, `information_schema`). Een regex over broncode keurt ook een regel goed die alleen in commentaar staat, en een grep over migraties ziet oude functiedefinities die allang vervangen zijn.

### Grenzen tussen mappen

dependency-cruiser bewaakt de importgraaf: `src/web` importeert uit `src/api` alleen het type `AppType`; alleen `src/api/db` importeert de databasedriver en Drizzle, en exporteert zelf alleen `withUser()`; `src/shared` importeert niets uit `web` of `api`; geen cycles.

### Snelle feedbacklus

| Moment | Wat | Duur |
|---|---|---|
| Na elke bewerking (hook) | ESLint en Prettier op dat ene bestand | ~1–2 s |
| Pre-commit | Format, ESLint op staged bestanden, gitleaks | < 10 s |
| Einde beurt (Stop-hook) | `tsc --incremental`, ESLint `--cache` en `vitest --changed` op geraakte bestanden | ~10–30 s |
| Database-tests (agent) | `pnpm test:db`: integratie en pgTAP tegen de lokale stack | ~20–60 s |
| Pre-push | Volledige `gate:fast` | < 60 s |
| CI | `gate:fast` + build, daarna `gate:slow` | 3–5 min, 8–15 min |

`gate:fast` = lint, typecheck, unit-tests, dependency-cruiser, bundelbudget, `check-migrations`, `check-docs` (smal: paden en `pnpm`-scripts in `AGENTS.md`, `CLAUDE.md` en `.claude/**` moeten bestaan, statussen uit de vaste woordenlijst). `gate:slow` = `test:db` met de policy-check, squawk en `supabase db lint` op migraties, het schema-snapshot zonder verschil, plus een kleine e2e-set, alles tegen een verse Supabase-stack. Naast CI draaien CodeQL en osv-scanner als verplichte checks.

### Tests

- **Unit** met Vitest op `src/api/domain` en `src/shared`; property-based (fast-check) voor reken- en parselogica.

- **Integratie** tegen de lokale stack. `withUser()` accepteert in tests een geïnjecteerde transactie, zodat elke test in een savepoint draait; per feature één test die echt commit, om triggers en constraints te raken.

- **Races:** elke mutatie met een uniekheidsregel of geld krijgt een integratietest met twee gelijktijdige requests; precies één slaagt.

- **E2E** met Playwright altijd tegen de echte lokale stack, nooit met gemockte API of database: alleen zo is het contract tussen frontend, API en database echt getest. Inloggen per rol en één kernflow per feature, met de CSP aan.


## Vaste patronen

Structuur en beveiliging liggen vast via types en checks; dit hoofdstuk legt het dagelijkse gedrag vast, zodat elke sessie hetzelfde bouwt. Elk patroon staat in het gouden pad (de eerste feature) en vanaf fase 2 in de generator-templates. De agent kopieert het in plaats van het te onthouden.

### Frontend

| Gebied | Vast patroon | Afgedwongen door |
|---|---|---|
| Routing | TanStack Router met bestandsroutes en getypte zoekparameters. Elke route heeft een ErrorBoundary en een `beforeLoad`-guard die `can(permissie)` controleert | Router-types; lint op routes zonder guard |
| State | Server-state alleen in TanStack Query, UI-state (filters, tabs, paginering) in de URL, formulierstate in React Hook Form. Geen globale store | Lint verbiedt store-libraries |
| Data ophalen | Per resource één `queries.ts` met key-factory (`keys.notes.list(filters)`), hooks en mutaties. Een mutatie invalideert zijn eigen resource plus wat in de spec onder "raakt ook" staat. Optimistisch alleen als de spec het vraagt | Lint verbiedt `useQuery`/`useMutation` buiten `queries.ts` |
| API-client | Eén client: zet het token, ververst bij 401 één keer en probeert opnieuw, zet foutcodes om naar `ApiError` | Lint verbiedt `fetch(` buiten de client |
| Formulieren | React Hook Form met `zodResolver` op het gedeelde schema via `<Form>` en `<FormField>`. Valideren bij verlaten, daarna bij typen; verzendknop uit tijdens de mutatie; serverveldfouten via `setError` | Lint verbiedt `useForm` buiten de wrapper |
| Laden, leeg, fout | Eén `<AsyncView query empty>` toont skeleton, lege staat of foutstaat | Lint op `.isLoading`/`.isError` in `features/` |
| Teksten | Foutcode naar tekst in `copy/errors.ts` als `Record<ErrorCode, string>`; zod-meldingen in het Nederlands via de zod-locale | TypeScript |
| Rechten in de UI | Dezelfde `can(permissie)` uit `src/shared` als de API; knoppen en menu's verbergen wat niet mag. De API blijft de echte controle | Eén functie, twee gebruikers |

### Data en waarden

| Gebied | Vast patroon |
|---|---|
| Datums | `timestamptz` in de database, ISO-strings in het contract, één formatter-module (`Intl`, Europe/Amsterdam) in de UI |
| Bedragen | Gehele centen (`integer`), branded type `Cents`, één formatter |
| Paginering | Cursor-contract in `src/shared` (`{ items, nextCursor }`), cursor in de URL |
| Naamgeving | Bestanden kebab-case, componenten PascalCase, hooks `useX`, routes per resource in meervoud, tabellen en kolommen snake_case (Drizzle mapt naar camelCase); UI-tekst Nederlands, code en commits Engels |

### Werkafspraken

- **Spec-sjabloon** in `docs/specs/_template.md`, met status (`voorstel`, `goedgekeurd`, `gebouwd`, `vervallen`; alleen jij zet `goedgekeurd`). Vaste koppen, geen kop weglaten ("n.v.t. — reden" mag): doel in één zin; rollen en wie wat ziet; datawijzigingen met grants; routes en foutcodes; **hergebruik en UX** (welke bestaande componenten, per scherm de staten laden, leeg, fout, bezig, gelukt en verouderd, alle zichtbare tekst letterlijk, focusvolgorde en toetsenbord); acceptatiecriteria met namespace (`notes/AC-1`, gegeven/wanneer/dan); randgevallen als tabel (situatie → gedrag → foutcode); "raakt ook"; buiten scope; testplan. Ontbreekt een antwoord, dan vraagt de agent het; hij vult geen aanname in. De reviewer controleert dat elk criterium een test met inhoud heeft.

- **Responsive zonder apparaatdetectie.** Layout past zich aan via CSS-breakpoints en container queries; de lint verbiedt `matchMedia`, `userAgent` en `isMobile` in `src/web`. Wat echt per formaat verschilt (bijvoorbeeld een sheet in plaats van een dialoog), regelt één hook op basis van breakpoints, nooit per component.

- **UI-controle** via `pnpm ui:check <route>`: screenshots op 375 en 1280 px plus axe. Vaste stap in de skill voor schermwerk en een punt op de reviewlijst.

- **Licht pad:** een wijziging zonder migratie, nieuwe route of nieuwe permissie slaat spec en tester over. Alles daarboven volgt de volledige werkstraat.

- **Stack draait niet:** de `SessionStart`-hook draait `doctor --quick` en zet de uitkomst in de context. Staat de stack uit, dan vraagt de agent jou `pnpm dev` te starten.

- **Waar een regel woont:** op precies één plek, in deze volgorde van voorkeur: type of `defineRoute` (onmogelijk) → lintregel of check → gouden pad of template → padregel in `.claude/rules/` → AGENTS.md.


## Data-toegang en security

Alle data loopt via de API; de browser kan geen enkele Supabase-dienst gebruiken behalve inloggen. Ankerpunten: OWASP Top 10:2025 (vooral A01 Broken Access Control en A03 Supply Chain), de OWASP API Security Top 10, en OWASP ASVS 5.0 niveau 1 als checklist in een `security-review`-skill.

### De secure route

- **Alleen inloggen vanuit de browser.** De browser gebruikt `@supabase/auth-js`, niet de volledige `supabase-js`.

- **Data API, Storage en Realtime dicht, lokaal én in productie.** Data API uit; geen Storage-policies voor `authenticated` (bestanden via signed URL's van de API); Realtime: "Allow public access" uit en geen policies op `realtime.messages`. Een smoketest probeert met een echte gebruikerstoken een tabel te lezen, een bucket te listen en op Realtime te abonneren; alle drie moeten falen. Hij draait lokaal en tegen staging als release-voorwaarde.

- **JWT-verificatie.** Asymmetrische signing keys, JWKS bij het laden van de module opgehaald, expliciete algoritme-allowlist, controle op `iss`, `aud`, `exp` en rol. Hono ≥ 4.11.4. Korte token-levensduur (bijvoorbeeld 15 minuten). `user_metadata` wordt nooit gelezen: gebruikers kunnen het zelf aanpassen.

- **Eigen databaserol via de pooler.** De API verbindt via Supavisor in transaction mode als `api_user` (`NOINHERIT`, geen eigen rechten, alleen lid van `authenticated`), met `pg` en een kleine pool op moduleniveau. Nooit als `postgres`. Systeemjobs krijgen een aparte rol. **Eerste taak van fase 1:** bewijzen dat Supavisor met deze eigen rol werkt; anders valt dit ontwerp om.

- **`withUser(claims, tx => …)`**** als enige ingang.** Eén transactie per request die rol en claims zet; `read only` voor GET-routes. De databasemodule exporteert niets anders.

- **Rollen uit de database, niet uit de token.** `requirePermission()` en de RLS-helpers lezen de rol per request uit `user_roles`; een rol in de token is alleen een hint voor de UI. Intrekken werkt daardoor direct. Voor admin-routes controleert de API ook dat de sessie nog bestaat (`session_id` tegen `auth.sessions`), zodat uitloggen of blokkeren meteen telt.

- **Autorisatie zonder overlap.** `can(permissie)` beslist op functieniveau (mag deze rol deze route; voorkomt BFLA). RLS beslist op rijniveau (welke rijen ziet en wijzigt deze gebruiker; voorkomt BOLA). Elke tabel heeft RLS aan en elke policy een pgTAP-test. Policies gebruiken `(select auth.uid())`.

- **MFA voor admin.** Permissies met kenmerk `admin` eisen `aal2`, in `can()` en in een RLS-helper; getest met een admin-token op `aal1`.


**Rechten rond RLS.** Policies alleen zijn niet genoeg: een API-rol met TRUNCATE, REFERENCES of TRIGGER op een tabel omzeilt RLS alsnog. Daarom staat nieuwe tabellen automatisch blootstellen uit, krijgt elke tabel expliciete grants in de migratie, en controleert een pgTAP-invariant dat geen enkele API-rol een recht heeft dat RLS omzeilt en dat elke tabel RLS aan heeft.

**Database-afspraken:**

- **Schema-snapshot.** `supabase/schema.snapshot.sql` wordt gegenereerd met `supabase db dump --local --schema-only`: één leesbaar bestand met de huidige tabellen, functies, grants en policies. De agent leest dit in plaats van alle migraties; CI faalt als het snapshot niet bij de migraties past.

- **Elke policy een test, op naam.** `check-policies` leest `pg_policies` uit de lokale database en eist dat elke policynaam in een pgTAP-test voorkomt.

- **`search_path = ''`** op elke `security definer`-functie (RLS-helpers, audit-triggers), met volledig gekwalificeerde namen. De advisors van Supabase bewaken dit.

- **Eén actor.** `defineRoute` geeft de handler een getypte `ctx.actor` uit de permissiecheck; een handler zoekt de gebruiker nooit zelf opnieuw op.

- **Databasefouten op één plek vertaald.** `withUser()` zet Postgres-fouten om naar domeincodes uit het register: 23505 (uniek) → bijvoorbeeld `ALREADY_EXISTS`, 23503 (verwijzing) → `NOT_FOUND`, 42501 (RLS) → `FORBIDDEN`. Geen enkele route vangt ze zelf af.

- **Limieten één keer.** Grenzen staan in `src/shared/limits.ts`. Heeft de database ook een CHECK-constraint, dan bewijst een test dat beide waarden gelijk zijn.


Sleutels: `sb_publishable_` in de browser, `sb_secret_` alleen server-side, legacy-sleutels uit.

### Verharding

- **Rate limiting:** inloggen, reset en magic links gaan rechtstreeks naar Supabase Auth; daar gelden de rate limits van Supabase plus een CAPTCHA (Cloudflare Turnstile) op aanmeld- en resetformulieren. Dure API-routes krijgen een eigen limiet.

- **CSP, volledig uitgeschreven:** `default-src 'self'`; `script-src 'self'` plus het Turnstile-domein; `frame-src` het Turnstile-domein; `connect-src 'self'` plus de Supabase Auth-URL; `style-src 'self'` plus wat de toast-bibliotheek nodig heeft (bij voorkeur een nonce); `img-src 'self' data:`; `frame-ancestors 'none'`. Fouttracking via een tunnel-route `/api/monitoring`. E2E-tests draaien met de CSP aan, zodat een overtreding faalt.

- **Overige headers:** HSTS, `nosniff`, `Referrer-Policy`.

- **Service worker** (PWA) cachet nooit `/api/*`, zodat gebruikersdata niet blijft hangen op een gedeeld apparaat.

- **Token in localStorage:** de CSP blokkeert geïnjecteerde scripts, niet een gecompromitteerde dependency; daartegen helpen de supply-chain-maatregelen.

- **Fouten:** één `onError` die `{code, requestId}` teruggeeft; nooit stacktraces of SQL.


- **Ontwikkelpagina's niet in productie.** `/design-system` en `/design` bestaan alleen in dev-builds; de productiebuild laat ze weg in plaats van ze achter een wachtwoord te zetten.

- **De clientfouten-route is de enige route zonder login.** Hij krijgt een maximale grootte per melding, een limiet per IP en per minuut, en slaat geen vrije tekst op die langer is dan nodig.


### Logging en back-ups

- **Logs** per request met `requestId`, gebruiker-ID, duur en databasetijd.

- **Clientfouten naar de eigen database** (vanaf fase 2): onverwachte fouten in de frontend gaan via `reportClientError()` naar een API-route en worden opgeslagen in een eigen tabel, ook lokaal, zonder extern account. Een lintregel verbiedt een kale `console.error` in `queries.ts` en de API-client. Sentry of een vergelijkbare dienst is optioneel in productie.

- **Back-ups:** dagelijkse back-ups van Supabase Pro voor productie. Fase 3 is pas klaar als een back-up één keer is teruggezet in een lokale stack, volgens `docs/operations/backup-restore.md`.


### Secrets en supply chain

- Env-schema bij opstart; alleen de publishable key en URL's krijgen `VITE_`.

- GitHub secret scanning met push protection; gitleaks in pre-commit en CI.

- Renovate met gegroepeerde updates; pnpm met `minimumReleaseAge` (7 dagen), expliciete `allowBuilds` en `trustPolicy: no-downgrade`.

- GitHub Actions gepind op SHA, `permissions: read-all`. Deploy-secrets alleen in beschermde GitHub-environments.


- **CodeQL** (statische analyse) en **osv-scanner** (bekende kwetsbaarheden in dependencies) zijn verplichte checks op elke PR en draaien daarnaast wekelijks op `main`.


### Agentveiligheid

- **Eigen GitHub-identiteit voor de agent:** de repo staat in een (gratis) organisatie; de agent pusht met een fijnmazig token van een bot-account, zonder `workflows`-recht, zodat hij geen workflow kan aanpassen die secrets leest. Jouw eigen token staat niet in de agent-omgeving.

- **CODEOWNERS (jij)** op tests, `.github/`, check-scripts en `.claude/`; code-owner-review verplicht, oude goedkeuringen vervallen bij een nieuwe push. Dat vervangt een label: een bot die PR's opent, kan op GitHub ook labels zetten.

- **Geen productiegeheimen in de werkmap**; lokaal draait tegen de lokale stack met demo-sleutels.

- **Deny-regels op ****`.env*`**** plus de OS-sandbox.**

- **MCP-servers** alleen read-only en versie gepind.


## Design system

Het design system is gebouwd zodat een agent geen eigen stijl kan verzinnen: klassen die niet uit de tokens komen bestaan niet, rauwe HTML-controls zijn buiten de componentenmap verboden, en elke component staat op een catalogusroute die met screenshots en axe wordt bewaakt.

**Optioneel: ontwerp eerst.** Wordt een scherm eerst als klikbaar prototype ontworpen (bijvoorbeeld als HTML-export uit een ontwerptool), dan komt die export in `designs/` en is hij in de dev-server te bekijken op `/design`. Het prototype bepaalt de eerste bouw van een scherm; daarna is het design system leidend en is afwijken van het prototype normale evolutie, geen fout. Zonder prototypes vervalt dit.

### Tokens in drie lagen

- **Primitief** — palet in OKLCH (`--gray-50…950`, `--brand-*`) in gewone `:root`, zonder utilities. Componenten mogen ze nooit direct gebruiken.

- **Semantisch** — de namen van shadcn/ui overgenomen: `--background`, `--foreground`, `--card`, `--popover`, `--primary`, `--primary-foreground`, `--secondary`, `--muted`, `--muted-foreground`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`, plus `--radius`. Via `@theme inline` worden ze `--color-*` en dus `bg-background`, `text-muted-foreground`. Eigen namen zouden betekenen dat elk gekopieerd component handmatig hernoemd moet worden en registry-updates niet meer passen. Aanvullingen (`--success`, `--warning`) volgen hetzelfde patroon. Dit is de enige laag die een nieuwe app of thema aanpast.

- **Component** — alleen waar meerdere componenten één beslissing delen: `--control-h-sm/md/lg`, `--control-radius`, `--focus-ring-*`.


In `@theme` worden alleen de kleur-, radius- en schaduwschalen van Tailwind gereset (`--``color-``*: initial`, `--radius-*: initial`, `--shadow-*: initial`); spacing, breakpoints, typeschaal en animaties worden expliciet gedefinieerd. Zo bestaat `bg-red-500` niet meer, maar blijven de utilities werken die shadcn-componenten nodig hebben. Dark mode wisselt de semantische laag onder `[data-theme=dark]`.

CSS is de enige bron. DTCG-JSON (stabiele spec sinds oktober 2025) met Style Dictionary pas toevoegen bij Figma-koppeling of meerdere platforms; een tweede bron is een tweede plek die een agent fout kan aanpassen.

### Componentmodel

- **Basis:** shadcn/ui, gekopieerd naar `src/web/ui`. Toegankelijkheid en toetsenbordgedrag komen uit de primitieven. Na elke `shadcn add` draait een kleine codemod die het component op de eigen tokens zet; registry-updates worden bewust overgenomen, niet blind.

- **Varianten** in één recept per component (CVA, zoals shadcn). Een nieuwe variant gaat in het recept, nooit op de aanroepplek.

- **Afleiden, niet forken.** `DangerButton` is `<Button variant="destructive">`. Een link die eruitziet als knop gebruikt `asChild`, geen kopie.

- **Formulieren** via `<Form>` en `<FormField>` (zie Vaste patronen).

- **Layout** in feature-code met utility-klassen voor layout (flex, grid, gap, padding, breedte); `Stack`, `Inline` en `Container` zijn er voor de veelvoorkomende gevallen. Kleur, radius, schaduw en typografie komen altijd uit componenten.


### Afdwingen

| Regel | Geldt voor | Mechanisme |
|---|---|---|
| Alleen bestaande klassen | Overal | Reset van kleur, radius en schaduw + eslint-plugin-better-tailwindcss `no-unknown-classes` |
| Geen arbitrary values, `!` of `dark:` | `src/web/features` | `no-restricted-classes`; `src/web/ui` is uitgezonderd, want shadcn gebruikt ze |
| Geen rauwe `<button>`, `<input>`, `<select>`, `<textarea>`, `<dialog>`, `<a>` | Buiten `src/web/ui` | `react/forbid-elements`, met melding welke component te gebruiken |
| Alleen layout-klassen in `className` | `src/web/features` | `no-restricted-classes` op kleur, radius, schaduw, font en ring |
| Geen hex of benoemde kleuren | Buiten de tokenbestanden | ESLint-regel op hex-literals |
| Contrast | Tokenparen in beide thema's | Unittest |
| Elk component staat op de systeempagina (vanaf fase 2) | `src/web/ui` | `check:catalogus`: elk geëxporteerd component heeft een voorbeeld op `/design-system`, of een uitzondering met een code en een reden |
| Visueel en toegankelijk | Gewijzigde schermen | `ui:check` (screenshots + axe) als skill-stap en reviewpunt; screenshot-regressie in CI is een uitbreiding |

**Consistentie per constructie:**

- **Minimale doelgrootte (44 px) en de focusring zitten in de basis van elk componentrecept**, zodat ze gelden zonder dat iemand eraan denkt.

- **Contrasttest over de recepten:** de test loopt alle varianten van elk recept langs en controleert elk paar van achtergrond en tekst, niet alleen de tokenparen.

- **Focus-lintregel:** `outline-none` mag alleen samen met `focus-visible:ring-*` in dezelfde klassenlijst.

- **Eén ****`scanAxe(page)`****-helper** met de tags `wcag2a`, `wcag2aa`, `wcag21aa` en `wcag22aa` (target-size staat in axe standaard uit). Een lintregel verbiedt losse `AxeBuilder`-aanroepen in tests.

- **Woordenlijsttest op ****`src/web/copy`****:** vaste termen (bijvoorbeeld altijd "Annuleren", nooit "Annuleer"), verboden synoniemen, vaste opbouw en interpunctie van lege staten.

- **Doelbrowsers vastgelegd** in `browserslist` in `package.json`. Tailwind v4 vraagt minimaal Safari 16.4, Chrome 111 en Firefox 128; oudere apparaten van gebruikers zijn vooraf bekend, niet achteraf.


### Agents laten hergebruiken

- **Live componentlijst:** de skill voor schermwerk haalt via `scripts/facts.mjs` de actuele componenten met varianten op, zodat de agent eerst zoekt wat er al is.

- **Skill ****`nieuw-component`** als checklist: eerst de lijst doorzoeken, bestaand recept uitbreiden, alleen tokens, voorbeeld op `/design-system`, `ui:check`.

- **Harde regel:** past geen component, dan stopt de agent en stelt een variant voor in plaats van zelf iets te bouwen.

- **In-app ****`/design-system`****-route** in plaats van Storybook: één build, echte providers, en een vast doel voor `ui:check`.


### Startkit (v1)

Fase 1 levert vijf componenten (Button, Input, Field, Card, Dialog); de rest komt erbij zodra een app hem nodig heeft. De volledige set waar de kit naartoe groeit:

Button, IconButton, Input, Textarea, Select, Checkbox, Switch, RadioGroup, Field/FormField, Label, Card, Dialog/AlertDialog, Popover, DropdownMenu, Tooltip, Tabs, Toast, Badge, Table, plus Stack, Inline, Container, Skeleton, EmptyState en Spinner.

Toegankelijkheidsbasis: WCAG 2.2 AA (contrast 4,5:1 tekst, 3:1 UI), één gedeelde focusring, `prefers-reduced-motion`, en 44 px als huisnorm voor aanraakdoelen (AA vraagt 24 px).

## Werkstraat

De hoofdsessie bouwt, zodat jij kunt bijsturen en de agent jou iets kan vragen. Eerst zet de hoofdsessie het contract neer (schema's en routes die nog 501 teruggeven); daarna schrijft een tester-subagent de acceptatietests tegen dat contract, zodat ze compileren en terecht falen. Na de bouw keurt een reviewer-subagent in een schone context. Jij reviewt en merget.

*[Diagram: werkstraat · zes stappen, twee terugkoppelingen — zie het originele plan]*

- **Licht pad:** zonder migratie, nieuwe route of nieuwe permissie geen spec en geen tester: plan mode, bouwen, review.

- **Testregel:** de hoofdsessie mag tests toevoegen, niet bestaande wijzigen of verwijderen. De handhaving is CODEOWNERS op testbestanden plus jouw review; CI zet gewijzigde tests als lijst in de PR.

- **Subagents** in `.claude/agents/`: de reviewer zonder schrijftools (`disallowedTools: Write, Edit`) en met `maxTurns`. Dat de tester alleen in testmappen schrijft, dwingt een PreToolUse-hook af die het pad controleert.

- **Stop-hook (hoofdsessie):** typecheck, lint en unit-tests op geraakte bestanden; bij falen `{"decision": "block"}` met maximaal ~40 regels uitvoer, hooguit één keer per beurt, zodat de agent daarna nog kan stoppen en jou iets vragen. Slaat over in plan mode en als er niets veranderd is. Snel en deterministisch: nooit netwerk, nooit de database.

- **SubagentStop-hook:** per subagent een eigen klaar-criterium. Tester: nieuwe tests compileren en falen op hun asserties. Reviewer: rapport geschreven.

- **PostToolUse-hook:** ESLint en Prettier op het bewerkte bestand.

- **SessionStart-hook:** actuele spec, branch, laatste checkuitslag en status van de lokale stack in de context.

- **Hooks falen dicht:** `set -euo pipefail` met `trap 'exit 2' ERR`; `doctor.sh` controleert dat `jq` er is. Exit 1 of een timeout laat een actie door.

- **Ontbreekt een beslissing** (bedrag, tekst, randgeval), dan stopt de agent en vraagt het.

- **Reviewers rapporteren alleen** correctheidsfouten, functionele duplicatie, afwijkingen van de spec en ontbrekende testinhoud per acceptatiecriterium; stijl is werk van de lint.


**Aanvullend hek:**

- **`guard-files`****-hook (PreToolUse op bewerken):** blokkeert met een uitleg het bewerken van gegenereerde bestanden ("draai `pnpm db:types`") en van migraties die al gecommit zijn ("maak een nieuwe met `supabase migration new`"). Directe feedback in plaats van pas in CI.

- **Reviewer alleen lezen:** een `readonly-bash`-hook staat voor de reviewer alleen `pnpm` check- en testcommando's, `git diff`/`log`/`show`/`status` en `gh pr view`/`diff`/`checks` toe. Zo kan hij ook via de shell niets schrijven.

- **`ask`**** op checks:** in `.claude/settings.json` staan check-scripts, workflows, hooks, `.claude/` en de pgTAP-invarianten op `ask`. De agent moet het vragen voordat hij ze aanpast; CODEOWNERS is daarna de harde grens.

- **Model per subagent:** reviewer `opus`, tester `sonnet`, hoofdsessie naar keuze.

- **Definition of Done** in `docs/dod.md` (± 10 regels) die de reviewer afloopt: checks groen met bewijs in de PR; elk acceptatiecriterium een test met inhoud; nieuwe routes via `defineRoute` met permissie en test per verboden rol; nieuwe foutcodes met tekst; geen nieuwe `unsafeCast` zonder reden; `ui:check` gedaan bij schermwerk.


## Efficiëntie

De grootste winst zit in minder werk per feature voor de agent: minder lezen, minder beslissen, minder herstellen.

- **Gouden pad eerst, generator daarna.** De eerste feature wordt met de hand en zorgvuldig door alle lagen gebouwd. Pas in fase 2 wordt daaruit `pnpm new:resource <naam>` afgeleid: migratie met RLS, grants en eigenaar-policy, pgTAP-test, zod-schema, `defineRoute`, `queries.ts`, scherm met `AsyncView` en een integratietest. Voor migraties volstaat `supabase migration new`; voor componenten een skill.

- **Live feiten in skills in plaats van lijsten in tekst.** `scripts/facts.mjs` leest uit de repo wat er is: de checks en wat ze bewaken, de componenten met hun varianten, de routes en permissies, de ADR's met status. Skills halen dat bij aanroep op met een `!`-commando in de SKILL.md. Zo krijgt de agent altijd de actuele stand, zonder gegenereerd bestand dat kan verouderen en zonder dat het in elke sessie in de context staat.

- **Onderhoud:** Renovate met gegroepeerde PR's; automatisch mergen van patches komt later, als de testset zich bewezen heeft.

- **Meten:** CI logt per PR welke checks faalden. Na een wijziging aan de agent-opzet bouwt de agent dezelfde drie testopdrachten opnieuw; een regel blijft alleen als hij aantoonbaar helpt.


## Documentatie en tokenbudget

Documentatie legt vast wat een machine niet kan controleren: het waarom, het domein en de beslissingen. Wat een type of check afdwingt, staat niet in proza.

| Bestand | Inhoud | Laadt | Budget |
|---|---|---|---|
| `AGENTS.md` | Stack, commando's, domein, de paar regels zonder check | Altijd | ≤ 100 regels |
| `CLAUDE.md` | `@AGENTS.md` plus werkstraat en wanneer welke skill | Altijd | ≤ 50 regels |
| `.claude/rules/*.md` | Conventies per pad (`src/api/**`, `src/web/**`, `supabase/**`) | Alleen bij bestanden op dat pad | ≤ 60 regels elk |
| `.claude/skills/*/SKILL.md` | Procedures, met live feiten via `scripts/facts.mjs` | Beschrijving altijd, inhoud bij gebruik | ≤ 200 regels |
| `docs/specs/` | Featurespecs volgens het sjabloon, met status | Tijdens de feature | 1–2 pagina's |
| `docs/adr/` | Beslissingen met context, alternatieven en status | Op verzoek | 1 pagina |
| `docs/operations/` | Runbook voor release en rollback, back-up en herstel | Bij release of incident | 1–2 pagina's elk |

Om het zuinig te houden: wat soms nodig is, hoort in een skill of padregel, niet in een `@`-import (die laadt altijd mee). Onderzoek gaat via subagents die alleen een conclusie teruggeven. Na twee mislukte correcties: `/clear` en opnieuw beginnen met een betere prompt. Externe diensten via hun CLI (`gh`, `supabase`) in plaats van MCP.

## Versiebeheer, CI en release

GitHub is de grens buiten de machine van de agent. Die grens werkt alleen als GitHub jou en de agent uit elkaar houdt en de agent niet bij secrets kan.

**Identiteiten.** De repo staat in een (gratis) organisatie. De agent pusht met een fijnmazig token van een bot-account: schrijven op branches en PR's openen, geen `workflows`-recht, geen admin. Jij reviewt en merget met je eigen account.

**Ruleset op ****`main`****:** alleen via PR; verplichte checks `gate:fast` en `gate:slow`; code-owner-review (jij) op tests, `.github/`, check-scripts en `.claude/`; goedkeuring vervalt bij een nieuwe push; geen force push of delete; geen bypass voor de bot; "Allow GitHub Actions to create and approve pull requests" uit.

**Instellingen als code.** Branch protection en rulesets staan in `.github/settings/main-protection.json` en worden met één `gh api`-commando toegepast. `scripts/check-github.mjs` controleert alleen-lezend of ze echt actief zijn en faalt als de bescherming ontbreekt of als de agent onder jouw account werkt. Beschreven is niet hetzelfde als ingesteld.

**Bewaker vanaf ****`main`****.** Een aparte workflow (`guard.yml`, via `pull_request_target`) draait de check-scripts en de lijst beschermde paden van `main`, niet die uit de PR. PR-code wordt alleen als git-data gelezen, nooit uitgevoerd. Zo kan een PR zijn eigen bewaker niet afzwakken: wie een check-script aanpast, wordt beoordeeld door de oude versie, en de wijziging vraagt jouw code-owner-review.

**Werkwijze:** korte branches, één onderwerp per PR, squash-merge, conventional commits. De PR-template vraagt welke acceptatiecriteria en tests de wijziging bewijzen. Lokaal staan deny-regels op `git push` naar `main`, `gh pr merge` en `--no-verify`; dat is gemak, de grens is de ruleset.

**CI:** snelle job op elke push, trage job alleen op PR's en `main`, met `concurrency` die oude runs annuleert, pad-filters en caches. Actions gepind op SHA, runner gepind op `ubuntu-24.04`.

### Release naar Vercel en Supabase

Elke wijziging gaat lokaal → PR → staging → productie. De database gaat altijd vóór de code, en altijd eerst naar staging. Automatische Git-deploys van Vercel staan uit; CI bouwt en zet neer.

- **PR:** CI draait `gate:fast` en `gate:slow` tegen een verse lokale stack, de bewaker vanaf `main`, CodeQL en osv-scanner. Geen preview-deploys: die zouden tegen staging draaien zonder de migraties van die PR.

- **Merge op ****`main`**** → staging:** de workflow controleert eerst dat CI groen is voor exact dit commit (`check-release-ci`). Daarna migraties naar het staging-project (`supabase db push`), `supabase db advisors` tegen staging als blokkerende stap, `vercel build` met de staging-variabelen, `vercel deploy --prebuilt`, en de smoketests tegen staging.

- **Release-tag → productie:** jij maakt een tag met CHANGELOG. De workflow controleert dat CI en staging groen waren voor dit commit, wacht op jouw goedkeuring via een beschermde GitHub-environment, past de migraties toe op productie, en controleert alleen-lezend dat het productieschema de tabellen en kolommen heeft die de code verwacht (`check-deployment-schema`, afgeleid uit het Drizzle-schema, niet uit een handlijst). Daarna bouwt hij met de productievariabelen (`vercel build --prod`, `deploy --prebuilt --prod`) en draait de smoketests. Omdat `VITE_`-variabelen in de build zitten, is het hetzelfde commit, niet dezelfde build.


**Regels:**

- **Migraties zijn append-only.** Een migratie die op `main` staat, wordt nooit meer gewijzigd of verwijderd; een fix is een nieuwe migratie. `check-migrations` in `gate:fast` controleert dat tegen `origin/main`, plus dat elk versienummer uniek is (parallelle branches leveren anders dubbele nummers op, die pas bij `db push` naar productie falen).

- **Migraties zijn achterwaarts compatibel** (expand/contract), zodat de vorige code blijft werken en een code-rollback altijd kan.

- **Nooit handmatig aan productie.** Productiesleutels staan alleen in de beschermde environment en in Vercel; de agent heeft ze nergens.

- **Rollback:** code via Vercel instant rollback; database vooruit herstellen met een nieuwe migratie, in nood vanuit de back-up. Beide stap voor stap in `docs/operations/runbook.md`.

- **Na de release** een uur fouttracking en logs volgen.

- **Supabase Pro voor productie** (dagelijkse back-ups, geen pauze); staging op de gratis laag. **Vercel Pro** zodra de app commercieel is.


## Lokaal ontwikkelen

Alle ontwikkeling gebeurt lokaal: VS Code met de WSL-extensie, Claude Code in Ubuntu, de app op localhost en de database in Docker. Er is geen cloudomgeving of extern account nodig om te bouwen en te testen.

### Eén commando om te starten

`pnpm dev` doet in volgorde:

- Controleert dat Docker draait en start de Supabase-stack als die nog niet loopt (Postgres, Auth, Mailpit, Studio, pooler).

- Schrijft `.env.local` uit `supabase status` (lokale demo-sleutels, nooit echte).

- Start Hono op `:8787` en Vite op `:5173` met proxy voor `/api`, beide met hot reload.


`pnpm db:reset` zet de database terug naar migraties plus seed. Mailpit (`localhost:54324`) vangt magic links en resetmails op. Supabase Studio (`localhost:54323`) is er om de lokale data te bekijken.

### De agent en de lokale stack

- Permissiemodus **auto** plus de **sandbox** (bubblewrap) met `failIfUnavailable: true`.

- **Een gesandboxt commando kan de lokale database niet bereiken:** op Linux en WSL2 heeft de sandbox een eigen localhost. Daarom draaien alleen deze letterlijke commando's buiten de sandbox (`excludedCommands`): `pnpm test:db`, `pnpm db:reset`, `pnpm db:types` en `pnpm ui:check`. De scripts erachter vallen onder CODEOWNERS, zodat de agent ze niet ongemerkt kan aanpassen. Al het andere draait in de sandbox.

- **De stack zelf start buiten de agent,** via `pnpm dev` (jij) of de `SessionStart`-hook. De agent start of stopt Docker nooit.


### Wat overal gelijk is

`mise.toml` (Node, pnpm), `packageManager` en `engines.node`, de Supabase CLI als gepinde devDependency, `supabase/config.toml` met dezelfde Postgres-versie als de projecten, één script per check dat hooks, CI en CLAUDE.md aanroepen, en `.claude/settings.json` in git.

### Optioneel: Claude Code in de cloud

Voor afgebakende klussen (dependency-updates, tests repareren) kan een cloud-sessie werken op een branch en een PR opleveren. Dat is een aanvulling, geen onderdeel van de basis: alles moet zonder werken.

## Ubuntu en Docker

Ubuntu is de werkplek, Docker is gereedschap voor drie specifieke klussen. De app zelf draait in ontwikkeling niet in Docker: productie draait op Vercel Functions en niet in een container, dus een gecontaineriseerde dev-server levert geen extra gelijkenis op, alleen tragere hot reload en een extra laag waar de agent over moet nadenken.

### Waarom Ubuntu (via WSL2)

- **Gelijk aan CI en productie.** GitHub Actions draait Ubuntu, Vercel bouwt op Linux (Amazon Linux 2023). Hoofdlettergevoelige paden, shell-scripts, bestandsbewaking en native modules gedragen zich lokaal zoals daar.

- **De agent-sandbox werkt alleen op Linux.** De Claude Code-sandbox (bubblewrap) draait op Linux en WSL2; op native Windows lopen commando's zonder sandbox.

- **Windows-tools blijven bruikbaar.** WSL2 draait een echte Linux-kernel naast Windows; VS Code opent de map via de WSL-extensie.


**Versie:** Ubuntu 24.04 LTS, expliciet geïnstalleerd (`wsl --install -d Ubuntu-24.04`) en in CI gepind op `ubuntu-24.04`. GitHub zet `ubuntu-latest` tussen 19 oktober en 19 november 2026 om naar 26.04; overstappen gebeurt bewust, lokaal en in CI tegelijk, als een starter-release.

### Wat Docker wel en niet doet

| Klus | Docker? | Hoe |
|---|---|---|
| Lokale Supabase-stack | Ja, hoofdtaak | `supabase start` met uitgesloten diensten die de starter niet gebruikt (`-x ``imgproxy,edge-runtime,logflare,vect``or`). Supavisor blijft aan zodat lokaal dezelfde transaction-mode-pooler draait als in productie; storage-api alleen uitsluiten als de app geen bestanden heeft. Volledige stack vraagt ~7 GB RAM; afgeslankt fors minder |
| Integratietests | Ja, via dezelfde stack | `supabase db reset` (migraties + seed), daarna Vitest tegen de lokale stack. Geen kale Postgres via Testcontainers: die mist `auth`, rollen en JWT-claims, dus test je een andere database dan je uitrolt |
| Screenshot-baselines | Ja | Playwright-image `mcr.microsoft.com/playwright:v<exacte versie>-noble`, lokaal én in CI. Fonts en rendering verschillen per OS; baselines worden alleen in die image gemaakt |
| Agent-sandbox voor onbewaakt werk | Optioneel | Docker Sandboxes (microVM per agent, eigen Docker-daemon, sleutels via host-proxy) of de referentie-devcontainer met firewall. Alleen voor runs zonder toestemmingsprompts |
| CI | Ja, vanzelf | GitHub-runners hebben Docker; zelfde stack en zelfde Playwright-image |
| De app zelf (Vite, Hono) | Nee | Draaien native in Ubuntu; gelijkenis met productie via Vercel preview-deploys |

### Welke Docker

Advies: **Docker Engine direct in Ubuntu** (`docker-ce` uit Docker's apt-repository, met `systemd=true` in `/etc/wsl.conf`). Gratis en open source, het lichtst in geheugen, en identiek aan wat CI draait.

- **Docker Desktop** is gepolijster en heeft een GUI, maar is alleen gratis bij minder dan 250 medewerkers én minder dan $10M omzet. Voor persoonlijk, niet-commercieel gebruik is het gratis; Docker Engine blijft de keuze omdat het gelijk is aan CI. Nooit beide tegelijk: Desktop vereist dat `docker-ce` in de distro eerst weg is.

- **Podman en Rancher Desktop** afraden: bekende problemen met Supabase (mounts, health checks) en Testcontainers.

- **In de gaten houden:** Supabase heeft sinds oktober 2026 een experimentele native runtime (`--runtime native`) die de stack zonder Docker draait op Linux. Als die stabiel wordt, verdwijnt Docker uit de dagelijkse loop.


### Dev container of native

Native in WSL2 met de Claude Code-sandbox is de standaard: sneller, minder lagen. Een devcontainer loont pas bij (a) agents zonder toestemmingsprompts, (b) een team dat een identieke toolchain nodig heeft, of (c) Codespaces. Kies dan Docker-in-Docker, niet het hostsocket doorgeven: met de hostsocket kloppen paden en `localhost` niet voor de Supabase-stack, en krijgt de agent feitelijk root-toegang tot de host-daemon, wat de sandbox teniet doet.

Docker en de bubblewrap-sandbox gaan niet samen. De stack start daarom buiten de agent, en database-commando's van de agent lopen via een paar vaste uitzonderingen; zie Lokaal ontwikkelen.

### Ubuntu inrichten

- **Code op ext4** in `~/code`, nooit op `/mnt/c`. Gemeten: bestanden aanmaken en verwijderen is daar ~60× trager, precies wat `node_modules` doet.

- **`.wslconfig`** (Windows-profiel): onder `[wsl2]` `memory` (bijv. 10 GB bij 16 GB RAM), `processors`, `swap=4GB`, `networkingMode=mirrored` (localhost in beide richtingen; bind Vite op `127.0.0.1`, IPv6 `::1` werkt niet). Onder `[experimental]` `autoMemoryReclaim=gradual` en `sparseVhd=true`.

- **`/etc/wsl.conf`****:** `[boot] systemd=true`.

- **Bestandsbewaking:** `fs.inotify.max_user_watches=524288` via `/etc/sysctl.d/`.

- **Toolchain met mise** (`mise.toml`: Node 24 LTS, pnpm). Corepack zit vanaf Node 25 niet meer in Node, dus daar niet op leunen. Supabase CLI en Playwright als gepinde devDependencies.

- **Git:** `gh auth login` + `gh auth setup-git`; `.gitattributes` met `* text=auto eol=lf`; nooit dezelfde checkout vanuit Windows én WSL bewerken.

- **Claude Code** via de native installer in WSL; voor de sandbox `bubblewrap` en `socat`, en op 24.04 een AppArmor-profiel als `kernel.apparmor_restrict_unprivileged_userns` op 1 staat. Linux-Node moet vóór Windows-Node in het PATH staan.

- **Headed browsers** werken via WSLg: `playwright test --ui` opent op het Windows-bureaublad.

- **Onderhoud** maandelijks: `docker system prune`, `fstrim`, VHD comprimeren. Back-up: alles staat in git; `wsl --export` is gemak, geen noodzaak.


### Nieuwe machine in tien stappen

- Windows: `wsl --update`, `wsl --install -d Ubuntu-24.04`, `.wslconfig` plaatsen, VS Code met WSL-extensie.

- Ubuntu: `systemd=true` in `/etc/wsl.conf`, daarna `wsl --shutdown`.

- Basispakketten: `build-essential git curl unzip bubblewrap socat gh`, AppArmor-profiel indien nodig, inotify-limiet.

- Docker Engine uit Docker's apt-repository, gebruiker in groep `docker`, `docker run hello-world`.

- mise installeren en activeren.

- `gh auth login`, `gh auth setup-git`, git-naam en -mail.

- Claude Code installeren, `/sandbox` controleren.

- Repo klonen naar `~/code/<app>`.

- `mise install`, `pnpm install --frozen-lockfile`, `playwright install --with-deps chromium`, `supabase start`.

- `code .` en `pnpm doctor && pnpm gate:fast` als bewijs dat alles klopt.


Stap 3 t/m 10 staan als `scripts/bootstrap.sh` in de repo, plus `scripts/doctor.sh` die versies, inotify, sandbox en Docker controleert. Verder in de repo: `mise.toml`, `.gitattributes`, `.editorconfig`, `.vscode/extensions.json` en `settings.json`, en een `.devcontainer/` voor wie hem nodig heeft.

Bewust niet in de MVP: de experimentele Supabase native runtime (pas overwegen als hij stabiel is en WSL2 officieel ondersteunt) en Docker Sandboxes (pas als agents zonder toestemmingsprompts gaan draaien; zie Uitbreidingen).

## Repo-structuur

Eén repository, één pakket.

```
src/
  web/                 Vite + React SPA
    routes/            TanStack Router-bestandsroutes, elk met guard en ErrorBoundary
    features/          schermen en queries.ts per resource
    ui/                tokens/*.css, shadcn-componenten, recepten (44 px en focusring in de basis)
    lib/               api.ts (enige data-ingang), auth.ts (auth-js), format.ts, report-error.ts
    copy/              errors.ts (Record<ErrorCode, string>), teksten, woordenlijst
    dev/               design-system en design: alleen in dev-builds
  api/                 Hono-app
    routes/            één bestand per resource, alleen via defineRoute() (ctx.actor)
    domain/            pure logica
    db/                pool, withUser() (enige export, vertaalt Postgres-fouten), Drizzle-schema (gegenereerd), ids.ts
    auth/              JWT-verificatie, rollen uit user_roles, sessiecheck
    obs/               logger, requestId, clientfouten-route (met limieten)
    env.ts             enige plek met process.env
    server.ts          lokale ingang (@hono/node-server, :8787)
  shared/              zod-schema's, can(), limits.ts, branded IDs, Cents, cursor-contract, foutcodes, assert(), unsafeCast()
api/index.ts           Vercel-ingang, exporteert dezelfde Hono-app
supabase/
  config.toml          zelfde Postgres-versie en instellingen als staging en productie
  migrations/          append-only, achterwaarts compatibel, expliciete grants, search_path = ''
  schema.snapshot.sql  gegenereerd: huidige tabellen, functies, grants, policies
  tests/               pgTAP per policy (op naam) plus de rechten-invariant
  seed.sql             testgebruikers per rol (lokaal en staging)
scripts/
  dev, bootstrap, doctor, test-db, ui-check, db-types (pull + brands + snapshot)
  facts.mjs            live feiten voor skills
  check-migrations, check-policies, check-docs, check-catalogus,
  check-release-ci, check-deployment-schema, check-github
designs/               optioneel: prototype-exports
docs/                  specs/ (met _template.md), adr/, operations/ (runbook, backup-restore), dod.md
.claude/
  settings.json        permissies (deny en ask), sandbox, excludedCommands, hooks
  agents/              tester (sonnet), reviewer (opus)
  skills/              spec, nieuw-route, nieuw-scherm, nieuw-component, migratie, release, security-review
  rules/               api.md, web.md, database.md (padgebonden)
  hooks/               lint-na-bewerking, guard-files, readonly-bash, stop, subagent-stop, tester-paden, sessie-context
.github/
  workflows/           ci.yml, guard.yml (vanaf main), codeql.yml, release-staging.yml, release-production.yml
  settings/            main-protection.json
  CODEOWNERS  pull_request_template.md
AGENTS.md  CLAUDE.md  CHANGELOG.md  mise.toml  lefthook.yml  vercel.json  (browserslist in package.json)
```

## Fasering

Drie fases. De eerste twee gebeuren volledig lokaal; pas in fase 3 komen Vercel en Supabase erbij. De uren zijn een realistische schatting voor één ontwikkelaar met agents.

| Fase | Inhoud | Uren |
|---|---|---|
| 0. Bewijs | Supavisor met eigen rol `api_user` plus `withUser()` met `pg` | 4–8 |
| 1. Fundament | Zie hieronder | 130–175 |
| 2. Eerste features | Gouden pad, generator, drie features | 40–60 |
| 3. Eerste release | Staging, productie, release-workflows | 25–40 |

### Fase 0: bewijs, vóór alles

Maak een gratis Supabase-project, verbind via Supavisor in transaction mode als `api_user` met `pg`, en draai dezelfde lektest als eerder met PgBouncer. *Klaar als:* nul lekken en geen toegang buiten `withUser()`. Faalt dit, dan eerst het datapad herontwerpen.

### Fase 1: fundament, lokaal

- **Machine en repo** (~10 u): Ubuntu, Docker Engine, mise, `bootstrap.sh`, `doctor.sh`, `pnpm dev`, `browserslist`.

- **Checks** (~22 u): tsconfig, ESLint (inclusief verbod op apparaatdetectie en de focusregel), dependency-cruiser, lefthook, `check-migrations`, smalle `check-docs`, `gate:fast`, `gate:slow` met squawk en `db lint`, bundelbudget.

- **Secure route en database** (~26 u): `defineRoute` met `ctx.actor`, getypte client, `withUser` met foutvertaling, Drizzle met brands, foutcodes, `limits.ts`, smoketest, expliciete grants, `search_path`, pgTAP-rechteninvariant, `check-policies`, schema-snapshot, racetests.

- **Auth en rollen** (~20 u): inloggen, `user_roles`, `can()`, MFA voor admin met inschrijfscherm, seed, Mailpit.

- **Frontend-basis** (~19 u): router met guards, API-client met 401-afhandeling, `AsyncView`, formulier-wrapper, formatters, design system met basiskit (44 px en focus in de recepten), contrasttest over de recepten, `scanAxe`, woordenlijsttest, ontwikkelpagina's alleen in dev.

- **Agent-opzet** (~22 u): AGENTS.md, CLAUDE.md, padregels, skills met live feiten, spec-sjabloon, DoD, twee subagents met model, hooks (inclusief `guard-files` en `readonly-bash`), `ask` op checks, sandbox met uitzonderingen.

- **GitHub** (~17 u): organisatie, bot-account, instellingen als code met `check-github`, CODEOWNERS, CI, bewaker vanaf `main`, `check-release-ci`, CodeQL, osv-scanner.


*Klaar als:* een verse laptop met `bootstrap.sh` en `pnpm dev` tot een ingelogde app komt zonder extern account; CI weigert een `any`, een databaseclient in `src/web`, een route buiten `defineRoute` en een gewijzigde bestaande migratie; een PR die een check-script afzwakt, wordt door de bewaker vanaf `main` tegengehouden; `check-github` is groen; de smoketest bewijst dat de browser niet bij data, storage of realtime kan; elke rol logt in via een e2e-test.

### Fase 2: eerste features, lokaal

De eerste feature wordt het gouden pad, met de hand en zorgvuldig. Daaruit wordt `new:resource` afgeleid. Daarnaast komen clientfouten naar de eigen database en `check:catalogus` voor het design system. Daarna nog twee features via de werkstraat.

*Klaar als:* drie features gemerged; elke checkfout van de agent is gelogd en waar nodig omgezet in een betere regel of template.

### Fase 3: eerste release

Supabase-projecten voor staging (gratis) en productie (Pro), twee Vercel-projecten, beschermde GitHub-environments, release-workflows met `check-deployment-schema`, CSP op het echte domein, PWA-manifest, en de runbooks in `docs/operations/` voor release, rollback en herstel.

*Klaar als:* een release-tag gaat via staging naar productie zonder handwerk; een code-rollback werkt; een back-up is teruggezet in een lokale stack.

### Uitbreidingen, op aanleiding

| Uitbreiding | Toevoegen wanneer |
|---|---|
| Audit log | Wijzigingen moeten herleidbaar zijn naar een gebruiker |
| Bestanden (signed URL's) of realtime | De app heeft ze nodig, met een eigen ADR |
| Idempotency-Key | Mutaties met geld of voorraad |
| Screenshot-regressie en axe in CI | Een visuele of toegankelijkheidsfout glipte door |
| jscpd, knip, ast-grep | Review vindt herhaaldelijk kopieën, dode code of een terugkerend fout patroon |
| Mutation testing | Kritieke reken- of geldlogica |
| Renovate automatisch mergen, OpenTelemetry | De basis draait stabiel |
| Devcontainer of Docker Sandboxes | Iemand werkt mee, of agents draaien zonder toestemmingsprompts |

### Kosten

- **Lokaal:** geen.

- **Staging:** Supabase en Vercel op de gratis laag.

- **Productie:** Supabase Pro (vanaf $25 per maand); Vercel Pro ($20 per maand) zodra de app commercieel is.

- **GitHub:** gratis organisatie; beperkte gratis Actions-minuten voor private repo's.


### Uitgezocht op 9 oktober 2026

| Vraag | Antwoord | Bron |
|---|---|---|
| Werkt inloggen met de Data API uit? | Ja: Auth, Data API en Storage zijn losse diensten | Broncode Supabase CLI |
| Werkt `withUser()` via een pooler in transaction mode? | Ja met PgBouncer en postgres.js: nul lekken. Met Supavisor, eigen rol en `pg`: nog niet bewezen | Eigen test; fase 0 |
| Kan de agent vanuit de sandbox de lokale database bereiken? | Nee: de sandbox heeft op Linux een eigen localhost. Opgelost met vaste uitzonderingen | Claude Code-sandboxdocs |
| Kan Vercel dezelfde build promoveren naar productie? | Nee: promoveren bouwt opnieuw, en `VITE_` zit in de build. Daarom bouwt CI per omgeving | Vercel-docs |
| Kan een bot PR's openen zonder labels te kunnen zetten? | Nee. Daarom CODEOWNERS in plaats van een label | GitHub REST-docs |
| Werkt typescript-eslint met TypeScript 7? | Nee; de repo pint TypeScript 6.0.x | npm-registry |

## Bronnen

Geraadpleegd op 9 oktober 2026.

- Claude Code: [best practices](https://code.claude.com/docs/en/best-practices), [permissies](https://code.claude.com/docs/en/permissions), [hooks](https://code.claude.com/docs/en/hooks), [sandbox](https://code.claude.com/docs/en/sandboxing), [subagents](https://code.claude.com/docs/en/sub-agents), [skills](https://code.claude.com/docs/en/skills), [memory en CLAUDE.md](https://code.claude.com/docs/en/memory), [plugins voor organisaties](https://code.claude.com/docs/en/plugins/org), [worktrees](https://code.claude.com/docs/en/worktrees), [GitHub Actions](https://code.claude.com/docs/en/github-actions), [Claude Code op het web](https://code.claude.com/docs/en/claude-code-on-the-web), [cloud-environments](https://code.claude.com/docs/en/cloud-environments)

- Werkwijzen: [Anthropic, multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system), [Cognition, Don't Build Multi-Agents](https://cognition.com/blog/dont-build-multi-agents), [Böckeler, spec-driven development tools](https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html), [GitHub spec-kit](https://github.com/github/spec-kit)

- GitHub: [rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets), [SHA-pinning-beleid](https://github.blog/changelog/2025-08-15-github-actions-policy-now-supports-blocking-and-sha-pinning-actions/)

- Security: [OWASP Top 10:2025](https://owasp.org/Top10/2025/), [OWASP ASVS](https://github.com/OWASP/ASVS), [OWASP Top 10 for Agentic Applications 2026](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026), [Supabase Data API hardening](https://supabase.com/docs/guides/api/hardening-data-api), [Supabase JWT's](https://supabase.com/docs/guides/auth/jwts), [Supabase API-sleutels](https://supabase.com/docs/guides/api/api-keys), [Supabase RBAC](https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac), [Hono jwk-lek GHSA-3vhc-576x-3qv4](https://osv.dev/vulnerability/GHSA-3vhc-576x-3qv4), [pnpm supply-chain security](https://pnpm.io/supply-chain-security)

- Codekwaliteit: [ESLint bulk suppressions](https://eslint.org/docs/head/use/suppressions), [typescript-eslint switch-exhaustiveness-check](https://typescript-eslint.io/rules/switch-exhaustiveness-check/), [dependency-cruiser rules](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md), [knip](https://knip.dev/reference/cli), [jscpd](https://github.com/kucherenko/jscpd), [Stryker](https://stryker-mutator.io/docs/stryker-js/configuration/), [Hono RPC](https://hono.dev/docs/guides/rpc)

- Design system: [DTCG 2025.10](https://www.w3.org/community/design-tokens/2025/10/28/design-tokens-specification-reaches-first-stable-version/), [Tailwind theme](https://tailwindcss.com/docs/theme), [shadcn: Base UI als standaard](https://ui.shadcn.com/docs/changelog/2026-07-base-ui-default), [shadcn Field](https://ui.shadcn.com/docs/components/base/field), [eslint-plugin-better-tailwindcss](https://github.com/schoero/eslint-plugin-better-tailwindcss), [react/forbid-elements](https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/forbid-elements.md)

- Omgeving: [WSL-bestandssystemen](https://learn.microsoft.com/en-us/windows/wsl/filesystems), [Docker Desktop-licentie](https://docs.docker.com/subscription/desktop-license/)


- Ubuntu en Docker: [WSL-configuratie](https://learn.microsoft.com/en-us/windows/wsl/wsl-config), [WSL-netwerken](https://learn.microsoft.com/en-us/windows/wsl/networking), [Docker Engine op Ubuntu](https://docs.docker.com/engine/install/ubuntu/), [Docker Sandboxes](https://docs.docker.com/ai/sandboxes/), [Supabase start-opties](https://supabase.com/docs/reference/cli/supabase-start), [Supabase Docker- en native runtimes](https://supabase.com/docs/guides/local-development/docker-and-native-runtimes), [Playwright in Docker](https://playwright.dev/docs/docker), [Playwright snapshots](https://playwright.dev/docs/test-snapshots), [Ubuntu 26.04 op GitHub runners](https://github.blog/changelog/2026-09-17-ubuntu-26-generally-available-and-latest-migration), [Vercel build image](https://vercel.com/docs/builds/build-image), [Claude Code devcontainer](https://code.claude.com/docs/en/devcontainer), [Claude Code installatie](https://code.claude.com/docs/en/setup), [mise](https://mise.jdx.dev/dev-tools/), [WSL2-bestandssysteemsnelheid (benchmark)](https://brainwagon.org/blog/2026_07_11_wsl2_filesystem_speed)


- Versie 2 (review): [Supabase Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits), [Supabase db push](https://supabase.com/docs/reference/cli/supabase-db-push), [Realtime-autorisatie](https://supabase.com/docs/guides/realtime/authorization), [Vercel functie-regio](https://vercel.com/docs/functions/configuring-functions/region), [Vercel databasepools](https://vercel.com/kb/guide/efficiently-manage-database-connection-pools-with-fluid-compute), [Claude Code hooks-gids](https://code.claude.com/docs/en/hooks-guide), [Claude Code cloud-environments](https://code.claude.com/docs/en/cloud-environments)


- Versie 4 (review): [Claude Code sandbox](https://code.claude.com/docs/en/sandboxing), [Claude Code hooks](https://code.claude.com/docs/en/hooks), [Claude Code subagents](https://code.claude.com/docs/en/sub-agents), [Vercel deployment promoveren](https://vercel.com/docs/deployments/promoting-a-deployment), [Hono op Vercel](https://hono.dev/docs/getting-started/vercel), [GitHub labels-API](https://docs.github.com/en/rest/issues/labels#add-labels-to-an-issue), [GitHub fijnmazige tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)

