---
status: voorstel # voorstel | goedgekeurd | gebouwd | vervallen — alleen de eigenaar zet goedgekeurd
namespace: eigen-account
---

# Eigen account: naam, wachtwoord, sessies en e-mailadres

Geen kop weglaten; "n.v.t. — reden" mag. Ontbreekt een antwoord, dan vraagt de agent het.

## Doel

Elke ingelogde gebruiker beheert op `/account` zijn eigen naam, wachtwoord en sessies, en wijzigt zijn e-mailadres met een
bevestiging via het oude én het nieuwe adres (roadmap stuk 3e).

## Rollen en wie wat ziet

| Rol | Ziet | Mag |
|---|---|---|
| anoniem | — (`/account` en `/email-bevestigen` sturen naar `/login`, daarna terug) | — |
| `user` | `/account` via het profielmenu | eigen naam, wachtwoord, sessies en e-mailadres |
| `admin` (MFA) | idem; zonder MFA eerst de TOTP-stap (framework §6) | idem; sectie "Herstelcodes" volgt uit spec `accountbeheer-uitbreiding` |

- Alles werkt alleen op het eigen account: de routes nemen de gebruiker uit `ctx.actor`, nooit uit de invoer.
- Sessie-ID's van andere gebruikers bestaan voor de route niet: een vreemd ID geeft `NOT_FOUND`, geen `FORBIDDEN` (geen enumeratie).

## Datawijzigingen (met grants)

- **Geen migratie.** Naam, e-mail, `emailVerified` en sessies staan al in `better_auth` (ADR 0010); alleen `auth_service` raakt ze.
- **Better Auth-configuratie** (`src/core/api/auth/options.ts`): `user.changeEmail.enabled: true` met `sendChangeEmailConfirmation` (mail naar
  het oude adres) en `emailVerification.sendVerificationEmail` (mail naar het nieuwe adres); geldigheid `EMAIL_CHANGE_TTL_SECONDS` (OV-5).
  Links wijzen naar het scherm `${APP_ORIGIN}/email-bevestigen?token=…`, niet naar de GET-route van Better Auth (framework §6).
- **Hooks:** after-hook op `/change-password` geeft de nieuwe sessie de `session_strength` van de oude (anders verliest een admin zijn MFA);
  before-hook op `/verify-email` eist een sessie (anders maakt Better Auth er een); before-hook op `/change-email` eist een verse sessie (OV-4).
- **`disabledPaths` erbij** (404, test per pad): `/update-user`, `/list-sessions`, `/revoke-session`, `/revoke-sessions`, `/revoke-other-sessions`
  (OV-2, OV-3). `SessionInfo` in `src/core/api/auth/auth.ts` krijgt `sessionId`, zodat een route weet welke sessie "deze" is.
- Geen nieuwe plugin: alles komt uit de kern van Better Auth 1.7.7.

## Routes en foutcodes

| Methode | Pad | Permissie | Foutcodes |
|---|---|---|---|
| PATCH | `/api/me` `{ naam }` → `null` | `me:update` (`user`, `admin`) | `VALIDATION`, `UNAUTHENTICATED`, `MFA_REQUIRED` |
| POST | `/api/auth/change-password` `{ currentPassword, newPassword, revokeOtherSessions: true }` (Better Auth) | ingelogd | `WRONG_PASSWORD`, `VALIDATION`, `RATE_LIMITED` |
| GET | `/api/me/sessions` → `{ items: [{ id, apparaat, aangemaakt, laatstActief, huidig }] }` | `me:read` | `UNAUTHENTICATED`, `MFA_REQUIRED` |
| DELETE | `/api/me/sessions/:id` → `null` | `me:update` | `NOT_FOUND`, `VALIDATION` |
| POST | `/api/me/sessions/revoke-others` → `null` | `me:update` | — |
| POST | `/api/auth/change-email` `{ newEmail, callbackURL }` (Better Auth) | ingelogd, verse sessie | `VALIDATION`, `SESSION_NOT_FRESH`, `RATE_LIMITED` |
| GET | `/api/auth/verify-email?token=` (Better Auth; alleen vanuit `/email-bevestigen` na een klik) | ingelogd, zelfde gebruiker | `EMAIL_LINK_INVALID` |

- **Naam** via een eigen route (zod uit `src/shared/contracts/me.ts`, grens `MAX_NAME_LENGTH`) en `ctx.services.profile.rename`
  (`internalAdapter.updateUser`), niet via `/update-user`: dat accepteert ook `image` en kent onze grenzen niet (OV-2).
