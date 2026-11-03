---
status: goedgekeurd
namespace: inloggat-dichten
model: opus
---

# Inloggat dichten: eenmalige TOTP-codes en e-maillinks, geen sessietoken in JSON

Geen kop weglaten; "n.v.t. — reden" mag. Ontbreekt een antwoord, dan vraagt de agent het.

## Doel

De drie "Bekend gat"-punten van R-AUTH-06 dicht, elk met een integratietest die op de huidige code faalt
([ADR 0073](../adr/0073-eenmalige-codes-en-geen-sessietoken-in-json.md)).

## Rollen en wie wat ziet

| Rol | Ziet | Mag |
|---|---|---|
| anoniem | ongewijzigd | inloggen; een gebruikte TOTP-code werkt niet nog een keer |
| `user` | ongewijzigd | een link van de e-mailwijziging werkt één keer |
| `admin` (MFA) | ongewijzigd | idem; een gebruikte TOTP-code geeft geen tweede MFA-sessie |

- Niemand ziet of een code "al gebruikt" of "fout" is: beide geven hetzelfde antwoord (geen orakel).
- Geen rol krijgt rechten op de tabel; alleen `auth_service` mag de claimfunctie uitvoeren.

## Datawijzigingen (met grants)

Eén nieuwe migratie (expand, raakt geen bestaande rijen):

- Tabel `app.one_time_use (key text primary key, expires_at timestamptz not null)`; RLS aan en `force`; `grant select, insert,
  update, delete` alleen aan `app_definer`; policy `one_time_use_definer_all` voor `all to app_definer using (true) with check
  (true)` (vorm van `app.rate_limits`). Niet `unlogged`: een claim moet een crash of failover overleven, anders werkt een
  gebruikte code daarna weer.
- Functie `app.claim_one_time_use(p_key text, p_ttl_seconds integer) returns boolean`, `security definer`, `set search_path = ''`,
  volledig gekwalificeerde namen, eigenaar `app_definer` (R-DB-09). Doet in één statement
  `insert … values (p_key, pg_catalog.now() + ttl) on conflict (key) do update set expires_at = excluded.expires_at where
  one_time_use.expires_at <= pg_catalog.now() returning true`; geen rij terug → `false`. Een verlopen sleutel mag dus opnieuw.
  Weigert met `22023` bij een lege sleutel, een sleutel zonder prefix (`<prefix>:<rest>`), een sleutel langer dan 200 tekens of
  `p_ttl_seconds` niet in 1 … `ONE_TIME_USE_MAX_TTL_SECONDS`. De tijd komt van de database.
- `revoke all … from public`; `grant usage on schema app to auth_service`; `grant execute on function app.claim_one_time_use(text,
  integer) to auth_service`. Geen andere rol (ook `app_authenticated` niet) krijgt execute.
- `insert into app.retention values ('app.one_time_use', 'expires_at', interval '0 seconds', 'app', 'eenmalig gebruik: de
  geldigheid zit al in expires_at (ADR 0073)')`.
- Sleutels (in `src/core/api/auth`): `totp:` + sha256-hex van `<userId>:<code>`; `email-link:` + sha256-hex van het token. Nooit de
  code of het token zelf.
- Grenzen in `src/core/shared/limits.ts`: `TOTP_REUSE_BLOCK_SECONDS = 120` (venster ±1 stap van 30 s plus marge) en
  `ONE_TIME_USE_MAX_TTL_SECONDS = EMAIL_CHANGE_TTL_SECONDS`.

## Routes en foutcodes

n.v.t. — geen nieuwe route en geen nieuwe foutcode. Gedrag dat verandert op bestaande paden:

| Methode | Pad | Permissie | Foutcodes |
|---|---|---|---|
| POST | `/api/auth/two-factor/verify-totp` | Better Auth (two_factor-cookie of sessie) | gebruikte code: 401 `INVALID_CODE`, gelijk aan een foute code (web: `INVALID_TOTP`) |
| POST | `/api/me/email/bevestigen` | `me:update` | tweede keer hetzelfde token: 409 `EMAIL_LINK_INVALID` |
| * | `/api/auth/*` | ongewijzigd | geen; elk JSON-antwoord zonder eigenschap `token` |

Foutvolgorde op `verify-totp`: de bestaande before-stappen (afgewezen sessie, lifecycle, `trustDevice`) eerst, dan de claim, dan
de controle van Better Auth. Een claim tegen een verlopen of ontbrekende challenge gebeurt niet: zonder gebruikers-ID (geen geldige
two_factor-challenge en geen sessie) laat de hook het verzoek door naar Better Auth, dat het dan zelf weigert.
Op `/api/me/email/bevestigen`: eerst `readToken` (ongeldig → `EMAIL_LINK_INVALID`), dan de claim met als geldigheid `exp` min nu
(≤ 0 → `EMAIL_LINK_INVALID` zonder claim), dan `verifyEmail`.

## Kopieer de vorm van

