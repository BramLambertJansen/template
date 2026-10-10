---
status: voorstel # voorstel | goedgekeurd | gebouwd | vervallen — alleen de eigenaar zet goedgekeurd
namespace: accounts
---

# Accountbeheer, uitbreiding: blokkeren, uitnodiging intrekken, resetlink en herstelcodes

Geen kop weglaten; "n.v.t. — reden" mag. Ontbreekt een antwoord, dan vraagt de agent het.

## Doel

Een admin met MFA blokkeert en deblokkeert accounts, trekt een openstaande uitnodiging in en stuurt een resetlink; een gebruiker met TOTP
heeft herstelcodes, zodat een verloren telefoon niet alleen via `pnpm admin:create` op te lossen is (roadmap stuk 3e). Bouwt op spec
[accountbeheer](accountbeheer.md); de AC-nummers lopen daarom door vanaf AC-11.

## Rollen en wie wat ziet

| Rol | Ziet | Mag |
|---|---|---|
| `user` | niets nieuws; met TOTP: sectie "Herstelcodes" op `/account` (spec [eigen-account](eigen-account.md)) | eigen herstelcodes maken en gebruiken |
| `admin` (MFA) | in `/admin/accounts` per rij het menu "Acties"; status "Geblokkeerd" | blokkeren, deblokkeren, uitnodiging intrekken, resetlink sturen; eigen herstelcodes |
| geblokkeerd account | `/login` met "Dit account is geblokkeerd. Neem contact op met een beheerder." (pas na een juist wachtwoord, OV-5) | niets |

- Een admin kan zichzelf niet blokkeren; de laatste niet-geblokkeerde admin kan niet geblokkeerd worden (`LAST_ADMIN`).
- Blokkeren trekt alle sessies van het account in, in dezelfde transactie; de volgende request van dat account geeft 401.

## Datawijzigingen (met grants)

Volgens de aanbeveling bij OV-1 (één nieuwe migratie; kolom-allowlist uitbreiden vraagt een ADR als aanvulling op ADR 0014):

- **`better_auth."user".blocked_at timestamptz null`** via Better Auth `user.additionalFields` (`input: false`, kolomnaam `blocked_at`),
  door `auth generate` in de migratie. Better Auth leest het veld zelf; schrijven doet alleen de functie hieronder.
- **Grants aan `app_definer`** (allowlist in `db/tests/invarianten.sql` erbij): `select (blocked_at)` en `update (blocked_at)` op `better_auth."user"`,
  `select ("userId")` en `delete` op `better_auth.session`. Geen andere kolommen.
- **`app.set_account_blocked(p_user_id text, p_blocked boolean) returns void`** — `security definer`, eigenaar `app_definer`, `search_path = ''`,
  execute aan `app_authenticated`, klasse `client` in de functiecatalogus. Eist `app.is_mfa_admin()` (anders 42501), weigert `p_user_id =
  app.current_user_id()` (`OWN_ACCOUNT`) en een account zonder credential (`ACCOUNT_INVITED`), neemt de advisory lock van de laatste-admin-regel,
  faalt met `LAST_ADMIN` als er geen niet-geblokkeerde admin overblijft, zet `blocked_at` en verwijdert bij blokkeren alle sessies van het account.
- **`app.user_roles_keep_one_admin()`** (nieuwe migratie, `create or replace`): telt alleen admins met `blocked_at is null`.
- **`app.accounts`** (`create or replace view`): status `blocked` als `blocked_at` gezet is, vóór `active`/`invited`.
- **Herstelcodes**: kolom `backupCodes` bestaat al (tabel `twoFactor`, plugin two-factor); 10 codes, versleuteld opgeslagen (standaard van de plugin).

## Routes en foutcodes

