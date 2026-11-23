---
status: goedgekeurd
namespace: foutreferentie
---

# Foutreferentie bij onverwachte fouten

## Doel

Een gebruiker die een onverwachte serverfout ziet, krijgt de `requestId` uit de foutbody (`{ code, requestId }`, R-SEC-02) als
"Referentie: <id>" met een kopieerknop te zien, zodat support de melding direct aan de request-log kan koppelen (R-SEC-08),
zonder ooit stacktrace, SQL of servertekst te tonen.

## Rollen en wie wat ziet

Geen nieuwe rol of permissie. Iedere gebruiker die nu een foutweergave ziet (RouteError, AsyncView, de formuliermelding van
`<Form>`) ziet daar ook de referentie, alleen bij een fout die aan de voorwaarden van AC-6 voldoet. De referentie is de
server-gegenereerde `requestId` van zijn eigen verzoek; die bevat geen persoonsgegevens en geeft geen toegang tot iets. De
gebruiker ziet nooit de `code`, de HTTP-status, een stacktrace, SQL of een tekst van de server; de foutzin blijft de tekst bij
de code uit de foutteksten (`useErrorText`).

## Datawijzigingen (met grants)

n.v.t. — geen migratie, tabel, policy of grant; de `requestId` bestaat al in de foutbody, de log en `app.request_id`.

## Routes en foutcodes

n.v.t. — geen nieuwe of gewijzigde route, permissie of foutcode. De bestaande foutbody `{ code, requestId }` van `createApp`
(`src/core/api/http/create-app.ts`, `onError`, `notFound`, CSRF en `bodyLimit`) blijft ongewijzigd; alleen de web-client leest
`requestId` voortaan mee.

## Koppeling

n.v.t. — geen externe dienst; alles blijft binnen de eigen API en de browser.

## Kopieer de vorm van

- `src/web/features/accounts/accounts-page.tsx` — kitcomponenten via de barrel `src/web/ui` en teksten uit een copybestand,
  geen losse strings in de component.
- `src/web/features/accounts/invite-dialog.tsx` — foutafhandeling via `<Form>` met de formuliermelding boven de velden en
  focus op die melding na een serverfout.

## Hergebruik en UX

- Bestaande componenten: `CopyButton` (`src/core/web/ui/copy-button.tsx`, met eigen `label`, `copiedLabel` en standaard
  `errorLabel`), `RouteError` (`src/core/web/ui/route-error.tsx`), `AsyncView` (`src/core/web/ui/async-view.tsx`), `Form`
  (`src/core/web/ui/form.tsx`), `useErrorText` (`src/core/web/ui/error-texts.tsx`), `ApiError` (`src/core/web/lib/api-client.ts`).
  Nieuw is één klein publiek component `ErrorReference` (`src/core/web/ui/error-reference.tsx`, prop `error: unknown`) dat
  "Referentie: <id>" plus `CopyButton` rendert, of niets. RouteError, AsyncView en Form gebruiken het; een app kan het in een
  eigen foutweergave gebruiken via `src/web/ui/index.ts`. Geen nieuwe dependency, token, variant of kleur; klassen alleen
  bestaande tokens (`text-sm`, `text-muted-foreground`, `font-mono`, layoutklassen).
- Vorm van de requestId (validatie): een nieuwe module `src/core/shared/request-id.ts` exporteert `safeRequestId(value: unknown):
  string | null`. Die geeft de waarde alleen terug als het een string is van 1 tot en met `MAX_REQUEST_ID_LENGTH` (= 64, nieuw
  in `src/core/shared/limits.ts`) tekens die volledig voldoet aan `^[A-Za-z0-9_-]+$`; anders `null`. De huidige server geeft een
  UUID (36 tekens, `hono/request-id` met `headerName: ''`), die hieraan voldoet.
- `ApiError` krijgt `readonly requestId: string | null`; de constructor wordt `(code, status, requestId?: unknown)` en zet
  `this.requestId = safeRequestId(requestId)`. `message` blijft gelijk aan `code` (de requestId komt niet in `message`).
  De client leest de foutbody één keer en haalt er `code` (zoals nu, met `INTERNAL_ERROR` als terugval) en `requestId` uit; dat
  geldt voor `call` en `devLoginAs`. Bestaande aanroepen `new ApiError(code, status)` blijven geldig en geven `requestId === null`.
