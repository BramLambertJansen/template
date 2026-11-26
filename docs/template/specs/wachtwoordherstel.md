---
status: voorstel # voorstel | goedgekeurd | vervallen — architect of hoofdsessie zet de status in het voorstel, de merge door de eigenaar is het besluit (ADR 0046); gebouwd volgt uit de AC-dekking (ADR 0104)
namespace: wachtwoordherstel
---

# Wachtwoord vergeten: zelf herstellen, per app in te schakelen

[ADR 0043](../adr/0043-accounts-uitnodigen-mfa-en-beheer.md) houdt "wachtwoord vergeten" dicht (`/request-password-reset` geeft
404, R-AUTH-04) en noemt het als later werk: "een pad uit `disabledPaths` plus een scherm, met een eigen tokengeldigheid". Dat
past bij een app met een handvol accounts die een beheerder kent. Aanleiding voor deze spec: verzoek van de eigenaar
(2026-11-23), app-behoefte: een app met veel gewone gebruikers kan niet elk vergeten wachtwoord via een beheerder laten lopen.
De resetlink door een beheerder (spec [accountbeheer-uitbreiding](accountbeheer-uitbreiding.md), ST-02) blijft daarnaast bestaan.

**Vraagt eerst een besluit-PR**: herziening van ADR 0043 punt 3 en van R-AUTH-04 en R-UIT-03 (twee schermen zonder
`can()`-guard erbij). Dit is auth in core: risicowerk met een aparte tester (R-WERK-04).

**Standaard uit.** Een app zet het aan in haar compositie-root; een app die niets doet, gedraagt zich exact als nu.

## Doel

Een gebruiker met een actief account die zijn wachtwoord kwijt is, stelt zonder hulp van een beheerder een nieuw wachtwoord in
via een eenmalige link naar zijn e-mailadres, zonder dat de app daarbij prijsgeeft of een adres een account heeft.

## Rollen en wie wat ziet

| Wie | Aanvragen | Nieuw wachtwoord instellen |
|---|---|---|
| anoniem, adres van een actief account (met credential, niet geblokkeerd, niet gedeactiveerd) | altijd dezelfde bevestiging; er gaat één mail uit | met een geldige link: ja; daarna inloggen, geen sessie uit de link |
| anoniem, onbekend adres of een uitgenodigd, geblokkeerd of gedeactiveerd account | dezelfde bevestiging, in dezelfde tijd; er gaat geen mail uit | niet van toepassing |
| account met een beheerrol | als een actief account (OV-1) | ja; de tweede factor blijft staan, dus het nieuwe wachtwoord alleen geeft geen beheersessie |
| ingelogde gebruiker | de schermen sturen door naar de startpagina; wachtwoord wijzigen gaat via het eigen account | |

Met de schakelaar uit: beide schermen bestaan niet (de router kent ze niet) en `/api/auth/request-password-reset` geeft 404.

## Datawijzigingen (met grants)

Geen nieuwe tabel. Eén nieuwe migratie voor de limiet per adres (hieronder) en twee soorten in `app.claim_one_time_use`:

- **`app.consume_reset_request(p_email_hash text)`** → `boolean`, klasse `auth` (`execute` alleen aan `auth_service`),
  `security definer`, eigenaar `app_definer`, `set search_path = ''`: telt in de bestaande rate-limittabel een venster per
  gehasht adres en geeft `false` boven `PASSWORD_RESET_MAX_PER_HOUR`. Het adres zelf komt niet in de tabel. Regel in
  `db/tests/functies.sql`.
- De herstellink is eenmalig via de bestaande `app.claim_one_time_use` (spec inloggat-dichten); als die functie een vaste
  lijst soorten heeft, komt `password-reset` erbij in dezelfde migratie.

De tokens zelf staan in `better_auth.verification`, zoals die van een uitnodiging (R-DB-13: geen directe toegang uit app-code).

## Routes en foutcodes