| Methode | Pad | Permissie | Foutcodes |
|---|---|---|---|
| POST | `/api/accounts/:id/block` → `null` | `accounts:manage` | `NOT_FOUND`, `OWN_ACCOUNT`, `ACCOUNT_INVITED`, `LAST_ADMIN`, `FORBIDDEN`, `MFA_REQUIRED` |
| POST | `/api/accounts/:id/unblock` → `null` | `accounts:manage` | `NOT_FOUND`, `FORBIDDEN`, `MFA_REQUIRED` |
| DELETE | `/api/accounts/:id/invitation` → `null` | `accounts:invite` | `NOT_FOUND`, `ALREADY_ACTIVE`, `FORBIDDEN`, `MFA_REQUIRED` |
| POST | `/api/accounts/:id/reset-link` → `null` | `accounts:manage` | `NOT_FOUND`, `ACCOUNT_INVITED`, `ACCOUNT_BLOCKED`, `FORBIDDEN`, `MFA_REQUIRED` |
| POST | `/api/auth/two-factor/generate-backup-codes` `{ password }` (Better Auth) | ingelogd met TOTP | `WRONG_PASSWORD`, `RATE_LIMITED` |
| POST | `/api/auth/two-factor/verify-backup-code` `{ code }` (Better Auth) | half ingelogd | `INVALID_BACKUP_CODE`, `RATE_LIMITED` |
| POST | `/api/auth/sign-in/email`, `/two-factor/verify-totp` (bestaand) | — | erbij: `ACCOUNT_BLOCKED` |

- **Blokkeren zonder admin-plugin** (ADR 0013 verwierp die; OV-1): `databaseHooks.session.create.before` weigert met `ACCOUNT_BLOCKED` als
  `blocked_at` gezet is. Dat dekt inloggen, TOTP, herstelcode, uitnodiging accepteren en de dev-login.
- **Uitnodiging intrekken** via `ctx.services.invitations.revoke`: eerst de open `reset-password:*`-tokens weg, dan controleren dat er geen
  credential is (anders `ALREADY_ACTIVE`), dan `internalAdapter.deleteUser` (cascade op `user_roles`). Die volgorde laat een gelijktijdige
  acceptatie falen in plaats van een net geactiveerd account te verwijderen.
- **Resetlink** via `ctx.services.invitations.sendResetLink`: `auth.api.requestPasswordReset` server-side, zoals opnieuw uitnodigen (ADR 0013);
  `/request-password-reset` blijft publiek dicht. `sendResetPassword` kiest de mail: met credential de resetmail, zonder de uitnodiging.
  Geldigheid: dezelfde 7 dagen als de uitnodiging (één instelling in Better Auth; OV-4). Bij gebruik trekt `revokeSessionsOnPasswordReset` de sessies in.
- **Herstelcodes**: `/two-factor/verify-backup-code` en `/two-factor/generate-backup-codes` uit `disabledPaths`; `/view-backup-codes` blijft dicht.
  `/two-factor/enable` geeft al 10 codes terug: het inschrijfscherm toont ze. De after-hook die `session_strength = 'mfa'` zet, geldt ook voor
  `/verify-backup-code`; de before-hook tegen `trustDevice` ook. Een gebruikte code vervalt (plugin).

## Hergebruik en UX

- **Bestaande componenten:** `Table`, `DropdownMenu` (menu "Acties" per rij), `ConfirmDialog` (blokkeren, uitnodiging intrekken, resetlink),
  `Notice`, `Form`/`FormField`, `Input`, `Button`, `Section`, `CenteredCard`. Geen nieuw component.
- **Staten per scherm:** acties: dialoog open, bezig (`busy`, sluiten geblokkeerd), gelukt (dialoog dicht, `Notice` boven de tabel), fout (`Notice` in de dialoog).
  Herstelcodes: tonen eenmalig na maken; bezig; fout per veld. Herstelcode bij inloggen: zoals het TOTP-scherm. Laden/leeg: ongewijzigd. Verouderd: n.v.t.
- **Alle zichtbare tekst letterlijk:**