- `db/migrations/20261011120000_rate_limits.sql` — tabel alleen voor `app_definer`, security definer-functie met één upsert, tijd uit de database
- `db/migrations/20261019120000_retention.sql` — regel in `app.retention`
- `db/tests/rate_limits.sql` — pgTAP op policy-naam, grants en gelijktijdigheid
- `src/core/api/auth/hooks.ts` — before-hook op een pad van Better Auth met `APIError`
- `src/core/api/auth/account-lifecycle.ts` — gebruiker uit de two_factor-challenge via de ondertekende cookie
- `test/api/eigen-account-deel2.int.test.ts` — links uit Mailpit en tweede bevestiging

## Hergebruik en UX

- Bestaande componenten: geen wijziging in de UI.
- Staten per scherm: ongewijzigd. TOTP-scherm: een gebruikte code toont de bestaande foutmelding van `INVALID_TOTP`;
  `/email-bevestigen`: een tweede keer toont de bestaande melding van `EMAIL_LINK_INVALID`.
- Alle zichtbare tekst letterlijk: geen nieuwe tekst.
- Focusvolgorde en toetsenbord: ongewijzigd.

## Acceptatiecriteria

- **inloggat-dichten/AC-1** — Gegeven een admin met TOTP die met code C is ingelogd, wanneer binnen 90 s een tweede inlogpoging
  (wachtwoord goed) dezelfde code C stuurt, dan 401 `INVALID_CODE`, geen sessiecookie en geen nieuwe rij in `better_auth.session`.
- **inloggat-dichten/AC-2** — Gegeven twee inlogpogingen tot de TOTP-stap, wanneer beide tegelijk dezelfde juiste code sturen, dan
  krijgt precies één een sessie en de andere 401 `INVALID_CODE`.
- **inloggat-dichten/AC-3** — Gegeven een sessie met sterkte `password` en TOTP aan, wanneer `verify-totp` met een code die al voor
  inloggen is gebruikt, dan 401 en blijft de sterkte `password`.
- **inloggat-dichten/AC-4** — Gegeven een gebruikte code C, wanneer de volgende code van de authenticator wordt gestuurd, dan lukt het
  (de claim blokkeert alleen C).
- **inloggat-dichten/AC-5** — Gegeven een foute code, wanneer die wordt gestuurd, dan blijven foutteller, lockout en rate limit van
  Better Auth werken zoals nu (bestaande tests groen).
- **inloggat-dichten/AC-6** — Gegeven link 1 van een e-mailwijziging die één keer is bevestigd, wanneer dezelfde link opnieuw wordt
  bevestigd, dan 409 `EMAIL_LINK_INVALID` en staat er na beide pogingen precies één mail 2 bij het nieuwe adres.
- **inloggat-dichten/AC-7** — Gegeven link 1, wanneer twee bevestigingen tegelijk binnenkomen, dan antwoordt één `{ stap: 'oud' }`,
  de andere 409, en gaat mail 2 één keer weg.
- **inloggat-dichten/AC-8** — Gegeven de flows inloggen zonder TOTP, inloggen met TOTP, `GET /api/auth/get-session` en
  `/change-password`, wanneer ze slagen, dan bevat geen JSON-antwoord op enige diepte een eigenschap `token`, en werkt de
  sessiecookie daarna voor `GET /api/me`.
- **inloggat-dichten/AC-9** — Gegeven een JSON-antwoord met `token` op het hoogste niveau, in een genest object en in een array, en
  een antwoord dat geen JSON is, wanneer de gateway het doorgeeft, dan is elke `token` weg, blijven status, overige velden en
  `Set-Cookie` gelijk en klopt `Content-Length`; niet-JSON blijft byte voor byte gelijk (unit).
- **inloggat-dichten/AC-10** — Gegeven de database, wanneer `app_authenticated`, `api_user` of `app_definer` (anders dan als eigenaar)
  de claimfunctie of de tabel probeert, dan geweigerd; `auth_service` mag alleen de functie, niet de tabel.
- **inloggat-dichten/AC-11** — Gegeven een sleutel, wanneer die twee keer wordt geclaimd, dan `true` en `false`; na het verlopen
  weer `true`; ongeldige sleutel of geldigheid → `22023` (pgTAP).

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Juiste code, maar het verzoek faalt na de claim (bijv. 5xx) | code werkt niet meer; volgende code (≤ 30 s) wel | — |
| Foute code geprobeerd, daarna dezelfde foute code | beide fout; de tweede telt niet als nieuwe poging bij Better Auth | `INVALID_CODE` |
| TOTP inschakelen (`/two-factor/enable` + `verify-totp` met sessie) | dezelfde claim: de inschrijfcode werkt daarna niet om in te loggen | `INVALID_CODE` |
| Twee gebruikers toevallig dezelfde code | geen conflict: de gebruikers-ID zit in de sleutel | — |
| Link 1 opnieuw nodig omdat mail 2 kwijt is | gebruiker vraagt de wijziging opnieuw aan | `EMAIL_LINK_INVALID` |
| Link 2 tweede keer | ongewijzigd: al ongeldig | `EMAIL_LINK_INVALID` |
| Verlopen link | ongewijzigd, zonder claim | `EMAIL_LINK_INVALID` |
| Uitnodigingslink tweede keer | ongewijzigd: Better Auth verwijdert de rij al bij gebruik | `INVITATION_INVALID` |
| Database niet bereikbaar bij de claim | het verzoek faalt (500), het laat de code niet ongecontroleerd door (fail-closed) | `INTERNAL_ERROR` |