Geen route via `defineRoute`: beide paden zijn van Better Auth onder `/api/auth/*` (uitzondering R-UIT-02).

| Methode | Pad | Wie | Uitkomst |
|---|---|---|---|
| POST | `/api/auth/request-password-reset` — `{ email }` | anoniem | schakelaar uit: 404. Aan: altijd 200 `{ ok: true }`, ook bij een onbekend adres of boven de limiet per adres; `RATE_LIMITED` alleen op de limiet per IP; `VALIDATION` bij een ongeldige body |
| POST | `/api/auth/reset-password` — `{ token, newPassword }` | anoniem | bestaand pad (uitnodigingen). Met een hersteltoken: zet het wachtwoord, trekt alle sessies van het account in, geeft geen sessie en geen token terug |

**Nieuwe foutcode** in de app-laag (`src/shared/errors.ts`, tekst in `src/web/copy/errors.ts`, zoals `INVITATION_INVALID`):
`RESET_LINK_INVALID` (400) voor een verlopen, gebruikte, ingetrokken of onbekende herstellink. Een zwak of gelekt wachtwoord
geeft de bestaande codes van het instellen bij een uitnodiging.

**Schakelaar**: `passwordReset: true` in de auth-configuratie die `src/api/server.ts` aan `createAuth` geeft. Aan betekent:
`/request-password-reset` gaat uit `disabledPaths`, en de web-kant krijgt dezelfde waarde als publieke buildwaarde zodat de
schermroutes en de link op `/login` alleen dan bestaan. `createAuth` weigert de schakelaar bij `APP_ENV=staging` of
`production` zolang de voorwaarde van OV-3 niet vervuld is.

**Verloop van een aanvraag** (hook in `src/core/api/auth`):

1. limiet per IP via de bestaande rate limit van Better Auth, met een eigen regel voor dit pad (`PASSWORD_RESET_IP_MAX` per
   `PASSWORD_RESET_IP_WINDOW_SECONDS`);
2. het adres wordt genormaliseerd zoals bij inloggen; onbekend, zonder credential-account, geblokkeerd of gedeactiveerd: geen
   token, geen mail;
3. limiet per adres via `app.consume_reset_request`; erboven: geen token, geen mail;
4. open hersteltokens van het account vervallen, er komt één nieuw token met geldigheid `PASSWORD_RESET_TTL_SECONDS`;
5. de mail gaat de wachtrij in (OV-2) met een link naar `${APP_ORIGIN}/wachtwoord-herstellen?token=…`;
6. het antwoord is in alle gevallen `{ ok: true }`. Stappen 2 t/m 5 lopen na het antwoord of in constante tijd: de
   antwoordtijd mag niet verraden of het adres bestaat.

**Verloop van het instellen**: het token wordt geclaimd met `app.claim_one_time_use` (twee gelijktijdige pogingen: één
slaagt); het account is intussen niet geblokkeerd of gedeactiveerd (anders `RESET_LINK_INVALID`); het wachtwoord voldoet aan
`MIN_PASSWORD_LENGTH`, `MAX_PASSWORD_LENGTH` en de controle op gelekte wachtwoorden; `session_version` gaat omhoog zodat elke
bestaande sessie vervalt (R-AUTH-08); er gaat een bevestigingsmail naar het adres. De tweede factor en de rol veranderen niet.
`sendResetPassword` kiest de mail op het bestaan van een credential-account: zonder is het een uitnodiging (ongewijzigd, link
naar `/uitnodiging`), met is het herstel.

**Grenzen** in `src/core/shared/limits.ts`: `PASSWORD_RESET_TTL_SECONDS = 3600`, `PASSWORD_RESET_MAX_PER_HOUR = 3` (per adres),
`PASSWORD_RESET_IP_MAX = 10` per `PASSWORD_RESET_IP_WINDOW_SECONDS = 3600` (OV-4). `INVITATION_TTL_SECONDS` blijft 7 dagen.

