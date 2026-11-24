---
status: voorstel # voorstel | goedgekeurd | vervallen — architect of hoofdsessie zet de status in het voorstel, de merge door de eigenaar is het besluit (ADR 0046); gebouwd volgt uit de AC-dekking (ADR 0104)
namespace: images
---

# Afbeeldingen tonen: weergave-URL en bestanden bij een resource

Uitbreiding op de spec [bestandsopslag](bestandsopslag.md) (`goedgekeurd`, nog niet gebouwd). Die spec dekt uploaden, een eigen
lijst, downloaden als bijlage en verwijderen, en zet "bestanden delen of aan een andere resource koppelen" en "previews" buiten
scope. Deze spec voegt precies die twee toe, alleen voor rasterafbeeldingen. Aanleiding: verzoek van de eigenaar (2026-11-23),
app-behoefte: een app toont een afbeelding bij een rij (bijvoorbeeld bij een artikel) aan iedereen die de rij mag lezen.

**Vraagt eerst een besluit-PR.** [ADR 0060](../adr/0060-bestandsopslag-als-poort.md) punt 2 en R-OPSL-02 eisen nu dat elke
download een bijlage met een neutraal type is. Een afbeelding in het scherm tonen is daarmee in strijd. De besluit-PR herziet
ADR 0060 (nieuw punt: weergave-URL voor een vaste lijst rastertypen) en R-OPSL-02; pas daarna kan deze spec `goedgekeurd` worden.

Bouwen in twee delen, elk een eigen PR:

| Deel | Inhoud | Wacht op | AC's |
|---|---|---|---|
| **A — weergave-URL** | `createViewUrl` op de poort en in de contracttestsuite, lokale adapter, `img-src` in de CSP, grenzen, veld `view` in `GET /api/files`, voorvertoning op `/bestanden` | bestandsopslag deel A en B gebouwd; besluit-PR | AC-1 t/m AC-9 |
| **B — bestand bij een resource** | het koppelpatroon (kolom, foreign key, policy), de check erop, sectie in het gouden pad, voorbeeld op `/design-system` | A | AC-10 t/m AC-15 |

Productie volgt de grens van de bestandsopslag: geen opslag in productie tot deel C daarvan gebouwd is (R-OPSL-04).

## Doel

Een app toont een geüploade afbeelding in het scherm aan iedereen die de bijbehorende rij mag lezen, via een kortlevende
weergave-URL en zonder publieke bucket.

## Rollen en wie wat ziet

| Rol | Eigen afbeelding | Afbeelding bij een rij die de rol mag lezen | Overige afbeeldingen |
|---|---|---|---|
| anoniem | niets (`UNAUTHENTICATED`) | niets | niets |
| elke rol met `files:read` | weergave-URL, downloaden, verwijderen (zoals bestandsopslag) | alleen een weergave-URL, via de route van die resource; niet downloaden als bijlage, niet verwijderen | niets: `NOT_FOUND` |
| een beheerrol | als hierboven, met MFA | als hierboven, met MFA | niets |

Wie de afbeelding bij een rij mag vervangen of weghalen, bepaalt de permissie van die resource (het koppelveld is een gewone
kolom van de rij). De eigenaar van het bestand blijft de uploader (OV-3).

## Datawijzigingen (met grants)

**Deel A**: geen migratie. Of een bestand een afbeelding is, volgt uit `content_type` en de vaste lijst in core.

**Deel B**: de template krijgt geen tabel erbij. Het patroon dat een app per koppeling in haar eigen migratie zet:

- kolom `<naam>_file_id uuid references public.files(id) on delete set null` op de resourcetabel, met de bestaande
  kolomgrants van die tabel (`insert`/`update` op de kolom voor wie de rij mag schrijven);