- `supportReference(error: unknown): string | null` in `src/core/web/lib/api-client.ts` geeft de requestId terug als `error`
  een `ApiError` is met `status >= 500` en `requestId !== null`; anders `null`. Dit is de enige beslisregel voor tonen.
- Plaatsing:
  - RouteError (alleen de tak "Er ging iets mis", nooit de tak "geen toegang"): direct na de foutzin (`<p role="alert">`) en
    vóór "Opnieuw proberen", als zusterelement, niet binnen de `<p>`.
  - AsyncView, fouttak zonder behouden data: binnen de bestaande `<div role="alert">`, na de foutzin en vóór "Opnieuw proberen".
  - AsyncView, verouderd (`refresh` met behouden data en een fout ≥ 500): binnen de bestaande `<div role="alert">`, na de zin
    "<staleLabel> <foutzin>" en vóór "Opnieuw proberen".
  - Form: direct na de formuliermelding (`<p role="alert" tabIndex={-1}>`), als zusterelement, alleen als die melding staat.
    Een fout die via `fieldForCode` naar een veld gaat, toont geen referentie.
- Staten per scherm:
  - laden: ongewijzigd, geen referentie.
  - leeg: ongewijzigd, geen referentie.
  - fout ≥ 500 met geldige requestId: foutzin, daaronder "Referentie: <id>" en de knop "Referentie kopiëren".
  - fout < 500, fout zonder (geldige) requestId, of een fout die geen `ApiError` is: exact de huidige weergave, geen extra
    element, geen lege regel, geen lege kopieerknop.
  - bezig (kopiëren): de knop van `CopyButton` toont "Bezig…" (bestaand gedrag).
  - gelukt (kopiëren): statusregel "Referentie gekopieerd."; het klembord bevat precies `<id>` (zonder "Referentie: ").
  - kopiëren mislukt: "Kopiëren is niet gelukt. Selecteer en kopieer de tekst zelf." (bestaande standaardtekst); de id staat als
    gewone, selecteerbare tekst op het scherm.
  - verouderd: zie plaatsing; de referentie verdwijnt zodra de query weer slaagt.
  - Form opnieuw verzonden: bij het verzenden verdwijnen melding en referentie samen; een nieuwe fout toont de nieuwe referentie.
- Alle zichtbare tekst letterlijk (nieuw in `src/core/web/copy/ui.ts`):
  - `errorReference: 'Referentie:'` — weergave: `Referentie: ` gevolgd door de id in `font-mono`, in één `<p>`, bijvoorbeeld
    "Referentie: 3f6c2a9e-1b4d-4c8e-9a7f-2d5e8b1c0a64".
  - `copyErrorReference: 'Referentie kopiëren'` — label van de `CopyButton`.
  - `errorReferenceCopied: 'Referentie gekopieerd.'` — `copiedLabel` van de `CopyButton`.
  - Mislukt kopiëren gebruikt de bestaande `uiTexts.copyFailed`; "Bezig…" de bestaande `uiTexts.busy`.
  - Geen andere nieuwe tekst; foutzinnen, "Er ging iets mis" en "Opnieuw proberen" blijven ongewijzigd.
- Focusvolgorde en toetsenbord:
  - RouteError: titel → foutzin (niet focusbaar) → referentietekst (niet focusbaar) → "Referentie kopiëren" → "Opnieuw proberen".
  - AsyncView: foutzin → referentietekst → "Referentie kopiëren" → "Opnieuw proberen".
  - Form: na een serverfout krijgt de formuliermelding de focus (ongewijzigd); de eerstvolgende Tab gaat naar "Referentie
    kopiëren", daarna naar het eerste veld.
  - "Referentie kopiëren" is een `Button` (via `CopyButton`): bedienbaar met Enter en Spatie, bestaande focusring en
    aanraakdoel van 44 px (R-UI-06). Na kopiëren blijft de focus op de knop.
  - De referentietekst zelf zit niet in een live-regio: alleen de bestaande meldingen worden aangekondigd; in AsyncView valt hij
    binnen de bestaande `role="alert"`-container en wordt hij met de foutzin meegelezen.

## Acceptatiecriteria