- **Wachtwoord** via `changePassword` van Better Auth: controleert het huidige wachtwoord en trekt met `revokeOtherSessions` alle andere
  sessies in (framework §6: verplicht, dus altijd `true`; geen keuze in de UI). Fouten vertaalt `authErrorCode` in `src/core/web/lib/auth.ts`.
- **Sessies** via eigen routes en `ctx.services.sessions` (`internalAdapter.listSessions`/`deleteSession`), omdat `/list-sessions` de
  sessietokens naar de browser stuurt (OV-3). `apparaat` is een korte omschrijving uit de user-agent ("Firefox op Windows"), parser zonder dependency.
- **E-mail**: Better Auth-flow "change-email-confirmation": mail 1 naar het oude adres, na klikken mail 2 naar het nieuwe; na klikken op mail 2 is het
  adres gewijzigd en `emailVerified` waar. Een bezet adres geeft hetzelfde antwoord en verstuurt niets (geen enumeratie, gedrag van Better Auth).

## Hergebruik en UX

- **Bestaande componenten:** `PageHeader`, `Section`, `Card`, `Form`/`FormField`, `Input`, `Button`, `Notice`, `Table`, `AsyncView`, `ConfirmDialog`,
  `CenteredCard` (voor `/email-bevestigen`). Geen nieuw component.
- **Staten per scherm:** naam/wachtwoord/e-mail: leeg, bezig (knop uit, "Bezig…"), fout per veld of melding, gelukt (`Notice`). Sessies: laden, fout
  via `AsyncView` (leeg kan niet: de huidige sessie staat er altijd), bezig per rij. `/email-bevestigen`: klaar om te bevestigen, bezig, gelukt, fout.
  Verouderd: n.v.t.
- **Alle zichtbare tekst letterlijk:**

| Plek | Tekst |
|---|---|
| Profielmenu | menu-item "Mijn account" (boven "Uitloggen") |
| Pagina | titel "Mijn account" |
| Naam | sectiekop "Naam"; veld "Naam"; knop "Naam opslaan"; gelukt "Je naam is opgeslagen." |
| Wachtwoord | sectiekop "Wachtwoord"; velden "Huidig wachtwoord", "Nieuw wachtwoord", "Nieuw wachtwoord herhalen"; hulptekst "Minstens 12 tekens. Je wordt op je andere apparaten uitgelogd."; knop "Wachtwoord wijzigen"; gelukt "Je wachtwoord is gewijzigd. Je andere sessies zijn beëindigd."; mismatch "De wachtwoorden zijn niet gelijk." |
| Sessies | sectiekop "Sessies"; kolommen "Apparaat", "Ingelogd op", "Laatst actief"; label "Dit apparaat"; actie "Beëindigen"; knop "Alle andere sessies beëindigen"; onbekend apparaat "Onbekend apparaat"; verborgen kolomkop "Acties" |
| Sessie beëindigen (ConfirmDialog) | titel "Sessie beëindigen?"; tekst "Het apparaat {apparaat} wordt uitgelogd."; knoppen "Beëindigen", "Annuleren"; gelukt "De sessie is beëindigd." |
| Andere sessies (ConfirmDialog) | titel "Alle andere sessies beëindigen?"; tekst "Je blijft alleen op dit apparaat ingelogd."; knoppen "Beëindigen", "Annuleren"; gelukt "Je andere sessies zijn beëindigd." |
| E-mailadres | sectiekop "E-mailadres"; huidig "Huidig e-mailadres: {email}"; veld "Nieuw e-mailadres"; knop "E-mailadres wijzigen"; gelukt "We hebben een bevestigingslink gestuurd naar {huidig e-mailadres}. Daarna volgt een link naar het nieuwe adres."; zelfde adres "Dit is al je e-mailadres." |
| Mail oud adres | onderwerp "Bevestig de wijziging van je e-mailadres"; tekst "Iemand wil het e-mailadres van je account bij {appnaam} wijzigen in {nieuw e-mailadres}. Was jij dat? Bevestig dan met de knop. Was jij het niet? Wijzig direct je wachtwoord."; knop "Wijziging bevestigen" |
| Mail nieuw adres | onderwerp "Bevestig je nieuwe e-mailadres"; tekst "Bevestig dat dit je nieuwe e-mailadres is voor {appnaam}."; knop "E-mailadres bevestigen" |
| `/email-bevestigen` | titel "E-mailadres bevestigen"; knop "Bevestigen"; na stap 1 "Gelukt. Open nu de link die we naar je nieuwe e-mailadres hebben gestuurd."; na stap 2 "Je e-mailadres is gewijzigd." met link "Naar Mijn account" |
| Foutteksten | `WRONG_PASSWORD` "Je huidige wachtwoord klopt niet."; `SESSION_NOT_FRESH` "Log opnieuw in om dit te wijzigen."; `EMAIL_LINK_INVALID` "Deze link is verlopen of al gebruikt. Vraag de wijziging opnieuw aan." |

