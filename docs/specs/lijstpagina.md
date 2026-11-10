---
status: gebouwd # #670
namespace: lijstpagina
---

# Lijstpagina: zoeken, filteren en sorteren in de URL

> Goedgekeurd door de agent onder mandaat van de eigenaar (2026-10-11). Elke open vraag is besloten volgens de aanbeveling
> erbij; zie `docs/reviews/2026-10-11-keuzes-agent.md`. De eigenaar kan dit herzien.

Geen kop weglaten; "n.v.t. — reden" mag. Ontbreekt een antwoord, dan vraagt de agent het.

## Doel

Eén patroon voor lijstpagina's: zoeken, filteren en sorteren staan in de search params (TanStack Router `validateSearch`), werken op het
cursor-contract (`src/core/shared/cursor.ts`) en `Table`; eerst op `/admin/accounts`, daarna in de sjablonen van `pnpm new:resource` (roadmap stuk 3f).

## Rollen en wie wat ziet

| Rol | Ziet | Mag |
|---|---|---|
| `admin` (MFA) | `/admin/accounts` met zoekveld, filters "Rol" en "Status" en "Sorteren" | zoeken, filteren, sorteren, de URL delen of als bladwijzer bewaren |
| `user` | ongewijzigd: geen toegang tot `/admin/accounts` (`FORBIDDEN`) | — |
| app met `new:resource` | een lijst met zoekveld en sorteren (filters per spec van de resource) | — |

- De search params zijn UI-state, geen autorisatie: de API valideert dezelfde waarden opnieuw, RLS bepaalt welke rijen er zijn.
- Een gedeelde URL toont de ontvanger alleen wat zijn eigen rechten toelaten.

## Datawijzigingen (met grants)

- **Geen migratie** voor het patroon. Zoeken en sorteren op `app.accounts` lopen over de bestaande view (`security_barrier`: het filter
  `app.is_mfa_admin()` gaat altijd vóór het zoekfilter).
- Geen index in deze spec: een accountlijst is klein, en een index op `better_auth."user"` (bijv. `pg_trgm`) vraagt een extensie en een ADR (OV-4).
- Spec [accountbeheer-uitbreiding](accountbeheer-uitbreiding.md) voegt status `geblokkeerd` toe; het statusfilter neemt de waarden uit het contract over.

## Routes en foutcodes

| Methode | Pad | Permissie | Foutcodes |
|---|---|---|---|
| GET | `/api/accounts?q=&rol=&status=&sort=&cursor=` → `{ items, nextCursor }` | `accounts:read` (ongewijzigd) | `VALIDATION`, `FORBIDDEN`, `MFA_REQUIRED` |

- **Gedeeld schema** in core: `defineListSearch({ sorts, filters, cursorKeys })` (`src/core/shared/list-search.ts`) maakt één zod-object met `q`
  (`trim`, 1..`MAX_SEARCH_LENGTH`, leeg = weg), de filters (elk een `z.enum` uit het contract) en `sort` (enum, met standaard). De contracten
  gebruiken het `.strict()` als input (ongeldig → `VALIDATION`); de webroute gebruikt het met `.catch()` per veld in `validateSearch` (ongeldig →
  standaardwaarde, geen foutpagina) en schrijft standaardwaarden niet in de URL.