- **foutreferentie/AC-1** — Gegeven een API-antwoord met status 500 en body `{"code":"INTERNAL_ERROR","requestId":"3f6c2a9e-1b4d-4c8e-9a7f-2d5e8b1c0a64"}`,
  wanneer `call` faalt, dan gooit hij een `ApiError` met `code` `INTERNAL_ERROR`, `status` 500 en `requestId`
  `3f6c2a9e-1b4d-4c8e-9a7f-2d5e8b1c0a64`, en `message` is `INTERNAL_ERROR`. Toets: `src/core/web/lib/api-client-request-id.test.ts`
- **foutreferentie/AC-2** — Gegeven een foutbody waarin `requestId` ontbreekt, geen string is (getal, `null`, object), leeg is,
  65 tekens lang is, of een teken buiten `[A-Za-z0-9_-]` bevat (spatie, `<`, `/`, regeleinde, `'`), wanneer `call` faalt, dan is
  `requestId` van de `ApiError` `null` en `code` is zoals vandaag. Toets: `src/core/web/lib/api-client-request-id.test.ts`
- **foutreferentie/AC-3** — Gegeven een foutantwoord dat geen JSON is (bijv. HTML van een proxy), wanneer `call` faalt, dan is
  `code` `INTERNAL_ERROR` en `requestId` `null`. Toets: `src/core/web/lib/api-client-request-id.test.ts`
- **foutreferentie/AC-4** — Gegeven een id van precies 64 tekens uit `[A-Za-z0-9_-]`, wanneer `safeRequestId` hem krijgt, dan geeft
  die hem ongewijzigd terug; met 1 teken ook; met 0 of 65 tekens `null`. Toets: `src/core/shared/request-id.test.ts`
- **foutreferentie/AC-5** — Gegeven `devLoginAs` met een foutantwoord ≥ 500 en geldige requestId, dan heeft de gegooide `ApiError`
  die `requestId`. Toets: `src/core/web/lib/api-client-request-id.test.ts`
- **foutreferentie/AC-6** — `supportReference` geeft de id alleen bij een `ApiError` met `status >= 500` en `requestId !== null`;
  bij status 499, bij status 500 zonder requestId, bij een gewone `Error` met een eigenschap `requestId`, bij `ForbiddenError` en
  bij `undefined` geeft hij `null`. Toets: `src/core/web/lib/api-client-request-id.test.ts`
- **foutreferentie/AC-7** — Gegeven RouteError met `new ApiError('INTERNAL_ERROR', 500, '<id>')`, dan staat er na de foutzin de
  tekst "Referentie: <id>" en een knop met de toegankelijke naam "Referentie kopiëren", vóór de knop "Opnieuw proberen". Toets: `src/core/web/ui/route-error-reference.test.tsx`
- **foutreferentie/AC-8** — Gegeven RouteError met een `ForbiddenError`, een `ApiError` met status 404 en geldige id, of een
  `ApiError` met status 500 zonder id, dan bevat de weergave geen tekst "Referentie" en geen knop "Referentie kopiëren", en het
  aantal elementen in de container is gelijk aan dat zonder deze feature (geen lege regel). Toets: `src/core/web/ui/route-error-reference.test.tsx`
- **foutreferentie/AC-9** — Gegeven de weergave van AC-7, wanneer de gebruiker op "Referentie kopiëren" drukt (muis, Enter of
  Spatie), dan bevat het klembord precies `<id>` en verschijnt "Referentie gekopieerd."; als het klembord weigert, verschijnt
  "Kopiëren is niet gelukt. Selecteer en kopieer de tekst zelf." en blijft "Referentie: <id>" zichtbaar. Toets: `src/core/web/ui/error-reference.test.tsx`
- **foutreferentie/AC-10** — Gegeven een AsyncView-query die faalt met een `ApiError` 500 met geldige id, dan staan
  "Referentie: <id>" en "Referentie kopiëren" binnen de `role="alert"`-container, na de foutzin en vóór "Opnieuw proberen"; met
  een `ApiError` 400 of 500 zonder id staan ze er niet. Toets: `src/core/web/ui/async-view-reference.test.tsx`
- **foutreferentie/AC-11** — Gegeven AsyncView met `refresh`, behouden data en een refetch die faalt met een `ApiError` 503 met
  geldige id, dan staat de referentie in de verouderd-melding; nadat de refetch slaagt, is de referentie weg. Toets: `src/core/web/ui/async-view-reference.test.tsx`