- **Focusvolgorde en toetsenbord:** secties in de volgorde van de tabel; Enter verzendt het formulier van de sectie waarin de focus staat; na een
  fout gaat de focus naar de melding (`role="alert"`); `ConfirmDialog` zet de focus op "Annuleren" en geeft hem bij sluiten terug aan de knop.

## Acceptatiecriteria

- **eigen-account/AC-1** — Gegeven een ingelogde `user`, wanneer hij in het profielmenu "Mijn account" kiest, dan ziet hij `/account` met de vier secties.
- **eigen-account/AC-2** — Gegeven `/account`, wanneer hij zijn naam wijzigt in "Nieuwe Naam", dan toont de melding "Je naam is opgeslagen." en tonen
  het profielmenu (initialen) en `/api/me` de nieuwe naam.
- **eigen-account/AC-3** — Gegeven twee sessies van dezelfde gebruiker, wanneer hij met het juiste huidige wachtwoord een nieuw wachtwoord instelt,
  dan is de andere sessie weg (volgende request 401), blijft hij zelf ingelogd en werkt alleen het nieuwe wachtwoord bij inloggen.
- **eigen-account/AC-4** — Gegeven een admin met MFA-sessie, wanneer hij zijn wachtwoord wijzigt, dan heeft zijn nieuwe sessie sterkte `mfa`
  en werkt `/admin/accounts` zonder nieuwe TOTP-code.
- **eigen-account/AC-5** — Gegeven een fout huidig wachtwoord, wanneer hij verzendt, dan ziet hij "Je huidige wachtwoord klopt niet." en is er niets gewijzigd.
- **eigen-account/AC-6** — Gegeven twee sessies, wanneer hij de andere sessie beëindigt via de dialoog, dan verdwijnt die uit de lijst en geeft een
  request met die sessie 401; de eigen sessie heeft geen knop "Beëindigen" maar het label "Dit apparaat".
- **eigen-account/AC-7** — Gegeven drie sessies, wanneer hij "Alle andere sessies beëindigen" bevestigt, dan staat alleen "Dit apparaat" nog in de lijst.
- **eigen-account/AC-8** — Gegeven `gebruiker@template.test`, wanneer hij `nieuw@template.test` aanvraagt, beide links (Mailpit) opent en telkens op
  "Bevestigen" klikt, dan is zijn e-mailadres `nieuw@template.test` en logt hij daarmee in; met het oude adres niet meer.
- **eigen-account/AC-9** — Gegeven een e-mailadres van een ander account, wanneer hij dat aanvraagt, dan ziet hij dezelfde melding als bij een vrij adres
  en gaat er geen mail weg.
- **eigen-account/AC-10** — Gegeven een sessie ouder dan 10 minuten, wanneer hij een e-mailwijziging aanvraagt, dan ziet hij "Log opnieuw in om dit te wijzigen."
- **eigen-account/AC-11** — Gegeven een anonieme bezoeker of een andere ingelogde gebruiker, wanneer hij een bevestigingslink opent en op "Bevestigen"
  klikt, dan verandert er niets (anoniem: eerst `/login`; andere gebruiker: `EMAIL_LINK_INVALID`).

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Naam leeg of > `MAX_NAME_LENGTH` | veldfout "Vul een naam in." / "Hooguit 100 tekens." | `VALIDATION` |
| Nieuw wachtwoord < 12 of > 128 tekens | veldfout "Minstens 12 tekens." | `VALIDATION` |
| Nieuw wachtwoord gelijk aan het huidige | toegestaan (Better Auth controleert het niet; OV-6) | — |
| Te veel pogingen met een fout huidig wachtwoord | melding van `RATE_LIMITED` (regel Better Auth) | `RATE_LIMITED` |
| Sessie-ID van een andere gebruiker of onbekend | geweigerd, zelfde antwoord | `NOT_FOUND` |
| De eigen huidige sessie beëindigen via `DELETE` | geweigerd: daarvoor is "Uitloggen" | `VALIDATION` |
| Bevestigingslink verlopen, gebruikt, vervalst of van een ander account | één melding | `EMAIL_LINK_INVALID` |
| Nieuw adres wordt tussen aanvraag en bevestiging door een ander account bezet | wijziging faalt (uniek in de database) | `EMAIL_LINK_INVALID` |
| Uitgenodigd account (nog geen wachtwoord) | kan niet inloggen, dus n.v.t. | — |
| Sessie verlopen tijdens het invullen | naar `/login` met melding, daarna terug naar `/account` | `UNAUTHENTICATED` |