- één extra `select`-policy op `public.files`, `to app_authenticated`:
  `using (exists (select 1 from public.<resource> r where r.<naam>_file_id = files.id))`. De subquery loopt onder de RLS van
  de resourcetabel: het bestand is leesbaar voor precies wie een rij leest die ernaar wijst. De naam is
  `files_select_via_<resource>_<naam>`;
- een trigger op de resourcetabel (via één core-functie `app.check_linked_image()`, `security definer`, eigenaar `app_definer`,
  `set search_path = ''`, klasse `intern`) die bij `insert` of `update` van de kolom weigert als het bestand niet `ready` is,
  geen type uit `VIEWABLE_IMAGE_TYPES` heeft of niet van de actor is (42501 → `FORBIDDEN`);
- geen `update`- of `delete`-policy erbij: schrijven en verwijderen blijven bij de eigenaar van het bestand.

De functie `app.check_linked_image()` komt in een core-migratie in deel B, met een regel in `db/tests/functies.sql`.

## Routes en foutcodes

| Methode | Pad | Permissie | Wijziging |
|---|---|---|---|
| GET | `/api/files` | `files:read` | elk item krijgt `view: { url, expiresAt } \| null`: gevuld voor een `ready`-bestand met een type uit `VIEWABLE_IMAGE_TYPES`, anders `null` |
| GET | `/api/files/:id/download` | `files:read` | ongewijzigd; blijft een bijlage, ook voor een afbeelding |

Geen nieuwe route en geen nieuwe foutcode. Een resourceroute van de app neemt de weergave-URL op in haar eigen antwoord:
`ctx.services.files.viewOf(file)` geeft `{ url, expiresAt } | null` voor een rij uit `public.files` die de query (onder RLS)
heeft gelezen. Een URL maken is synchroon lokaal ondertekenen (ADR 0060 punt 2), dus een lijst met afbeeldingen kost geen
aanroep naar de opslag en geen voor-stap. Zonder adapter geeft `viewOf` `null`; de resourceroute zelf blijft werken.

**Poort** (`src/core/api/storage/`): `defineFileStorage` krijgt een vijfde methode
`createViewUrl({ key, contentType, ttlSeconds })` → `{ url }`, synchroon. De response heeft precies het opgegeven
`Content-Type`, `Content-Disposition: inline` zonder bestandsnaam, `X-Content-Type-Options: nosniff`,
`Cache-Control: private, max-age=<ttlSeconds>` en, waar de provider het toestaat, `Content-Security-Policy: sandbox`.
`viewOrigin`: de origin voor `img-src`, of `null` als de URL's op `APP_ORIGIN` staan. `createFileService` roept
`createViewUrl` alleen aan voor een type uit `VIEWABLE_IMAGE_TYPES` en een sleutel die op `^files/<uuid>$` past.

**Grenzen**. Hard in `src/core/shared/limits.ts`: `VIEWABLE_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif']`
(geen `image/svg+xml`: SVG kan script bevatten; geen `image/gif`, OV-2) en de bestaande `MAX_FILE_URL_TTL_SECONDS`. In
`FILE_LIMITS` van de app: `viewUrlTtlSeconds` (standaard `300`). Een app die afbeeldingen toelaat, zet de gewenste typen in
`allowedTypes`; `createApp` weigert `viewUrlTtlSeconds` boven de harde grens.

**CSP**: `contentSecurityPolicy` krijgt een optionele extra origin voor `img-src`, naast `'self' data:`. De productieserver
krijgt `viewOrigin` van de adapter; `vite.config.ts` gebruikt de lokale adapter en geeft niets extra mee.

**Lokale adapter**: het token van de dev-route krijgt een derde soort (`view`), gebonden aan sleutel, vervaltijd en type; `GET`
met zo'n token antwoordt met de headers hierboven.

## Kopieer de vorm van