- **Accounts:** `accountsSearch = defineListSearch({ sorts: ['nieuwste', 'oudste', 'naam-az', 'naam-za'], filters: { rol: ROLLEN, status: STATUSSEN },
  cursorKeys })`, standaard `nieuwste`. `q` zoekt hoofdletterongevoelig in naam en e-mailadres (`ilike`, `%`, `_` en `\` ge-escaped). Sortering `naam-*` op
  `(lower(naam), id)`, `nieuwste`/`oudste` op `(aangemaakt, id)`.
- **Cursor aan de sortering gebonden:** de cursor is `encodeCursor([sort, …sleutel])`; `decodeCursor` met een tuple per sortering. Een cursor van een
  andere sortering of met een ander sleuteltype geeft `VALIDATION`. Zoek- en filterwaarden zitten in de query key van TanStack Query: elke wijziging
  begint bij de eerste pagina. De paginagrootte blijft `ACCOUNTS_PAGE_SIZE`.
- **Cursorbudget** (leerpunt #411): een cursor is nooit langer dan `MAX_CURSOR_LENGTH` (4096, `src/core/shared/limits.ts`). `pageQuery` en
  `defineListSearch` weigeren een langere (`VALIDATION`); `encodeCursor` eist met `assert()` dat hij erbinnen valt (anders `INTERNAL_ERROR`, gelogd).
  Zo geeft de server nooit stil een `nextCursor` terug die zijn eigen invoer weigert. `maxCursorLength(maxLengths)` rekent de langst mogelijke cursor
  uit de maximale UTF-16-lengte per sleuteldeel: elke eenheid wordt in JSON hooguit 6 bytes (`\u0001`, losse surrogaat), base64url maakt het ×4/3.
  Waarom 4096: ruim boven elke sleutel uit de template en ver onder de headergrens van Node (16 KiB); de grens blijft dus begrensd, en een losse
  waarde per lijst (zoals de eerdere 500) kan niet meer afwijken van de sleutel.
- **Sleutelbudget afgedwongen** (leerpunt #444): `cursorKeys` is verplicht en geeft per sortering een niet-lege tuple met de maximale UTF-16-lengte
  van elk sleuteldeel na de sorteernaam, bv. `{ nieuwste: [MAX_TIMESTAMP_LENGTH, MAX_ID_LENGTH] }`. Het type eist precies één entry per sortering
  (ontbrekend of extra = typefout). Bij definitie gooit `defineListSearch` een `Error` als `maxCursorLength([sort.length, ...lengtes])` groter is dan
  `MAX_CURSOR_LENGTH` (melding noemt sortering en uitgerekende lengte; precies op de grens mag); ook zonder type (JS) gooit hij bij een ontbrekende
  of extra entry en bij een lengte die geen geheel getal ≥ 0 is. Het resultaat krijgt `encodeCursor(sort, parts)`: `assert()` op het aantal delen
  uit de declaratie (anders `AssertionError` → `INTERNAL_ERROR`), daarna de core-`encodeCursor([sort, ...parts])`. Routes gebruiken die in plaats van
  de losse `encodeCursor`; de assert op `MAX_CURSOR_LENGTH` in core blijft het vangnet.
- **Grens `MAX_TIMESTAMP_LENGTH` = 48** (`src/core/shared/limits.ts`): de ISO-tekst van een `timestamptz` uit Postgres (`to_json(...) #>> '{}'`) is in
  het slechtste geval ~40 tekens (6-cijferig jaar, microseconden, offset met seconden, " BC"); 48 met marge.
- **Accounts `cursorKeys`:** `nieuwste`/`oudste` `[MAX_TIMESTAMP_LENGTH, MAX_ID_LENGTH]`; `naam-az`/`naam-za` `[2 * MAX_NAME_LENGTH, MAX_ID_LENGTH]`,
  omdat de sleutel `lower(naam)` is en lowercase een teken kan verlengen (İ → i + U+0307). Budget hooguit 3270 tekens (`maxCursorLength([7, 200, 200])`).
  `src/api/routes/accounts.ts` gebruikt `accountsSearch.encodeCursor(sort, [...])`. Generator: `cursorKeys` voor `nieuwste` en `oudste` met
  `[MAX_TIMESTAMP_LENGTH, MAX_ID_LENGTH]`; de route gebruikt `__naamCamel__Search.encodeCursor`.
- **Ontdubbelen:** keyset-paginering garandeert niets als een rij tussen twee pagina's van sorteersleutel verandert (bijv. hernoemd): hij kan
  dan op een volgende pagina terugkomen of worden overgeslagen. `useInfiniteQuery` voegt de pagina's daarom samen met ontdubbelen op `id`
  (eerste voorkomen wint); een overgeslagen rij verschijnt pas na herladen. Geldt ook voor de generator.
- **Cursor niet in de URL** (OV-1): "Meer laden" blijft (`useInfiniteQuery`); de URL bewaart zoeken, filters en sortering. Framework §5 ("cursor in de
  URL") wordt daarop aangepast.
- **Lijstquery-helpers** (leerpunt #662): de cursor-decoder en de `ilike`-escape staan nu alleen lokaal in `src/api/routes/accounts.ts`
  (`after()`, `containsPattern()`), en elke resource kopieert ze. Ze komen één keer in core, in `src/core/api/route/list-query.ts`. Daar en niet in
  `src/core/shared/list-search.ts`, want de decoder gooit `AppError` (`src/core/api/errors.ts`) en core/shared importeert niets uit core/api. De escape
  hoort bij SQL en niet in de browserbundel, en de route krijgt één importplek. Geen nieuw uitbreidingspunt en geen nieuwe foutcode, alleen
  bestaande `VALIDATION`.
  - `containsPattern(q: string): string` geeft `%` + `q` + `%`, waarbij in `q` elke `\`, `%` en `_` een `\` ervoor krijgt (`ilike` gebruikt `\` als
    standaard-escape). De functie is totaal: lege invoer geeft `%%`, en de lengte is `2 + q.length + aantal ge-escapete tekens`.
  - `decodeListCursor(search, { sort, cursor }, parts)`: `search` is het resultaat van `defineListSearch`, `{ sort, cursor }` komt uit de geparste
    input, en `parts` is een niet-lege tuple van zod-schema's voor de sleuteldelen na de sorteernaam. Zonder `cursor` geeft hij `null`. Met een
    cursor decodeert hij met `decodeCursor(cursor, z.tuple([z.literal(sort), ...parts]))` en geeft hij alleen de geparste sleuteldelen terug, zonder de
    sorteernaam. Het uitvoertype is `{ [K in keyof Parts]: z.infer<Parts[K]> } | null`, met
    `Parts extends readonly [z.ZodType, ...z.ZodType[]]`. TypeScript leidt dat type niet af uit de gespreide tuple. Daarom mag de helper bij
    `z.tuple([z.literal(sort), ...parts])` en bij het afknippen van de sorteernaam `unsafeCast(waarde, reden)` gebruiken, nooit `as` (R-CODE-04).
    Een `ZodError` (vreemde base64, geen JSON, andere sortering, verkeerd type of aantal delen) wordt `new AppError('VALIDATION')` zonder `cause`.
    De fout is daarmee gelijk aan wat `src/api/routes/accounts-cursor.test.ts` nu eist (`rejects.toEqual(new AppError('VALIDATION'))`). Elke
    andere fout gaat ongewijzigd door, dus een bug wordt `INTERNAL_ERROR` en geen `VALIDATION`; de huidige `catch {}` vangt alles. Vóór het
    decoderen eist `assert()` dat `parts.length` gelijk is aan `search.cursorKeys[sort].length` (anders `AssertionError` → `INTERNAL_ERROR`). Zo
    volgen decoderen en `search.encodeCursor` dezelfde declaratie.
  - `src/api/routes/accounts.ts` gebruikt beide en verliest `after()`, `containsPattern()` en de import van `decodeCursor`. Gedrag en foutcodes van
    `GET /api/accounts` blijven gelijk, en `src/api/routes/accounts-cursor.test.ts` blijft ongewijzigd groen.
  - **Rail `lijstquery`** (ESLint, `eslint.config.js`, fixtures in `test/rails/eslint.test.ts`; R-DOC-02) geldt in `src/api/**/*.ts` buiten tests
    (`TESTS` in `eslint.config.js`). Elk van deze vormen geeft een fout:
    1. Een import, re-export (`export { … } from`, `export * from`) of `import()` van een bron die past op
       `/(^#core|core)[/]shared[/]cursor[.]ts$/` (alias of relatief pad). Dat geldt met een benoemde specifier `decodeCursor` of `encodeCursor`,
       met een namespace-specifier (`import * as`), met een default-specifier, en altijd bij `export *` en `import()`.
       Benoemde imports van `pageSchema`, `pageQuery` en `maxCursorLength` mogen wel.
    2. Een regex-literal waarvan het patroon zowel `%` als `_` bevat.
    3. `RegExp(…)` of `new RegExp(…)` met als eerste argument een tekstliteral, of een template literal zonder expressies, die zowel `%` als `_`
       bevat.
    4. `.replace(…)` of `.replaceAll(…)` met als eerste argument de tekstliteral `%`, `_` of `\`, of een regex-literal die `%`, `_` of een
       letterlijke `\` bevat, maar alleen als het tweede argument een `\` bevat (tekstliteral, of een template literal met `\` in een vast deel)
       of een functie is (pijl- of functie-expressie). `naam.replaceAll('_', ' ')` en `slug.replace(/_/g, '-')` mogen dus.
    5. Een functie- of variabeledeclaratie (`function`, `const`, `let`) met de naam `containsPattern` of `decodeListCursor`.

    Melding, letterlijk: "Lijstquery: decodeer de cursor met decodeListCursor en escape de zoekterm met containsPattern uit
    #core/api/route/list-query.ts; maak de cursor met search.encodeCursor. Geen eigen kopie (spec lijstpagina, leerpunt #662)."

    Gedekt zijn ook template literals zonder expressies, als bron van `import()` en als eerste argument van `RegExp`. Niet gedekt, en daarvoor
    blijft de review de grens:
    - een template literal mét expressies, als bron of als patroon;
    - een bronpad of patroon dat in een variabele is opgebouwd;
    - een escape in een ander bestand of met andere tekens;
    - een functie onder een andere naam.

    Stand vóór de bouw-PR: buiten `src/api/routes/accounts.ts` stond in `src/api` (zonder tests) geen `.replace` of `.replaceAll` en geen regex
    met `%` en `_`, en buiten tests importeerde alleen `accounts.ts` uit `#core/shared/cursor.ts`. Na de bouw-PR doet geen enkel bestand
    in `src/api` dat nog.
    Ook niet gedekt: een template literal als tweede argument van `.replace` met een `\` in een derde of latere vaste deel, en een import met een
    tekstnaam (`import { 'decodeCursor' as d } from …`).
    `src/api/routes/accounts-cursor.test.ts` importeert `encodeCursor` uit dat bestand, maar valt als test buiten de rail.
  - **Generator:** in `scripts/kit/templates/route.ts.tmpl` wordt de commentaarzin "escape `%`, `_` en `\` in `q` voordat je zoekt met ilike"
    (regel 14–15) vervangen door een verwijzing naar `decodeListCursor` en `containsPattern` uit `#core/api/route/list-query.ts`. De routes blijven
    `notImplemented` (R-ROL-06, stap 2 van de werkstraat). Een import die nog niet gebruikt wordt, zou op lint falen; de rail houdt een kopie
    tegen zodra de developer de route bouwt (OV-7). In `scripts/kit/templates/spec.md.tmpl` blijft regel 65 ("In `q` worden `%`, `_` en `\`
    ge-escaped …") staan, want `test/rails/new-resource-lijst.test.ts` (test "escapen van %, _ en \\ bij zoeken") eist die tekst. Die regel krijgt
    er alleen `containsPattern` bij, en de cursorregel `decodeListCursor`. Geen andere test leest de tekst van `route.ts.tmpl` letterlijk.
    `test/rails/new-resource.test.ts` en `test/rails/contract-sjabloon-cursor-keys.test.ts` lezen wel andere bestanden, maar niet deze zin.

## Hergebruik en UX

- **Bestaande componenten:** `Table`, `AsyncView`, `PageHeader`, `Field`, `Input` (`type="search"`), `Select`, `Button`, `Notice`.
  **Nieuw in de kit (OV-2):** `ListToolbar` in `src/core/web/ui` — layoutblok met zoekveld, nul of meer `Select`-filters, sorteren en "Filters wissen";
  stapelt onder elkaar op 375 px; op `/design-system` en in `check:catalogus`. Plus `useListSearch(route)` in `src/core/web/lib` (lezen en bijwerken
  van de search params; zoekveld met 300 ms debounce en `replace: true`, filters en sorteren als nieuwe history-stap).
- **Staten per scherm:** laden (eerste keer, via `AsyncView`); leeg zonder zoeken of filters ("Nog geen accounts."); leeg mét zoeken of filters
  (eigen tekst plus knop "Filters wissen"); fout via `AsyncView`; verouderd: bij een nieuwe zoekopdracht blijven de vorige rijen staan
  (`placeholderData`), de tabel krijgt `aria-busy="true"` en de statusregel toont "Bezig met laden…"; "Meer laden" bezig: knop uit.
- **Alle zichtbare tekst letterlijk:**

| Plek | Tekst |
|---|---|
| Zoekveld (accounts) | label "Zoeken"; hulptekst "Zoek op naam of e-mailadres." |
| Filter Rol | label "Rol"; opties "Alle rollen", "Gebruiker", "Beheerder" |
| Filter Status | label "Status"; opties "Alle statussen", "Actief", "Uitgenodigd" (en "Geblokkeerd" na spec accountbeheer-uitbreiding) |
| Sorteren | label "Sorteren"; opties "Nieuwste eerst", "Oudste eerst", "Naam A–Z", "Naam Z–A" |
| Wissen | knop "Filters wissen" (alleen zichtbaar als `q` of een filter actief is; wist `q` en filters, de sortering blijft staan) |
| Leeg met filters | "Geen accounts gevonden. Pas je zoekopdracht of filters aan." |
| Statusregel (`aria-live="polite"`) | "{n} accounts getoond." / bij meer pagina's "{n} accounts getoond. Er zijn er meer." / tijdens laden "Bezig met laden…" |
| Generator (sjabloon) | label "Zoeken"; sorteren "Nieuwste eerst", "Oudste eerst"; leeg met filters "Niets gevonden. Pas je zoekopdracht aan." |

- **Focusvolgorde en toetsenbord:** zoekveld → filters → sorteren → "Filters wissen" → tabel → "Meer laden". Typen verplaatst de focus nooit;
  Esc in het zoekveld wist het (native `type="search"`); na "Filters wissen" gaat de focus naar het zoekveld; na "Meer laden" blijft de focus op de knop.

## Acceptatiecriteria

- **lijstpagina/AC-1** — Gegeven een admin op `/admin/accounts`, wanneer hij "gebruiker" typt, dan staat na 300 ms `?q=gebruiker` in de URL (zonder
  nieuwe history-stap) en toont de tabel alleen accounts met "gebruiker" in naam of e-mailadres.
- **lijstpagina/AC-2** — Gegeven filter Rol "Beheerder" en Status "Actief", wanneer de pagina herlaadt of de URL in een nieuw tabblad opent, dan zijn
  dezelfde filters gekozen en dezelfde rijen zichtbaar.
- **lijstpagina/AC-3** — Gegeven sortering "Naam A–Z" en meer dan 25 accounts, wanneer hij "Meer laden" kiest, dan volgen de rijen de sortering zonder
  dubbele of ontbrekende rijen.
- **lijstpagina/AC-4** — Gegeven een gefilterde lijst, wanneer hij de Terug-knop van de browser gebruikt, dan staat het vorige filter of de vorige sortering terug.
- **lijstpagina/AC-5** — Gegeven een zoekopdracht zonder treffers en sortering "Naam A–Z", dan ziet hij "Geen accounts gevonden. …" en "Filters
  wissen"; na een klik bevat de URL alleen nog `sort=naam-az` en staat de volledige lijst er in die sortering.
- **lijstpagina/AC-6** — Gegeven een URL met `?sort=onzin&rol=koning`, wanneer hij hem opent, dan ziet hij de lijst met de standaardwaarden en zonder foutmelding;
  dezelfde waarden rechtstreeks naar `/api/accounts` geven `VALIDATION`.
- **lijstpagina/AC-7** — Gegeven een cursor die bij "nieuwste" hoort, wanneer iemand hem met `sort=naam-az` naar de API stuurt, dan `VALIDATION`.
- **lijstpagina/AC-8** — Gegeven `pnpm new:resource notities`, dan heeft de gemaakte lijst zoeken en sorteren in de search params, compileert alles en slaagt `check:new-resource`.
- **lijstpagina/AC-9** — Gegeven een naam van `MAX_NAME_LENGTH` tekens uit de slechtste tekens (U+0001, `"`, `\`, een teken van 3 UTF-8-bytes, een
  surrogaatpaar, een losse surrogaat) en een id van `MAX_ID_LENGTH` tekens, wanneer de lijst er een cursor van maakt voor `naam-az` of `naam-za`, dan
  accepteert `accountsSearch.api` die cursor weer (de reproductie uit #411 geeft dan `true`).
- **lijstpagina/AC-10** — Gegeven een cursor van `MAX_CURSOR_LENGTH + 1` tekens, wanneer hij naar de API gaat (`defineListSearch` of `pageQuery`),
  dan `VALIDATION`; een cursor van precies `MAX_CURSOR_LENGTH` tekens wordt op lengte niet geweigerd.
- **lijstpagina/AC-11** — Gegeven een sleutel waarvan de cursor langer dan `MAX_CURSOR_LENGTH` wordt, wanneer de server `encodeCursor` aanroept, dan
  gooit die een `AssertionError` in plaats van de cursor terug te geven.
- **lijstpagina/AC-12** — Gegeven per sleuteldeel een maximale lengte, dan is de echte lengte van `encodeCursor` voor elk slechtste teken hooguit
  `maxCursorLength`, en bij uitsluitend U+0001 precies gelijk.
- **lijstpagina/AC-13** — Gegeven een `cursorKeys`-declaratie waarvan `maxCursorLength([sort.length, ...lengtes])` groter is dan `MAX_CURSOR_LENGTH`,
  dan gooit `defineListSearch` bij definitie een `Error` die de sortering noemt; een declaratie van precies `MAX_CURSOR_LENGTH` gooit niet.
- **lijstpagina/AC-14** — Gegeven `cursorKeys` met een ontbrekende of extra sortering, dan is dat een typefout en gooit `defineListSearch` ook runtime
  een `Error`; een lengte die geen geheel getal ≥ 0 is, geeft ook een `Error`.
- **lijstpagina/AC-15** — Gegeven `search.encodeCursor(sort, parts)` met een ander aantal delen dan gedeclareerd, dan een `AssertionError`; met het
  juiste aantal is de uitkomst gelijk aan `encodeCursor([sort, ...parts])`.
- **lijstpagina/AC-16** — Gegeven `pnpm new:resource notities`, dan declareert het contract `cursorKeys` voor elke sortering en slaagt `check:new-resource`.
- **lijstpagina/AC-17** — Gegeven `containsPattern`, dan geeft `abc` → `%abc%`, `50%_a\b` → `%50\%\_a\\b%`, `''` → `%%`,
  `MAX_SEARCH_LENGTH` keer `\` → een tekst van `2 * MAX_SEARCH_LENGTH + 2` tekens die met `%` begint en eindigt, met daartussen alleen `\\`-paren, en
  `MAX_SEARCH_LENGTH` keer `a` → ongewijzigd tussen twee `%`.
- **lijstpagina/AC-18** — In het nieuwe `test/api/accounts-search-escape.int.test.ts` maakt de test accounts aan met de namen
  "Zoek a_b", "Zoek axb", "Zoek 5%", "Zoek 5x" en "Zoek a\b". Een admin met MFA roept `GET /api/accounts` aan:
  - met `q=a_b` staat van deze vijf alleen "Zoek a_b" in `items`, precies één keer;
  - met `q=5%` alleen "Zoek 5%", precies één keer;
  - met `q=\` staat "Zoek a\b" precies één keer in `items`, en geen van de andere vier.
- **lijstpagina/AC-19** — Gegeven `decodeListCursor` met een `defineListSearch` waarvan `cursorKeys.nieuwste` twee delen heeft:
  zonder `cursor` → `null`; met `search.encodeCursor('nieuwste', [t, id])` → `[t, id]`; met een cursor van een andere sortering, geen base64url, geen
  JSON, een sleuteldeel van het verkeerde type of een ander aantal delen → `AppError` met `code` `VALIDATION`.
- **lijstpagina/AC-20** — Gegeven `decodeListCursor` met `parts` van een andere lengte dan `cursorKeys[sort]`, dan een
  `AssertionError` (geen `AppError`); en gegeven een sleutelschema dat een gewone `Error` gooit, dan komt die `Error` ongewijzigd naar buiten, niet als
  `VALIDATION`.
- **lijstpagina/AC-21** — Gegeven de rail `lijstquery`, dan geeft ESLint in `src/api/routes/` met de melding uit
  "Lijstquery-helpers" een fout op één fixture per vorm.
  - Vorm 1 (bron `#core/shared/cursor.ts`):
    - `import { decodeCursor } from '#core/shared/cursor.ts'`;
    - `import { encodeCursor } from '#core/shared/cursor.ts'`;
    - `import * as cursor from '#core/shared/cursor.ts'`;
    - `import cursor from '#core/shared/cursor.ts'`;
    - `import { decodeCursor } from '../../core/shared/cursor.ts'`;
    - `export { decodeCursor } from '#core/shared/cursor.ts'`;
    - `export * from '#core/shared/cursor.ts'`;
    - `await import('#core/shared/cursor.ts')`;
    - ``await import(`#core/shared/cursor.ts`)``; die geeft in `src/` ook de bestaande rail `rails/import` (niet-literal bron), dus de fixture
      verwacht beide meldingen.
  - Vorm 2: de regex `/[\\%_]/g` uit `accounts.ts`.
  - Vorm 3: `new RegExp('[%_]')`, `RegExp('[%_]')` en ``RegExp(`[%_]`)``.
  - Vorm 4:
    - `q.replaceAll('%', '\\%')`;
    - `q.replace('_', '\\_')`;
    - `q.replaceAll('\\', '\\\\')`;
    - ``q.replaceAll('%', `\\%`)``;
    - `q.replaceAll('_', (c) => c)`.
  - Vorm 5: `function containsPattern() {}`, `const containsPattern = () => ''`, `function decodeListCursor() {}` en
    `const decodeListCursor = () => null`.

  Geen fout geven:
  - `naam.replaceAll('_', ' ')` en `slug.replace(/_/g, '-')`;
  - `import { pageQuery } from '#core/shared/cursor.ts'`;
  - een import van `decodeListCursor` en `containsPattern` uit `#core/api/route/list-query.ts`;
  - dezelfde foute fixtures in `src/core/` of in een `*.test.ts`.
- **lijstpagina/AC-22** — Gegeven de bouw-PR, dan importeert `src/api/routes/accounts.ts` `decodeListCursor` en `containsPattern`
  uit `#core/api/route/list-query.ts` en slaagt `pnpm lint` met de rail aan. Deze bestaande tests blijven groen zonder dat ze wijzigen:
  - de integratietests van `GET /api/accounts` (`test/api/accounts.int.test.ts`, `test/api/accounts-sort.int.test.ts`,
    `test/api/accounts-cursor-validation.int.test.ts`);
  - de unittest `src/api/routes/accounts-cursor.test.ts`, die `rejects.toEqual(new AppError('VALIDATION'))` eist.
- **lijstpagina/AC-23** — Gegeven `pnpm new:resource notities`:
  - de gemaakte `src/api/routes/notities.ts` noemt `decodeListCursor`, `containsPattern` en `#core/api/route/list-query.ts`, en bevat de zin
    "escape `%`, `_` en `\` in `q`" niet meer (de vorm uit `scripts/kit/templates/route.ts.tmpl`, regel 14);
  - de gemaakte spec houdt de zin "In `q` worden `%`, `_` en `\` ge-escaped" en noemt daarbij `containsPattern`, en bij de cursor
    `decodeListCursor`;
  - `check:new-resource` slaagt.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| `q` met `%`, `_` of `\` | letterlijk gezocht, geen wildcard | — |
| `q` alleen spaties | als leeg behandeld; weg uit de URL | — |
| `q` langer dan `MAX_SEARCH_LENGTH` (100) | web: afgekapt in het veld (`maxLength`); API: geweigerd | `VALIDATION` |
| Onbekende sleutel in de search params | web: genegeerd; API: geweigerd (`.strict()`) | `VALIDATION` |
| Gemanipuleerde of vreemde cursor | geweigerd, geen SQL-fout | `VALIDATION` |
| Bug in een sleutelschema of in het aantal `parts` van de route | zichtbaar als fout van de server, niet verstopt als ongeldige invoer (AC-20) | `INTERNAL_ERROR` |
| Cursor die `atob` of de strikte `TextDecoder` laat falen (`TypeError`, `DOMException`) | `decodeCursor` maakt er binnen zijn eigen `try` al een `ZodError` van, dus `VALIDATION`; AC-20 toetst dit niet, AC-19 ("geen base64url") wel | `VALIDATION` |
| `src/api` gebruikt `.replace`/`.replaceAll` met `_` voor iets anders dan een escape (bv. `_` → spatie) | geen fout van de rail: het tweede argument bevat geen `\` en is geen functie (AC-21) | — |
| Nieuwe resource kopieert `after()`/`containsPattern()` uit een oude versie van `accounts.ts` | lint faalt met de melding van de rail (AC-21) | — |
| Cursor langer dan `MAX_CURSOR_LENGTH` | geweigerd | `VALIDATION` |
| Naam van 100 tekens met stuurtekens of aanhalingstekens als sorteersleutel | de cursor past in het budget; "Meer laden" werkt (AC-9) | — |
| Sleutel die buiten de contracten om te lang is opgeslagen (bijv. `pnpm admin:create --name`; de naamkolom heeft geen lengte-CHECK) | zichtbare fout op die sortering in plaats van een stil vastgelopen "Meer laden" (AC-11) | `INTERNAL_ERROR` |
| Sortering toegevoegd op een lang tekstveld zonder passend budget in `cursorKeys` | de app start en de tests draaien niet: fout bij het laden van het contract, geen `INTERNAL_ERROR` in productie (AC-13) | — |
| Account wijzigt tussen twee pagina's (bijv. hernoemd) | kan op een volgende pagina terugkomen (ontdubbeld op `id`, dus één keer zichtbaar) of overgeslagen worden (zichtbaar na herladen) | — |
| Snel typen | één request per 300 ms stilte; een oud antwoord overschrijft geen nieuw (query key) | — |
| `user` opent `/admin/accounts?q=x` | geen toegang, zoals nu | `FORBIDDEN` |
| Naam met hoofdletters en accenten | sortering op `lower(naam)` in de collatie van de database (OV-3) | — |

## Raakt ook

- `src/core/shared/list-search.ts`, `src/core/web/lib/list-search.ts`, `src/core/web/ui/list-toolbar.tsx` (core, gate-pad), `MAX_SEARCH_LENGTH` in
  `src/core/shared/limits.ts`; `src/shared/contracts/accounts.ts`, `src/api/routes/accounts.ts`, `src/web/features/accounts/*`, route `/_app/admin/accounts` (`validateSearch`).
- Generator: `scripts/kit/templates/` (`contract.ts.tmpl`, `route.ts.tmpl`, `queries.ts.tmpl`, `page.tsx.tmpl`, `web-route.tsx.tmpl`, `spec.md.tmpl`) en
  `scripts/kit/check-new-resource.mjs`: gate-paden (ADR 0016), dus een gate-wijziging door de eigenaar.
- Framework §5 (Paginering, Routing) en `docs/gouden-pad.md` wijzen naar dit patroon; `/design-system` krijgt een voorbeeld van `ListToolbar`.
- Cursorbudget (#411): `src/core/shared/cursor.ts` (`maxCursorLength`, assert in `encodeCursor`), `src/core/shared/limits.ts` (`MAX_CURSOR_LENGTH`,
  `MAX_ID_LENGTH`), `src/core/shared/ids.ts`, `src/core/shared/list-search.ts` (core, gate-pad); `src/shared/contracts/accounts.ts` (test op het budget).
- Sleutelbudget (#444): `src/core/shared/list-search.ts` (`cursorKeys`, `encodeCursor`), `src/core/shared/limits.ts` (`MAX_TIMESTAMP_LENGTH`; core,
  gate-pad); `src/shared/contracts/accounts.ts`, `src/api/routes/accounts.ts`; generator `contract.ts.tmpl`, `route.ts.tmpl`, `spec.md.tmpl` (gate-paden)
  met `check:new-resource`; `docs/gouden-pad.md`, `CHANGELOG.md`. Geen migratie, route of permissie.
- `src/core/shared/cursor.ts`: het commentaar zegt "cursor in de URL"; dat wordt "cursor alleen in de query van TanStack Query" (OV-1).
- Lijstquery-helpers (#662), per pad met het niveau uit `feiten.mjs pad`:
  - `src/core/api/route/list-query.ts` (nieuw) en `src/core/api/route/list-query.test.ts`: schrijven `gate` (`src/core/**`), besluit eigenaar. De
    developer schrijft de code met de melding "noem het in de PR", de tester schrijft de test (R-WERK-10).
  - `eslint.config.js` (rail `lijstquery` in `ruleNames` en een `restrict(...)`-blok): schrijven `voorReview`, besluit eigenaar. Alleen de
    hoofdsessie schrijft dit (R-ROL-02). Een nieuwe lintregel uit de PR zelf is voor `pnpm ratchet` een melding, geen fout (R-CI-02).
  - `scripts/kit/templates/route.ts.tmpl`, `scripts/kit/templates/spec.md.tmpl`: schrijven `voorReview`, besluit eigenaar. Alleen de
    hoofdsessie schrijft dit; daarna draait `check:new-resource`.
  - `test/rails/eslint.test.ts` en `test/rails/new-resource-lijst.test.ts`: tests toevoegen, niets wijzigen. Nieuw
    `test/api/accounts-search-escape.int.test.ts` (AC-18). Alle drie `gate`, R-TEST-02; de tester schrijft ze. Bestaande tests die
    ongewijzigd groen blijven: `src/api/routes/accounts-cursor.test.ts` (eist `new AppError('VALIDATION')` zonder `cause`), de drie
    integratietests uit AC-22, en de test "escapen van %, _ en \\ bij zoeken" in `test/rails/new-resource-lijst.test.ts` (eist de escapezin
    in `spec.md.tmpl`). Geen test leest de tekst van `route.ts.tmpl` letterlijk.
  - `src/api/routes/accounts.ts`: schrijven vrij. `docs/gouden-pad.md` (stap 6 Route: de lijst gebruikt de helpers): besluit eigenaar.
    `CHANGELOG.md`: vrij.
  - Geen migratie, route, permissie, foutcode of resource. `check:migrations`, `check:secdef`, `test:db`-policies,
    `test/security/resources.ts` en permissietests per verboden rol zijn dus niet geraakt. `pnpm test:db` draait wel, voor AC-18 en AC-22.
  - Geen ADR. Een hulpfunctie in core die de app importeert, valt onder de bestaande zonegrens (ADR 0040): geen nieuw uitbreidingspunt, en geen
    A1 t/m A4 (de rail maakt een check strenger, niet losser).
- **PR-indeling** (R-WERK-05, R-WERK-07, ADR 0080 punt 4; geen pad is `besluit-pr` of `altijdVragen`, dus geen kritiek werk):
  1. **Besluit-PR (#669, gemerged):** alleen `docs/specs/lijstpagina.md`, met AC-17 t/m AC-23 als `(nog niet gebouwd)`. De status bleef
     `gebouwd # #514`. De markering mag niet in een PR met code (spec specarchief-en-bouwvorm, AC-7), dus die PR ging eerst. De merge door de
     eigenaar is het besluit.
  2. **Bouw-PR** (volledige route, eigenaarmerge): eerst een stub van `src/core/api/route/list-query.ts` met de definitieve signaturen
     (`containsPattern` geeft `q` terug, `decodeListCursor` geeft `null`). De tester-hook eist dat een test op een assertie faalt en niet op een
     ontbrekende import, dus een module die nog niet bestaat heeft eerst zo'n stub nodig. Dan de tester: AC-17, AC-19, AC-20,
     AC-21 en AC-23 falen rood op asserties. AC-18 is een beschermtest en is al groen tegen de oude `accounts.ts`; hij bewaakt dat de
     verhuizing de escape niet verandert. Dan de developer (core-helper, `accounts.ts`), dan de hoofdsessie (`eslint.config.js`, sjablonen).
     Daarna haalt de bouw-PR de markeringen weg en zet hij `gebouwd # #<deze PR>`. Docs (`docs/gouden-pad.md`, `CHANGELOG.md`) gaan in dezelfde
     PR mee.

## Buiten scope

Totaal aantal resultaten, paginanummers, kolomkoppen als sorteerknop, opgeslagen weergaven, full-text search of `pg_trgm`, filters op datum,
meerdere waarden per filter, zoeken op `/design-system`-voorbeelddata. Bij het cursorbudget (#411): een lengte-CHECK op de naam in de database
(`better_auth."user"` is auth, dus eerst een besluit-PR) en stuurtekens in namen weigeren (een aparte keuze, met bestaande gegevens). Bij het sleutelbudget (#444): een lintregel die de losse `encodeCursor` in
app-routes verbiedt (sinds #662 in de rail `lijstquery`), en een lengte-CHECK in de database. Bij de lijstquery-helpers (#662) valt buiten scope: de
escape in de securitysuite (`test/security/`), want daar lopen #656, #657 en #661 (vervolg, OV-6); de webkant uit hetzelfde leerpunt ("Meer laden"
en focus per lijstscherm, OV-8); een keyset-voorwaarde als helper (de kolommen en de cast verschillen per sortering); en een `max`-lengte per
sleuteldeel die uit `cursorKeys` wordt afgeleid.

## Testplan

- **Unit:** `defineListSearch`: strict voor de API, `.catch()` voor de web, `q` trim en leeg, grenzen gelijk aan `limits.ts`; cursor per sortering
  (goed, andere sortering, verkeerd type); escapen van `%`, `_`, `\`; `useListSearch` (debounce, `replace` bij zoeken, push bij filter);
  `ListToolbar` (labels, "Filters wissen" alleen bij actieve filters, sortering blijft, focus na wissen); samenvoegen van pagina's met een dubbele
  `id` (één rij); copy-woordenlijst. Cursorbudget: `maxCursorLength` als bovengrens per slechtste teken (AC-12), lengtegrens op de invoer (AC-10),
  assert bij emissie (AC-11), roundtrip van de accountsleutel op maximale lengte per naamsortering (AC-9). Sleutelbudget: `defineListSearch` gooit
  boven de grens en niet precies erop (AC-13); ontbrekende/extra entry als typefout (`@ts-expect-error`) en runtime-`Error`, lengte -1, 1.5, `NaN`
  (AC-14); `search.encodeCursor` met te weinig/te veel delen en gelijk aan core bij het juiste aantal (AC-15); accounts-declaratie ≤ 3270.
- **pgTAP:** n.v.t. (geen migratie); de bestaande test "`app.accounts` alleen voor admin met MFA" blijft groen, nu ook met een zoekfilter.
- **Integratie (`pnpm test:db`):** `GET /api/accounts` per filter, per sortering en met zoeken; paginering over 3 pagina's zonder dubbele of ontbrekende
  rijen per sortering; ongeldige `sort`, `rol`, `status`, `q` en cursor → `VALIDATION`; `user` → `FORBIDDEN`, admin zonder MFA → `MFA_REQUIRED`.
  Volgorde op naam: exacte asserts alleen op ASCII-namen; namen met accenten of hoofdletters alleen op aanwezigheid en zonder dubbele rij, want de
  collatie verschilt per database (OV-3) en lokaal is niet gelijk aan de provider.
- **Generator:** `check:new-resource` maakt een resource uit de nieuwe sjablonen en draait typecheck, lint en unit (AC-8, AC-16).
- **Lijstquery-helpers (#662):** unit `src/core/api/route/list-query.test.ts` voor AC-17, AC-19 en AC-20 (de geparste sleuteldelen exact, de
  `code` van de fout exact, `AssertionError` op klasse). Railfixtures in `test/rails/eslint.test.ts` voor AC-21, positief en negatief.
  Integratie (`pnpm test:db`) voor AC-18 in het nieuwe `test/api/accounts-search-escape.int.test.ts`. De test maakt de vijf accounts zelf aan
  en telt per `q` hoe vaak elk ervan in `items` staat, zodat een lege lijst niet kan slagen.
  AC-22 via `pnpm lint` en de bestaande integratietests, ongewijzigd. AC-23 in `test/rails/new-resource-lijst.test.ts` op de sjabloontekst, plus
  `check:new-resource`.
- **E2E (`pnpm ui:check`, echte stack, CSP aan):** AC-1 t/m AC-6 op `/admin/accounts` met seed-accounts; axe op 375 en 1280 px met lege lijst,
  gefilterde lijst en "verouderd"; op 375 px geen horizontale scroll buiten de tabel.

## Open vragen voor de eigenaar

- **OV-1** — "Meer laden" met de cursor alleen in de query (zoals nu) of vorige/volgende pagina's met de cursor in de URL (framework §5)? Aanbeveling:
  "Meer laden"; een cursor in de URL laat na herladen alleen een middenstuk zien. Framework §5 aanpassen (beschermd pad).
- **OV-2** — Nieuw kitcomponent `ListToolbar` in core, of elke lijst zet `Field`, `Input` en `Select` zelf in een flex-rij? Aanbeveling: `ListToolbar`;
  het patroon komt in elke lijst en in de generator terug, en 375 px en focus zijn dan één keer goed.
- **OV-3** — Sorteren op naam met `lower()` in de standaardcollatie van de database, of een ICU-collatie (`nl-NL`)? Aanbeveling: standaardcollatie nu;
  een ICU-collatie hangt af van de beheerde database van de app (ADR per app).
- **OV-4** — Index voor zoeken (`pg_trgm`) nu al? Aanbeveling: nee; pas bij een lijst die aantoonbaar traag is, met ADR voor de extensie.
- **OV-5** — Welke sorteringen krijgt de generator standaard? Aanbeveling: alleen "Nieuwste eerst" en "Oudste eerst" op `aangemaakt` plus zoeken;
  filters per resource vanuit de spec.
- **OV-6** — De securitysuite toetst de escape niet (leerpunt #662, stap 4). Nu meenemen of als vervolg? Aanbeveling: als vervolg, na #656, #657 en
  #661. Die werken in `test/security/`, en een gelijktijdige wijziging botst. Na hun merge een roadmap-item of leerpunt: per resource met
  `q` toetst de suite dat `%` en `_` geen wildcard zijn. AC-17 (unit) en AC-18 (accounts, echte database) dekken het gat tot dan.
- **OV-7** — Moet de generator een gebouwde lijstroute emitteren die de helpers al gebruikt, of alleen het commentaar plus de rail? Aanbeveling:
  commentaar plus rail. Een gebouwde handler kent de zoekvelden en de tabelkolommen nog niet (die komen uit de spec van de resource), en zonder
  goedgekeurde spec maakt de generator alleen een skelet (R-ROL-06). Een ongebruikte import faalt op lint.
- **OV-8** — Het leerpunt noemt ook de webkant ("Meer laden" en focus per lijstscherm). Hoort die hierbij? Aanbeveling: nee, die gaat apart. Hij
  raakt `src/core/web/lib` en UI-tests, en eerst moet blijken met een tweede lijstscherm wat er echt herhaald wordt (de generator heeft al
  `useListSearch` en `ListToolbar`).
- **OV-9** — Komt de import van `encodeCursor` uit `#core/shared/cursor.ts` ook in de rail, zodat routes alleen `search.encodeCursor` gebruiken? Dat
  stond bij #444 nog buiten scope. Aanbeveling: ja. `accounts.ts` en het sjabloon gebruiken al `search.encodeCursor`, dus het kost niets, en het
  houdt decoderen en coderen aan dezelfde `cursorKeys`.