| Plek | Tekst |
|---|---|
| Accounts | status "Geblokkeerd"; menuknop per rij met toegankelijke naam "Acties voor {naam}"; items: actief "Resetlink sturen", "Blokkeren"; geblokkeerd "Deblokkeren"; uitgenodigd "Opnieuw uitnodigen", "Uitnodiging intrekken" (eigen rij: geen "Blokkeren") |
| Blokkeren (ConfirmDialog) | titel "{naam} blokkeren?"; tekst "{naam} wordt direct overal uitgelogd en kan niet meer inloggen tot je het account deblokkeert."; knoppen "Blokkeren", "Annuleren"; gelukt "{naam} is geblokkeerd." |
| Deblokkeren (direct, geen dialoog) | gelukt "{naam} is gedeblokkeerd." |
| Uitnodiging intrekken (ConfirmDialog) | titel "Uitnodiging intrekken?"; tekst "De link aan {email} werkt niet meer en het account verdwijnt uit de lijst."; knoppen "Intrekken", "Annuleren"; gelukt "De uitnodiging aan {email} is ingetrokken." |
| Resetlink (ConfirmDialog, niet rood) | titel "Resetlink sturen?"; tekst "{naam} krijgt een mail met een link om een nieuw wachtwoord in te stellen. Het huidige wachtwoord blijft werken tot dan."; knoppen "Link sturen", "Annuleren"; gelukt "Resetlink verstuurd naar {email}." |
| Resetmail | onderwerp "Nieuw wachtwoord instellen voor {appnaam}"; tekst "Een beheerder heeft een link voor je aangevraagd om een nieuw wachtwoord in te stellen. De link is 7 dagen geldig."; knop "Wachtwoord instellen" |
| Herstelcodes tonen (na inschrijven of opnieuw maken) | kop "Herstelcodes"; uitleg "Bewaar deze codes op een veilige plek. Elke code werkt één keer, als je je authenticator-app niet bij de hand hebt. Je ziet ze maar één keer."; knop "Ik heb ze bewaard" |
| Herstelcodes op `/account` | sectiekop "Herstelcodes"; uitleg "Nieuwe codes maken maakt de oude ongeldig."; veld "Wachtwoord"; knop "Nieuwe herstelcodes maken" |
| TOTP-scherm | link "Gebruik een herstelcode"; titel "Herstelcode"; uitleg "Voer een van je herstelcodes in."; veld "Herstelcode"; knop "Bevestigen"; terug "Gebruik je authenticator-app" |
| Foutteksten | `OWN_ACCOUNT` "Dit kan niet bij je eigen account."; `ACCOUNT_INVITED` "Dit account is nog niet actief. Nodig opnieuw uit of trek de uitnodiging in."; `ACCOUNT_BLOCKED` "Dit account is geblokkeerd. Neem contact op met een beheerder."; `INVALID_BACKUP_CODE` "Deze herstelcode klopt niet of is al gebruikt."; `WRONG_PASSWORD` uit spec eigen-account |

- **Focusvolgorde en toetsenbord:** menu "Acties" met pijltjes, Esc sluit (focus terug op de knop); `ConfirmDialog` start op "Annuleren", na sluiten
  terug op de menuknop van de rij (of op de tabel als de rij weg is); herstelcodes als lijst, de knop "Ik heb ze bewaard" krijgt de focus pas na de lijst.

## Acceptatiecriteria

- **accounts/AC-11** — Gegeven een admin met MFA en een actieve `user` met twee sessies, wanneer de admin "Blokkeren" bevestigt, dan geven beide sessies
  bij de volgende request 401, staat de status op "Geblokkeerd" en ziet de `user` bij inloggen "Dit account is geblokkeerd. …".