- `db/migrations/20261009194039_user_roles.sql` — policy en grants in dezelfde migratie.
- `db/migrations/20261012200000_account_blocking.sql` — functie van `app_definer` met `set search_path = ''`.
- `db/tests/user_roles.sql` — pgTAP per policy op naam.
- `src/core/api/http/security-headers.ts` — één plek voor de CSP; hier komt de optionele `img-src`-origin bij.
- `src/core/web/ui/image.tsx` — bestaand component met vaste verhouding, verplichte `alt` en een tekst als de afbeelding niet laadt.
- `src/web/features/accounts/queries.ts` — key-factory en verversen.
- `e2e/ui-weergave-basis.spec.ts` — e2e van `Image` met axe op 375 en 1280 px.

## Hergebruik en UX

- **Bestaande componenten**: `Image` (`ratio`, `alt`, `unavailableText`), `DataTable`, `Gallery`, `AsyncView`. Geen nieuw component.
- **Voorvertoning op `/bestanden`** (deel A): een extra eerste kolom met `Image` (`ratio="square"`) voor items met `view`; een
  item zonder `view` toont niets in die kolom. `alt` is de bestandsnaam.
- **Verlopen URL**: de query van een lijst met weergave-URL's krijgt een `staleTime` van de helft van `viewUrlTtlSeconds` en
  ververst bij terugkeer naar het tabblad; laadt een afbeelding toch niet, dan toont `Image` zijn `unavailableText`. Geen
  automatische herhaalpoging per afbeelding.
- **Afbeelding bij een rij kiezen** (deel B, patroon voor apps): de bestaande uploadflow uit de bestandsopslag
  (`POST /api/files` → upload → `complete`), daarna schrijft de mutatie van de resource het `id` in het koppelveld. Het
  formulier toont de gekozen afbeelding met `Image` en een knop om hem weg te halen.
- **Staten**: laden (`AsyncView` van de lijst), leeg (geen afbeelding: niets of de lege staat van de feature), fout
  (`unavailableText`), bezig (`busy` op de uploadknop), gelukt (toast van de feature), verouderd (verversen zoals hierboven).
- **Alle zichtbare tekst letterlijk** (`src/web/copy/ui.ts`):

  | Plek | Tekst |
  |---|---|
  | Kolomkop voorvertoning | "Voorbeeld" |
  | `unavailableText` | "Afbeelding niet beschikbaar" |
  | Knop in een formulier met een gekoppelde afbeelding | "Afbeelding kiezen" / "Afbeelding verwijderen" |

- **Focusvolgorde en toetsenbord**: een afbeelding is geen Tab-stop; de knoppen volgen de volgorde van het formulier.

## Acceptatiecriteria

**Deel A**

- **images/AC-1** — Gegeven de contracttestsuite, wanneer hij tegen de lokale adapter draait, dan levert een weergave-URL het
  opgegeven `Content-Type`, `Content-Disposition: inline` zonder bestandsnaam en `X-Content-Type-Options: nosniff`, en weigert
  hij na `ttlSeconds`; een adapter die een ander type teruggeeft, `nosniff` weglaat of een verlopen URL accepteert, laat de
  suite falen. Toets: `src/core/api/storage/contract-view.test.ts` (nieuw)
- **images/AC-2** — Gegeven een bestand met een type buiten `VIEWABLE_IMAGE_TYPES` (ook `image/svg+xml` en `text/html`), dan roept
  `createFileService` `createViewUrl` niet aan en is `view` `null`. Toets: `src/core/api/storage/file-service-view.test.ts` (nieuw)
- **images/AC-3** — Gegeven een weergave-token voor sleutel X, wanneer het wordt gebruikt voor sleutel Y, als upload, als
  download, na het verlopen of met een gewijzigde handtekening, dan 403 en wordt er niets gelezen of geschreven. Toets: `test/api/images-dev-route.int.test.ts` (nieuw)
- **images/AC-4** — Gegeven een adapter met `viewOrigin` O, dan bevat `img-src` precies `'self'`, `data:` en O; met `null`,
  zonder adapter en in `vite.config.ts` precies `'self'` en `data:`. Toets: `src/core/api/http/security-headers-img.test.ts` (nieuw)