- **foutreferentie/AC-12** — Gegeven een `<Form>` waarvan `onSubmit` een `ApiError` 500 met geldige id gooit en de code niet in
  `fieldForCode` staat, dan krijgt de formuliermelding de focus, staat "Referentie: <id>" direct erna, en gaat de volgende Tab naar
  "Referentie kopiëren". Toets: `src/core/web/ui/form-reference.test.tsx`
- **foutreferentie/AC-13** — Gegeven een `<Form>` waarvan `onSubmit` een `ApiError` 500 met geldige id gooit en de code wél in
  `fieldForCode` staat, dan staat de fout bij het veld en verschijnt nergens "Referentie". Toets: `src/core/web/ui/form-reference.test.tsx`
- **foutreferentie/AC-14** — Gegeven de formuliermelding met referentie van AC-12, wanneer de gebruiker opnieuw verzendt en dat
  slaagt, dan zijn melding en referentie weg; faalt het opnieuw met een andere id, dan staat alleen de nieuwe id er. Toets: `src/core/web/ui/form-reference.test.tsx`
- **foutreferentie/AC-15** — In geen enkele weergave van deze spec verschijnt `code`, HTTP-status, `message` of een andere
  eigenschap van de fout dan de gevalideerde requestId: een test met een `ApiError` 500 waarvan de body ook `message`, `stack`
  en `detail` met de tekst "geheim" bevat, vindt "geheim" niet in de DOM. Toets: `src/core/web/ui/error-reference.test.tsx`
- **foutreferentie/AC-16** — Een fout uit de echte `createApp` (route die gooit, onbekende route) heeft een `requestId` waarvoor
  `safeRequestId(requestId) === requestId` geldt; zo faalt de test als de server ooit een vorm kiest die de web-client weigert. Toets: `src/core/api/http/request-id-shape.test.ts`
- **foutreferentie/AC-17** — `ErrorReference` staat in `src/web/ui/index.ts` en de catalogus op `/design-system` toont een voorbeeld
  met een fictieve serverfout (referentie en kopieerknop). Toets: `src/web/features/design-system/error-reference-example.test.tsx`

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Body zonder `requestId` (bijv. Better Auth-fout of proxy) | Geen referentie, geen lege regel | ongewijzigd (`code` uit body of `INTERNAL_ERROR`) |
| `requestId` met HTML, spatie, regeleinde of > 64 tekens | Verworpen (`null`), geen referentie | ongewijzigd |
| `requestId` geen string (getal, object, array, `null`) | Verworpen (`null`) | ongewijzigd |
| Status 4xx met geldige id (bijv. `RATE_LIMITED`, `NOT_FOUND`) | Geen referentie: de foutzin is voor de gebruiker voldoende | ongewijzigd |
| Netwerkfout (fetch gooit, geen `ApiError`) | Geen referentie | n.v.t. |
| Fout die geen `ApiError` is maar `requestId` heeft | Geen referentie (`instanceof ApiError` vereist) | n.v.t. |
| App bouwt zelf `new ApiError(code, 500, '<script>')` | Constructor valideert: `requestId` `null` | n.v.t. |
| `navigator.clipboard` ontbreekt of weigert | Bestaande `copyFailed`-tekst; id blijft selecteerbaar | n.v.t. |
| Snelle dubbele klik op "Referentie kopiëren" | Eén kopieeractie (bestaand `pending`-gedrag van `CopyButton`) | n.v.t. |
| AsyncView verouderd met fout < 500 | Bestaand gedrag: data niet behouden, fouttak zonder referentie | n.v.t. |
| Smalle viewport (375 px) | Id breekt niet uit de container (`break-all` op de id) | n.v.t. |

## Raakt ook

Bestanden die de bouw raakt (allemaal in de template; in de template wijzigt core met eigenaarakkoord, R-REPO-03):