## Kopieer de vorm van

- `src/core/api/auth/options.ts` — `disabledPaths`, `sendResetPassword` en de tokengeldigheid.
- `src/core/api/auth/invitations.ts` — open tokens laten vervallen vóór een nieuw token.
- `src/core/api/auth/one-time-use.ts` — eenmalig claimen van een link.
- `src/core/api/auth/mailing.ts` — een mail per soort op het basissjabloon `src/core/api/mail/layout.ts`.
- `db/migrations/20261103160000_one_time_use.sql` — functie van klasse `auth`, alleen voor `auth_service`.
- `test/auth/eenmalig.int.test.ts` — eenmalig gebruik, ook bij twee gelijktijdige pogingen.
- `src/web/features/invitation/invitation-page.tsx` — scherm met token uit de URL, wachtwoordveld en doorsturen naar `/login`.
- `src/web/features/login/login-page.tsx` — `CenteredCard` met formulier zonder AppShell.
- `src/web/routes/uitnodiging.tsx` — schermroute zonder `can()`-guard, met ErrorBoundary.
- `e2e/account-lifecycle.spec.ts` — e2e met Mailpit: mail openen, link volgen, inloggen.

## Hergebruik en UX

- **Bestaande componenten**: `CenteredCard`, `Form`, `FormField`, `FormErrorSummary`, `Input`, `PasswordInput`, `Button`
  (`busy`), `Notice`, `NavLink`. Geen nieuw component.
- **Schermen** (beide zonder AppShell, zoals `/login`):
  - `/wachtwoord-vergeten`: één veld voor het e-mailadres. Na verzenden vervangt de bevestiging het formulier.
  - `/wachtwoord-herstellen?token=…`: nieuw wachtwoord en herhaling. Zonder token of met een ongeldig token: de melding van
    `RESET_LINK_INVALID` met een link naar `/wachtwoord-vergeten`. Na succes door naar `/login` met de bevestiging.
  - `/login` krijgt onder het formulier de link "Wachtwoord vergeten?", alleen met de schakelaar aan.
- **Staten per scherm**: laden (geen: er is geen data vooraf), leeg (het lege formulier), fout (veldfout of `Notice`), bezig
  (`busy` op de knop, velden niet te wijzigen), gelukt (bevestiging), verouderd (een link die intussen gebruikt of verlopen is:
  `RESET_LINK_INVALID`).
- **Alle zichtbare tekst letterlijk** (`src/web/copy/ui.ts` en `src/web/copy/errors.ts`):

  | Plek | Tekst |
  |---|---|
  | Link op `/login` | "Wachtwoord vergeten?" |
  | Titel `/wachtwoord-vergeten` | "Wachtwoord vergeten" |
  | Uitleg | "Vul je e-mailadres in. Je krijgt een link om een nieuw wachtwoord in te stellen." |
  | Veldlabel / knop | "E-mailadres" / "Link versturen" |
  | Bevestiging | "Als dit adres bij een account hoort, staat er binnen enkele minuten een mail in je inbox. De link werkt één uur." |
  | Link terug | "Terug naar inloggen" |
  | Titel `/wachtwoord-herstellen` | "Nieuw wachtwoord instellen" |
  | Veldlabels / knop | "Nieuw wachtwoord" / "Nieuw wachtwoord herhalen" / "Wachtwoord instellen" |
  | Bevestiging op `/login` | "Je wachtwoord is gewijzigd. Log in met je nieuwe wachtwoord." |
  | `RESET_LINK_INVALID` | "Deze link is verlopen of al gebruikt. Vraag een nieuwe aan." |
  | Mail herstel, onderwerp | "Nieuw wachtwoord instellen" |
  | Mail herstel, tekst | "Je hebt gevraagd om een nieuw wachtwoord. Stel het in via de knop hieronder. De link werkt één uur en één keer. Heb je dit niet gevraagd? Dan hoef je niets te doen; je wachtwoord blijft hetzelfde." |
  | Mail herstel, knop | "Wachtwoord instellen" |
  | Mail bevestiging, onderwerp | "Je wachtwoord is gewijzigd" |
  | Mail bevestiging, tekst | "Het wachtwoord van je account is zojuist gewijzigd. Was jij dit niet? Neem dan contact op met de beheerder." |

  "Eén uur" in de teksten volgt `PASSWORD_RESET_TTL_SECONDS` via `format`; een test houdt tekst en grens gelijk.
