---
status: gebouwd
namespace: suitecontract
---

# Securitysuite volgt het contract van de resource

## Doel

De securitysuite (spec `security-suite`) leidt haar verwachting af uit het contract van een resource (routecontract en
databasecatalogus), zodat een resource uit `pnpm new:resource` de suite haalt zonder handwerk buiten de declaratie, en
generator en suite niet meer uiteen kunnen lopen. Lost leerpunten #656, #657 en #681 op, plus dezelfde drift bij de
permissie-oracle.

Uitbreiding (#719, reviewbevinding C-2, ontwerp 7): de actorsoorten van de suite volgen het rollenregister
(`src/shared/roles.ts`, spec `rollenregister`, ADR 0092), zodat een app met een extra rol de generieke suite niet wijzigt. Alleen
de permissie-oracle en de lijst beheerrollen (`MFA_ROLLEN`) blijven met de hand, onafhankelijk van de implementatie.

### Uitgangssituatie (main `11ffbd8`, gelezen, niet gedraaid)

| Ticket | Wat er nu gebeurt | Bestand:regel |
|---|---|---|
| #656 | De suite stuurt altijd `limit: 1` en eist bij twee rijen per gebruiker een tweede pagina. Een gegenereerde lijst komt uit `defineListSearch`, strict zonder `limit`: 400 `VALIDATION`, "controle afgebroken", en daarmee vallen AC-9 en AC-10 voor de hele resource weg. Zonder `limit` past het ook niet: de vaste paginagrootte is 25, twee rijen geven één pagina. De zelftest merkt niets, want de probe-lijst heeft een eigen `limit`. | `test/security/controles.ts:400`, `:438`; `src/core/shared/list-search.ts:113-127`; `scripts/kit/new-resource.mjs:26`; `test/security/probe-eigenaar.ts:88` |
| #657 | AC-8 op de database eist voor elke owner-tabel een niet-lege `sample.update` met een kolom waarop B UPDATE-recht heeft, ook als de resource niet bewerkbaar is. Het migratiesjabloon geeft juist geen update-grant. Ontbreekt `sample.update`, dan stopt de controle vóór de select- en delete-proef. De API-kant slaat update al over zonder update-route. | `controles.ts:153-160`, `:116-134`, `:465`, `:544`; `scripts/kit/templates/migratie.sql.tmpl:15-18` |
| #681 | AC-5 roept met `adminMfa` de handler van elke admin-GET aan en eist 200, terwijl de spec alleen weigeringen belooft en voor `adminMfa` alleen "niet `MFA_REQUIRED`". Een onbekend id (404) of een nog niet gebouwde route (501) maakt AC-5 rood. Een gegenereerde resource met `--rollen user,admin` raakt dit meteen. `routeSamples` helpt niet: `routes.int.test.ts` roept `sampleFor` aan, niet `sampleVoor`. | `test/security/routes.int.test.ts:160-171`, `:30`; `docs/template/specs/security-suite.md:110-111`, `:162`, `:182`; `test/security/resources.ts:83-87` |
| (geen ticket) | `new:resource` voegt `<naam>:read`/`<naam>:write` toe aan `permissions.ts`, maar drukt geen regel voor `PERMISSIE_ORACLE` af: security/AC-4 ("de oracle heeft precies de sleutels van `permissions.names`") wordt rood. | `scripts/kit/new-resource.mjs:269-295`; `test/security/fixtures.ts:33-41`; `test/security/routes.int.test.ts:114-116` |

Uitgangssituatie voor ontwerp 7 (main `1113a2a5`, gelezen, niet gedraaid):

| Ticket | Wat er nu gebeurt | Bestand:regel |
|---|---|---|
| #719, C-2 | security/AC-4 eist dat `roles.names` precies `['admin', 'user']` is; een app met een derde rol is rood met "een nieuwe rol vraagt een actorsoort" en moet de suite met de hand aanpassen. | `test/security/routes.int.test.ts:121-123` |
| #719, C-2 | `ActorSoort` is een vaste lijst; `verwachteUitkomst` beeldt elke soort die niet `user` is af op `admin`, en de MFA-eis hangt aan de naam `admin`, niet aan `beheer`. | `test/security/fixtures.ts:43`, `:53-66`, `:78-80` |
| #719, C-2 | `maak` maakt van elke soort die niet `zonderRol` of `user` is een `admin`-account; `A`/`B` maken voor elke rol die niet `admin` is een `user`-account, dus `resources.ts` met `rol: 'planner'` test stil met `user`. `account()` neemt alleen `'user' \| 'admin'`. | `test/security/fixtures.ts:321-327`, `:391-399`; `test/api/account-harness.ts:66` |
| #719, C-2 | AC-4 draait alleen `user` en `zonderRol`; AC-5 alleen routes waarvan de permissie `admin` heeft. Een beheerrol van de app krijgt geen MFA-weigering, een gewone rol geen FORBIDDEN-proef. | `test/security/routes.int.test.ts:127`, `:147-173` |
| #719 | Het gouden pad noemt "een actorsoort in `test/security/fixtures.ts`" als stap bij een nieuwe rol. | `docs/gouden-pad.md:133-134` |

Geen CI-job haalt generatoruitvoer door de suite: `check:new-resource` draait alleen `gate:fast` en past de declaratie niet toe
(`scripts/kit/check-new-resource.mjs:5`, `:36-39`). Daarom komt het bewijs uit een probe in generatorvorm (AC-10).

## Rollen en wie wat ziet

Geen wijziging voor eindgebruikers. De suite gebruikt dezelfde fixtures als spec `security-suite` (A, B, `adminMfa`,
`adminZonderMfa`, `zonderRol`, verlopen, geen sessie). Een lijst met `pageSize` accepteert `limit` voor elke rol die de
lijstpermissie heeft; dat geeft niemand meer rijen dan de vaste paginagrootte.

Met ontwerp 7 komen de actorsoorten uit het register: per rol buiten `MFA_ROLLEN` één soort met de rolnaam (`user`), per beheerrol
`<rol>Mfa` en `<rol>ZonderMfa` (`adminMfa`, `adminZonderMfa`), plus `zonderRol` en `geenSessie`. In de template zijn dat precies
de vijf soorten van nu.

## Ontwerp

### 1. `pageSize` in het lijstcontract (#656, core)

- `defineListSearch` krijgt een optionele `pageSize` in de config. Met `pageSize` krijgt het API-schema het veld
  `limit: z.coerce.number().int().min(1).max(pageSize).default(pageSize)`; zonder `pageSize` blijft het schema zoals nu (geen
  `limit`, een `limit` is een onbekend veld: `VALIDATION`). Het webschema krijgt nooit `limit` (niet in de URL).
- `pageSize` is een geheel getal van 1 t/m `MAX_PAGE_SIZE`; anders gooit `defineListSearch` bij het laden, zoals bij `cursorKeys`.
  `limit` wordt een gereserveerde naam: een filter met die naam gooit, zoals `q`, `sort` en `cursor`.
- `ListSearch` geeft `pageSize` terug (of `undefined`), zodat de handler en tests dezelfde waarde lezen.
- De accountslijst geeft geen `pageSize` mee en verandert niet (`src/shared/contracts/accounts.ts`).

### 2. Generator (#656, oracle)

- `scripts/kit/templates/contract.ts.tmpl` geeft `pageSize: <NAAM>_PAGE_SIZE` mee (de constante die de generator al in
  `src/shared/limits.ts` schrijft). `route.ts.tmpl` zegt in het commentaar dat de lijst `input.limit` rijen geeft (plus één om te
  zien of er meer zijn), niet de constante zelf.
- `new:resource` drukt naast de twee declaraties voor `test/security/resources.ts` een derde af: de regels
  `'<naam>:read'` en `'<naam>:write'` met de rollen uit `--rollen` in `PERMISSIE_ORACLE` (`test/security/fixtures.ts`). Net als
  de andere afgedrukte wijzigingen een exacte, uniek toepasbare Edit in `plan().declaratie`; het script schrijft het bestand
  niet (spec `security-suite`, optie a). Ontbreekt `test/security/fixtures.ts`, dan drukt het voor dat bestand niets af, zoals
  nu bij `resources.ts` (`new-resource.mjs:347-348`).
- De afgedrukte `update`-sample krijgt het commentaar dat hij alleen nodig is bij een update-route of een update-grant.
- Het spec-sjabloon (`spec.md.tmpl`) noemt in de zin over de vaste paginagrootte dat de lijst `limit` tot die grens accepteert.
  De zin met de API-URL (`/api/__naam__?q=&sort=&cursor=`) blijft letterlijk staan.

### 3. Lijstcontrole van de suite (#656)

De suite leest het contract van de lijstroute uit de resource. `EigenaarOpzet` (`test/security/controles.ts`) krijgt daarvoor
een verplicht veld `routes` met de routes waarop de zender werkt (echt register: `routes` uit `src/api/app.ts`; probe-app: de
probe-routes); de suite zoekt het contract op het label van de lijstroute. Ontbreekt het contract, dan is dat een probleem.
De beslissing per veld kijkt naar dat ene veld, niet naar het hele schema (een ander verplicht filter mag de uitkomst niet
bepalen):

- **Accepteert het lijstschema `limit`** (`Object.hasOwn(input.shape, 'limit')` en `input.shape.limit.safeParse(1)` slaagt): de
  suite stuurt `limit: 1` en eist bij meer dan één rij van B ten minste twee pagina's, zoals nu.
- **Accepteert het `limit` niet**: de suite stuurt geen `limit` en meldt één probleem met de naam van resource en route:
  `<naam>: het lijstcontract '<GET /pad>' kent geen limit; geef defineListSearch een pageSize (spec suite-volgt-contract)`.
  Fail-closed: de resource is rood met deze reden, niet met "controle afgebroken" door een 400.
- **Zoeken:** de q-variant draait alleen als het lijstschema een veld `q` heeft. Heeft het `q`, maar weigert `input.shape.q`
  de zoekterm uit de sample (bijv. langer dan `MAX_SEARCH_LENGTH`), dan is dat een probleem met de naam van de resource. Zonder
  `q` is er geen zoekpad om te lekken; de variant vervalt.

### 4. Updatecontrole op de database (#657)

Per owner-tabel stelt de suite onder dezelfde app-rol als B vast of er op enige kolom UPDATE-recht is
(`has_any_column_privilege(<tabel>, 'UPDATE')`; telt ook een tabelbrede grant). Drie uitkomsten:

- **Recht:** zoals nu. De kolom komt uit `sample.updateRij` als die er is, anders uit `sample.update` (zelfde patroon als
  `sample.rij` naast `sample.create`), zodat een API-veldnaam die afwijkt van de kolomnaam kan. Ontbreekt die sample, dan is dat
  een probleem, maar de select- en delete-proef en de vergelijking van de rij van A lopen toch.
- **Geen recht:** de suite eist geen `sample.update`, slaat de update-proef over en meldt dat met de tabelnaam in de
  testuitvoer (een melding, geen probleem). Strenger dan nu: als A en als B faalt `update <tabel> set id = id` (zonder where)
  met `42501`; een andere uitkomst is een probleem. Select en delete door B blijven.
- **Niet vast te stellen** (de catalogusvraag geeft een fout of een onleesbaar antwoord): een probleem
  `<tabel>: updaterecht niet vast te stellen: <reden>`; nooit gelezen als "geen recht".

Vorm:

- Het lezen van het catalogusantwoord is een losse, geëxporteerde functie `updaterechtUit(tabel, poging)` in `controles.ts`, met
  als uitkomst `recht`, `geen-recht` of `onbekend` met het probleem `<tabel>: updaterecht niet vast te stellen: <reden>`. Een
  fout, een lege rij, `null` of een antwoord dat geen boolean is, geeft `onbekend`. Het verslag neemt dat probleem letterlijk
  over; zo is het hele pad met een unit-test te bewijzen, zonder een catalogusvraag te laten falen.
- Een nieuwe, geëxporteerde `tabelEigenaarVerslag(spelers, resources)` geeft `{ problemen, meldingen }`. De bestaande
  `tabelEigenaarProblemen` blijft bestaan en geeft `(await tabelEigenaarVerslag(...)).problemen`, zodat de bestaande aanroepers
  niet veranderen. De test van AC-8 schrijft de meldingen naar de testuitvoer (`console.info`).

### 5. MFA-doorgang in AC-5 (#681)

- `adminZonderMfa` blijft op elke admin-route `403 MFA_REQUIRED` krijgen, zonder bijwerking (ongewijzigd).
- `adminMfa` blijft alleen op admin-routes met `GET` (alleen-lezen transactie, `src/core/api/http/create-app.ts`). De eis is
  een allowlist: goed is alleen `200`, of `404` met code `NOT_FOUND`. Elk ander antwoord is rood met status en code in de
  melding, ook `400 VALIDATION` en `429 RATE_LIMITED` (die komen vóór de MFA-controle en bewijzen dus niets), `401`, `403`
  en elke `5xx`. Het oordeel is één geëxporteerde functie `mfaDoorgangProbleem(antwoord)` in `test/security/fixtures.ts` met
  eigen unit-tests; ze geeft `undefined` of de melding.
- Dit is de enige generieke aanroep die de handler bereikt; spec `security-suite` noemt hem als uitzondering op "alleen
  weigeringen". Een bewijs zonder handler kan niet: `VALIDATION` komt vóór de MFA-controle.
- `sampleVoor(route, samples = routeSamples)` krijgt een optionele samples-map. `routes.int.test.ts` gebruikt voor elk verzoek
  `sampleVoor` en importeert `sampleFor` niet meer, zodat een gedeclareerde `routeSamples`-regel ook voor AC-2 t/m AC-7 geldt.

### 6. Probe in generatorvorm (bewijs)

Een eigen opener (`openGeneratorProbe` in `test/security/probe-eigenaar.ts`) bouwt in een eigen terugdraaiende transactie een
tweede probe-resource uit `scripts/kit/templates/migratie.sql.tmpl` (naam `security_probes_gen`), met alleen
`grant insert (label)` (geen update-grant). De probe-app heeft de routes die de generator maakt minus bewerken: een lijst met
een contract uit `defineListSearch({ …, pageSize })` en een handler met `decodeListCursor` en `containsPattern`, create en
delete; geen `PATCH` en geen `GET /:id`. Classificatie en resources-regel zijn eigen constanten naast die van de eerste probe.
De bestaande opener (`openEigenaarProbe`), `probeRouteClassificatie`, `EIGENAAR_ROUTES` en `resources` veranderen hierdoor niet,
dus de bestaande tests over de eerste probe blijven zoals ze zijn. De tweede probe gaat door dezelfde controlefuncties
(AC-8 t/m AC-11 van spec `security-suite`).

### 7. Actorsoorten uit het rollenregister (#719, C-2)

De rollen van de actoren komen uit het register (`roles.names`), niet uit de naam `admin`. Wat een rol mag en welke rollen MFA
vragen, staat met de hand in de suite (geen afleiding uit `permissions.ts`, `check()` of `roles.isBeheer`). Alles in
`test/security/fixtures.ts`, tenzij anders genoemd.

- **Beheerrollen met de hand.** `MFA_ROLLEN` naast `PERMISSIE_ORACLE` (in `test/security/fixtures.ts`, met
  `satisfies readonly Role[]`) noemt de beheerrollen; `actorSoorten`, `verwachteUitkomst`, `beheerrollenMet` en `A`/`B` lezen de MFA-eis daaruit.
  `beheerVerschil(bron)` geeft de rollen waar `register.isBeheer` en `MFA_ROLLEN` verschillen (in de volgorde van
  `register.names`); een test naast de `appUseVerschil`-test eist `[]`, met in de melding
  `zet '<rol>' in MFA_ROLLEN als hij beheer heeft, anders niet (test/security/fixtures.ts)`.
- **Bron.** `bron` is `{ register: Roles, oracle: Readonly<Record<string, readonly string[]>>, mfaRollen: readonly string[] }`,
  standaard `{ register: roles, oracle: PERMISSIE_ORACLE, mfaRollen: MFA_ROLLEN }`; elke functie hieronder neemt hem als
  optioneel laatste argument.
- **Soorten.** Een nieuwe, geëxporteerde, pure functie `actorSoorten(bron)` geeft per soort
  `{ soort, rol, mfa }`, in deze volgorde: `{ soort: 'geenSessie', rol: null, mfa: false }`,
  `{ soort: 'zonderRol', rol: null, mfa: false }`, en per naam uit `register.names` (in die volgorde): buiten `mfaRollen` één soort
  `{ soort: <rol>, rol: <rol>, mfa: false }`; in `mfaRollen` eerst `{ soort: '<rol>Mfa', rol: <rol>, mfa: true }`, dan
  `{ soort: '<rol>ZonderMfa', rol: <rol>, mfa: false }`. Een rolnaam past op `^[a-z][a-z0-9_]*$`, dus geen soortnaam met een
  hoofdletter (`geenSessie`, `zonderRol`, `…Mfa`, `…ZonderMfa`) kan met een rolnaam botsen. `geenSessie` heeft geen account.
- **Type.** `ActorSoort` wordt `string` (het register is breed getypt). Een soort die niet in `actorSoorten(bron)` staat,
  laat `verwachteUitkomst`, `stuurAls` en `actor` gooien met
  `onbekende actorsoort '<soort>' (niet in actorSoorten van het rollenregister)`. De regel `export type ActorSoort` blijft direct na
  `PERMISSIE_ORACLE` staan: `new:resource` gebruikt hem als anker (`scripts/kit/new-resource.mjs`, `oracleInhoud`).
- **Oordeel.** `verwachteUitkomst(soort, permissie, bron)` volgt `can()`:
  onbekende permissie gooit (zoals nu); `geenSessie` → `401 UNAUTHENTICATED`; `zonderRol` → `403 FORBIDDEN`; rol niet in
  `oracle[permissie]` → `403 FORBIDDEN`; rol in `mfaRollen` en de soort heeft geen MFA → `403 MFA_REQUIRED`; anders toegestaan.
  FORBIDDEN gaat vóór MFA_REQUIRED, zoals in `src/core/shared/can.ts`.
- **Beheerrollen per permissie.** `adminHeeftPermissie` verdwijnt; in de plaats komt `beheerrollenMet(permissie, bron)`: de
  rollen uit `oracle[permissie]` die in `mfaRollen` staan, in de volgorde van `register.names`.
- **Gevallen.** Twee pure, geëxporteerde functies bepalen welke aanroepen de suite doet, zodat ze zonder database te testen zijn.
  Ze zijn generiek over een minimale route (`R extends { contract: { method, path, permission } }`) en geven die route terug,
  zodat `routes.int.test.ts` het echte `AppRoute` terugkrijgt:
  - `ac4Gevallen(routes, bron)`: elk paar (soort, route) met een soort uit `actorSoorten` behalve `geenSessie`, waarvoor
    `verwachteUitkomst` `403 FORBIDDEN` geeft. Toegestane paren en `MFA_REQUIRED`-paren vallen erbuiten.
  - `ac5Gevallen(routes, bron)`: per route en per rol uit `beheerrollenMet(route.contract.permission)` het paar
    (`<rol>ZonderMfa`, route) met verwachting `403 MFA_REQUIRED`, en voor een `GET`-route ook (`<rol>Mfa`, route) voor de
    MFA-doorgang (`mfaDoorgangProbleem`, ontwerp 5).
  `test/security/routes.int.test.ts` itereert AC-4 en AC-5 over deze functies; de test van AC-1 telt voor AC-5 de routes met ten
  minste één beheerrol.
- **Accounts.** `maak(soort)` leest `{ rol, mfa }` uit `actorSoorten`: `zonderRol` zoals nu, anders `h.account(rol)` en bij
  `mfa` daarna `h.enableTotp`. `A(rol: string = 'user')`/`B(rol: string = 'user')` kiezen de soort `<rol>Mfa` als de rol in
  `mfaRollen` staat, anders `<rol>`; een rol buiten het register gooit met de rolnaam. `echteZender`
  (`test/security/controles.ts:404`) en `ResourceRegel.rol` (`test/security/resources.ts:22`) houden `Role`. `account()` in
  `test/api/account-harness.ts` neemt elke `string` als rol (de database weigert een onbekende rol met `23503`).
  `createSecurityFixtures(bron)` krijgt de bron als optioneel argument; de API van de fixtures (`createAccountTestApp`) blijft
  het echte register gebruiken.
- **Oracle volledig voor `app.use`.** Core geeft `app.use` aan elke rol (`src/core/shared/can.ts`). Een nieuwe, geëxporteerde
  `appUseVerschil(bron)` geeft de rollen uit `register.names` die niet in `oracle['app.use']` staan; de vervangende test van
  `routes.int.test.ts:121-123` eist een lege lijst, met in de melding
  `voeg '<rol>' toe aan PERMISSIE_ORACLE['app.use'] en aan elke permissie die de rol krijgt (test/security/fixtures.ts)`. Zo
  faalt een vergeten oracle-regel vóór AC-4 de handler van een `app.use`-route bereikt.
- **Wat een app nog met de hand doet.** De rol in de oracle bij `app.use` en bij elke permissie die hij krijgt, en een beheerrol
  in `MFA_ROLLEN`. Het gouden pad (`docs/gouden-pad.md`, "Een rol toevoegen of weghalen", stap 5) zegt dat in plaats van "een
  actorsoort".

## Hergebruik en UX

- Bestaande componenten: geen; geen scherm.
- Staten per scherm: n.v.t.
- Alle zichtbare tekst letterlijk: alleen testuitvoer, in het Nederlands; de nieuwe meldingen staan letterlijk hierboven.
- Focusvolgorde en toetsenbord: n.v.t.
- Techniek die we hergebruiken: `defineListSearch` en de lijstquery-helpers (`decodeListCursor`, `containsPattern` uit
  `src/core/api/route/list-query.ts`) voor de probe in generatorvorm; de probe-opbouw uit `test/security/fixtures.ts`; de
  controlefuncties in `test/security/controles.ts`. Voor ontwerp 7: `defineRoles` en `Roles` uit `src/core/shared/roles.ts`
  (een nep-register in unit-tests), `account()` en `enableTotp()` uit `test/api/account-harness.ts`, en `migratorPool` en
  `cleanupTestRoles(pool, ['suitetest_planner', 'suitetest_beheer'])` uit `test/auth/role-register-harness.ts`, in `beforeAll`
  en `finally`.

## Acceptatiecriteria

- **suitecontract/AC-1** — Gegeven `defineListSearch` met `pageSize: n`, wanneer de API-input wordt gevalideerd, dan wordt `limit`
  als tekst of getal van 1 t/m `n` geaccepteerd, is het zonder `limit` gelijk aan `n`, en geven `0`, `n + 1`, `1.5` en `'abc'`
  een fout; het webschema kent geen `limit` en `ListSearch.pageSize` is `n`. Zonder `pageSize` is `limit` een onbekend veld
  (fout), zoals nu, en is `ListSearch.pageSize` `undefined`.
- **suitecontract/AC-2** — Gegeven een `pageSize` die geen geheel getal van 1 t/m `MAX_PAGE_SIZE` is, of een filter met de naam
  `limit`, wanneer `defineListSearch` wordt aangeroepen, dan gooit het met een melding die de oorzaak noemt.
- **suitecontract/AC-3** — Gegeven `pnpm new:resource <naam>`, wanneer het gegenereerde contract wordt geladen, dan accepteert de
  lijstroute `limit` tot en met `<NAAM>_PAGE_SIZE` en weigert ze `<NAAM>_PAGE_SIZE + 1`, en noemt de gegenereerde route
  `input.limit`.
- **suitecontract/AC-4** — Gegeven `pnpm new:resource <naam> --rollen <rollen>` in een kopie met `test/security/fixtures.ts`,
  wanneer het plan wordt gemaakt, dan bevat `plan().declaratie` een uniek toepasbare wijziging voor `test/security/fixtures.ts` die
  `'<naam>:read'` en `'<naam>:write'` met die rollen aan `PERMISSIE_ORACLE` toevoegt, en zijn na het toepassen daarvan en het
  schrijven van `permissions.ts` de sleutels van de oracle gelijk aan die van de permissietabel. Het script schrijft
  `fixtures.ts` niet; zonder `fixtures.ts` in de kopie bevat het plan er geen wijziging voor.
- **suitecontract/AC-5** — Gegeven een resource waarvan het lijstcontract `limit` accepteert, wanneer de suite de lijst van B
  controleert, dan stuurt ze `limit: 1` en is het een probleem als B met meer dan één rij geen tweede pagina krijgt. Gegeven een
  lijstcontract zonder `limit` (ook als het een ander verplicht veld heeft), dan stuurt de suite geen `limit` en bevat het verslag
  het probleem
  `<naam>: het lijstcontract '<GET /pad>' kent geen limit; geef defineListSearch een pageSize (spec suite-volgt-contract)` en
  geen "controle afgebroken". Gegeven een opzet zonder contract voor de lijstroute, dan is dat een probleem met het label.
- **suitecontract/AC-6** — Gegeven een lijstcontract met `q`, wanneer de suite de lijst van B controleert, dan draait de
  q-variant; weigert `input.shape.q` de zoekterm uit de sample, dan is dat een probleem met de naam van de resource. Gegeven een
  lijstcontract zonder `q`, dan stuurt de suite geen `q`.
- **suitecontract/AC-7** — Gegeven een owner-tabel met UPDATE-recht voor de app-rol, wanneer `tabelEigenaarVerslag` draait, dan
  komt de kolom uit `sample.updateRij` of anders `sample.update`; ontbreken beide, dan is dat een probleem en lopen de select- en
  delete-proef van B en de vergelijking van de rij van A toch (een gebroken select-policy staat in hetzelfde verslag).
- **suitecontract/AC-8** — Gegeven een owner-tabel zonder UPDATE-recht voor de app-rol, wanneer `tabelEigenaarVerslag` draait,
  dan is `sample.update` niet nodig, is er geen probleem over updaterecht, bevat `meldingen` een melding met de tabelnaam dat de
  update-proef is overgeslagen, en faalt `update <tabel> set id = id` als A en als B met `42501`; select en delete door B raken
  0 rijen. `tabelEigenaarProblemen` geeft dezelfde problemen als het verslag.
- **suitecontract/AC-9** — Gegeven een catalogusantwoord over updaterecht dat een fout is, geen rij heeft, `null` is of geen
  boolean, wanneer `updaterechtUit(tabel, poging)` het leest, dan is de uitkomst `onbekend` met het probleem
  `<tabel>: updaterecht niet vast te stellen: <reden>`; `true` geeft `recht` en `false` `geen-recht`.
- **suitecontract/AC-10** — Gegeven de probe in generatorvorm (`openGeneratorProbe`: sjabloontabel met alleen
  `grant insert (label)`, lijst uit `defineListSearch` met `pageSize`, create en delete, geen `PATCH` en geen `GET /:id`), wanneer
  `tabelEigenaarVerslag`, `spoofDbProblemen`, `eigenaarApiProblemen`, `spoofApiProblemen` en de classificatiecontrole erop draaien,
  dan zijn er geen problemen en bevat `meldingen` de overgeslagen update-proef met de tabelnaam.
- **suitecontract/AC-11** — Gegeven het antwoord van `adminMfa` op een admin-GET, wanneer `mfaDoorgangProbleem` het beoordeelt,
  dan is alleen `200` of `404` met code `NOT_FOUND` goed; `400 VALIDATION`, `401 UNAUTHENTICATED`, `403 FORBIDDEN`,
  `403 MFA_REQUIRED`, `404` zonder code `NOT_FOUND`, `429 RATE_LIMITED`, `500` en `501` geven een melding met status en code.
  AC-5 van spec `security-suite` gebruikt die functie.
- **suitecontract/AC-12** — Gegeven een samples-map met een regel voor een route, wanneer `sampleVoor(route, samples)` wordt
  aangeroepen, dan geeft het die regel; zonder regel de afgeleide sample. `test/security/routes.int.test.ts` importeert
  `sampleFor` niet en haalt elke sample via `sampleVoor`.
- **suitecontract/AC-13** — Gegeven het nep-register `defineRoles({ planner: { beheer: false }, eigenaar:
  { beheer: true } })` met `mfaRollen` `['admin', 'eigenaar']`, wanneer `actorSoorten` die bron leest, dan zijn de soorten
  precies, in deze volgorde, `geenSessie`,
  `zonderRol`, `user`, `adminMfa`, `adminZonderMfa`, `planner`, `eigenaarMfa`, `eigenaarZonderMfa`, met `rol` en `mfa` zoals in
  ontwerp 7. Gegeven de bevroren template-bron (een kopie in de test van het register `user`, `admin` met beheer,
  `mfaRollen` `['admin']` en de oracle zoals de template ze levert; niet de live `roles` en `MFA_ROLLEN`, zodat een app met
  een extra rol deze test niet hoeft te wijzigen), dan zijn het precies `geenSessie`, `zonderRol`, `user`, `adminMfa`,
  `adminZonderMfa`. Met de live bron heeft elke rol uit `roles.names` minstens één soort.
- **suitecontract/AC-14** — Gegeven dat nep-register en die `mfaRollen` en de nep-oracle
  `{ 'app.use': ['user', 'admin', 'planner', 'eigenaar'], 'plan:read': ['planner'], 'eigen:beheer': ['eigenaar'] }`, wanneer
  `verwachteUitkomst` oordeelt, dan is `planner` op `plan:read` toegestaan, `user` op `plan:read` `403 FORBIDDEN`,
  `eigenaarZonderMfa` op `eigen:beheer` `403 MFA_REQUIRED`, `eigenaarZonderMfa` op `plan:read` `403 FORBIDDEN` (niet
  `MFA_REQUIRED`), `eigenaarMfa` op `eigen:beheer` toegestaan en `planner` op `app.use` toegestaan; de soort `baasMfa` en een
  permissie buiten de oracle gooien met de melding uit ontwerp 7 respectievelijk de bestaande melding. Gegeven de bevroren template-bron
  (AC-13), dan is de uitkomst voor elke permissie en elk van de vijf soorten gelijk aan een tabel die de test met de
  hand bevat: `geenSessie` overal `401 UNAUTHENTICATED`, `zonderRol` overal `403 FORBIDDEN`, `user` toegestaan op `app.use`,
  `me:read` en `me:update` en verder `403 FORBIDDEN`, `adminMfa` overal toegestaan, `adminZonderMfa` overal `403 MFA_REQUIRED`.
- **suitecontract/AC-15** — Gegeven vier nep-routes (`POST` met `app.use`, `GET` met `plan:read`, `GET` en
  `POST` met `eigen:beheer`) en de nep-bron van AC-14, wanneer `ac4Gevallen` en `ac5Gevallen` draaien, dan bevat, vergeleken als
  gesorteerde verzamelingen van `(soort, routeLabel)`, `ac4Gevallen` precies deze paren, elk met `403 FORBIDDEN`: `zonderRol` op alle vier; op `plan:read` `user`, `adminMfa`,
  `adminZonderMfa`, `eigenaarMfa` en `eigenaarZonderMfa`; op beide `eigen:beheer`-routes `user`, `adminMfa`, `adminZonderMfa`
  en `planner`. `ac5Gevallen` bevat precies: `adminZonderMfa` en `eigenaarZonderMfa` op de `app.use`-route en
  `eigenaarZonderMfa` op beide `eigen:beheer`-routes, elk met `403 MFA_REQUIRED`, en `eigenaarMfa` op de `GET`-route van
  `eigen:beheer` voor de MFA-doorgang. `beheerrollenMet('plan:read')` is leeg, `beheerrollenMet('app.use')` is
  `['admin', 'eigenaar']`. Gegeven de bevroren template-bron (AC-13) en de routes uit `src/api/app.ts` waarvan de permissie in die bevroren oracle
  staat, dan zijn de paren (ook als gesorteerde
  verzamelingen) gelijk aan wat `routes.int.test.ts` op `1113a2a5` draait: AC-4 (`user`, elke route waarvan
  de oracle `user` niet noemt) en (`zonderRol`, elke route); AC-5 `adminZonderMfa` op elke route waarvan de oracle `admin` noemt
  en `adminMfa` op de `GET`-routes daarvan.
- **suitecontract/AC-16** — Gegeven het nep-register van AC-13 en een oracle waarin `app.use` `planner` mist,
  wanneer `appUseVerschil` draait, dan is de uitkomst `['planner']`; met `planner` en `eigenaar` erin `[]`. Met `eigenaar` als
  beheerrol in het register maar niet in `MFA_ROLLEN` is `beheerVerschil` `['eigenaar']`; met `mfaRollen`
  `['admin', 'eigenaar', 'planner']` `['planner']`; met `['admin', 'eigenaar']` `[]`. Met de echte bron zijn beide `[]`.
  `test/security/routes.int.test.ts` bevat `['admin', 'user']` en `['user', 'zonderRol']` niet meer; AC-4 en AC-5 itereren over
  `ac4Gevallen` en `ac5Gevallen`.
- **suitecontract/AC-17** — Gegeven de testrollen `suitetest_planner` (geen beheer) en `suitetest_beheer`
  (beheer), gecommit via `app.register_role`, en een nep-bron met dezelfde vlaggen en `mfaRollen` `['admin',
  'suitetest_beheer']`, wanneer `createSecurityFixtures(bron)` actoren maakt, dan heeft `actor('suitetest_planner', 'lezen')` een account met rol `suitetest_planner` in `public.user_roles` en
  een sessie met `session_strength = 'password'`, `A('suitetest_beheer')` en `B('suitetest_beheer')` twee verschillende accounts
  met rol `suitetest_beheer` en `session_strength = 'mfa'`, en `actor('suitetest_beheerZonderMfa', 'lezen')` rol
  `suitetest_beheer` met `password`. `A('baas')` gooit met de rolnaam. Na afloop (`cleanupTestRoles` in `finally`) staan de testrollen niet meer in
  `app.roles`.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Lijst met `pageSize`, client stuurt geen `limit` | `limit` = `pageSize`; de webpagina verandert niet | n.v.t. |
| `limit` als querytekst (`?limit=1`) | `coerce` maakt er een getal van; buiten 1..`pageSize` is een fout | `VALIDATION` |
| Hand geschreven lijst met een eigen `limit` (zoals de eerste probe) | Telt als "accepteert `limit`"; de suite vraagt niet waar het veld vandaan komt | n.v.t. |
| Owner-tabel met UPDATE-recht maar zonder update-route | De databasecontrole draait de update-proef (het recht bestaat); de API-controle slaat update over (geen route) | n.v.t. |
| Update-route zonder UPDATE-recht (gegenereerde PATCH, nog geen grant) | AC-8 slaat de update-proef over; de API-controle van AC-10 eist dat een geldige update 200 geeft en is daardoor rood tot er een grant is of de route weg is | n.v.t. |
| Admin-GET met `:id` en onbekend sample-id | `404 NOT_FOUND` is goed voor AC-5 | `NOT_FOUND` |
| `404 NOT_FOUND` van de router in plaats van de handler | Niet te onderscheiden, maar de suite stuurt alleen paden uit het register | n.v.t. |
| Gegenereerde admin-GET, handler nog niet gebouwd | `501` is rood voor AC-5, zoals de rest van de suite rood is tot de resource gebouwd is | `NOT_IMPLEMENTED` |
| `adminMfa` boven zijn telbudget, of een ongeldige sample | `429` of `400` is rood voor AC-5: de MFA-controle is niet bereikt | `RATE_LIMITED`, `VALIDATION` |
| Tweede beheerrol van een app (vlag `beheer`) | Ontwerp 7: na de regel in `MFA_ROLLEN` soorten `<rol>Mfa` en `<rol>ZonderMfa`; AC-5 draait voor elke beheerrol die de oracle bij de permissie noemt | `MFA_REQUIRED` |
| `beheer` in het register en `MFA_ROLLEN` lopen uiteen | `beheerVerschil` is rood met de rolnaam | n.v.t. |
| Nieuwe rol in het register, niet in de oracle | `appUseVerschil` is rood met de rolnaam; op de andere permissies verwacht AC-4 `FORBIDDEN`, dus geeft `permissions.ts` de rol meer dan de oracle, dan is AC-4 rood | `FORBIDDEN` |
| Oracle of `MFA_ROLLEN` noemt een rol die niet in het register staat | Typefout (`satisfies … Role[]`), zoals nu bij de oracle | n.v.t. |
| Rol zonder enige permissie behalve `app.use` | Eén soort; AC-4 verwacht `FORBIDDEN` op elke andere route | `FORBIDDEN` |
| Beheerrol zonder MFA op een permissie die de rol niet heeft | `FORBIDDEN`, niet `MFA_REQUIRED` (volgorde van `can()`); valt in AC-4, niet in AC-5 | `FORBIDDEN` |
| `resources.ts` met `rol: '<beheerrol>'` | `A`/`B` met MFA, zoals nu voor `admin` | n.v.t. |
| `resources.ts` met een rol buiten het register | `A`/`B` gooien met de rolnaam (was: stil een `user`-account) | n.v.t. |
| Rol in het register, niet in `app.roles` | `account()` faalt met `23503`; dat bewaakt al `test/auth/roles-register.int.test.ts` | n.v.t. |

## Raakt ook

Risicowerk (securitysuite): tester eerst, developer, reviewer vóór de push (framework §8).

- `src/core/shared/list-search.ts` en zijn tests (core, gate; eigenaarakkoord gegeven op 2026-11-15).
- `scripts/kit/new-resource.mjs`, `scripts/kit/templates/contract.ts.tmpl`, `route.ts.tmpl`, `spec.md.tmpl` (`scripts/**`,
  `voorReview`).
- `test/security/**`: `controles.ts` (`EigenaarOpzet.routes`, `updaterechtUit`, `tabelEigenaarVerslag`, lijstcontrole),
  `fixtures.ts` (`mfaDoorgangProbleem`), `resources.ts` (`sample.updateRij`, `sampleVoor` met samples-map, commentaar over
  `sample.update`), `probe-eigenaar.ts` (`opzet` vult `routes`, `openGeneratorProbe`).
- Bestaande tests die de hoofdsessie omzet, met reden in de PR (R-TEST-02):
  - `test/security/routes.int.test.ts`: AC-5 met `adminMfa` via `mfaDoorgangProbleem` in plaats van `toBe(200)`; `sampleVoor`
    in plaats van `sampleFor`; het kopcommentaar noemt de uitzondering.
  - `test/security/ownership.int.test.ts:98-103`: de met de hand gebouwde opzet voor het echte register krijgt `routes`.
  - `test/rails/new-resource-lijst.test.ts:146-148`: de werkmap krijgt `src/shared/limits.ts`, anders laadt het gegenereerde
    contract niet meer; de verwachte lijstinput krijgt `limit`.
  - `test/rails/new-resource-security.test.ts` en `test/rails/new-resource.test.ts`: alleen als het dry-run-verslag of het
    bestandsplan de derde afgedrukte wijziging laat zien.
  - Elke zelftest die de oude melding `sample.update ontbreekt of is leeg` vastpint.
- Docs: spec `security-suite` (AC-5, AC-8, AC-9, de uitzondering op "alleen weigeringen", de rij AC-5 in Randgevallen,
  `sample.updateRij`; daarnaast losse correctie: `ROLES` komt uit `src/shared/roles.ts`), spec `lijstpagina` (`pageSize`),
  `docs/gouden-pad.md` (de afgedrukte oracle-regel), `docs/template-changelog.md` onder `[Unreleased]`.

Ontwerp 7 (#719, C-2), ook risicowerk (securitysuite): tester eerst, developer, reviewer vóór de push.

- `test/security/fixtures.ts`: `actorSoorten`, `ActorSoort` als `string` (de regel `export type ActorSoort` blijft het anker van
  `new:resource`), `MFA_ROLLEN`, `verwachteUitkomst` met `bron`, `beheerrollenMet` in plaats van `adminHeeftPermissie`,
  `ac4Gevallen`, `ac5Gevallen`, `appUseVerschil`, `beheerVerschil`, `maak`/`A`/`B` uit de bron, `createSecurityFixtures(bron)`.
- `test/api/account-harness.ts`: `account()` neemt elke rolnaam (geen ander gedrag voor `user` en `admin`).
- Geraakt maar ongewijzigd: `test/security/controles.ts` (`echteZender` houdt `rol: Role`) en `test/security/resources.ts`
  (`ResourceRegel.rol` houdt `Role`).
- Bestaande tests die de hoofdsessie omzet, met reden in de PR (R-TEST-02):
  - `test/security/routes.int.test.ts`: de test op `['admin', 'user']` (`:121-123`) wordt de `appUseVerschil`- en
    `beheerVerschil`-test; AC-4 en AC-5
    itereren over `ac4Gevallen`/`ac5Gevallen`; de AC-5-testnamen noemen de soort (`%s op %s`) in plaats van vast `adminZonderMfa`
    en `adminMfa`; AC-1 en AC-7 tellen met `beheerrollenMet`. De verwachtingen voor `user` en `admin` blijven gelijk
    (suitecontract/AC-15).
  - `test/rails/new-resource-oracle.test.ts` (suitecontract/AC-4) blijft ongewijzigd groen; alleen als het anker verschuift, met
    reden in de PR.
- Geen migratie, geen nieuwe tabel, geen grant: `check:migrations`, `check:secdef` en `test/security/resources.ts` niet geraakt.
  AC-17 commit testrollen via de bestaande `app.register_role` (als `app_migrator`) en ruimt ze idempotent op met
  `cleanupTestRoles` (Hergebruik). Geen nieuwe permissie, dus geen permissietest per verboden rol.
- Docs: spec `security-suite` (de fixturetabel onder "Rollen en wie wat ziet" noemt de soorten uit het register; AC-4 en AC-5
  zeggen "een beheerrol" in plaats van `admin`; de rij `docs/template/specs/security-suite.md:188` ("de rolmatrix itereert over
  `ROLES` … zonder wijziging") wordt herschreven: soorten uit `roles.names`, de rol met de hand in `PERMISSIE_ORACLE` en, als
  beheerrol, in `MFA_ROLLEN`), `docs/gouden-pad.md` ("Een rol toevoegen of weghalen", stap 5: de rol in `PERMISSIE_ORACLE` bij
  `app.use` en bij elke permissie die hij krijgt, een beheerrol ook in `MFA_ROLLEN`; geen actorsoort meer),
  `docs/template-changelog.md` onder `[Unreleased]` (door de hoofdsessie).

## Buiten scope

- `check:new-resource` uitbreiden met `test:db` of het toepassen van de declaratie (CI-wijziging; het bewijs komt uit AC-10).
- Een generatorvlag voor een resource zonder bewerken; de developer haalt de `PATCH`-route met de hand weg.
- De oracle afleiden uit `permissions.ts` of `check()`, of `MFA_ROLLEN` uit `roles.isBeheer`: ze blijven met de hand, anders
  test de suite de implementatie met zichzelf.
- Toestemmingen: de suite roept alleen weigeringen aan. Noemt de oracle een rol toegestaan maar weigert `permissions.ts` die,
  dan ziet de suite dat niet; voor `user` en `admin` dekt `src/shared/permissions.test.ts` het, voor een app-rol de test per
  verboden rol.
- De oracle naar een eigen databestand verhuizen (zie OV-5).
- Meer dan één rol per account: het register kent één rol per account.
- De docsgap rond `parseInput` (`{ ...body, ...params }`) uit #656.

## Testplan

1. Unit (tester): `src/core/shared/list-search-page-size.test.ts` (AC-1, AC-2); `test/rails/new-resource-contract-limit.test.ts`
   (AC-3, laadt het gegenereerde contract zoals `test/rails/new-resource-lijst.test.ts`); `test/rails/new-resource-oracle.test.ts`
   (AC-4); `test/security/mfa-doorgang.test.ts` (AC-11); `test/security/updaterecht.test.ts` (AC-9, `updaterechtUit`);
   `test/security/sample-voor.test.ts` (AC-12, samples-map en de vormtoets op `routes.int.test.ts`).
2. Integratie in `pnpm test:db` (tester): `test/security/suite-contract.int.test.ts` voor AC-5 t/m AC-8 en AC-10, met probe-varianten: een lijst zonder `limit`, een lijst zonder `q`, de eerste probe met en zonder
   update-grant en zonder `sample.update`, en de probe in generatorvorm.
3. De tester en de developer zetten hun verslag in `test/security/verslag-suite-contract.md` (vervallen) (testpad; de hoofdsessie haalt het
   vóór de PR weg).
4. Ontwerp 7, zonder derde rol in de template. Het bewijs dat een extra rol de suite niet raakt, komt uit pure functies met een
   nep-bron (`defineRoles({ planner: { beheer: false }, eigenaar: { beheer: true } })`, nep-oracle, `mfaRollen`) en nep-routes; het
   echte register blijft `user` en `admin`.
   - Unit (tester): `test/security/actorsoorten.test.ts` (AC-13 t/m AC-16: `actorSoorten`, `verwachteUitkomst`,
     `beheerrollenMet`, `ac4Gevallen`, `ac5Gevallen`, `appUseVerschil`, `beheerVerschil`, telkens met nep-bron én echte bron,
     plus de vormtoets op `routes.int.test.ts`). Een nep-route heeft alleen `contract.method`, `contract.path` en
     `contract.permission`.
   - Integratie in `pnpm test:db` (tester): `test/security/actorsoorten.int.test.ts` (AC-17): de enige plek met een echte derde
     rol, gecommit en opgeruimd met `cleanupTestRoles`; namen met voorvoegsel `suitetest_`, zodat ze niet
     botsen met `planner`, `eigenaar` en `toezicht` uit die tests.
   - `test/security/routes.int.test.ts` en `owner-actors.int.test.ts` blijven groen in de runner (`routes.int.test.ts` itereert nu over `ac4Gevallen` en `ac5Gevallen`): dat is het bewijs
     dat de verwachtingen voor `user` en `admin` gelijk blijven, naast de vergelijking met `1113a2a5` in AC-15.
5. Lokaal: `pnpm exec tsc -b --noEmit`, `pnpm test:unit`, `pnpm ratchet`, `pnpm check:roadmap`, `pnpm format:check`, de
   geheimenscanner. `pnpm test:db` draait alleen in de runner; de branch wijzigt een script dat de host uitvoert, dus het bewijs
   komt uit de CI van de PR.

## Open vragen

- **OV-1 ✅ besloten** — #656: `pageSize` in `defineListSearch` (core), generator geeft hem mee, suite leest het contract
  (eigenaar, 2026-11-15). Afgewezen: alleen de suite (cursorcontrole vervalt), alleen de generator (omweg om `.overwrite`).
- **OV-2 ✅ besloten** — #681: AC-5 blijft één leesaanroep met `adminMfa`; goed is alleen `200` of `404 NOT_FOUND` (allowlist,
  eigenaar 2026-11-15, na de spec-review: een denylist liet `400` en `429` door zonder dat de MFA-controle bereikt was).
- **OV-3 ✅ besloten** — #657: zonder UPDATE-recht de update-proef overslaan met melding, fail-closed catalogusvraag (eigenaar in
  #657), plus de strengere eis `42501` voor A en B (eigenaar, 2026-11-15).
- **OV-4 ✅ besloten** — Ook de oracle-regel uit de generator en de probe in generatorvorm horen in deze PR (eigenaar, 2026-11-15).
- **OV-5** — Blijft `PERMISSIE_ORACLE` in `test/security/fixtures.ts`, of verhuist ze naar een eigen databestand
  (bijvoorbeeld `test/security/oracle.ts` (voorbeeld), zoals `resources.ts`), zodat een app bij een nieuwe rol of resource alleen data wijzigt
  en een template-update van `fixtures.ts` niet botst met de oracle-regels van de app? Verhuizen raakt ook `new:resource`
  (`oracleInhoud`), suitecontract/AC-4 en het gouden pad. Aanbeveling: in deze stap laten staan (kleinste stap uit #719) en het
  verhuizen als apart leerpunt opnemen als een app er echt op botst.
- **OV-6** — Doet AC-17 een echte derde rol (gecommit in de gedeelde testdatabase), of volstaat het unit-bewijs van AC-13 t/m
  AC-16? Zonder AC-17 bewijst niets dat `maak`, `A` en `B` het account met de juiste rol en sessiesterkte maken. Aanbeveling:
  AC-17 houden, met `cleanupTestRoles` uit `test/auth/role-register-harness.ts`.
- **OV-7 ✅ besloten** — De MFA-eis komt niet uit `roles.isBeheer` maar uit `MFA_ROLLEN` met de hand, bewaakt door
  `beheerVerschil` (eigenaar, 2026-11-19).