- **images/AC-5** — Gegeven `viewUrlTtlSeconds` boven `MAX_FILE_URL_TTL_SECONDS`, wanneer de API start, dan weigert `createApp`
  met een melding die de sleutel noemt. Toets: `src/core/api/http/create-app-images.test.ts` (nieuw)
- **images/AC-6** — Gegeven een eigen `ready`-afbeelding en een eigen `ready`-pdf, dan heeft in `GET /api/files` alleen de
  afbeelding een `view` met `expiresAt` niet verder dan `viewUrlTtlSeconds`; een `pending`-afbeelding staat er niet in. Toets: `test/api/images.int.test.ts` (nieuw)
- **images/AC-7** — Gegeven gebruikers A en B en een afbeelding van A zonder koppeling, dan bevat geen antwoord aan B een
  weergave-URL ervoor. Toets: `test/api/images.int.test.ts` (nieuw)
- **images/AC-8** — Gegeven geen adapter, dan is `viewOf` `null` en geeft een route die hem gebruikt haar gewone antwoord. Toets: `test/api/images.int.test.ts` (nieuw)
- **images/AC-9** — Gegeven `/bestanden` met een afbeelding en een pdf op 375 en 1280 px, dan toont de rij van de afbeelding
  een voorvertoning met de bestandsnaam als `alt`, de rij van de pdf geen, en vindt axe geen overtredingen. Toets: `e2e/images.spec.ts` (nieuw)

**Deel B**

- **images/AC-10** — Gegeven een resourcetabel met het koppelpatroon, een rij die naar een afbeelding van A wijst en een
  gebruiker B die de rij mag lezen, dan leest B de rij uit `public.files` en niets anders van A; mag B de rij niet lezen, dan
  ook het bestand niet. Toets: `db/tests/linked_image.sql` (nieuw)
- **images/AC-11** — Gegeven B uit AC-10, dan faalt `update` en `delete` van B op het bestand van A (0 rijen), en geeft
  `GET /api/files/:id/download` en `DELETE /api/files/:id` voor B `NOT_FOUND`. Toets: `test/api/images-linked.int.test.ts` (nieuw)
- **images/AC-12** — Gegeven een schrijver van de resource, wanneer hij het koppelveld zet op een bestand van een ander, een
  `pending`-bestand of een type buiten `VIEWABLE_IMAGE_TYPES`, dan `FORBIDDEN` en blijft de rij ongewijzigd. Toets: `db/tests/linked_image.sql` (nieuw)
- **images/AC-13** — Gegeven een gekoppelde afbeelding, wanneer de eigenaar het bestand verwijdert of zijn account verdwijnt,
  dan is het koppelveld null, blijft de rij bestaan en staat de sleutel in `app.file_deletions`. Toets: `db/tests/linked_image.sql` (nieuw)
- **images/AC-14** — Gegeven een migratie met een foreign key naar `public.files` zonder `on delete set null`, zonder de
  policy `files_select_via_<resource>_<naam>` of zonder de trigger, dan faalt de check en noemt hij tabel en kolom; fixtures
  bewijzen elk van de drie. Toets: `test/rails/check-linked-image.test.ts` (nieuw)
- **images/AC-15** — Gegeven het voorbeeld op `/design-system` (alleen voorbeelddata, R-WEB-08), dan toont het een rij met en
  een rij zonder afbeelding en de staat "Afbeelding niet beschikbaar". Toets: `e2e/images.spec.ts` (nieuw)

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Het object heeft andere bytes dan een afbeelding (type klopte bij `complete`) | de browser toont niets (`nosniff`); `Image` toont `unavailableText` | |
| Twee rijen wijzen naar hetzelfde bestand | toegestaan; leesbaar via elk van beide | |
| Het koppelveld wordt leeggemaakt | het bestand blijft bij de eigenaar bestaan en is niet meer gedeeld | |
| Weergave-URL doorgestuurd naar een ander | werkt tot de vervaltijd, zoals elke signed URL; daarom een korte termijn | |
| Lijst met meer afbeeldingen dan de paginagrootte | elke pagina ondertekent alleen haar eigen rijen | |