- **Focusvolgorde en toetsenbord**: focus op het eerste veld bij openen; na verzenden op `/wachtwoord-vergeten` gaat de focus
  naar de bevestiging (`role="status"`); bij een fout naar `FormErrorSummary`. Alles werkt met Tab en Enter.

## Acceptatiecriteria

- **wachtwoordherstel/AC-1** — Gegeven de schakelaar uit, dan geeft `POST /api/auth/request-password-reset` 404, kent de router
  `/wachtwoord-vergeten` en `/wachtwoord-herstellen` niet en staat de link niet op `/login`; de bestaande test per pad uit
  `disabledPaths` blijft groen. Toets: `test/auth/wachtwoordherstel-uit.int.test.ts` (nieuw)
- **wachtwoordherstel/AC-2** — Gegeven de schakelaar aan en een actief account, wanneer het adres wordt aangevraagd, dan komt
  er precies één mail in Mailpit met een link naar `/wachtwoord-herstellen?token=…` en is het antwoord `{ ok: true }`. Toets: `test/auth/wachtwoordherstel.int.test.ts` (nieuw)
- **wachtwoordherstel/AC-3** — Gegeven een onbekend adres en een uitgenodigd, een geblokkeerd en een gedeactiveerd account, dan
  is het antwoord byte voor byte gelijk aan dat van AC-2, komt er geen mail en geen token. Toets: `test/auth/wachtwoordherstel.int.test.ts` (nieuw)
- **wachtwoordherstel/AC-4** — Gegeven honderd aanvragen voor een bestaand en honderd voor een onbekend adres, dan gebeurt het
  werk van stap 2 t/m 5 niet vóór het antwoord (de test telt: bij het antwoord is er nog geen token geschreven en geen mail
  aangeboden) of loopt het voor beide door hetzelfde pad. Toets: `test/auth/wachtwoordherstel-timing.int.test.ts` (nieuw)
- **wachtwoordherstel/AC-5** — Gegeven `PASSWORD_RESET_MAX_PER_HOUR` aanvragen voor één adres binnen het venster, dan geeft de
  volgende nog steeds `{ ok: true }` en komt er geen mail bij; na het venster weer wel. Toets: `test/auth/wachtwoordherstel.int.test.ts` (nieuw)
- **wachtwoordherstel/AC-6** — Gegeven `PASSWORD_RESET_IP_MAX` aanvragen vanaf één IP binnen het venster, dan geeft de volgende
  `RATE_LIMITED`, ongeacht het adres. Toets: `test/auth/wachtwoordherstel.int.test.ts` (nieuw)
- **wachtwoordherstel/AC-7** — Gegeven twee aanvragen na elkaar voor hetzelfde account, dan werkt alleen de link uit de laatste
  mail; de eerste geeft `RESET_LINK_INVALID`. Toets: `test/auth/wachtwoordherstel.int.test.ts` (nieuw)
- **wachtwoordherstel/AC-8** — Gegeven een geldige link, wanneer het nieuwe wachtwoord wordt ingesteld, dan logt het oude
  wachtwoord niet meer in en het nieuwe wel, zijn alle eerdere sessies van het account ongeldig, bevat het antwoord geen
  `token` en zet het geen sessiecookie. Toets: `test/auth/wachtwoordherstel.int.test.ts` (nieuw)