## Raakt ook

- `src/shared/permissions.ts`: `me:update`; contracten in `src/shared/contracts/me.ts`; foutcodes `WRONG_PASSWORD`, `SESSION_NOT_FRESH`,
  `EMAIL_LINK_INVALID` met teksten in `src/web/copy/errors.ts`; grens `EMAIL_CHANGE_TTL_SECONDS` in `src/core/shared/limits.ts`.
- `src/core/api/auth` (options, `SessionInfo.sessionId`, services `profile` en `sessions`), `src/core/web/lib/auth.ts` (nieuwe stappen in `authErrorCode`),
  mail-layout (twee nieuwe mails), `AuthConfig` krijgt een algemene `sendMail` naast `sendInvitation`.
- Mutaties invalideren `me` en `me/sessions`; na een e-mailwijziging ook `accounts` (lijst van de admin).
- ADR 0013 noemt de dichte paden: een aanvulling (nieuwe ADR, nummer via `feiten.mjs`) legt `changeEmail`, de nieuwe `disabledPaths` en de hooks vast.

## Buiten scope

Profielfoto (`image`), account zelf verwijderen (`/delete-user` blijft dicht), TOTP zelf aan- of uitzetten voor `user`, "wachtwoord vergeten",
locatie of IP-adres per sessie tonen (OV-3), melding per mail bij een nieuwe login.

## Testplan

- **Unit:** zod-schema's van `me.ts` (naam, sessie-ID; grenzen gelijk aan `limits.ts`); user-agent-parser (tabeltest, ook leeg en onbekend);
  `authErrorCode` voor `changePassword`/`changeEmail`/`verifyEmail`; `can()` voor `me:update` × rol × sessiesterkte; copy-woordenlijst.
- **pgTAP:** n.v.t. (geen migratie); de bestaande invariant "`better_auth` dicht" blijft groen.
- **Integratie (`pnpm test:db`):** `PATCH /api/me` en de sessieroutes: een test per verboden situatie (anoniem `UNAUTHENTICATED`, admin zonder MFA
  `MFA_REQUIRED`) en ongeldige input; sessie van een ander → `NOT_FOUND`; eigen sessie via `DELETE` → `VALIDATION`; `session_strength` blijft `mfa` na
  `change-password`; `/verify-email` zonder sessie geweigerd; elk nieuw pad in `disabledPaths` geeft 404; bezet adres verstuurt geen mail.
- **E2E (`pnpm ui:check`, echte stack, CSP aan):** AC-1 t/m AC-11, mails uit Mailpit; axe op 375 en 1280 px voor `/account` (ook met open
  `ConfirmDialog`) en `/email-bevestigen`.

## Open vragen voor de eigenaar

- **OV-1** — Pad en naam van het scherm: `/account` met titel "Mijn account"? Aanbeveling: ja, kort en in lijn met het profielmenu.
- **OV-2** — Naam via een eigen route (`PATCH /api/me`, `/update-user` dicht) of via `/update-user` van Better Auth? Aanbeveling: eigen route;
  zod, `limits.ts` en `defineRoute` gelden dan gewoon, en `image` kan niet ongemerkt binnenkomen.
- **OV-3** — Sessies via eigen routes (geen tokens naar de browser) of via `/list-sessions`/`/revoke-session` van Better Auth? En tonen we het IP-adres?
  Aanbeveling: eigen routes, geen IP-adres (persoonsgegeven; lokaal altijd 127.0.0.1).
- **OV-4** — Eist een e-mailwijziging een verse sessie (`freshAge` 10 min, framework §6) of het huidige wachtwoord? Aanbeveling: verse sessie;
  Better Auth controleert bij `/change-email` geen wachtwoord, en de bevestiging via het oude adres is de tweede drempel.
- **OV-5** — Geldigheid van de bevestigingslinks: aanbeveling 1 uur (standaard van Better Auth), als `EMAIL_CHANGE_TTL_SECONDS` in `limits.ts`.
- **OV-6** — Weigeren we een nieuw wachtwoord dat gelijk is aan het huidige, of trekt een e-mailwijziging ook de andere sessies in?
  Aanbeveling: beide nee in deze spec (geen eis in framework §6); later per besluit.