## Raakt ook

- `check:migrations`, `check:secdef`, `check:policies`, `db/tests/functies.sql`; de nieuwe check uit AC-14 in `gate:fast`.
- `docs/framework.md`: R-OPSL-02 (weergave naast bijlage) en de CSP-regel; `docs/gouden-pad.md`: sectie "Een afbeelding bij een rij".
- `test/security/resources.ts`: een resource met een koppelveld krijgt het geval "lezer zonder eigendom" in haar samples.
- De spec bestandsopslag: AC-1 en de poortbeschrijving krijgen de vijfde methode via een specwijziging (besluitroute).
- Na ST-05: de AVG-export van de eigenaar bevat de metadata van een gedeeld bestand, niet van wie het alleen kan zien.

## Buiten scope

- Verkleinen, bijsnijden, thumbnails, meerdere formaten en `srcset`.
- Inhoudscontrole op magic bytes en virusscan (blijft buiten scope zoals in de bestandsopslag).
- Andere typen inline tonen (pdf, video, SVG).
- Afbeeldingen voor anonieme bezoekers of in e-mail; publieke buckets blijven uit (ADR 0060 punt 3).
- Bestanden zonder persoonlijke eigenaar (OV-3).

## Testplan

- Deel A: contracttestsuite tegen de lokale adapter; integratietests tegen de echte stack; e2e op `/bestanden`.
- Deel B: pgTAP met een tijdelijke resourcetabel in de test (de template heeft geen app-resource); fixtures voor de check;
  integratietest met een testroute uit de fixture van de route kit.
- `pnpm gate:fast`, `pnpm gate:slow`, `pnpm ratchet` en `pnpm check:storage-adapters` groen; uitslag in de PR.

## Open vragen

Een vraag zonder aanbeveling (de eigenaar kiest) blokkeert `goedgekeurd`; een vraag met aanbeveling mag blijven staan. `check-docs` telt elke regel in deze sectie met het waarschuwingsteken en "open" (ook met U+FE0F of hoofdletter, ook zonder opsommingsteken).

- **OV-1** — Herziening van ADR 0060 punt 2 en R-OPSL-02 zodat een weergave-URL naast de bijlage mag. Aanbeveling: ja, beperkt
  tot de vaste lijst rastertypen in core, met `nosniff` en een eigen `img-src`-origin; zonder dit besluit vervalt de spec.
- **OV-2** — Welke typen in `VIEWABLE_IMAGE_TYPES`. Aanbeveling: JPEG, PNG, WebP en AVIF; geen SVG (script) en geen GIF (groot,
  beweging botst met `prefers-reduced-motion`).
- **OV-3** — Eigenaar van een gekoppeld bestand. Aanbeveling: de uploader blijft eigenaar en de koppeling vervalt
  (`on delete set null`) als zijn account verdwijnt; gevolg: een afbeelding bij een rij kan verdwijnen als de uploader wordt
  verwijderd. Het alternatief (bestanden zonder persoonlijke eigenaar) vraagt een nullable `owner_id`, een eigen policyset en een
  eigen besluit over de AVG-export, en is een aparte spec.
- **OV-4** — `viewUrlTtlSeconds` standaard. Aanbeveling: 300 seconden: lang genoeg voor een lijstscherm, kort genoeg voor een
  doorgestuurde link.
- **OV-5** — Een eigen maximale grootte voor afbeeldingen naast `FILE_LIMITS.maxBytes`. Aanbeveling: nee; één grens per app tot
  een app beide soorten met verschillende grenzen nodig heeft.