- **wachtwoordherstel/AC-9** — Gegeven een geldige link, wanneer hij twee keer tegelijk wordt gebruikt, dan slaagt precies één
  poging en geeft de andere `RESET_LINK_INVALID`; na `PASSWORD_RESET_TTL_SECONDS` geeft elke poging `RESET_LINK_INVALID`. Toets: `test/auth/wachtwoordherstel-eenmalig.int.test.ts` (nieuw)
- **wachtwoordherstel/AC-10** — Gegeven een link, wanneer het account daarna geblokkeerd of gedeactiveerd wordt, dan geeft
  instellen `RESET_LINK_INVALID` en blijft het wachtwoord ongewijzigd. Toets: `test/auth/wachtwoordherstel.int.test.ts` (nieuw)
- **wachtwoordherstel/AC-11** — Gegeven een account met een beheerrol en TOTP, wanneer het wachtwoord is hersteld, dan vraagt
  inloggen nog steeds de tweede factor en is het TOTP-geheim ongewijzigd; zonder code geeft een beheerroute `MFA_REQUIRED`. Toets: `test/auth/wachtwoordherstel.int.test.ts` (nieuw)
- **wachtwoordherstel/AC-12** — Gegeven een wachtwoord korter dan `MIN_PASSWORD_LENGTH`, langer dan `MAX_PASSWORD_LENGTH` of
  bekend als gelekt, dan dezelfde code als bij het accepteren van een uitnodiging, blijft de link bruikbaar en verandert het
  wachtwoord niet. Toets: `test/auth/wachtwoordherstel.int.test.ts` (nieuw)
- **wachtwoordherstel/AC-13** — Gegeven een uitgenodigd account, dan gaat de uitnodigingsmail nog steeds naar `/uitnodiging`
  met geldigheid `INVITATION_TTL_SECONDS`, en heeft een herstellink nooit die geldigheid. Toets: `test/auth/wachtwoordherstel.int.test.ts` (nieuw)
- **wachtwoordherstel/AC-14** — Gegeven een geslaagd herstel, dan komt er één bevestigingsmail met het letterlijke onderwerp, en
  bevat geen van beide mails het wachtwoord of een sessietoken. Toets: `test/auth/wachtwoordherstel.int.test.ts` (nieuw)
- **wachtwoordherstel/AC-15** — Gegeven `APP_ENV=staging` of `production` zonder de voorwaarde van OV-3, wanneer de API start
  met de schakelaar aan, dan weigert `createAuth` met een melding die de schakelaar noemt. Toets: `src/core/api/auth/options-password-reset.test.ts` (nieuw)
- **wachtwoordherstel/AC-16** — Gegeven de schakelaar aan, wanneer een gebruiker via `/login` → "Wachtwoord vergeten?" de hele
  flow doorloopt tegen de echte stack, dan ziet hij elke tekst letterlijk, logt hij in met het nieuwe wachtwoord, en vindt axe op
  beide schermen op 375 en 1280 px geen overtredingen. Toets: `e2e/wachtwoordherstel.spec.ts` (nieuw)
- **wachtwoordherstel/AC-17** — Gegeven een ingelogde gebruiker, wanneer hij een van beide schermen opent, dan komt hij op de
  startpagina. Toets: `e2e/wachtwoordherstel.spec.ts` (nieuw)

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Adres met andere hoofdletters of spaties eromheen | genormaliseerd zoals bij inloggen | |
| De link wordt geopend door een mailscanner (GET) | een GET verandert niets; alleen de POST met het wachtwoord claimt het token (R-AUTH-05) | |
| Het e-mailadres van het account wijzigt na de aanvraag | de link vervalt | `RESET_LINK_INVALID` |
| Uitnodiging en herstel door elkaar | een uitnodigingstoken werkt alleen op `/uitnodiging`-gedrag (credential aanmaken); een hersteltoken nooit voor een account zonder credential | `RESET_LINK_INVALID` |
| De mail kan niet verzonden worden | de aanvrager merkt niets; de wachtrij herhaalt (OV-2) | |
| Body met een extra veld | geweigerd | `VALIDATION` |