## Raakt ook

- Kritieke paden (eigenaarmerge): `src/core/api/auth/` (hooks, `auth.ts`-gateway, `profile.ts` `confirmEmail`, opties of injectie
  van de claim via de bestaande `auth_service`-pool), `db/migrations/` (nieuw), `src/core/shared/limits.ts`.
- Gegenereerd: `db/schema.snapshot.sql` en `src/api/db/schema.ts` opnieuw (`pnpm check:snapshot`), niet met de hand.
- Checks: `check:migrations`, `check:secdef`, `test:db` (pgTAP `db/tests/one_time_use.sql`; `db/tests/invarianten.sql` noemt de
  nieuwe grant aan `auth_service` expliciet, zodat elke andere grant over de schemagrens blijft falen), `check:snapshot`.
  `test/security/resources.ts`: n.v.t. (geen resource per eigenaar). Geen nieuwe permissie.
- Bestaande test die wijzigt (R-TEST-02, reden: dit besluit wijzigt het gedrag): in `test/api/eigen-account-deel2.int.test.ts`
  "link 1 nogmaals geopend binnen de geldigheid: mail 2 gaat opnieuw weg" wordt AC-6. Geen andere bestaande test wijzigt.
- Docs in de bouw-PR: R-AUTH-06 zonder "Bekend gat" en met de nieuwe regel (eenmalig, geen token in JSON) in `docs/framework.md`;
  R-AUTH-02 en R-DB-05/R-LAAG-05 waar de nieuwe grant genoemd moet worden; ST-02 in `docs/roadmap.md` afgevinkt voor dit deel met
  bewijs; spec `eigen-account` verwijst al naar deze spec.
- Fase: fase 1 stuk 3e (ST-02); `docs/dod.md` Fase 1 en Features.

## Buiten scope

Herstelcodes (eigen spec in ST-02, gebruiken later dezelfde claimfunctie), strengere TOTP-controle op tijdstap (ADR 0073,
Alternatieven), intrekken van een lopende e-mailwijziging, de bearer-plugin, opruimen van verlopen rijen (ST-03).

## Testplan

Tester schrijft de tests eerst; ze falen op de huidige code op een assertie (R-PRINC-04), niet op een ontbrekend bestand.

- **Unit:** de strip-functie van de gateway (AC-9); sleutelvorm (prefix, hash, nooit de code of het token).
- **pgTAP (`db/tests/one_time_use.sql`):** RLS aan en `force`, policy `one_time_use_definer_all` op naam, grants per rol (AC-10),
  claim twee keer, verlopen claim, ongeldige invoer (AC-11), gelijktijdige claim met twee verbindingen indien de bestaande
  rate-limit-test die vorm al heeft, anders in de integratietest (AC-2).
- **Integratie (`pnpm test:db`, echte stack, nooit gemockt):** AC-1 t/m AC-8; codes uit het vaste seed-geheim van de testharness;
  AC-2 en AC-7 met `Promise.all`. AC-5: de bestaande lockout- en rate-limittests blijven ongewijzigd groen.
- **E2E:** n.v.t. — geen UI-wijziging; het TOTP-scherm en `/email-bevestigen` tonen bestaande meldingen.
- **Vangnet** (review 3 november 2026, P7): (1) overname door integratietests in `pnpm test:db` die bij elke `better-auth`-update
  draaien (R-AUTH-09); (2) bewijs: elke nieuwe test faalt op `origin/main` vóór de bouw, de uitslag staat in de PR; (3) meting: geen
  bestaande test, fixture of check verdwijnt of wordt versoepeld, alleen de ene genoemde test wijzigt; (4) terugval: faalt na een
  update van Better Auth een van deze tests, dan gaat de update niet door tot de eigenaar beslist.

## Open vragen

- **OV-1** — Blokkeert de claim alleen dezelfde code, of ook oudere codes uit het venster na een nieuwere (tijdstap bijhouden)?
  Aanbeveling: alleen dezelfde code; voldoet aan RFC 6238 en vraagt geen eigen cryptocode of interne Better Auth-functies (ADR 0073).
- **OV-2** — Link 1 een tweede keer: weigeren, of mail 2 opnieuw sturen zoals nu? Aanbeveling: weigeren; elke link werkt één keer,
  en wie mail 2 mist, start opnieuw.