- **accounts/AC-12** — Gegeven dat geblokkeerde account, wanneer de admin "Deblokkeren" kiest, dan kan de `user` weer inloggen en is de status "Actief".
- **accounts/AC-13** — Gegeven twee admins waarvan één geblokkeerd, wanneer iets de ander blokkeert of degradeert, dan faalt dat met `LAST_ADMIN`.
- **accounts/AC-14** — Gegeven een admin, wanneer hij zijn eigen rij bekijkt, dan staat "Blokkeren" niet in het menu, en de API weigert met `OWN_ACCOUNT`.
- **accounts/AC-15** — Gegeven een uitnodiging, wanneer de admin "Intrekken" bevestigt, dan verdwijnt het account uit de lijst, geeft de link
  `INVITATION_INVALID` en kan hetzelfde adres opnieuw uitgenodigd worden.
- **accounts/AC-16** — Gegeven een actieve `user`, wanneer de admin een resetlink stuurt, dan staat de resetmail in Mailpit; na het instellen van een nieuw
  wachtwoord zijn de oude sessies weg en werkt alleen het nieuwe wachtwoord.
- **accounts/AC-17** — Gegeven een admin die TOTP instelt, wanneer de code klopt, dan ziet hij 10 herstelcodes; met één daarvan (in plaats van TOTP)
  krijgt hij een MFA-sessie, en dezelfde code werkt daarna niet meer (`INVALID_BACKUP_CODE`).
- **accounts/AC-18** — Gegeven een gebruiker met TOTP op `/account`, wanneer hij met zijn wachtwoord nieuwe herstelcodes maakt, dan werken de oude niet meer.
- **accounts/AC-19** — Gegeven een `user` of een admin zonder MFA, wanneer hij een van de vier nieuwe accountroutes aanroept, dan `FORBIDDEN` / `MFA_REQUIRED`.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Blokkeren van een al geblokkeerd account, deblokkeren van een actief | geen fout, niets verandert (idempotent) | — |
| Blokkeren of resetlink voor een uitgenodigd account | geweigerd; intrekken of opnieuw uitnodigen | `ACCOUNT_INVITED` |
| Resetlink voor een geblokkeerd account | geweigerd | `ACCOUNT_BLOCKED` |
| Laatste twee niet-geblokkeerde admins blokkeren elkaar tegelijk | precies één slaagt | `LAST_ADMIN` |
| Intrekken terwijl de genodigde tegelijk accepteert | precies één slaagt | `ALREADY_ACTIVE` of `INVITATION_INVALID` |
| Intrekken van een account dat inmiddels actief is | geweigerd | `ALREADY_ACTIVE` |
| Onbekend of al verwijderd account | geweigerd | `NOT_FOUND` |
| Geblokkeerd account met een open uitnodigings- of resetlink | wachtwoord instellen lukt, inloggen niet | `ACCOUNT_BLOCKED` |
| Herstelcode met spaties of kleine letters | spaties weg; hoofdlettergevoelig zoals de plugin | `INVALID_BACKUP_CODE` |
| Alle herstelcodes op en telefoon kwijt | `pnpm admin:create` (runbook) | — |
| Te veel pogingen met herstelcodes | regel van Better Auth, zoals TOTP | `RATE_LIMITED` |

## Raakt ook

- `src/shared/permissions.ts`: `accounts:manage` (OV-2); foutcodes `OWN_ACCOUNT`, `ACCOUNT_INVITED`, `ACCOUNT_BLOCKED`, `INVALID_BACKUP_CODE` met teksten;
  contract `accountItem.status` krijgt `geblokkeerd` (raakt spec [lijstpagina](lijstpagina.md), filter "Status").
- `src/core/api/auth` (options, `invitations.ts`: `revoke`, `sendResetLink`), `src/api/services.ts` (vertaling van de nieuwe fouten), mail-layout (resetmail),
  `src/core/web/lib/auth.ts` (`authErrorCode` voor herstelcode en `ACCOUNT_BLOCKED`). Mutaties invalideren `accounts`.