## Raakt ook

- `docs/framework.md`: R-AUTH-04 (pad open met de schakelaar), R-UIT-03 (twee schermen), R-AUTH-05 (tokengeldigheid herstel).
- ADR 0043 punt 3 (besluit-PR) en de test per pad uit `disabledPaths`.
- `check:secdef`, `db/tests/functies.sql`, `db/tests/rate_limits.sql`; `e2e/rate-limit.spec.ts` blijft groen.
- De securitysuite: het pad is anoniem en komt in de lijst van paden zonder login met zijn eigen negatieve gevallen.
- `docs/operations/eerste-admin.md`: een beheerder die ook zijn tweede factor kwijt is, gebruikt nog steeds het runbook.
- Audit: een auditregel voor zelfherstel vraagt een eigen writer voor Better Auth-acties zonder admin (`app.audit_account_action`
  eist `app.is_mfa_admin()`, ADR 0051 punt 2) en een eigen besluit; tot die er is, geen regel. ST-04 (gearchiveerd) dekte alleen admin-acties.

## Buiten scope

- Zelf registreren; herstel van een verloren tweede factor (backupcodes: ST-02).
- Inloggen met een magic link als vervanging van het wachtwoord.
- Herstel via sms of beveiligingsvragen.
- CAPTCHA zelf (ST-10); deze spec legt alleen de afhankelijkheid vast (OV-3).

## Testplan

- Integratietests tegen de echte stack met Mailpit, met de schakelaar aan en uit (twee app-instanties in de test).
- pgTAP voor de nieuwe functie; racetest op twee verbindingen voor het eenmalige gebruik.
- e2e op 375 en 1280 px met axe en CSP aan.
- De bestaande auth-integratietests draaien ongewijzigd groen (R-AUTH-09); een gewijzigde bestaande test staat met reden in de PR.

## Open vragen

Een vraag zonder aanbeveling (de eigenaar kiest) blokkeert `goedgekeurd`; een vraag met aanbeveling mag blijven staan. `check-docs` telt elke regel in deze sectie met het waarschuwingsteken en "open" (ook met U+FE0F of hoofdletter, ook zonder opsommingsteken).

- **OV-1** — Mag een account met een beheerrol zelf herstellen. Aanbeveling: ja; de tweede factor blijft verplicht, dus een
  gekaapte mailbox alleen geeft geen beheersessie. Het alternatief (beheerrollen alleen via de resetlink van een andere
  beheerder) sluit de laatste beheerder buiten.
- **OV-2** — Bouwen vóór of na de mail-outbox (ST-03). Aanbeveling: erna. De roadmap vraagt bij ST-02 geen synchroon mailpad te
  kopiëren als de outbox de geldende route wordt, en in de wachtrij zetten kost voor elk adres even veel tijd (AC-4).
- **OV-3** — Voorwaarde om de schakelaar in staging en productie aan te mogen zetten. Aanbeveling: CAPTCHA op het aanvraagpad
  (R-AUTH-05; komt met ST-10); tot die er is weigert `createAuth` de schakelaar buiten `local` en `test`.
- **OV-4** — De vier grenswaarden. Aanbeveling: link één uur geldig, drie mails per adres per uur, tien aanvragen per IP per uur.
- **OV-5** — Een aanvraag voor een uitgenodigd account dat nog geen wachtwoord heeft. Aanbeveling: geen mail; opnieuw uitnodigen
  blijft bij de beheerder, anders kan iedereen een uitnodiging laten verlengen.
- **OV-6** — De bevestigingsmail na een geslaagd herstel. Aanbeveling: ja, altijd; het is het enige signaal voor de eigenaar
  van het account als iemand anders de link gebruikte.