- Bron:
  - `src/core/shared/request-id.ts` (nieuw: `safeRequestId`)
  - `src/core/shared/limits.ts` (nieuw: `MAX_REQUEST_ID_LENGTH = 64`)
  - `src/core/web/lib/api-client.ts` (`ApiError.requestId`, body één keer lezen, `supportReference`)
  - `src/core/web/copy/ui.ts` (drie nieuwe teksten)
  - `src/core/web/ui/error-reference.tsx` (nieuw: `ErrorReference`)
  - `src/core/web/ui/route-error.tsx`, `src/core/web/ui/async-view.tsx`, `src/core/web/ui/form.tsx` (plaatsing)
- Tests (nieuw, ernaast; geen bestaande test wijzigen):
  - `src/core/shared/request-id.test.ts` (AC-4)
  - `src/core/web/lib/api-client-request-id.test.ts` (AC-1, AC-2, AC-3, AC-5, AC-6)
  - `src/core/web/ui/error-reference.test.tsx` (AC-9, AC-15)
  - `src/core/web/ui/route-error-reference.test.tsx` (AC-7, AC-8)
  - `src/core/web/ui/async-view-reference.test.tsx` (AC-10, AC-11)
  - `src/core/web/ui/form-reference.test.tsx` (AC-12, AC-13, AC-14)
  - `src/core/api/http/request-id-shape.test.ts` (AC-16)
  - `src/web/features/design-system/error-reference-example.test.tsx` (AC-17)
- Barrel: `src/web/ui/index.ts` (export `ErrorReference`).
- Catalogus: `src/web/features/design-system/additional-examples.tsx` (voorbeeld `ErrorReference` en RouteError met een
  fictieve `ApiError('INTERNAL_ERROR', 500, '<voorbeeld-id>')`; alleen voorbeelddata, R-WEB-08).
- Gebruiksdoc: `docs/design-system-catalogue.md` (regel bij "RouteError en NotFound" en een regel voor `ErrorReference`).
- Checks: `pnpm check:catalogus`, `pnpm gate:fast`, `pnpm ui:check`. Niet geraakt: `check:migrations`, `check:secdef`,
  `test:db`/policies, `test/security/resources.ts` en permissietests per verboden rol (geen migratie, functie, resource of
  permissie).

## Buiten scope

- Server: geen wijziging aan `createApp`, de foutbody, de requestId-generator of de request-log.
- Inloggen en accountacties via `src/core/web/lib/auth.ts` (Better Auth): hun fouten hebben geen requestId in de body; geen
  referentie daar.
- De `X-Request-Id`-header uitlezen als terugval: niet in deze spec.
- Toasts en `ConfirmDialog`: geen referentie.
- De referentie meesturen in de clientfoutlog (R-SEC-08): geen wijziging.
- Een supportpagina, mailto-link of formulier om de referentie te versturen.
- Wijzigingen aan bestaande tests, regels, checks of dependencies.

## Testplan

- Unit (Vitest, project `web`, jsdom): de nieuwe testbestanden uit "Raakt ook" dekken AC-1 t/m AC-15; `fetch` en
  `navigator.clipboard` gestubd zoals in `src/core/web/lib/api-client.test.ts` en `src/core/web/ui/copy-button.test.tsx`. AC-8
  vergelijkt het aantal kindelementen van de container met en zonder geldige referentie-voorwaarde.
- Unit (API): AC-16 naar het voorbeeld van `src/core/api/http/hardening.test.ts` (route die gooit en onbekende route via
  `appWith`/`request`).
- Catalogus en toegankelijkheid: AC-17 heeft een unit-test; daarnaast draaien `pnpm check:catalogus` en `pnpm ui:check` (axe op 375 en 1280 px op `/design-system`) als procesbewijs in CI.
- Regressie (procesbewijs, geen AC): `pnpm gate:fast` en `git diff --name-status origin/main` zonder `M` op een bestaand `*.test.ts(x)`.

## Open vragen

- **OV-1** — Referentie ook bij 4xx-fouten tonen? Opties: alleen ≥ 500, of bij elke `ApiError` met id. Aanbeveling: alleen
  ≥ 500 (AC-6); bij 4xx is de foutzin zelf de uitleg en voegt een referentie ruis toe, en een app kan `ErrorReference` zelf
  breder inzetten.
- **OV-2** — De `X-Request-Id`-header als terugval lezen wanneer de body geen requestId heeft? Aanbeveling: nee (zie "Buiten
  scope"); elke foutbody van `createApp` bevat hem al, en één bron houdt de validatie eenvoudig.