- ADR 0013 (dichte paden, admin-plugin) en ADR 0014 (allowlist) krijgen een aanvulling in een nieuwe ADR (nummer via `feiten.mjs`).
- **Audit log:** wie wie blokkeerde, uitnodigingen introk of een resetlink stuurde, hoort in een audit log. Daarover is nog geen besluit (ADR open);
  tot dan logt alleen de request-log (`requestId`, gebruiker-ID). Na het besluit krijgt elke route hier een audit-regel.

## Buiten scope

Rol wijzigen en accounts verwijderen via de UI, blokkeren met einddatum of reden, de admin-plugin van Better Auth, "wachtwoord vergeten",
aantal resterende herstelcodes tonen (`/view-backup-codes` is alleen server-side), herstelcodes downloaden of afdrukken.

## Testplan

- **Unit:** `can()` voor `accounts:manage` × rol × sessiesterkte; contractschema's; keuze resetmail of uitnodiging in `sendResetPassword`; `authErrorCode`; copy.
- **pgTAP:** `app.set_account_blocked`: admin met MFA ja, `user` en admin zonder MFA 42501, eigen account, uitgenodigd account, `LAST_ADMIN`, sessies weg;
  `user_roles_keep_one_admin` met een geblokkeerde admin; `app.accounts` status `blocked`; functiecatalogus (klasse `client`); allowlist-invariant met de nieuwe kolommen.
- **Integratie (`pnpm test:db`):** per nieuwe route een test per verboden rol (`user` → `FORBIDDEN`, admin zonder MFA → `MFA_REQUIRED`) en ongeldige input;
  racetests "laatste twee admins blokkeren elkaar" en "intrekken tegen accepteren"; `session.create.before` weigert een geblokkeerd account bij
  inloggen, TOTP, herstelcode en dev-login; `/view-backup-codes` blijft 404; `verify-backup-code` geeft `session_strength = 'mfa'`.
- **E2E (`pnpm ui:check`, echte stack, CSP aan):** AC-11 t/m AC-18, mails uit Mailpit; axe op 375 en 1280 px voor accounts (met open menu en elke
  `ConfirmDialog`), herstelcodes tonen, `/account` sectie Herstelcodes en het herstelcodescherm bij inloggen.

## Open vragen voor de eigenaar

- **OV-1** — Waar staat "geblokkeerd"? Aanbeveling: `better_auth."user".blocked_at`, geschreven door een functie van `app_definer` (atomair met de
  laatste-admin-regel en het intrekken van sessies), gelezen door Better Auth bij elke nieuwe sessie. Vraagt grants buiten de allowlist van ADR 0014
  (dus een ADR). Alternatieven: kolom in `public.user_roles` (Better Auth kan hem niet lezen, inloggen lukt dan half) of de admin-plugin (ADR 0013 verwierp hem; ADR nodig).
- **OV-2** — Eén permissie `accounts:manage` voor blokkeren en resetlink, intrekken onder `accounts:invite`? Aanbeveling: ja; aparte permissies pas als een app rollen anders verdeelt.
- **OV-3** — Herstelcodes ook voor `user` (zodra die TOTP kan instellen) of alleen voor admins? Aanbeveling: voor iedereen met TOTP; het kost niets extra.
- **OV-4** — Resetlink 7 dagen geldig (gelijk aan de uitnodiging, één instelling in Better Auth) of korter met een eigen token? Aanbeveling: 7 dagen
  nu; korter bij het openen van "wachtwoord vergeten" (gevolg in ADR 0013).
- **OV-5** — Ziet een geblokkeerd account (na een juist wachtwoord) "Dit account is geblokkeerd." of de gewone inlogfout? Aanbeveling: de eigen melding;
  het lekt alleen iets aan wie het wachtwoord al kent.
- **OV-6** — Deblokkeren zonder bevestiging? Aanbeveling: ja, het is niet destructief en direct terug te draaien.
